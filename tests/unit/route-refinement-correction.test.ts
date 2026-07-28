import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import { planTrip } from "@/lib/planner";
import {
  applyPath,
  beginCorrection,
  beginRefinement,
  nextAction,
} from "@/lib/route-refinement";
import { MAX_CORRECTION_ROUNDS } from "@/lib/endpoints";
import { eastEnd, near, snapshot, westEnd } from "./fixture";
import type {
  Itinerary,
  PlanningParameters,
  RefinementState,
  Station,
  TracedPath,
} from "@/lib/types";

/**
 * The case this whole feature exists for.
 *
 * The estimate said a segment fits inside the free window. The real path is
 * longer, and it does not. A rider who is not told sets off on a plan that will
 * bill them, which is the one failure this product is built to prevent.
 *
 * Note what this file imports: lib/, and nothing else. No React, no jsdom, no
 * @testing-library, no fake timers, no network. If the correction decision ever
 * drifts into a component, this test cannot be written and
 * tests/unit/routing-boundaries.test.ts fails the build.
 */

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

const stations: Station[] = [
  {
    id: "A",
    name: "Alpha",
    position: { lat: 45.5, lon: -73.6 },
    capacity: 20,
    mechanicalBikesAvailable: 5,
    ebikesAvailable: 0,
    docksAvailable: 10,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
  },
  {
    id: "B",
    name: "Bravo",
    position: { lat: 45.52, lon: -73.58 },
    capacity: 20,
    mechanicalBikesAvailable: 3,
    ebikesAvailable: 0,
    docksAvailable: 8,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
  },
];

/** Walk, ride A->B, walk. The ride's estimate sits comfortably inside budget. */
function plan(rideSeconds: number): Itinerary {
  return {
    steps: [
      {
        kind: "walk",
        from: { lat: 45.499, lon: -73.601 },
        to: stations[0].position,
        toStationId: "A",
        duration: 200,
        distance: 250,
      },
      {
        kind: "bike",
        fromStationId: "A",
        toStationId: "B",
        duration: rideSeconds,
        distance: 2000,
        remaining: budget - rideSeconds,
        remainingStatus: "comfortable",
      },
      {
        kind: "walk",
        from: stations[1].position,
        to: { lat: 45.521, lon: -73.579 },
        toStationId: null,
        duration: 150,
        distance: 180,
      },
    ],
    totalDuration: 350 + rideSeconds,
    stopCount: 0,
    freeWindowConsumed: rideSeconds,
    snapshotObservedAt: new Date("2026-07-28T10:00:00Z"),
  };
}

const bikePath = (length: number): TracedPath => ({
  coordinates: [stations[0].position, stations[1].position],
  length,
  profile: "bike",
});

/**
 * Resolves every outstanding request: the given length for the ride, nothing
 * for the walks.
 *
 * The decision deliberately waits until nothing is outstanding. Declaring a plan
 * broken on partial measurements would rearrange a rider's trip and possibly
 * rearrange it back a moment later, which is worse than taking the extra second.
 */
function resolveAll(
  state: RefinementState,
  rideLength: number,
): RefinementState {
  let next = state;
  for (const request of [...state.outstanding]) {
    next = applyPath(
      next,
      request,
      request.profile === "bike" ? bikePath(rideLength) : null,
      params,
    );
  }
  return next;
}

/** A length whose duration exceeds the usable budget at the given parameters. */
function overBudgetLength(p: PlanningParameters): number {
  return (budget - p.segmentOverhead + 600) * p.cyclingSpeed;
}

