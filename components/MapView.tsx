"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// maplibre-gl 6 has no default export; it publishes named classes. `Map`
// would shadow the global, so the package provides the MapLibreMap alias.
import {
  LngLatBounds,
  MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  LINE_STYLE,
  RING_LEVELS,
  RING_PIXEL_RATIO,
  endpointElement,
  highlightLabelLayout,
  highlightRingPaint,
  readTokens,
  ringIcon,
  ringImage,
  ringLevel,
  routeStationIds,
  stationLabelLayout,
  stationLabelPaint,
  type MapTokens,
} from "@/components/map-symbols";
import StationCallout from "@/components/StationCallout";
import { anchorPath } from "@/lib/route-geometry";
import { configReady } from "@/lib/runtime-config";
import { useStrings } from "@/components/LocaleProvider";
import type { Itinerary, LatLon, Station, TracedItinerary } from "@/lib/types";

/**
 * The map.
 *
 * Two constraints shape this component, both non-negotiable:
 *
 * 1. Static export prerenders client components at build time, when `window`
 *    and WebGL do not exist. The map is therefore created in an effect and
 *    never during render.
 * 2. FR-026 requires centre and zoom to survive a parameter change. The
 *    MapLibre instance owns its own view state and lives in a ref, so no React
 *    re-render can reset it. Driving the camera from React state is precisely
 *    the bug that requirement guards against.
 */

const STATIONS_SOURCE = "stations";
const ROUTE_SOURCE = "route";
const STOPS_SOURCE = "stops";
/** Holds nought or one feature: whichever station is being pointed at. */
const HIGHLIGHT_SOURCE = "highlight";

const STATIONS_LAYER = "stations-dots";
const STATION_LABELS_LAYER = "station-labels";
const HIGHLIGHT_RING_LAYER = "station-highlight";
const HIGHLIGHT_LABEL_LAYER = "station-highlight-label";

/**
 * How far from a station's centre a tap still counts as landing on it, in
 * pixels.
 *
 * The rendered dot is about 9px across at full icon size and half that when the
 * reader has not zoomed in, which is well under the 44px a finger needs. This is
 * queried as a box around the pointer rather than a point, so a near miss on a
 * touch screen still opens the station the reader was aiming at.
 */
const STATION_HIT_SLOP = 12;

const MONTREAL: LatLon = { lat: 45.5088, lon: -73.5878 };

/** Which end of the trip the next map click sets, if any. */
export type PickTarget = "origin" | "destination";

/**
 * A one-shot request to look at something, sent by the panel when the user
 * picks an address. `id` makes each request distinct, so asking twice for the
 * same point moves the camera twice.
 *
 * This is the only thing that may move the camera. Nothing here reacts to a
 * parameter change, which is what FR-026 forbids.
 */
export interface FocusRequest {
  points: LatLon[];
  id: number;
  /**
   * Move the centre and leave the zoom alone.
   *
   * Set when the request came from tapping a step of the itinerary: the reader
   * asked "where is that one", not "show me that one closer". Pulling them to
   * zoom 14 from wherever they had settled would discard a framing they chose,
   * which is the same mistake FR-026 names. Only meaningful for a single point;
   * a fitted pair has to choose a zoom by definition.
   */
  keepZoom?: boolean;
}

/**
 * MapLibre must be told where its worker is.
 *
 * Left to itself it derives the URL from `import.meta.url`, which Turbopack
 * compiles to a `file://` path. MapLibre's own `/^https?:/` guard then rejects
 * it and returns an empty string, so `new Worker('')` fails, no tile is ever
 * parsed, and the map paints nothing but the style's background colour. The
 * copy this points at is placed in `public/maplibre/` by
 * scripts/copy-maplibre-worker.mjs, which runs before every dev and build.
 *
 * Module scope, so it is set before any map can be constructed. The file is not
 * imported through the bundler on purpose: it needs to keep its own name and
 * sit beside `maplibre-gl-shared.mjs`, which it imports relatively.
 */
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/**
 * Camera moves, in milliseconds.
 *
 * A map flight is not interface furniture: cutting it to nothing turns every
 * recentring into a jump and costs the reader the one thing the movement is
 * for, which is knowing where they were taken from. It stays short, and it
 * disappears entirely for a reader who asked for stillness.
 */
