"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FeedFailure, FeedFreshness } from "@/components/FeedNotice";
import ItineraryTrail from "@/components/ItineraryTrail";
import MapAttribution from "@/components/MapAttribution";
import { SwapVertical } from "@/components/icons";
import AssumptionsLine from "@/components/AssumptionsLine";
import NoStopComparison from "@/components/NoStopComparison";
import PlannerPanel from "@/components/PlannerPanel";
import SearchField from "@/components/SearchField";
import TripSummary from "@/components/TripSummary";
import type { FocusRequest, PickTarget } from "@/components/MapView";
import { loadStationSnapshot } from "@/lib/feed-client";
import { formatCoordinates } from "@/lib/geocode";
import { DEFAULT_PARAMETERS, validateParameters } from "@/lib/params";
import { planTrip } from "@/lib/planner";
import { noStopRide } from "@/lib/pricing";
import { describeCorrection, t } from "@/lib/strings";
import type {
  FeedStatus,
  LatLon,
  PlanResult,
  PlanningParameters,
} from "@/lib/types";

/**
 * The single surface: a map filling the frame, with one panel over it
 * (FR-139, FR-140).
 *
 * The panel's order is fixed and is the point of this feature: endpoint entry,
 * then the result, then the assumptions (FR-101, FR-102). Parameters are an
 * input changed once a year; the itinerary is the output read every time. The
 * old arrangement put the input first and charged a scroll on every
 * consultation.
 *
 * MapLibre touches window and WebGL, neither of which exists when static export
 * prerenders this at build time, so the map is loaded client-side only.
 */
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const MONTREAL: LatLon = { lat: 45.5088, lon: -73.5878 };

const FAILURE_MESSAGES = t.plan.failures;

