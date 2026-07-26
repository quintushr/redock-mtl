"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import FeedNotice from "@/components/FeedNotice";
import ItineraryList from "@/components/ItineraryList";
import ParameterPanel from "@/components/ParameterPanel";
import SearchField from "@/components/SearchField";
import { loadStationSnapshot } from "@/lib/feed-client";
import { DEFAULT_PARAMETERS, validateParameters } from "@/lib/params";
import { planTrip } from "@/lib/planner";
import type {
  FeedStatus,
  LatLon,
  PlanResult,
  PlanningParameters,
} from "@/lib/types";

/**
 * The single surface (FR-025): map and itinerary detail side by side, never on
 * separate screens, so consulting one never discards the other.
 *
 * MapLibre touches window and WebGL, neither of which exists when static export
 * prerenders this at build time, so the map is loaded client-side only.
 */
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const MONTREAL: LatLon = { lat: 45.5088, lon: -73.5878 };

const FAILURE_MESSAGES: Record<string, string> = {
  "origin-out-of-coverage":
    "Your starting point is outside the area this network serves.",
  "destination-out-of-coverage":
    "Your destination is outside the area this network serves.",
  "no-station-near-origin":
    "No station is within walking distance of your starting point.",
  "no-mechanical-bike-near-origin":
    "There are stations nearby, but none has a mechanical bike. The free window does not apply to electric bikes.",
  "no-station-near-destination":
    "No station is within walking distance of your destination.",
  "gap-too-large":
    "The stations along this route are too far apart to link with segments that stay inside the free window.",
  "invalid-parameters":
    "These assumptions cannot produce a plan. Adjust them and try again.",
};

const SUGGESTION_LABELS: Record<string, string> = {
  "increase-walk-distance": "Walk further",
  "increase-speed": "Assume a faster pace",
  "reduce-safety-margin": "Keep less margin in hand",
};

export default function PlannerShell() {
  const [feed, setFeed] = useState<FeedStatus>({ state: "loading" });
  const [parameters, setParameters] =
    useState<PlanningParameters>(DEFAULT_PARAMETERS);
  const [origin, setOrigin] = useState<LatLon | null>(null);
  const [destination, setDestination] = useState<LatLon | null>(null);
  const [picking, setPicking] = useState<"origin" | "destination">("origin");
  const [geolocationDenied, setGeolocationDenied] = useState(false);

  // Debounce recomputation so dragging a slider does not queue redundant work
  // (FR-022a). The plan itself is fast; the point is to keep the main thread
  // free while the finger is still moving.
  const [settled, setSettled] = useState(parameters);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current !== null) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setSettled(parameters), 150);
    return () => {
      if (debounce.current !== null) clearTimeout(debounce.current);
    };
  }, [parameters]);

  // Fetch after mount, never during render: static export prerenders this
  // component at build time, and a render-time fetch would bake a stale
  // snapshot into the shipped HTML.
  useEffect(() => {
    let cancelled = false;
    loadStationSnapshot().then((status) => {
      if (!cancelled) setFeed(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Geolocation is read only after mount, and nothing ever blocks on it
  // (FR-003). Denial is a normal path, not an error.
  useEffect(() => {
    const geolocation =
      typeof navigator === "undefined" ? undefined : navigator.geolocation;

    if (geolocation === undefined) {
      // Deferred rather than set inline: a synchronous setState in an effect
      // body cascades an extra render, and React's lint rule rightly rejects it.
      const timer = setTimeout(() => setGeolocationDenied(true), 0);
      return () => clearTimeout(timer);
    }

    geolocation.getCurrentPosition(
      (position) => {
        setOrigin({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
        setPicking("destination");
      },
      () => setGeolocationDenied(true),
      { timeout: 8000 },
    );
  }, []);

  const snapshot =
    feed.state === "ready" || feed.state === "stale" ? feed.snapshot : null;

  const validation = validateParameters(parameters);
  const correction = validation.ok ? null : validation.reason;

  const plan: PlanResult | null = useMemo(() => {
    if (snapshot === null || origin === null || destination === null) return null;
    return planTrip(origin, destination, snapshot, settled);
  }, [snapshot, origin, destination, settled]);

  const handleMapClick = useCallback(
    (point: LatLon) => {
      if (picking === "origin") {
        setOrigin(point);
        setPicking("destination");
      } else {
        setDestination(point);
      }
    },
    [picking],
  );

  const applySuggestion = (kind: string, value: number): void => {
    if (kind === "increase-walk-distance") {
      setParameters((p) => ({ ...p, maxWalkDistance: value }));
    } else if (kind === "increase-speed") {
      setParameters((p) => ({ ...p, cyclingSpeed: value }));
    } else if (kind === "reduce-safety-margin") {
      setParameters((p) => ({ ...p, safetyMargin: value }));
    }
  };

  return (
    <main className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
      <div className="order-2 w-full overflow-y-auto border-zinc-200 p-4 lg:order-1 lg:w-[26rem] lg:shrink-0 lg:border-r dark:border-zinc-800">
        <h1 className="text-xl font-semibold">Free-window trip planner</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Split a ride into segments that each stay inside your subscription’s
          free window.
        </p>

        <div className="mt-4">
          <FeedNotice status={feed} />
        </div>

        <div className="mt-4 space-y-3">
          <SearchField
            label="Start"
            placeholder="Address, or click the map"
            bias={MONTREAL}
            onPick={(position) => setOrigin(position)}
          />
          <SearchField
            label="Destination"
            placeholder="Address, or click the map"
            bias={MONTREAL}
            onPick={(position) => setDestination(position)}
          />
          <p className="text-xs text-zinc-500">
            {geolocationDenied
              ? "Location is unavailable, so pick both points by search or by clicking the map."
              : "You can also click the map."}{" "}
            Next click sets your{" "}
            <button
              type="button"
              className="underline"
              onClick={() =>
                setPicking((p) => (p === "origin" ? "destination" : "origin"))
              }
            >
              {picking === "origin" ? "start" : "destination"}
            </button>
            .
          </p>
        </div>

        <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <ParameterPanel
            parameters={parameters}
            onChange={setParameters}
            correction={correction}
          />
        </div>

        <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {plan === null ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Set a start and a destination to see a plan.
            </p>
          ) : plan.ok ? (
            <ItineraryList
              itinerary={plan.itinerary}
              stations={snapshot?.stations ?? []}
            />
          ) : (
            // FR-028: name the cause and offer something concrete to do.
            <div role="alert">
              <p className="text-sm font-medium">No plan is possible</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {FAILURE_MESSAGES[plan.failure.reason]}
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {plan.failure.suggestions.map((suggestion) => (
                  <li key={suggestion.kind}>
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      onClick={() =>
                        applySuggestion(
                          suggestion.kind,
                          suggestion.suggestedValue,
                        )
                      }
                    >
                      {SUGGESTION_LABELS[suggestion.kind]}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="order-1 h-[45dvh] w-full lg:order-2 lg:h-auto lg:flex-1">
        <MapView
          stations={snapshot?.stations ?? []}
          itinerary={plan?.ok ? plan.itinerary : null}
          origin={origin}
          destination={destination}
          onMapClick={handleMapClick}
        />
      </div>
    </main>
  );
}
