"use client";

import { useEffect, useRef } from "react";
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
  RING_LEVELS,
  RING_PIXEL_RATIO,
  endpointElement,
  readTokens,
  ringIcon,
  ringImage,
  ringLevel,
  type MapTokens,
} from "@/components/map-symbols";
import { MAP_STYLE_URL } from "@/lib/endpoints";
import { t } from "@/lib/strings";
import type { Itinerary, LatLon, Station } from "@/lib/types";

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
}

const ENDPOINT_LABEL: Record<PickTarget, string> = {
  origin: t.map.originPin,
  destination: t.map.destinationPin,
};

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
 * frame. Below 1024px the panel takes the bottom edge, above it the left.
 * Without this, fitting the network extent centres it neatly underneath the
 * panel.
 */
function framePadding(): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const wide =
    typeof window !== "undefined" &&
    window.matchMedia !== undefined &&
    window.matchMedia("(min-width: 1024px)").matches;
  return wide
    ? { top: 48, bottom: 48, left: 428, right: 48 }
    : { top: 48, bottom: 320, left: 24, right: 24 };
}

export default function MapView({
  stations,
  itinerary,
  origin,
  destination,
  picking,
  focus,
  onMapClick,
  onEndpointMove,
}: {
  stations: Station[];
  itinerary: Itinerary | null;
  origin: LatLon | null;
  destination: LatLon | null;
  picking: PickTarget | null;
  focus: FocusRequest | null;
  onMapClick: (point: LatLon) => void;
  onEndpointMove: (target: PickTarget, point: LatLon) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
  const tokens = useRef<MapTokens | null>(null);
  /** The opening framing happens once, on the first stations that arrive. */
  const framed = useRef(false);
  const markers = useRef<Record<PickTarget, Marker | null>>({
    origin: null,
    destination: null,
  });

  // The map instance and the markers are created once and outlive every render,
  // so their listeners must reach the current callbacks rather than the ones
  // captured when they were built. The refs are updated in an effect, not
  // during render.
  const clickHandler = useRef(onMapClick);
  const moveHandler = useRef(onEndpointMove);
  useEffect(() => {
    clickHandler.current = onMapClick;
    moveHandler.current = onEndpointMove;
  }, [onMapClick, onEndpointMove]);

  // Create once. Never in render: at build time there is no browser.
  useEffect(() => {
    if (container.current === null || map.current !== null) return;

    const instance = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: [MONTREAL.lon, MONTREAL.lat],
      zoom: 12,
      /**
       * The credits are rendered by the panel, not here.
       *
       * MapLibre draws them in a corner of the map, and the panel covers the
       * bottom of the frame below 1024px, so the required OpenStreetMap and
       * OpenMapTiles credits were hidden for most riders. Displaying them is a
       * licence obligation, so they moved to the panel footer, which no rest
       * position and no scroll can hide. See components/MapAttribution.tsx.
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

    instance.on("click", (event) => {
      clickHandler.current({ lat: event.lngLat.lat, lon: event.lngLat.lng });
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

      for (const id of [STATIONS_SOURCE, STOPS_SOURCE]) {
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
        id: "stations-dots",
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
          // it. Walking and riding are told apart by the dash, not by a second
          // hue: two colours on one trace would be a colour code.
          "line-color": palette.brand,
          "line-width": ["get", "width"],
          "line-dasharray": ["get", "dash"],
        },
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

      ready.current = true;
    });

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
      ready.current = false;
      markers.current = { origin: null, destination: null };
    };
  }, []);

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
      element.setAttribute("aria-label", ENDPOINT_LABEL[target]);
      element.title = ENDPOINT_LABEL[target];
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
  }, [origin, destination]);

  // Arming a point turns the whole map into a target, so the cursor says so.
  // On a touch screen there is no cursor to say it, which is why the panel
  // carries the same message in words.
  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;
    instance.getCanvas().style.cursor = picking === null ? "" : "crosshair";
  }, [picking]);

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
        zoom: Math.max(instance.getZoom(), 14),
        padding: framePadding(),
        duration: cameraDuration(),
      });
      return;
    }

    const bounds = new LngLatBounds();
    for (const point of focus.points) bounds.extend([point.lon, point.lat]);
    instance.fitBounds(bounds, {
      padding: framePadding(),
      maxZoom: 15,
      duration: cameraDuration(),
    });
  }, [focus]);

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
          // No hue at any level. The ring's fill carries what this station
          // holds; see components/map-symbols.ts.
          properties: { icon: ringIcon(ringLevel(station)) },
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
        instance.fitBounds(bounds, {
          padding: framePadding(),
          duration: 0,
        });
      }
    };

    if (ready.current) apply();
    else instance.once("load", apply);
  }, [stations]);

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

      for (const step of itinerary?.steps ?? []) {
        if (step.kind === "walk") {
          lines.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [step.from.lon, step.from.lat],
                [step.to.lon, step.to.lat],
              ],
            },
            // Walking: same accent, dashed and thinner, because it is part of
            // the same journey but does not spend the free window.
            properties: { width: 2.5, dash: [1, 2] },
          });
        } else if (step.kind === "bike") {
          const from = byId.get(step.fromStationId);
          const to = byId.get(step.toStationId);
          if (from === undefined || to === undefined) continue;
          lines.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [from.lon, from.lat],
                [to.lon, to.lat],
              ],
            },
            properties: { width: 4, dash: [1, 0] },
          });
        } else {
          const at = byId.get(step.stationId);
          if (at === undefined) continue;
          stopPoints.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [at.lon, at.lat] },
            properties: {},
          });
        }
      }

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
  }, [itinerary, stations]);

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
        Nothing floats over the map any more.

        docs/ui-guidelines.md allows exactly one container above the map, and
        it is the panel. The arming banner and the availability legend were two
        more, and between them they carried a shadow, a blue outside the
        palette and the three-colour availability code the guidelines forbid
        outright. The banner's message now lives in the panel, next to the
        field it concerns, and the legend has nothing left to explain: the
        markers carry availability in the length of a ring, not in a hue.
      */}
    </div>
  );
}