const SUGGESTION_LABELS = t.plan.suggestions;

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
        setEndpoint("origin", here, t.fields.myLocation);
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
  // The domain stays the authority on what is wrong; only the wording is ours.
  const correction = validation.ok
    ? null
    : describeCorrection(parameters, validation.corrected);

  const plan: PlanResult | null = useMemo(() => {
    if (snapshot === null || origin === null || destination === null) return null;
    return planTrip(origin, destination, snapshot, settled);
  }, [snapshot, origin, destination, settled]);

  /**
   * The no-stop ride, recomputed with the plan.
   *
   * Derived from the same `settled` parameters and behind the same debounce, so
   * it can never show an amount from superseded assumptions and never lags the
   * itinerary it is being compared against (FR-135).
   */
  const noStop = useMemo(() => {
    if (plan === null || !plan.ok) return null;
    return noStopRide(plan.itinerary, snapshot?.stations ?? [], settled);
  }, [plan, snapshot, settled]);

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

  /**
   * Arms or disarms the map for the next click.
   *
   * This used to scroll the map into view, because the map sat above the panel
   * and was usually scrolled off screen. The map now fills the frame behind the
   * panel and is always visible, so the scroll has nothing left to do and would
   * only fight the panel's own scrolling.
   */
  const arm = (target: PickTarget): void => {
    setPicking((current) => (current === target ? null : target));
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
    <main className="relative h-dvh w-full overflow-hidden">
      {/*
        The map fills the frame and is mounted exactly once, at a position in
        the tree that nothing conditional sits above (FR-139, FR-145).
        Relocating it under a conditional would remount it, and a remounted map
        is a new MapLibre instance at the default camera, which is precisely the
        silent reset FR-123 and FR-124 forbid.
      */}
      <div className="absolute inset-0">
        <MapView
          stations={snapshot?.stations ?? []}
          itinerary={plan?.ok ? plan.itinerary : null}
          origin={origin}
          destination={destination}
          picking={picking}
          focus={focus}
          onMapClick={handleMapClick}
          onEndpointMove={handleEndpointMove}
        />
      </div>

      <PlannerPanel
        footer={<MapAttribution stations={snapshot?.attribution ?? null} />}
      >
        {/*
          Endpoint entry first. It is an input, but it is the one input the
          result cannot exist without, and the prohibition in FR-101 is on
          planning parameters, not on choosing where you are going.

          There is no heading and no description paragraph here. They spent the
          top of the screen explaining a result that is now visible immediately
          (FR-146).
        */}
        <div className="space-y-3">
          <SearchField
            label={t.fields.origin}
            placeholder={t.fields.placeholder}
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

          {/*
            On the seam between the two fields, which is where the gesture it
            performs actually happens, and 44px square. It used to be a
            full-width run of text off to one side, and it went inert without
            ever saying why; the reason is now in its accessible name.
          */}
          <div className="flex justify-center">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-control border border-line hover:bg-paper disabled:text-muted"
              disabled={origin === null && destination === null}
              aria-label={
                origin === null && destination === null
                  ? t.fields.swapUnavailable
                  : t.fields.swap
              }
              title={
                origin === null && destination === null
                  ? t.fields.swapUnavailable
                  : t.fields.swap
              }
              onClick={swapEndpoints}
            >
              <SwapVertical />
            </button>
          </div>

          <SearchField
            label={t.fields.destination}
            placeholder={t.fields.placeholder}
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

          {/*
            One line, and only when it has something to say. It used to be
            printed unconditionally, and stacked with the feed notice and the
            empty state into three grey paragraphs of equal weight where
            nothing told the reader what to do first.
          */}
          {(picking !== null || geolocationDenied) && (
            <p className="text-xs text-muted">
              {picking !== null
                ? t.map.hintPicking(picking)
                : t.map.hintGeolocationDenied}
            </p>
          )}
        </div>

        {/* The result region. Nothing that sets a planning parameter may appear
            above this point (FR-101). */}
        <div className="mt-4 border-t border-line pt-4">
          {feed.state === "unavailable" ? (
            // Without stations there is no plan, so the feed failure *is* the
            // result. It belongs where the reader is already looking.
            <FeedFailure status={feed} />
          ) : plan === null ? (
            <p className="text-sm text-muted">{t.plan.empty}</p>
          ) : plan.ok ? (
            <>
              <TripSummary itinerary={plan.itinerary} />
              <div className="mt-4">
                <ItineraryTrail
                  itinerary={plan.itinerary}
                  stations={snapshot?.stations ?? []}
                  params={settled}
                />
              </div>
              {/*
                Keyed on nothing: it must survive a parameter change rather than
                remount, or it would close under the reader's finger exactly
                when they are watching the margin move the price (FR-135).
              */}
              <NoStopComparison
                noStop={noStop}
                overageRate={settled.overageRate}
                stopCount={plan.itinerary.stopCount}
              />
            </>
          ) : (
            // FR-028: name the cause and offer something concrete to do.
            <div role="alert">
              <p className="text-sm font-medium">{t.plan.failureTitle}</p>
              <p className="mt-1 text-sm text-muted">
                {FAILURE_MESSAGES[plan.failure.reason]}
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {plan.failure.suggestions.map((suggestion) => (
                  <li key={suggestion.kind}>
                    <button
                      type="button"
                      className="min-h-11 rounded-control border border-line px-3 text-xs hover:bg-paper"
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

        {/* The settings, last, and one line until opened (FR-101, FR-103). */}
        <div className="mt-4 border-t border-line pt-4">
          <AssumptionsLine
            parameters={parameters}
            onChange={setParameters}
            correction={correction}
          />
        </div>

        {/*
          How fresh the figures are, after the result rather than before it.
          It qualifies an answer the reader has already read; between the
          fields and the itinerary it pushed that answer down the panel on
          every single consultation, and the guidelines' imposed order has no
          fifth block above the result.
        */}
        <div className="mt-4">
          <FeedFreshness status={feed} />
        </div>
      </PlannerPanel>
    </main>
  );
}