const CAMERA_MS = 400;

function cameraDuration(): number {
  if (typeof window === "undefined" || window.matchMedia === undefined) return 0;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : CAMERA_MS;
}

/**
 * Room to leave around a fitted view.
 *
 * The panel overlays the map, so the visible part of the frame is not the
 * frame. Below 768px the panel takes the bottom edge, above it the left.
 * Without this, fitting the network extent centres it neatly underneath the
 * panel.
 *
 * The bottom figure is derived rather than typed. It was 320px, which was the
 * sheet's collapsed rest position resolved against one screen and wrong on
 * every other: too much on a short viewport, where it ate a fit box that was
 * already small, and too little on a tall one, where the route was fitted into
 * ground the sheet covers.
 *
 * It now computes that position rather than approximating it, and the three
 * constants below are the same three PlannerPanel's `COLLAPSED` is built from.
 * They have to agree: this is the one place outside that component that needs
 * to know how much screen the sheet takes, and a copy that drifts puts the
 * route back under the panel with nothing failing to say so.
 *
 * The collapsed position and not the expanded one, deliberately. Expanding is a
 * gesture the reader makes to read the trail and undoes to look at the map;
 * framing for the position they are not resting at would keep the route
 * squeezed into the top eighth of the screen for the whole of the time they are
 * not making it.
 *
 * This is applied *once*, to the map's transform, and never passed to an
 * individual camera call — see the effect that calls `setPadding`. Passing it
 * per call is what the library's own option invites and it is a trap: a camera
 * command that carries `padding` installs it on the transform permanently, and
 * the next one then adds its own on top of it. Two of these on a 844px screen
 * come to 962px of vertical padding, `cameraForBounds` returns undefined
 * because the box it is asked to fit into is negative, and `fitBounds`
 * silently does nothing at all. That is not hypothetical: it is why entering a
 * destination left the camera on the origin, and it went unnoticed while this
 * figure was 320px, where two of them still summed to less than the screen.
 */
const SHEET_FLOOR_PX = 452;
const SHEET_SHARE = 0.56;
const SHEET_CAP = 0.72;

function framePadding(): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const wide =
    typeof window !== "undefined" &&
    window.matchMedia !== undefined &&
    window.matchMedia("(min-width: 768px)").matches;
  if (wide) return { top: 48, bottom: 48, left: 428, right: 48 };

  const height = typeof window === "undefined" ? 0 : window.innerHeight;
  const sheet = Math.min(
    height * SHEET_CAP,
    Math.max(height * SHEET_SHARE, SHEET_FLOOR_PX),
  );
  return {
    top: 48,
    // 8px of clearance above the sheet's edge, so a station sitting exactly on
    // the fitted bound is not drawn half under it.
    bottom: Math.round(sheet) + 8,
    left: 24,
    right: 24,
  };
}

