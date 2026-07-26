"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import FeedNotice from "@/components/FeedNotice";
import ItineraryList from "@/components/ItineraryList";
import ParameterPanel from "@/components/ParameterPanel";
import SearchField from "@/components/SearchField";
import type { FocusRequest, PickTarget } from "@/components/MapView";
import { loadStationSnapshot } from "@/lib/feed-client";
import { formatCoordinates } from "@/lib/geocode";
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
  // What the two fields show. A point can arrive from an address, a map click,
  // a dragged pin or the browser's geolocation, and the field must say which,
  // so the text is held here rather than inside the field.
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  /**
   * Which end the next map click sets, or null for none.
   *
   * Null is a real state, not an oversight: once both ends are set, an
   * unarmed map is a map the user can pan and inspect without a stray click
   * silently moving their destination. Re-arming is one button on the field
   * that would change.
   */
  const [picking, setPicking] = useState<PickTarget | null>("origin");
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const focusCount = useRef(0);
  const mapPanel = useRef<HTMLDivElement | null>(null);
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

  /**
   * Which ends are already chosen, as a ref.
   *
   * Read from callbacks that outlive the render they were made in: the
   * geolocation fix and the map click both need to know the state at the moment
   * they fire, not the state captured when they were created.
   */
  const chosen = useRef<Record<PickTarget, boolean>>({
    origin: false,
    destination: false,
  });

  /**
   * The single funnel for every way a point can be set: an address, a map
   * click, a dragged pin, geolocation. Point and label move together, so the
   * field can never show an address that is not where the pin is.
   */
  const setEndpoint = useCallback(
    (target: PickTarget, point: LatLon | null, label: string) => {
      chosen.current[target] = point !== null;
      if (target === "origin") {
        setOrigin(point);
        setOriginText(label);
      } else {
        setDestination(point);
        setDestinationText(label);
      }
    },
    [],
  );

  /**
   * Where the next map click goes once this end is set.
   *
   * Setting the start hands the map to the destination, which is the only
   * sequence anyone wants. Setting the last missing end disarms the map
   * entirely, so the click that follows cannot silently move what was just
   * placed. Arming for the *other* end is a deliberate choice and stands.
   */
  const advance = useCallback((target: PickTarget) => {
    setPicking((current) => {
      if (current !== target) return current;
      const other: PickTarget = target === "origin" ? "destination" : "origin";
      return chosen.current[other] ? null : other;
    });
  }, []);

  const focusOn = useCallback((points: LatLon[]) => {
    focusCount.current += 1;
    setFocus({ points, id: focusCount.current });
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
        // A slow fix must never overwrite a start the user chose in the
        // meantime; eight seconds is long enough for that race to be real.
        if (chosen.current.origin) return;
        const here = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        setEndpoint("origin", here, "Your location");
        advance("origin");
        // The user granted the permission; showing them where they are is the
        // whole point of having asked.
        focusOn([here]);
      },
      () => setGeolocationDenied(true),
      { timeout: 8000 },
    );
  }, [setEndpoint, advance, focusOn]);

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
      // An unarmed map is inert. This is the fix for the click that used to
      // land on whichever end had been armed last, which in practice meant
      // every click after the first one moved the destination.
      if (picking === null) return;
      setEndpoint(picking, point, formatCoordinates(point));
      advance(picking);
    },
    [picking, setEndpoint, advance],
  );

  // A dragged pin never re-arms and never moves the camera: the point is
  // already under the finger.
  const handleEndpointMove = useCallback(
    (target: PickTarget, point: LatLon) => {
      setEndpoint(target, point, formatCoordinates(point));
    },
    [setEndpoint],
  );

  const pickFromSearch = (
    target: PickTarget,
    position: LatLon,
    label: string,
  ): void => {
    setEndpoint(target, position, label);
    advance(target);
    // An address the user cannot see on the map is an address they cannot
    // check. Showing both ends once both exist is the useful framing.
    const other = target === "origin" ? destination : origin;
    focusOn(other === null ? [position] : [position, other]);
  };

  const arm = (target: PickTarget): void => {
    const next = picking === target ? null : target;
    setPicking(next);
    // On a phone the map sits above the panel and is usually scrolled off.
    // Arming a map the user cannot see is arming nothing.
    if (next !== null) {
      mapPanel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const clearEndpoint = (target: PickTarget): void => {
    setEndpoint(target, null, "");
    setPicking(target);
  };

  const swapEndpoints = (): void => {
    chosen.current = {
      origin: chosen.current.destination,
      destination: chosen.current.origin,
    };
    setOrigin(destination);
    setDestination(origin);
    setOriginText(destinationText);
    setDestinationText(originText);
  };

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
            placeholder="123 Rue Sainte-Catherine Ouest"
            value={originText}
            point={origin}
            bias={MONTREAL}
            armed={picking === "origin"}
            onValueChange={setOriginText}
            onPick={(position, label) =>
              pickFromSearch("origin", position, label)
            }
            onClear={() => clearEndpoint("origin")}
            onArm={() => arm("origin")}
          />

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
              disabled={origin === null && destination === null}
              onClick={swapEndpoints}
            >
              Swap start and destination
            </button>
          </div>

          <SearchField
            label="Destination"
            placeholder="123 Rue Sainte-Catherine Ouest"
            value={destinationText}
            point={destination}
            bias={MONTREAL}
            armed={picking === "destination"}
            onValueChange={setDestinationText}
            onPick={(position, label) =>
              pickFromSearch("destination", position, label)
            }
            onClear={() => clearEndpoint("destination")}
            onArm={() => arm("destination")}
          />

          <p className="text-xs text-zinc-500">
            {picking !== null
              ? `Click the map to set your ${picking === "origin" ? "start" : "destination"}, or type an address above.`
              : geolocationDenied
                ? "Location is unavailable. Type an address, drag a pin, or use “Pick on map”."
                : "Drag a pin to adjust it, or use “Pick on map” to place one again."}
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

      <div
        ref={mapPanel}
        className="order-1 h-[45dvh] w-full lg:order-2 lg:h-auto lg:flex-1"
      >
        <MapView
          stations={snapshot?.stations ?? []}
          itinerary={plan?.ok ? plan.itinerary : null}
          origin={origin}
          destination={destination}
          picking={picking}
          focus={focus}
          onMapClick={handleMapClick}
          onEndpointMove={handleEndpointMove}
          onCancelPicking={() => setPicking(null)}
        />
      </div>
    </main>
  );
}
