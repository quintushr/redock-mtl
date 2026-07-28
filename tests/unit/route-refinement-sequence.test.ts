import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import { applyPath, beginRefinement, nextAction } from "@/lib/route-refinement";
import type { Itinerary, Station, TracedPath } from "@/lib/types";

/**
 * The plan appears immediately and sharpens afterwards (US5).
 *
 * Everything here is synchronous, which is itself the point being made: the
 * sequence these tests describe involves no clock, no promise and no renderer,
 * because the state machine is where the ordering lives. The hook only carries
 * it out.
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

const plan: Itinerary = {
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
      duration: budget * 0.5,
      distance: 2000,
      remaining: budget * 0.5,
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
  totalDuration: 350 + budget * 0.5,
  stopCount: 0,
  freeWindowConsumed: budget * 0.5,
  snapshotObservedAt: new Date("2026-07-28T10:00:00Z"),
};

const path = (length: number, profile: "bike" | "foot"): TracedPath => ({
  coordinates: [stations[0].position, stations[1].position],
  length,
  profile,
});

describe("the plan is complete before any path exists (FR-321)", () => {
  it("hands back every step immediately, all pending", () => {
    const state = beginRefinement(plan, stations);
    expect(state.traced.itinerary.steps).toHaveLength(3);
    expect(state.traced.itinerary.totalDuration).toBe(plan.totalDuration);
    expect(state.traced.geometry.every((g) => g.status === "pending")).toBe(true);
  });

  it("performs no I/O to do it", () => {
    // beginRefinement is synchronous and returns a plain value. There is no
    // promise to await and nothing to mock, which is the strongest form this
    // assertion can take.
    const state = beginRefinement(plan, stations);
    expect(state).not.toBeInstanceOf(Promise);
    expect(state.outstanding).toHaveLength(3);
  });
});

describe("results land one at a time (FR-322)", () => {
  it("refines one step without touching the others", () => {
    const start = beginRefinement(plan, stations);
    const bike = start.outstanding.find((r) => r.profile === "bike")!;

    const after = applyPath(start, bike, path(3000, "bike"), params);

    expect(after.traced.geometry[1].status).toBe("traced");
    expect(after.traced.geometry[0].status).toBe("pending");
    expect(after.traced.geometry[2].status).toBe("pending");
    // The other two steps keep the durations the planner gave them.
    expect(after.traced.itinerary.steps[0].kind === "walk" &&
      after.traced.itinerary.steps[0].duration).toBe(200);
  });

  it("does not wait for a slow sibling before showing a fast one", () => {
    const start = beginRefinement(plan, stations);
    const walks = start.outstanding.filter((r) => r.profile === "foot");

    // The two walks arrive; the ride is still in flight.
    let state = applyPath(start, walks[0], path(300, "foot"), params);
    state = applyPath(state, walks[1], path(220, "foot"), params);

    expect(state.traced.geometry[0].status).toBe("traced");
    expect(state.traced.geometry[2].status).toBe("traced");
    expect(state.traced.geometry[1].status).toBe("pending");
    expect(state.traced.settled).toBe(false);
    // And the itinerary is usable throughout.
    expect(state.traced.itinerary.steps).toHaveLength(3);
  });

  it("is order-independent", () => {
    // Two paths arriving in either order produce the same state. Network
    // ordering is not something a rider should be able to observe.
    const start = beginRefinement(plan, stations);
    const [first, second] = start.outstanding;

    const forwards = applyPath(
      applyPath(start, first, path(300, first.profile), params),
      second,
      path(400, second.profile),
      params,
    );
    const backwards = applyPath(
      applyPath(start, second, path(400, second.profile), params),
      first,
      path(300, first.profile),
      params,
    );

    expect(forwards.traced.geometry).toEqual(backwards.traced.geometry);
    expect(forwards.traced.itinerary.totalDuration).toBeCloseTo(
      backwards.traced.itinerary.totalDuration,
      5,
    );
  });
});

describe("a result for a plan nobody is looking at lands nowhere (FR-327)", () => {
  it("ignores a request that was never outstanding", () => {
    const start = beginRefinement(plan, stations);
    const foreign = {
      from: { lat: 1, lon: 1 },
      to: { lat: 2, lon: 2 },
      profile: "bike" as const,
      stations: { fromId: "X", toId: "Y" },
    };

    const after = applyPath(start, foreign, path(9999, "bike"), params);
    expect(after.traced).toEqual(start.traced);
  });

  it("ignores a second answer for a step already resolved", () => {
    // Two answers for one request means one of them is stale. The first wins,
    // because the second cannot be newer information about the same question.
    const start = beginRefinement(plan, stations);
    const bike = start.outstanding.find((r) => r.profile === "bike")!;

    const once = applyPath(start, bike, path(2000, "bike"), params);
    const twice = applyPath(once, bike, path(8000, "bike"), params);

    expect(twice.traced.geometry[1].path?.length).toBe(2000);
  });
});

describe("walk legs (US4)", () => {
  it("asks about walks on foot and rides by bike (FR-303)", () => {
    const state = beginRefinement(plan, stations);
    expect(state.outstanding.map((r) => r.profile)).toEqual([
      "foot",
      "bike",
      "foot",
    ]);
  });

  it("keys a walk on its own endpoints, never on a station pair (FR-329b)", () => {
    // A walk's ends are wherever the rider tapped, so it has no station
    // identity and must not reach the persistent store.
    const state = beginRefinement(plan, stations);
    for (const request of state.outstanding) {
      if (request.profile === "foot") expect(request.stations).toBeUndefined();
      else expect(request.stations).toBeDefined();
    }
  });

  it("refines a walk's duration from its measured length", () => {
    const start = beginRefinement(plan, stations);
    const walk = start.outstanding.find((r) => r.profile === "foot")!;
    const after = applyPath(start, walk, path(600, "foot"), params);

    const step = after.traced.itinerary.steps[0];
    expect(step.kind).toBe("walk");
    if (step.kind !== "walk") return;
    // No segment overhead on foot: there is nothing to unlock.
    expect(step.duration).toBeCloseTo(600 / params.walkingSpeed, 5);
  });

  it("never lets a walk trigger a correction", () => {
    // Walking does not spend the free window, so a longer walk is a worse
    // estimate and never an invalid plan.
    let state = beginRefinement(plan, stations);
    for (const request of [...state.outstanding]) {
      state = applyPath(
        state,
        request,
        request.profile === "foot"
          ? path(60_000, "foot")
          : path(2000, "bike"),
        params,
      );
    }
    expect(nextAction(state, params).kind).toBe("settled");
  });
});
