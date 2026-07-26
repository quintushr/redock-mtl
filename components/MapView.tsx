"use client";

import { useEffect, useRef } from "react";
// maplibre-gl 6 has no default export; it publishes named classes. `Map`
// would shadow the global, so the package provides the MapLibreMap alias.
import {
  MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  MAP_ATTRIBUTION_SUFFIX,
  MAP_STYLE_URL,
} from "@/lib/endpoints";
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
  onMapClick,
}: {
  stations: Station[];
  itinerary: Itinerary | null;
  origin: LatLon | null;
  destination: LatLon | null;
  onMapClick: (point: LatLon) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const ready = useRef(false);

  // The map instance is created once and outlives every render, so its click
  // listener must reach the current callback rather than the one captured when
  // the map was built. The ref is updated in an effect, not during render.
  const clickHandler = useRef(onMapClick);
  useEffect(() => {
    clickHandler.current = onMapClick;
  }, [onMapClick]);

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
    };
  }, []);

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
      ref={container}
      className="h-full w-full"
      // The map is decorative to a screen reader; the step list carries the
      // itinerary in text.
      role="presentation"
      data-origin={origin === null ? undefined : `${origin.lat},${origin.lon}`}
      data-destination={
        destination === null ? undefined : `${destination.lat},${destination.lon}`
      }
    />
  );
}
