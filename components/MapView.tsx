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
  MAP_ATTRIBUTION_SUFFIX,
  MAP_STYLE_URL,
} from "@/lib/endpoints";
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

const ENDPOINT_COLOUR: Record<PickTarget, string> = {
  origin: "#059669",
  destination: "#dc2626",
};

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

export default function MapView({
  stations,
  itinerary,
  origin,
  destination,
  picking,
  focus,
  onMapClick,
  onEndpointMove,
  onCancelPicking,
}: {
  stations: Station[];
  itinerary: Itinerary | null;
  origin: LatLon | null;
  destination: LatLon | null;
  picking: PickTarget | null;
  focus: FocusRequest | null;
  onMapClick: (point: LatLon) => void;
  onEndpointMove: (target: PickTarget, point: LatLon) => void;
  onCancelPicking: () => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);
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
      // MapLibre reads the required OpenStreetMap and OpenMapTiles credits from
      // the style document; the provider credit is added on top (principle V).
      attributionControl: { customAttribution: MAP_ATTRIBUTION_SUFFIX },
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

    instance.on("load", () => {
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
        type: "circle",
        source: STATIONS_SOURCE,
        paint: {
          "circle-radius": 4,
          "circle-color": ["get", "colour"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });
      instance.addLayer({
        id: "route-line",
        type: "line",
        source: ROUTE_SOURCE,
        paint: {
          "line-width": 4,
          "line-color": ["get", "colour"],
          "line-dasharray": ["get", "dash"],
        },
      });
      instance.addLayer({
        id: "stops-dots",
        type: "circle",
        source: STOPS_SOURCE,
        paint: {
          "circle-radius": 7,
          "circle-color": "#111827",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
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

      const marker = new Marker({
        color: ENDPOINT_COLOUR[target],
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

  // Arming a point turns the whole map into a target, so say so with the
  // cursor as well as with the banner below.
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
        duration: 600,
      });
      return;
    }

    const bounds = new LngLatBounds();
    for (const point of focus.points) bounds.extend([point.lon, point.lat]);
    instance.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 600 });
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
          properties: {
            colour:
              station.mechanicalBikesAvailable > 0
                ? "#059669"
                : station.ebikesAvailable > 0
                  ? "#d97706"
                  : "#9ca3af",
          },
        })),
      });
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
            properties: { colour: "#6b7280", dash: [2, 2] },
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
            properties: { colour: "#1d4ed8", dash: [1, 0] },
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

      {picking !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-blue-600 px-4 py-2 text-sm text-white shadow-lg">
            <span>{t.map.hintPicking(picking)}</span>
            <button
              type="button"
              className="rounded-full bg-blue-500 px-2 py-0.5 text-xs hover:bg-blue-400"
              onClick={onCancelPicking}
            >
              {t.fields.clear}
            </button>
          </div>
        </div>
      )}

      {/* The dot colours are meaningless without this, and a rider choosing a
          starting point needs to know which stations can actually lend a
          mechanical bike (FR-011). */}
      <ul className="absolute bottom-8 left-2 space-y-1 rounded bg-white/90 p-2 text-[11px] shadow">
        {[
          ["#059669", "Vélo mécanique disponible"],
          ["#d97706", "Vélo électrique seulement"],
          ["#9ca3af", "Aucun vélo"],
        ].map(([colour, text]) => (
          <li key={text} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: colour }}
            />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