describe("a measured length that breaks the plan", () => {
  it("asks for a replan", () => {
    // The estimate had this ride at half the budget: comfortable.
    let state = beginRefinement(plan(budget * 0.5), stations);
    expect(nextAction(state, params).kind).toBe("fetch");

    // Reality is far longer.
    state = resolveAll(state, overBudgetLength(params));

    const action = nextAction(state, params);
    expect(action.kind).toBe("replan");
    if (action.kind !== "replan") return;
    expect(action.reason).toBe("over-budget");
  });

  it("hands back a lookup carrying the measured length", () => {
    let state = beginRefinement(plan(budget * 0.5), stations);
    const length = overBudgetLength(params);
    state = resolveAll(state, length);

    const action = nextAction(state, params);
    if (action.kind !== "replan") throw new Error("expected a replan");

    expect(action.measured("A", "B")).toBe(length);
    // Sparse: it answers about what was measured and nothing else, so the
    // planner keeps using its estimate everywhere it has no better information.
    expect(action.measured("A", "Z")).toBeUndefined();
    expect(action.measured("Z", "A")).toBeUndefined();
  });

  it("produces a plan that no longer uses the over-budget edge", () => {
    // The other half of the case: the lookup goes to the planner, and the
    // corrected plan routes around the segment that no longer fits. Against the
    // real Montreal snapshot, because the point is that an ordinary
    // shortest-path run over a real network does this without a repair step.
    const origin = near(westEnd);
    const destination = near(eastEnd);

    const first = planTrip(origin, destination, snapshot, params);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const ride = first.itinerary.steps.find((s) => s.kind === "bike");
    expect(ride).toBeDefined();
    if (ride === undefined || ride.kind !== "bike") return;

    // Declare that this particular pair is far longer than it looked.
    const measured = (from: string, to: string): number | undefined =>
      from === ride.fromStationId && to === ride.toStationId
        ? overBudgetLength(params)
        : undefined;

    const corrected = planTrip(origin, destination, snapshot, params, measured);
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) return;

    const stillUsed = corrected.itinerary.steps.some(
      (step) =>
        step.kind === "bike" &&
        step.fromStationId === ride.fromStationId &&
        step.toStationId === ride.toStationId,
    );
    expect(stillUsed).toBe(false);

    // And the corrected plan still honours the invariant the whole product
    // rests on: no segment exceeds the usable budget (FR-004).
    for (const step of corrected.itinerary.steps) {
      if (step.kind === "bike") expect(step.duration).toBeLessThanOrEqual(budget);
    }
  });
});

describe("a measured length that does not break the plan", () => {
  it("settles when the ride still fits", () => {
    let state = beginRefinement(plan(budget * 0.5), stations);
    for (const request of [...state.outstanding]) {
      state = applyPath(
        state,
        request,
        request.profile === "bike" ? bikePath(2100) : null,
        params,
      );
    }
    expect(nextAction(state, params).kind).toBe("settled");
  });

  it("proposes no correction when the real path is shorter than the estimate", () => {
    // FR-320. A pleasant surprise is not a reason to rearrange someone's trip.
    let state = beginRefinement(plan(budget * 0.9), stations);
    for (const request of [...state.outstanding]) {
      state = applyPath(
        state,
        request,
        request.profile === "bike" ? bikePath(400) : null,
        params,
      );
    }

    expect(nextAction(state, params).kind).toBe("settled");
    const ride = state.traced.itinerary.steps[1];
    expect(ride.kind).toBe("bike");
    if (ride.kind !== "bike") return;
    expect(ride.duration).toBeLessThan(budget * 0.9);
  });

  it("ignores a walk leg that got longer", () => {
    // Walking does not spend the free window, so a longer walk is a worse
    // estimate but never an invalid plan.
    let state = beginRefinement(plan(budget * 0.5), stations);
    for (const request of [...state.outstanding]) {
      state = applyPath(
        state,
        request,
        request.profile === "foot"
          ? { coordinates: [stations[0].position, stations[1].position], length: 9000, profile: "foot" }
          : bikePath(2100),
        params,
      );
    }
    expect(nextAction(state, params).kind).toBe("settled");
  });
});

describe("correction terminates", () => {
  it("gives up rather than looping once the cap is reached", () => {
    let state = beginRefinement(plan(budget * 0.5), stations);

    for (let round = 0; round < MAX_CORRECTION_ROUNDS; round += 1) {
      state = resolveAll(state, overBudgetLength(params));
      const action = nextAction(state, params);
      expect(action.kind).toBe("replan");
      state = beginCorrection(state, plan(budget * 0.5), stations);
    }

    // The cap is reached. One more over-budget measurement must not ask for a
    // fourth replan: a rider watching their itinerary rearrange four times has
    // lost the plot, whatever the theory says about termination.
    state = resolveAll(state, overBudgetLength(params));
    expect(nextAction(state, params).kind).toBe("exhausted");
  });

  it("counts the rounds it has spent", () => {
    let state = beginRefinement(plan(budget * 0.5), stations);
    expect(state.traced.corrections).toBe(0);

    state = beginCorrection(state, plan(budget * 0.5), stations);
    expect(state.traced.corrections).toBe(1);
    expect(state.rounds).toBe(1);
  });

  it("carries measurements into the next round", () => {
    // This is what makes termination structural rather than merely capped: a
    // pair measured once stays measured, so the edge set shrinks monotonically.
    let state = beginRefinement(plan(budget * 0.5), stations);
    const length = overBudgetLength(params);
    state = resolveAll(state, length);
    expect(state.measured.size).toBe(1);

    const next = beginCorrection(state, plan(budget * 0.5), stations);
    expect(next.measured.size).toBe(1);
    expect([...next.measured.values()]).toContain(length);
  });
});