export default function MapView({
  stations,
  itinerary,
  traced,
  origin,
  destination,
  picking,
  focus,
  highlighted,
  selected,
  onMapClick,
  onEndpointMove,
  onHighlight,
  onSelect,
  onUseStation,
}: {
  stations: Station[];
  itinerary: Itinerary | null;
  /**
   * Geometry for the itinerary above, as far as it is known.
   *
   * Null before any refinement has opened. This component performs no I/O of
   * any kind: it receives geometry and draws it. A request fired from here
   * would put retrieval and the replan decision inside a component that needs
   * WebGL to instantiate, and tests/unit/routing-boundaries.test.ts fails the
   * build if that ever happens.
   */
  traced: TracedItinerary | null;
  origin: LatLon | null;
  destination: LatLon | null;
  picking: PickTarget | null;
  focus: FocusRequest | null;
  /**
   * The station being pointed at, from either side.
   *
   * One value for both directions of the cross-highlight, which is what stops
   * the trail and the map disagreeing about which station is under the reader's
   * attention. Owned by the shell, because neither of the two surfaces that set
   * it is the parent of the other.
   */
  highlighted: string | null;
  /** The station whose callout is open, or null for none. */
  selected: string | null;
  onMapClick: (point: LatLon) => void;
  onEndpointMove: (target: PickTarget, point: LatLon) => void;
  onHighlight: (stationId: string | null) => void;
  onSelect: (stationId: string | null) => void;
  onUseStation: (target: PickTarget, station: Station) => void;
}) {
  const strings = useStrings();

  /**
   * Held in a ref as well as read directly: the marker-creating effect runs
   * outside React's render and must not re-run on a language change, or it
   * would rebuild the pins and move the camera.
   */
  const endpointLabels = useRef<Record<PickTarget, string>>({
    origin: strings.map.originPin,
    destination: strings.map.destinationPin,
  });
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  /**
   * The basemap style's address, once the configuration has been read.
   *
   * Null until then, and the map is not built until it is a string. It used to be
   * a compiled-in constant; it is a deployment's choice now, so that somebody
   * running the published image can point it at their own tile server without
   * rebuilding it (lib/runtime-config.ts).
   *
   * State rather than a value awaited inside the creating effect below: that
   * effect stays synchronous and keeps its early return, which is what lets the
   * body of it remain exactly the code that was there before.
   */
  const [styleUrl, setStyleUrl] = useState<string | null>(null);
  /**
   * Whether the MapLibre instance exists yet, as state rather than as a ref.
   *
   * Every effect below begins by bailing out when `map.current` is null. That was
   * free while the map was built synchronously on the first commit; now that it
   * waits one fetch for the line above, a ref would let all of them bail once and
   * never hear that the instance had appeared — stations already in hand would be
   * written to a source that did not exist, which is to say not drawn.
   *
   * So it is in their dependency lists. All of them are idempotent, setting source
   * data or writing a style property, so running a second time costs a redraw and
   * changes nothing.
   */
  const [hasMap, setHasMap] = useState(false);
  const tokens = useRef<MapTokens | null>(null);
  /** The opening framing happens once, on the first stations that arrive. */
  const framed = useRef(false);
  const markers = useRef<Record<PickTarget, Marker | null>>({
    origin: null,
    destination: null,
  });
  /** The element the callout is drawn in, moved by hand as the map moves. */
  const callout = useRef<HTMLDivElement | null>(null);

  // The map instance and the markers are created once and outlive every render,
  // so their listeners must reach the current callbacks rather than the ones
  // captured when they were built. The refs are updated in an effect, not
  // during render.
  const clickHandler = useRef(onMapClick);
  const moveHandler = useRef(onEndpointMove);
  const highlightHandler = useRef(onHighlight);
  const selectHandler = useRef(onSelect);
  useEffect(() => {
    clickHandler.current = onMapClick;
    moveHandler.current = onEndpointMove;
    highlightHandler.current = onHighlight;
    selectHandler.current = onSelect;
  }, [onMapClick, onEndpointMove, onHighlight, onSelect]);

  /**
   * Whether a point is armed, and whether a station is under the pointer, as
   * refs.
   *
   * The cursor is one property with two claims on it. Held here so the map's own
   * listeners can settle the question without either of the two effects below
   * having to know what the other last wrote.
   */
  const arming = useRef<PickTarget | null>(picking);
  const overStation = useRef(false);

  const applyCursor = useRef<() => void>(() => {});

  /** Which stations the itinerary touches, for the label layer and nothing else. */
  const onRoute = useMemo(() => routeStationIds(itinerary), [itinerary]);

  const station = selected === null
    ? null
    : (stations.find((candidate) => candidate.id === selected) ?? null);

  /**
   * The configuration, and from it the basemap's address.
   *
   * Its own effect, so the creating effect below stays synchronous. The request
   * itself is already in flight before this runs: the document's head starts it
   * before the bundle has parsed. See lib/runtime-config.ts.
   */
  useEffect(() => {
    let live = true;
    void configReady().then(({ mapStyleUrl }) => {
      if (live) setStyleUrl(mapStyleUrl);
    });
    return () => {
      live = false;
    };
  }, []);

  // Create once, as soon as the style's address is known. Never in render: at
  // build time there is no browser.
  useEffect(() => {
    if (styleUrl === null || container.current === null || map.current !== null) {
      return;
    }

    const instance = new MapLibreMap({
      container: container.current,
      style: styleUrl,
      center: [MONTREAL.lon, MONTREAL.lat],
      zoom: 12,
      /**
       * The credits are ours to place, not MapLibre's.
       *
       * They are on the map, where the tile licences want them and where
       * docs/ui-guidelines.md puts them. What is turned off here is only
       * MapLibre's own control: it draws in a fixed corner that the sheet
       * covers below 768px, which is how the required OpenStreetMap and
       * OpenMapTiles credits came to be hidden from most riders in the first
       * place. components/MapAttribution.tsx places them against whichever
       * edge the panel is not on. Leaving both on would credit everyone twice.
       */
      attributionControl: false,
    });

    instance.addControl(new NavigationControl(), "top-right");

    // Without a listener MapLibre swallows tile, style and worker failures
    // into a blank canvas, which is how a broken worker URL went unnoticed.
    // The map is optional to the planner, so this reports rather than throws.
    instance.on("error", (event) => {
      console.error("[map]", event.error ?? event);
    });

    /**
     * The station under a pointer, or null.
     *
     * A box rather than the bare point, so a finger that lands beside a 9px dot
     * still hits it. `queryRenderedFeatures` returns them in draw order and any
     * of the candidates is a legitimate answer at this tolerance, so the first
     * one is taken rather than sorting by distance for a difference nobody could
     * perceive.
     */
    const stationAt = (point: { x: number; y: number }): string | null => {
      if (instance.getLayer(STATIONS_LAYER) === undefined) return null;
      const [feature] = instance.queryRenderedFeatures(
        [
          [point.x - STATION_HIT_SLOP, point.y - STATION_HIT_SLOP],
          [point.x + STATION_HIT_SLOP, point.y + STATION_HIT_SLOP],
        ],
        { layers: [STATIONS_LAYER] },
      );
      const id = feature?.properties?.id;
      return typeof id === "string" ? id : null;
    };

    applyCursor.current = () => {
      const canvas = instance.getCanvas();
      canvas.style.cursor = overStation.current
        ? "pointer"
        : arming.current === null
          ? ""
          : "crosshair";
    };

    /**
     * One click handler for the whole map, and that is the point.
     *
     * A tap that lands on a station opens that station and *stops there*. It
     * must not also count as a tap on the map, or reading a station would drop
     * an endpoint underneath it — the same defect the endpoint pins already guard
     * against by stopping propagation on their own element. The station markers
     * are a layer rather than a DOM element, so there is no element to stop it
     * on; the equivalent is deciding here, once, before the map's own handler
     * can run. Registering a second, layer-scoped listener would not do it:
     * MapLibre would still deliver this one.
     *
     * A tap anywhere else dismisses the callout and then goes on to do whatever
     * the map click does. Dismissal does not swallow the tap: the callout is not
     * modal, and a reader who taps a street while the start is armed meant to
     * place their start there.
     */
    instance.on("click", (event) => {
      const hit = stationAt(event.point);
      if (hit !== null) {
        selectHandler.current(hit);
        highlightHandler.current(hit);
        return;
      }

      selectHandler.current(null);
      // And the ring goes with it. On a fine pointer `mousemove` has already
      // done this; on a touch screen nothing has, and without it the ring left
      // by the last tap would sit on a station the reader has finished with —
      // including one they reached from the trail rather than from the map.
      highlightHandler.current(null);
      clickHandler.current({ lat: event.lngLat.lat, lon: event.lngLat.lng });
    });

    /**
     * Hover, on a pointer fine enough to have one.
     *
     * `mousemove` on the whole map rather than `mouseenter` on the layer,
     * because the hit test above is a box and MapLibre's layer events are not:
     * scoping to the layer would light up a station only when the pointer was
     * dead on the dot, while a click a few pixels away still opened it. Two
     * different targets for the same mark is worse than either.
     *
     * Only the name and the ring appear here. Everything the callout adds needs
     * a tap, because most readers have no pointer at all.
     */
    instance.on("mousemove", (event) => {
      const hit = stationAt(event.point);
      overStation.current = hit !== null;
      applyCursor.current();
      highlightHandler.current(hit);
    });

    instance.on("mouseout", () => {
      overStation.current = false;
      applyCursor.current();
      highlightHandler.current(null);
    });

    const palette = readTokens();
    tokens.current = palette;

    instance.on("load", () => {
      // One image per ring level, registered before the layer that names them.
      for (const level of RING_LEVELS) {
        const image = ringImage(level, palette);
        if (image === null) continue;
        instance.addImage(ringIcon(level), image, {
          pixelRatio: RING_PIXEL_RATIO,
        });
      }

      for (const id of [STATIONS_SOURCE, STOPS_SOURCE, HIGHLIGHT_SOURCE]) {
        instance.addSource(id, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      instance.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      instance.addLayer({
        id: STATIONS_LAYER,
        type: "symbol",
        source: STATIONS_SOURCE,
        layout: {
          "icon-image": ["get", "icon"],
          // Several hundred markers, and a station omitted because a
          // neighbour was placed first is a station the rider cannot see.
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          // Dust at the network scale, readable once the reader has zoomed
          // into the streets they are actually planning through.
          "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 14, 1],
        },
      });
      instance.addLayer({
        id: "route-line",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          // The accent, and one of the three uses docs/ui-guidelines.md allows
          // it. Walking and riding are told apart by the dash pattern, not by a
          // second hue: two colours on one trace would be a colour code.
          "line-color": palette.brand,
          "line-width": ["get", "width"],
          "line-dasharray": ["get", "dash"],
        },
      });
      /*
        The cross-highlight ring, under the accent dot and over everything else.
        Under, so highlighting a stop does not paint a grey ring on top of the
        one coloured mark the map is allowed; over the plain stations, so the
        ring is not lost behind the dust of a dense block.
      */
      instance.addLayer({
        id: HIGHLIGHT_RING_LAYER,
        type: "circle",
        source: HIGHLIGHT_SOURCE,
        paint: highlightRingPaint(palette),
      });

      instance.addLayer({
        id: "stops-dots",
        type: "circle",
        source: STOPS_SOURCE,
        paint: {
          // The second allowed use of the accent, at a larger diameter than
          // any other station. These are the only coloured points on the map.
          "circle-radius": 7,
          "circle-color": palette.brand,
          "circle-stroke-width": 2,
          "circle-stroke-color": palette.panel,
        },
      });

      /*
        Names last, so they are on top of every mark they name. Both label
        layers carry the same halo colour and size; what differs is that this one
        yields to collision and the one below it never does.
      */
      instance.addLayer({
        id: STATION_LABELS_LAYER,
        type: "symbol",
        source: STATIONS_SOURCE,
        layout: stationLabelLayout(),
        paint: stationLabelPaint(palette),
      });

      instance.addLayer({
        id: HIGHLIGHT_LABEL_LAYER,
        type: "symbol",
        source: HIGHLIGHT_SOURCE,
        layout: highlightLabelLayout(),
        paint: {
          "text-color": palette.ink,
          "text-halo-color": palette.panel,
          "text-halo-width": 1.5,
        },
      });

      ready.current = true;
    });

    map.current = instance;
    setHasMap(true);

    return () => {
      instance.remove();
      map.current = null;
      ready.current = false;
      markers.current = { origin: null, destination: null };
      setHasMap(false);
    };
  }, [styleUrl]);

  // Start and destination pins, draggable so a point set roughly can be nudged
  // without retyping an address. Markers are DOM overlays, not layers, so they
  // need no style and no source and survive a failing tile server.
  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;

    const sync = (target: PickTarget, point: LatLon | null): void => {
      const existing = markers.current[target];

      if (point === null) {
        existing?.remove();
        markers.current[target] = null;
        return;
      }

      if (existing !== null) {
        existing.setLngLat([point.lon, point.lat]);
        return;
      }

      const palette = tokens.current ?? readTokens();
      const marker = new Marker({
        element: endpointElement(target, palette),
        draggable: true,
      });
      const element = marker.getElement();
      element.setAttribute("aria-label", endpointLabels.current[target]);
      element.title = endpointLabels.current[target];
      // A pointer landing on a pin must not also count as a click on the map,
      // or grabbing a pin would drop a second point underneath it.
      element.addEventListener("click", (event) => event.stopPropagation());
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        moveHandler.current(target, { lat, lon: lng });
      });

      marker.setLngLat([point.lon, point.lat]).addTo(instance);
      markers.current[target] = marker;
    };

    sync("origin", origin);
    sync("destination", destination);
  }, [origin, destination, hasMap]);

  /**
   * Keeps the pins' names in the reader's language.
   *
   * These labels used to come from a module-level constant built from the
   * always-French bundle, so an English rider's screen reader announced
   * "Départ, fais glisser pour déplacer" over a map they had asked for in
   * English. Nothing on screen showed it, which is how it survived.
   *
   * Updated in place rather than by rebuilding the markers: rebuilding would
   * move the camera, which is the bug the note at the top of this file warns
   * against.
   */
  useEffect(() => {
    endpointLabels.current = {
      origin: strings.map.originPin,
      destination: strings.map.destinationPin,
    };

    for (const target of ["origin", "destination"] as PickTarget[]) {
      const element = markers.current[target]?.getElement();
      if (element === undefined || element === null) continue;
      element.setAttribute("aria-label", endpointLabels.current[target]);
      element.title = endpointLabels.current[target];
    }
  }, [strings, hasMap]);

  // Arming a point turns the whole map into a target, so the cursor says so.
  // On a touch screen there is no cursor to say it, which is why the panel
  // carries the same message in words.
  //
  // Written through applyCursor rather than straight onto the canvas: a station
  // under the pointer also has a claim on the cursor, and two effects each
  // assigning the property directly would mean whichever ran last won.
  useEffect(() => {
    if (map.current === null) return;
    arming.current = picking;
    applyCursor.current();
  }, [picking, hasMap]);

  // The one place the camera is allowed to move on its own: the user asked for
  // a place by name, so showing them where it is answers the question they
  // asked. Never fired by a parameter change (FR-026).
  useEffect(() => {
    const instance = map.current;
    if (instance === null || focus === null || focus.points.length === 0) return;

    if (focus.points.length === 1) {
      const [point] = focus.points;
      instance.easeTo({
        center: [point.lon, point.lat],
        // Omitted entirely rather than set to the current value, so a request
        // that only wants a recentring cannot round-trip the zoom through a
        // float and land the reader a hair off where they were.
        ...(focus.keepZoom === true
          ? {}
          : { zoom: Math.max(instance.getZoom(), 14) }),
        // No `padding` here, nor on the fit below. The transform carries it; see
        // the effect that sets it and the note on framePadding for what passing
        // it per call actually does.
        duration: cameraDuration(),
      });
      return;
    }

    const bounds = new LngLatBounds();
    for (const point of focus.points) bounds.extend([point.lon, point.lat]);
    instance.fitBounds(bounds, {
      maxZoom: 15,
      duration: cameraDuration(),
    });
  }, [focus, hasMap]);

  /**
   * The room the panel takes, told to the map once rather than to each camera
   * command.
   *
   * This is what `padding` is for: it shifts the transform's centre so that
   * "centred" means centred in the part of the frame the reader can see, and
   * every camera operation — this component's and the library's own — then
   * respects it without being asked. Passing it per call instead is what
   * produced a `fitBounds` that did nothing, because each call left its padding
   * behind for the next one to add to.
   *
   * Re-applied on resize, because the figure is derived from the viewport and a
   * rotation changes it. `setPadding` is a jump, not an ease: it is a statement
   * about the frame rather than a move the reader asked for, and animating it
   * would drift the map under them every time the URL bar hid itself.
   */
  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;

    const apply = (): void => {
      instance.setPadding(framePadding());
    };
    apply();

    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, [hasMap]);

  // Stations, shown before any input (FR-027).
  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;

    const apply = (): void => {
      const source = instance.getSource(STATIONS_SOURCE);
      if (source === undefined) return;
      (source as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: stations.map((station) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [station.position.lon, station.position.lat],
          },
          properties: {
            // No hue at any level. The ring's fill carries what this station
            // holds; see components/map-symbols.ts.
            icon: ringIcon(ringLevel(station)),
            // The name travels with the feature so the label layer can draw it
            // without a second source, and `id` so a tap can be resolved back to
            // a station without a spatial search.
            id: station.id,
            name: station.name,
            // Read by both the label layer's zoom step and its collision sort
            // key: these are the names that are always drawn and always win.
            onRoute: onRoute.has(station.id),
          },
        })),
      });

      /**
       * The opening framing, once.
       *
       * The map used to open on a fixed zoom over the region, where several
       * hundred stations are indistinguishable dust. It now opens on the
       * extent of the network it actually serves.
       *
       * Guarded by a ref rather than by a dependency: this must fire on the
       * first snapshot and never again, or a feed refresh would drag the
       * camera away from wherever the reader had moved it (FR-026).
       */
      if (!framed.current && stations.length > 0) {
        framed.current = true;
        const bounds = new LngLatBounds();
        for (const station of stations) {
          bounds.extend([station.position.lon, station.position.lat]);
        }
        // No `padding`, for the same reason as the focus effect above: the
        // transform carries it. This one runs before the reader has done
        // anything, so it is also the call that used to install the padding
        // every later fit then doubled.
        instance.fitBounds(bounds, { duration: 0 });
      }
    };

    if (ready.current) apply();
    else instance.once("load", apply);
    // `onRoute` is a dependency because a station joining or leaving the
    // itinerary changes whether its name is drawn below zoom 15. The opening
    // framing is guarded by a ref, so re-running this cannot move the camera.
  }, [stations, onRoute, hasMap]);

  /**
   * The station being pointed at, from the trail or from the map.
   *
   * Two things happen together and they have to: the ring and the always-drawn
   * name go up, and the same station is filtered *out* of the collision-managed
   * label layer. Without the second half a station whose name already fitted
   * would have it printed twice, one on top of the other, which reads as a
   * rendering fault rather than as emphasis.
   */
  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;

    const apply = (): void => {
      const source = instance.getSource(HIGHLIGHT_SOURCE);
      if (source === undefined) return;

      const found =
        highlighted === null
          ? undefined
          : stations.find((candidate) => candidate.id === highlighted);

      (source as GeoJSONSource).setData({
        type: "FeatureCollection",
        features:
          found === undefined
            ? []
            : [
                {
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: [found.position.lon, found.position.lat],
                  },
                  properties: { name: found.name },
                },
              ],
      });

      instance.setFilter(
        STATION_LABELS_LAYER,
        found === undefined ? null : ["!=", ["get", "id"], found.id],
      );
    };

    if (ready.current) apply();
    else instance.once("load", apply);
  }, [highlighted, stations, hasMap]);

  /**
   * Keeps the callout over the station it belongs to.
   *
   * Written straight onto the element rather than held in state. MapLibre fires
   * `move` on every frame of a pan and an inertial fling, and routing that
   * through React would re-render the whole map subtree sixty times a second to
   * change two numbers. The bubble's *content* is React's; its position is the
   * map's.
   */
  useEffect(() => {
    const instance = map.current;
    if (instance === null || station === null) return;

    const place = (): void => {
      const element = callout.current;
      if (element === null) return;
      const point = instance.project([
        station.position.lon,
        station.position.lat,
      ]);
      element.style.transform = `translate(${point.x}px, ${point.y}px)`;
    };

    place();
    instance.on("move", place);
    return () => {
      instance.off("move", place);
    };
  }, [station, hasMap]);

  // The itinerary. Note what this effect does not do: it never calls setCenter
  // or fitBounds on a parameter change, because that would discard the view the
  // user chose (FR-026).
  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;

    const apply = (): void => {
      const route = instance.getSource(ROUTE_SOURCE);
      const stops = instance.getSource(STOPS_SOURCE);
      if (route === undefined || stops === undefined) return;

      const byId = new Map(stations.map((s) => [s.id, s.position]));
      const lines: GeoJSON.Feature[] = [];
      const stopPoints: GeoJSON.Feature[] = [];

      const steps = itinerary?.steps ?? [];

      /**
       * The path to draw for one step, and how to draw it.
       *
       * A traced step is drawn from the geometry the router returned, anchored
       * so it meets its markers (FR-305). Everything else, including a step
       * still waiting on an answer, keeps the straight line it has always had:
       * `pending` and `approximate` look identical on the map on purpose, since
       * neither is a path anybody has checked. The itinerary tells them apart in
       * words, where the difference between "not yet" and "no" actually matters.
       */
      const drawn = (
        index: number,
        from: LatLon,
        to: LatLon,
      ): { coordinates: [number, number][]; isTraced: boolean } => {
        const geometry = traced?.geometry[index];
        if (geometry?.status === "traced" && geometry.path !== null) {
          return {
            coordinates: anchorPath(geometry.path, from, to).map(
              (p) => [p.lon, p.lat] as [number, number],
            ),
            isTraced: true,
          };
        }
        return {
          coordinates: [
            [from.lon, from.lat],
            [to.lon, to.lat],
          ],
          isTraced: false,
        };
      };

      steps.forEach((step, index) => {
        if (step.kind === "walk") {
          const { coordinates, isTraced } = drawn(index, step.from, step.to);
          const style = isTraced
            ? LINE_STYLE.walk.traced
            : LINE_STYLE.walk.approximate;
          lines.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates },
            // Walking: the finer dotted pattern. Same accent, because it is
            // part of the same journey, and it does not spend the free window.
            properties: { width: style.width, dash: style.dash },
          });
        } else if (step.kind === "bike") {
          const from = byId.get(step.fromStationId);
          const to = byId.get(step.toStationId);
          if (from === undefined || to === undefined) return;
          const { coordinates, isTraced } = drawn(index, from, to);
          const style = isTraced
            ? LINE_STYLE.bike.traced
            : LINE_STYLE.bike.approximate;
          lines.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates },
            /**
             * Solid and full weight once traced; dashed and thin until then.
             *
             * The dashed line is a straight segment between two stations with a
             * detour factor applied to its length, not a route: it crosses the
             * river and the rail yards because it has never heard of either. A
             * solid 4px line promises a path somebody could follow, which is
             * exactly what the traced geometry is and exactly what the estimate
             * is not.
             */
            properties: { width: style.width, dash: style.dash },
          });
        } else {
          const at = byId.get(step.stationId);
          if (at === undefined) return;
          stopPoints.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [at.lon, at.lat] },
            properties: {},
          });
        }
      });

      (route as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: lines,
      });
      (stops as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: stopPoints,
      });
    };

    if (ready.current) apply();
    else instance.once("load", apply);
    // `traced` is in the dependency list, so a path arriving redraws the route
    // source and nothing else. No camera call here, so centre and zoom survive
    // every arrival (FR-323).
  }, [itinerary, traced, stations, hasMap]);

  return (
    <div
      className="relative h-full w-full"
      data-origin={origin === null ? undefined : `${origin.lat},${origin.lon}`}
      data-destination={
        destination === null ? undefined : `${destination.lat},${destination.lon}`
      }
    >
      <div
        ref={container}
        className="h-full w-full"
        // The map is decorative to a screen reader; the step list carries the
        // itinerary in text.
        role="presentation"
      />

      {/*
        One thing floats over the map, and only while it is asked for.

        docs/ui-guidelines.md allows exactly one *standing* container above the
        map, and it is the panel. The arming banner and the availability legend
        were two more, permanent, and between them they carried a shadow, a blue
        outside the palette and the three-colour availability code the guidelines
        forbid outright. Neither came back: the banner's message lives in the
        panel next to the field it concerns, and the legend has nothing left to
        explain.

        The callout is a different kind of thing and the amendment dated
        2026-07-29 in that document says so. It is summoned by a tap on one
        station, anchored to that station, and gone on the next tap elsewhere. It
        is also what makes the markers' availability reachable on a touch screen
        at all, which the quality floor requires and which the legend never did
        — the legend explained the code, it never told you what any given station
        held.
      */}
      {station !== null && (
        <div
          ref={callout}
          // Zero-size and unclickable itself: the map's own transform lands on
          // this, and the child does the offsetting. Without pointer-events-none
          // here a 0x0 box at the station's centre would still swallow taps.
          className="pointer-events-none absolute top-0 left-0 z-10"
        >
          {/*
            Centred over the station and lifted clear of its marker, which is 20px
            across at most; 16px puts the bubble's lower edge just above the ring
            rather than on it.
          */}
          <div
            className="pointer-events-auto"
            style={{ transform: "translate(-50%, calc(-100% - 16px))" }}
          >
            <StationCallout
              station={station}
              onUse={onUseStation}
              onClose={() => onSelect(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
