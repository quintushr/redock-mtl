"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import EmptyState from "@/components/EmptyState";
import { FeedFailure } from "@/components/FeedNotice";
import ItineraryTrail from "@/components/ItineraryTrail";
import MapAttribution from "@/components/MapAttribution";
import { Destination, Origin, SwapVertical } from "@/components/icons";
import PanelFooter from "@/components/PanelFooter";
import PlannerPanel from "@/components/PlannerPanel";
import SettingsOverlay from "@/components/SettingsOverlay";
import SearchField from "@/components/SearchField";
import TripSummary from "@/components/TripSummary";
import type { FocusRequest, PickTarget } from "@/components/MapView";
import {
  loadStationSnapshot,
  requestRefresh,
  secondsUntilRefreshPermitted,
} from "@/lib/feed-client";
import { formatCoordinates } from "@/lib/geocode";
import {
  DEFAULT_PARAMETERS,
  changedCount,
  validateParameters,
} from "@/lib/params";
import {
  clearStoredParameters,
  readStoredParameters,
  writeStoredParameters,
} from "@/lib/params-store";
import { planTrip } from "@/lib/planner";
import { noStopRide } from "@/lib/pricing";
import { useStrings } from "@/components/LocaleProvider";
import { useCorridor } from "@/components/useCorridor";
import { useTracedItinerary } from "@/components/useTracedItinerary";
import { describeCorrection } from "@/lib/corrections";
import type {
  FeedStatus,
  LatLon,
  PlanResult,
  PlanningParameters,
  Station,
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

/**
 * The one label this shell generates rather than receives.
 *
 * A field filled from an address holds what the reader chose, and translating
 * that would be rewriting their input. A field filled from the browser's
 * geolocation holds a label we wrote, so it has to follow the interface's
 * language. It is stored as a sentinel and worded on the way to the field,
 * which keeps the geolocation effect free of any dependency on the current
 * language: making that effect re-run on a language change would ask the
 * browser for the position again.
 *
 * The sentinel is deliberately not a word. It used to be the French label,
 * compared against every language's version of it, which meant this file had to
 * read wording by language name — the thing FR-202 exists to make impossible.
 * It also meant a rider who typed "Ma position" into the field had their text
 * silently replaced. A value no keyboard produces has neither problem.
 */
const MY_LOCATION = "\u0000geolocated";

function displayLabel(text: string, myLocation: string): string {
  return text === MY_LOCATION ? myLocation : text;
}

export default function PlannerShell() {
  const t = useStrings();
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
  /**
   * Whether the settings cover the panel.
   *
   * Held here rather than inside the overlay because the footer row that opens
   * it is a sibling, not a parent: one owner, so the row's `aria-expanded` and
   * the overlay's presence cannot disagree.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelId = useId();

  /**
   * The station under the reader's attention, and the station they opened.
   *
   * Two separate things, deliberately. Highlighting follows a pointer or a focus
   * ring and is gone the moment either moves on; a callout was asked for and
   * stays until it is dismissed. Collapsing them into one value would mean either
   * a bubble that flickers open as the pointer crosses the map, or a highlight
   * that outlives the pointer.
   *
   * Both live here rather than in either surface, because the map and the trail
   * both read and both write them, and neither is the other's parent. This is the
   * whole of the cross-highlight: two values in one place and no messages passed
   * between siblings.
   */
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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

  /**
   * Whether the reader's stored parameters have been looked for yet.
   *
   * Guards the write below. Without it the first render would persist the
   * defaults over whatever the reader had chosen, before the read that would
   * have found it — turning a feature meant to remember them into one that
   * quietly forgets.
   */
  const hydrated = useRef(false);

  /**
   * The reader's own parameters, restored.
   *
   * After mount and never during render. The build has no reader, so the
   * prerendered HTML has to be the documented defaults; reading storage while
   * rendering would make the first client render disagree with the server's and
   * produce a hydration mismatch. Same shape as the deferred first `Date.now()`
   * in PanelFooter, for the same reason.
   *
   * The one-frame flash from defaults to stored values is the accepted cost. It
   * is invisible in practice: no plan exists this early, so there is no figure
   * on screen to be seen changing.
   */
  useEffect(() => {
    /*
     * Deferred rather than called in the effect body, for the same reason the
     * geolocation denial below and PanelFooter's first tick are: a synchronous
     * setState in an effect body cascades an extra render, and React's lint rule
     * rightly rejects it.
     */
    const timer = setTimeout(() => {
      const stored = readStoredParameters();
      hydrated.current = true;
      if (stored === null) return;
      setParameters(stored);
      // Both at once rather than letting the debounce carry it, so the first
      // plan is computed against the reader's own assumptions instead of being
      // computed against the defaults and then recomputed 150ms later.
      setSettled(stored);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  /**
   * Remember them, or forget them.
   *
   * Hung off the debounced value rather than the live one: dragging a slider
   * would otherwise write on every frame, for a value nobody reads until the
   * next visit.
   *
   * A set back at its documented defaults *clears* the key rather than storing
   * a copy of it (FR-412a). Doing it here rather than in the reset control is
   * what makes it hold: a clear issued by the overlay would be overwritten by
   * this effect on the very next tick, and the reader who pressed reset would
   * still be carrying a stored set. It also keeps SettingsOverlay from having
   * to import a storage module, which is the sort of crack that widens.
   *
   * The distinction is not pedantry. A stored copy of today's defaults masks
   * any future change to them, permanently, on the machine of every reader who
   * ever pressed reset.
   */
  useEffect(() => {
    if (!hydrated.current) return;
    if (changedCount(settled) === 0) clearStoredParameters();
    else writeStoredParameters(settled);
  }, [settled]);

  /**
   * How long before another fetch is permitted, or null when nothing was
   * refused. Transient: cleared the moment a refresh is allowed through.
   */
  const [refreshWait, setRefreshWait] = useState<number | null>(null);

  /**
   * Load the snapshot, or load it again.
   *
   * Never during render: static export prerenders this component at build
   * time, and a render-time fetch would bake a stale snapshot into the shipped
   * HTML. Held in a callback rather than inlined in the effect so the failure
   * state can offer a retry that means something.
   *
   * This is the *failure* retry, which is a different question from the footer's
   * refresh: there is nothing in hand to be too soon after, so it goes straight
   * to the loader.
   */
  const loadFeed = useCallback(() => {
    setFeed({ state: "loading" });
    loadStationSnapshot().then(setFeed);
  }, []);

  /**
   * The footer's refresh, which the rider presses on purpose.
   *
   * Through requestRefresh rather than the loader, because that is the only
   * entry point that cannot outrun the courtesy floor. A refusal is not an
   * error: it is worded in the footer row and no request is sent (FR-420,
   * FR-421).
   */
  const refreshFeed = useCallback(() => {
    // Asked first only so a refusal does not flash a spinner for the microtask
    // it takes to come back. requestRefresh remains the authority; if this
    // disagreed with it, the module would still refuse.
    const wait = secondsUntilRefreshPermitted();
    if (wait > 0) {
      setRefreshWait(Math.ceil(wait));
      return;
    }

    setRefreshWait(null);
    setFeed({ state: "loading" });

    void requestRefresh().then((outcome) => {
      if (outcome.ok) setFeed(outcome.status);
      else setRefreshWait(Math.ceil(outcome.waitSeconds));
    });
  }, []);

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
        setEndpoint("origin", here, MY_LOCATION);
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
    : describeCorrection(parameters, validation.corrected, t);

  /**
   * The direct path between the two ends, used to estimate rather than to ride.
   *
   * Null until it lands, and null for good if the router cannot be reached. The
   * plan below is computed either way and simply improves when this arrives.
   */
  const corridor = useCorridor(origin, destination);

  const plan: PlanResult | null = useMemo(() => {
    if (snapshot === null || origin === null || destination === null)
      return null;
    /*
     * No `measured` here, and a corridor. The two are different tools: measured
     * distances correct a plan that has already been drawn, one traced pair at a
     * time, while the corridor improves the estimate the first draw is made
     * from. Without it the planner ranks candidate stops by great-circle
     * distance times a scalar, which cannot tell a station on the cycling artery
     * from one on the far side of an escarpment 12 m from the same straight line.
     */
    return planTrip(
      origin,
      destination,
      snapshot,
      settled,
      undefined,
      corridor ?? undefined,
    );
  }, [snapshot, origin, destination, settled, corridor]);

  /**
   * Real geometry for the plan above, filled in as it arrives.
   *
   * Deliberately downstream of `plan`: the itinerary is computed, rendered and
   * usable before this hook has issued a single request, and it stays usable if
   * every one of them fails (FR-321, FR-325). Driven off `settled` rather than
   * `parameters`, so dragging a slider cannot queue requests.
   */
  const traced = useTracedItinerary(plan, snapshot, settled, {
    origin,
    destination,
  });

  /**
   * The itinerary as shown.
   *
   * The refined one once any measurement has landed, the estimated one until
   * then. One variable so the map, the summary and the trail cannot disagree
   * about which durations they are displaying (FR-314).
   */
  const displayed =
    traced?.itinerary ?? (plan !== null && plan.ok ? plan.itinerary : null);

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

  /**
   * The trip that was last framed, as the pair of ends it was computed for.
   *
   * A key and not a boolean, because what must not re-fire is a second framing
   * of the *same* trip, and what must fire is the first framing of a different
   * one. Null until a plan has been framed at all.
   */
  const framedTrip = useRef<string | null>(null);

  /**
   * Frame the route once it exists.
   *
   * Entering two ends used to leave the camera wherever the second address had
   * put it — centred on the destination at zoom 14, with the other end and every
   * stop between them off screen. The plan is the answer this application
   * exists to give and the map is half of how it is read, so the moment there is
   * a route, the map shows the route.
   *
   * Keyed on the two ends and nothing else, which is what keeps it inside
   * FR-026. A parameter change recomputes the plan — different stops, different
   * durations, possibly a different station count — against the same pair of
   * ends, so the key does not move and the camera does not either. That is the
   * whole guarantee: dragging a slider may rewrite the itinerary underneath the
   * reader, but it may never take the map away from them.
   *
   * Every point of the itinerary, not just the two ends. A stop can sit well off
   * the straight line between them — that is rather the point of a stop — and a
   * framing that clipped it would hide the part of the plan the reader did not
   * already know.
   */
  useEffect(() => {
    if (origin === null || destination === null) return;
    if (plan === null || !plan.ok) return;

    const key = `${origin.lat},${origin.lon}>${destination.lat},${destination.lon}`;
    if (framedTrip.current === key) return;
    framedTrip.current = key;

    const positions = new Map(
      (snapshot?.stations ?? []).map((station) => [
        station.id,
        station.position,
      ]),
    );
    const points: LatLon[] = [origin];
    for (const step of plan.itinerary.steps) {
      if (step.kind === "walk") {
        points.push(step.from, step.to);
      } else if (step.kind === "bike") {
        const from = positions.get(step.fromStationId);
        const to = positions.get(step.toStationId);
        if (from !== undefined) points.push(from);
        if (to !== undefined) points.push(to);
      } else {
        const at = positions.get(step.stationId);
        if (at !== undefined) points.push(at);
      }
    }
    points.push(destination);

    focusOn(points);
  }, [plan, origin, destination, snapshot, focusOn]);

  /**
   * A step of the trail was activated: show me that station.
   *
   * Centre and nothing else. `keepZoom` is the point of the request: the reader
   * asked where a station is, not to be taken closer to it, and pulling them to
   * zoom 14 from a framing they chose is the same discard FR-026 exists to
   * prevent. It also leaves the highlight standing, which is what tells a reader
   * with no pointer which of the dots now under the centre of the map is the one
   * they tapped.
   */
  const showStation = useCallback(
    (id: string) => {
      const station = (snapshot?.stations ?? []).find(
        (candidate) => candidate.id === id,
      );
      if (station === undefined) return;
      setHighlighted(id);
      focusCount.current += 1;
      setFocus({
        points: [station.position],
        id: focusCount.current,
        keepZoom: true,
      });
    },
    [snapshot],
  );

  /**
   * "Partir d'ici" and "Aller ici", from the callout.
   *
   * Through the same funnel every other way of setting a point goes through, so
   * a station chosen on the map is indistinguishable downstream from an address
   * typed into the field — and the field shows the station's name, because that
   * is what the reader picked.
   *
   * The callout closes: it was opened to answer a question, and the question has
   * been answered by acting on it.
   */
  const useStation = useCallback(
    (target: PickTarget, station: Station) => {
      setSelected(null);
      setEndpoint(target, station.position, station.name);
      advance(target);
    },
    [setEndpoint, advance],
  );

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
          itinerary={displayed}
          traced={traced}
          origin={origin}
          destination={destination}
          picking={picking}
          focus={focus}
          highlighted={highlighted}
          selected={selected}
          onMapClick={handleMapClick}
          onEndpointMove={handleEndpointMove}
          onHighlight={setHighlighted}
          onSelect={setSelected}
          onUseStation={useStation}
        />

        {/*
          On the map, and inside its container so it is positioned against the
          map's own edges. The tile licences require it to be visible here; the
          panel footer is not where it goes.
        */}
        <MapAttribution
          stations={snapshot?.attribution ?? null}
          routing={traced?.geometry.some((g) => g.status === "traced") ?? false}
        />
      </div>

      <PlannerPanel
        /*
          The sheet takes its expanded ceiling while the settings are drawn.
          The overlay covers the scroll area and only that, so below 768px it
          inherited whatever the reader had left the sheet at — about 48px of
          window at the collapsed one, for nine sliders that no fold is allowed
          to hide.
        */
        overlayOpen={settingsOpen}
        overlay={
          <SettingsOverlay
            id={settingsPanelId}
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            parameters={parameters}
            onChange={setParameters}
            correction={correction}
          />
        }
        footer={
          <PanelFooter
            parameters={parameters}
            settingsOpen={settingsOpen}
            onToggleSettings={() => setSettingsOpen((open) => !open)}
            settingsPanelId={settingsPanelId}
            status={feed}
            onRefresh={refreshFeed}
            refreshWait={refreshWait}
          />
        }
      >
        {/*
          Endpoint entry first. It is an input, but it is the one input the
          result cannot exist without, and the prohibition in FR-101 is on
          planning parameters, not on choosing where you are going.

          There is no heading and no description paragraph here. They spent the
          top of the screen explaining a result that is now visible immediately
          (FR-146).
        */}
        {/*
          The gaps between the three regions are one step smaller below 768px
          and unchanged from it. Nothing here is a design decision being
          reversed: the same rhythm costs the same pixels on both surfaces, and
          on a phone those pixels come out of the trail rather than out of the
          margin around a card.
        */}
        <div className="divide-y divide-edge">
          <div className="pb-2 md:pb-3">
            {/*
              One container, two rows, 78px in total (FR-146a, and the "Saisie
              du départ et de la destination" section of
              docs/ui-guidelines.md).

              It was six stacked elements and about 180px: two headings, two
              bordered fields, a full-width swap button between them and a hint.
              Below 1024px that put the answer the panel exists to give past the
              fold before a single station had been read. The arithmetic now:
              1px border, a 38px row carrying its own 1px rule, a 38px row, 1px
              border.

              The rail is the labelling. A hollow ring is the start and a pin is
              the destination, which is the same grammar the itinerary trail
              uses further down, so it is learned once and read everywhere.
            */}
            <div className="flex rounded-control border border-edge bg-panel">
              <div
                className="relative flex w-7 shrink-0 flex-col items-center"
                aria-hidden="true"
              >
                {/* Between the two marks and behind neither: the segment runs
                    from one icon's edge to the other's, so it joins them
                    rather than striking through them. */}
                <span className="absolute top-[29px] bottom-[29px] w-[1.5px] bg-edge" />
                <span className="flex h-[38px] items-center text-muted">
                  <Origin />
                </span>
                <span className="flex h-[38px] items-center text-brand">
                  <Destination />
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="h-[38px] border-b border-edge">
                  <SearchField
                    label={t.fields.origin}
                    clearLabel={t.fields.clearOrigin}
                    placeholder={t.fields.placeholder}
                    value={displayLabel(originText, t.fields.myLocation)}
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
                </div>

                <div className="h-[38px]">
                  <SearchField
                    label={t.fields.destination}
                    clearLabel={t.fields.clearDestination}
                    placeholder={t.fields.placeholder}
                    value={displayLabel(destinationText, t.fields.myLocation)}
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
                </div>
              </div>

              {/*
                On the right edge and astride both rows, which is where the
                gesture it performs actually happens. 36px wide by the block's
                full 76px, so it clears the touch minimum on its long axis even
                though a row does not.
              */}
              <button
                type="button"
                className="state-layer flex w-9 shrink-0 items-center justify-center self-stretch rounded-r-[7px] border-l border-edge text-muted enabled:hover:text-ink disabled:opacity-40"
                disabled={origin === null && destination === null}
                aria-label={
                  origin === null && destination === null
                    ? t.fields.swapUnavailable
                    : t.fields.swap
                }
                onClick={swapEndpoints}
              >
                <SwapVertical />
              </button>
            </div>

            {/*
            One line, and only when it has something to say. It used to be
            printed unconditionally, and stacked with the feed notice and the
            empty state into three grey paragraphs of equal weight where
            nothing told the reader what to do first.

            The denial line is now tied to the start still being empty.
            `geolocationDenied` never clears, so it used to keep offering "type
            an address, or tap the map to place your start" above a start that
            had been placed several minutes earlier — advice for something
            already done, and two lines of it between the entry block and the
            answer.
          */}
            {(picking !== null || (geolocationDenied && origin === null)) && (
              <p className="mt-2 text-xs text-muted">
                {picking === "origin"
                  ? t.map.hintPickingOrigin
                  : picking === "destination"
                    ? t.map.hintPickingDestination
                    : t.map.hintGeolocationDenied}
              </p>
            )}
          </div>

          {/* The result region. Nothing that sets a planning parameter may appear
            above this point (FR-101). */}
          <div className="pt-2 pb-3 md:pt-3 md:pb-4">
            {feed.state === "unavailable" ? (
              // Without stations there is no plan, so the feed failure *is* the
              // result. It belongs where the reader is already looking.
              <FeedFailure status={feed} onRetry={loadFeed} />
            ) : plan === null ? (
              <EmptyState freeWindow={parameters.freeWindow} />
            ) : plan.ok ? (
              <>
                <TripSummary
                  itinerary={displayed ?? plan.itinerary}
                  noStop={noStop}
                  /*
                    The deferral gate, and the only correct source for it. False
                    while any path is outstanding or a correction is running;
                    true once every request has answered, success or failure, so
                    a plan whose tracing failed entirely is still priced
                    (FR-408a, FR-408b). A literal `true` here would remove the
                    deferral silently, with nothing else failing.
                  */
                  settled={traced?.settled ?? false}
                  /*
                    The debounced set, not the live one, and the same set the
                    `noStop` memo above was built from. Both figures therefore
                    rest on one set of assumptions and neither can lag the other
                    while a slider is still moving (FR-408).
                  */
                  params={settled}
                />
                <div className="mt-3 md:mt-4">
                  <ItineraryTrail
                    itinerary={displayed ?? plan.itinerary}
                    geometry={traced?.geometry ?? null}
                    corrections={traced?.corrections ?? 0}
                    stations={snapshot?.stations ?? []}
                    params={settled}
                    /*
                      The other half of the cross-highlight. The trail writes
                      `highlighted` on hover and on focus and reads it back to
                      tint the row, so pointing at a station on the map lights up
                      its step here without either component knowing the other
                      exists.
                    */
                    highlighted={highlighted}
                    onHighlight={setHighlighted}
                    onSelect={showStation}
                  />
                </div>
              </>
            ) : (
              // FR-028: name the cause and offer something concrete to do.
              <div role="alert">
                <p className="text-sm font-medium">{t.plan.failureTitle}</p>
                <p className="mt-1 text-sm text-muted">
                  {t.plan.failures[plan.failure.reason]}
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {plan.failure.suggestions.map((suggestion) => (
                    <li key={suggestion.kind}>
                      <button
                        type="button"
                        className="state-layer min-h-11 rounded-control border border-edge px-3 text-xs"
                        onClick={() =>
                          applySuggestion(
                            suggestion.kind,
                            suggestion.suggestedValue,
                          )
                        }
                      >
                        {t.plan.suggestions[suggestion.kind]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/*
            The settings and the freshness both used to end the scroll here.
            They are the two rows of the pinned footer now, which is what makes
            them reachable on a three-stop itinerary without scrolling to the
            bottom of it. Nothing replaces them: the scroll ends with the
            result, which is what it is for (FR-101).
          */}
        </div>
      </PlannerPanel>
    </main>
  );
}
