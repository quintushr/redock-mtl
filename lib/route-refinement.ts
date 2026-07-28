import { MAX_CORRECTION_ROUNDS } from "./endpoints";
import { durationFromPath, overBudgetSteps, pathKey } from "./route-geometry";
import { remainingAfter, remainingStatus } from "./remaining";
import type {
  Itinerary,
  ItineraryStep,
  LatLon,
  MeasuredDistance,
  NextAction,
  PlanningParameters,
  RefinementState,
  RoutingRequest,
  Station,
  StepGeometry,
  TracedPath,
} from "./types";

/**
 * The orchestration, as a synchronous state machine.
 *
 * This module exists so that "the source returned a length that breaks the plan"
 * is a unit test over a plain function rather than a React rendering exercise.
 * That case is the reason the whole feature exists; it has to be the easiest
 * thing here to test, not the hardest.
 *
 * The obvious implementation of this feature is a fetch inside a useEffect in
 * the map component with the correction loop written inline beside it. That puts
 * retrieval, caching and the replan decision inside a component that cannot be
 * instantiated without WebGL, and constitution principle III forbids it: "Logic
 * that could be expressed as a pure function MUST NOT be written inside a
 * component."
 *
 * So: pure, synchronous, no async, no import of routing.ts, no import of
 * planner.ts. The caller does the I/O and the replanning; this decides what the
 * I/O should be and what it means.
 */

// ---------------------------------------------------------------------------
// Opening a refinement
// ---------------------------------------------------------------------------

/**
 * Whether a step is something a router could have an opinion about.
 *
 * A docking stop is a place, not a leg: there is no path between a station and
 * itself. Its geometry entry exists only to keep the array index-aligned with
 * the steps, and it must be excluded from anything that asks "is everything
 * resolved yet" — otherwise a plan with an anchor stop never settles, and the
 * itinerary reports itself as still being traced forever.
 */
function isTraceable(step: ItineraryStep): boolean {
  return step.kind === "walk" || step.kind === "bike";
}

/** Every leg that could be traced has left `pending`. */
function isSettled(geometry: StepGeometry[], steps: ItineraryStep[]): boolean {
  return steps.every(
    (step, index) => !isTraceable(step) || geometry[index].status !== "pending",
  );
}

/** What a step needs fetched, or null when it cannot be asked about. */
function requestFor(
  step: ItineraryStep,
  positions: Map<string, LatLon>,
): RoutingRequest | null {
  if (step.kind === "walk") {
    return { from: step.from, to: step.to, profile: "foot" };
  }
  if (step.kind !== "bike") return null;

  const from = positions.get(step.fromStationId);
  const to = positions.get(step.toStationId);
  // A station can leave the feed between planning and refining. Asking for a
  // path between coordinates we no longer hold would be asking about nothing,
  // and it would spend a request to find that out (FR-329c).
  if (from === undefined || to === undefined) return null;

  return {
    from,
    to,
    profile: "bike",
    stations: { fromId: step.fromStationId, toId: step.toStationId },
  };
}

/**
 * Opens a refinement over a fresh plan.
 *
 * Lists what to fetch. Fetches nothing: the plan is complete and displayable the
 * moment this returns, which is what FR-321 requires.
 */
export function beginRefinement(
  plan: Itinerary,
  stations: Station[],
): RefinementState {
  const positions = new Map(stations.map((s) => [s.id, s.position]));

  const outstanding: RoutingRequest[] = [];
  const geometry: StepGeometry[] = plan.steps.map((step) => {
    const request = requestFor(step, positions);
    if (request !== null) outstanding.push(request);
    // A leg nobody can ask about is an approximation immediately; leaving it
    // `pending` would promise an answer that is never coming.
    return request === null && isTraceable(step)
      ? { status: "approximate", path: null }
      : { status: "pending", path: null };
  });

  return {
    traced: {
      itinerary: plan,
      geometry,
      // Usually false, but a plan whose every leg is untraceable is resolved
      // the moment it is opened.
      settled: isSettled(geometry, plan.steps),
      corrections: 0,
    },
    outstanding,
    measured: new Map(),
    rounds: 0,
  };
}

/**
 * Opens the next round over a corrected plan, carrying measurements forward.
 *
 * The measurements are what makes correction terminate: a pair measured once
 * stays measured, so the edge set shrinks monotonically over a finite graph.
 */
export function beginCorrection(
  state: RefinementState,
  corrected: Itinerary,
  stations: Station[],
): RefinementState {
  const next = beginRefinement(corrected, stations);
  return {
    ...next,
    traced: { ...next.traced, corrections: state.traced.corrections + 1 },
    measured: new Map(state.measured),
    rounds: state.rounds + 1,
  };
}

// ---------------------------------------------------------------------------
// Folding a result in
// ---------------------------------------------------------------------------

/** A docking stop carries a cooldown rather than a duration. */
function stepSeconds(step: ItineraryStep): number {
  return step.kind === "dock" ? step.cooldown : step.duration;
}

/**
 * Rebuilds an itinerary's derived figures after a step's duration changed.
 *
 * The total, the free window consumed, and every step's remaining time all
 * follow from the step durations, so they are recomputed together and cannot
 * disagree (FR-314). Remaining is computed here for the same reason
 * `buildItinerary` computes it: a figure, a band and a gauge that derive from
 * different arithmetic will eventually contradict each other on screen.
 */
function rebuild(
  itinerary: Itinerary,
  steps: ItineraryStep[],
  params: PlanningParameters,
): Itinerary {
  const withRemaining = steps.map((step) => {
    if (step.kind !== "bike") return step;
    const remaining = remainingAfter(step.duration, params);
    return { ...step, remaining, remainingStatus: remainingStatus(remaining) };
  });

  return {
    ...itinerary,
    steps: withRemaining,
    totalDuration: withRemaining.reduce((sum, s) => sum + stepSeconds(s), 0),
    freeWindowConsumed: withRemaining.reduce(
      (sum, s) => (s.kind === "bike" ? sum + s.duration : sum),
      0,
    ),
  };
}

/**
 * Which step a resolved request belongs to, or -1.
 *
 * A walk leg is identified by its own endpoints, a bike segment by its pair of
 * station ids. Matching on the key rather than on array position is what makes
 * a late result for a superseded plan land nowhere instead of on whichever step
 * happens to sit at that index now (FR-327).
 */
function indexOfRequest(steps: ItineraryStep[], request: RoutingRequest): number {
  const wanted = pathKey(request);

  return steps.findIndex((step) => {
    if (step.kind === "walk") {
      return pathKey({ from: step.from, to: step.to, profile: "foot" }) === wanted;
    }
    if (step.kind !== "bike") return false;
    return (
      pathKey({
        from: request.from,
        to: request.to,
        profile: "bike",
        stations: { fromId: step.fromStationId, toId: step.toStationId },
      }) === wanted
    );
  });
}

/**
 * Folds one resolved request into the state.
 *
 * `path === null` means the request failed, timed out, returned nothing, or was
 * rejected as implausible. All of those are the same to a rider: this part of
 * the journey is an approximation and says so (FR-324).
 *
 * Referentially transparent. Same state in, same state out, no mutation of the
 * argument. The hook holds this in useState, and a mutated object would make
 * React skip the render.
 */
export function applyPath(
  state: RefinementState,
  request: RoutingRequest,
  path: TracedPath | null,
  params: PlanningParameters,
): RefinementState {
  const wanted = pathKey(request);
  const outstanding = state.outstanding.filter((r) => pathKey(r) !== wanted);
  const index = indexOfRequest(state.traced.itinerary.steps, request);

  // A result for something we never asked about, or for a step that has already
  // resolved. Neither may overwrite what is on screen (FR-327).
  if (index === -1) return { ...state, outstanding };
  if (state.traced.geometry[index].status !== "pending") {
    return { ...state, outstanding };
  }

  const geometry = [...state.traced.geometry];
  geometry[index] =
    path === null
      ? { status: "approximate", path: null }
      : { status: "traced", path };

  const measured = new Map(state.measured);
  const steps = [...state.traced.itinerary.steps];

  if (path !== null) {
    const step = steps[index];
    /*
     * Both figures come from the measured path, never one from each.
     *
     * Updating the duration and leaving the distance behind produced a step that
     * drew a 2.6 km route, timed it as 2.6 km, and printed "2.0 km" beside both.
     * The rider cannot tell which to believe, and the wrong one is the only one
     * they can check against the map in front of them.
     */
    const duration = durationFromPath(path, params);
    steps[index] = { ...step, duration, distance: path.length } as ItineraryStep;
    if (step.kind === "bike") {
      measured.set(
        pathKey({
          from: request.from,
          to: request.to,
          profile: "bike",
          stations: { fromId: step.fromStationId, toId: step.toStationId },
        }),
        path.length,
      );
    }
  }

  return {
    ...state,
    traced: {
      ...state.traced,
      itinerary: rebuild(state.traced.itinerary, steps, params),
      geometry,
      settled: isSettled(geometry, steps),
    },
    outstanding,
    measured,
  };
}

// ---------------------------------------------------------------------------
// Deciding what happens next
// ---------------------------------------------------------------------------

/**
 * What the caller must do next.
 *
 * The whole decision, including termination, lives here rather than in a
 * component. `nextAction` is a function of its arguments alone: called twice on
 * the same state it returns the same action, which is what makes the correction
 * case assertable without a clock, a network or a renderer.
 */
export function nextAction(
  state: RefinementState,
  params: PlanningParameters,
): NextAction {
  // Anything still outstanding is asked for first. Deciding a plan is broken
  // before every measurement is in would rearrange a rider's trip on partial
  // information and possibly rearrange it back a moment later.
  if (state.outstanding.length > 0) {
    return { kind: "fetch", requests: [...state.outstanding] };
  }

  const over = overBudgetSteps(state.traced, params);
  if (over.length === 0) return { kind: "settled" };

  // The measurements say the plan does not hold, and we have run out of
  // patience for rearranging it. FR-319: say so plainly rather than loop.
  if (state.rounds >= MAX_CORRECTION_ROUNDS) return { kind: "exhausted" };

  return { kind: "replan", measured: lookup(state), reason: "over-budget" };
}

/**
 * The measurements gathered so far, as the sparse function the planner takes.
 *
 * Every pair measured across every round, not just this one's: that is what
 * makes correction terminate. A pair measured once stays measured, so each
 * round can only remove edges, and the edge set shrinks monotonically over a
 * finite graph.
 */
function lookup(state: RefinementState): MeasuredDistance {
  const measured = state.measured;
  return (fromStationId, toStationId) =>
    measured.get(
      pathKey({
        // Coordinates are ignored by the station form of the key, so any point
        // will do here; the identity is the pair of ids.
        from: { lat: 0, lon: 0 },
        to: { lat: 0, lon: 0 },
        profile: "bike",
        stations: { fromId: fromStationId, toId: toStationId },
      }),
    );
}
