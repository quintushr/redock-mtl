import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import {
  applyPath,
  beginRefinement,
  nextAction,
} from "@/lib/route-refinement";
import type { Itinerary, Station, TracedPath } from "@/lib/types";

/**
 * The refinement state machine.
 *
 * Imports nothing from components/. No React, no jsdom, no fake timers, no
 * network. That is the whole point of the module existing: the rules about what
 * to fetch and what to do with the answer are decided here, where they can be
 * asserted directly.
 */

const stations: Station[] = [
  {
    id: "A",
    name: "A",
    position: { lat: 45.5017, lon: -73.5673 },
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
    name: "B",
    position: { lat: 45.5088, lon: -73.554 },
    capacity: 20,
    mechanicalBikesAvailable: 3,
    ebikesAvailable: 0,
    docksAvailable: 8,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
  },
];

const ORIGIN = { lat: 45.5, lon: -73.57 };
const DESTINATION = { lat: 45.51, lon: -73.55 };

/** Walk, ride, walk. The shape of every simple plan. */
function itinerary(): Itinerary {
  return {
    steps: [
      {
        kind: "walk",
        from: ORIGIN,
        to: stations[0].position,
        toStationId: "A",
        duration: 200,
        distance: 250,
      },
      {
        kind: "bike",
        fromStationId: "A",
        toStationId: "B",
        duration: 600,
        distance: 1800,
        remaining: 1800,
        remainingStatus: "comfortable",
      },
      {
        kind: "walk",
        from: stations[1].position,
        to: DESTINATION,
        toStationId: null,
        duration: 150,
        distance: 180,
      },
    ],
    totalDuration: 950,
    stopCount: 0,
    freeWindowConsumed: 600,
    snapshotObservedAt: new Date("2026-07-28T10:00:00Z"),
  };
}

const path = (length: number, profile: "bike" | "foot" = "bike"): TracedPath => ({
  coordinates: [
    { lat: 45.5017, lon: -73.5673 },
    { lat: 45.5088, lon: -73.554 },
  ],
  length,
  profile,
});

describe("beginRefinement", () => {
  it("produces a complete itinerary with every step pending", () => {
    const state = beginRefinement(itinerary(), stations);
    expect(state.traced.geometry).toHaveLength(3);
    expect(state.traced.geometry.every((g) => g.status === "pending")).toBe(true);
    expect(state.traced.settled).toBe(false);
    expect(state.traced.corrections).toBe(0);
  });

  it("keeps geometry index-aligned with steps", () => {
    const plan = itinerary();
    const state = beginRefinement(plan, stations);
    expect(state.traced.geometry).toHaveLength(plan.steps.length);
  });

  it("lists one request per step and fetches nothing", () => {
    const state = beginRefinement(itinerary(), stations);
    expect(state.outstanding).toHaveLength(3);
    // The function is synchronous and returns a value. There is nothing here
    // that could perform I/O even if it wanted to.
    expect(state.outstanding[1].profile).toBe("bike");
    expect(state.outstanding[1].stations).toEqual({ fromId: "A", toId: "B" });
  });

  it("asks for the travel mode of each step", () => {
    const state = beginRefinement(itinerary(), stations);
    expect(state.outstanding.map((r) => r.profile)).toEqual([
      "foot",
      "bike",
      "foot",
    ]);
  });

  it("gives walk legs no station key, since their ends are arbitrary", () => {
    const state = beginRefinement(itinerary(), stations);
    expect(state.outstanding[0].stations).toBeUndefined();
    expect(state.outstanding[2].stations).toBeUndefined();
  });

  it("skips a bike step whose stations are not in the snapshot", () => {
    // A station can leave the feed between planning and refining. Asking for a
    // path between coordinates we no longer have would be asking about nothing.
    const state = beginRefinement(itinerary(), []);
    expect(state.outstanding.some((r) => r.profile === "bike")).toBe(false);
  });
});

describe("applyPath", () => {
  it("marks the matching step traced and leaves the others untouched", () => {
    const start = beginRefinement(itinerary(), stations);
    const next = applyPath(
      start,
      start.outstanding[1],
      path(1900),
      DEFAULT_PARAMETERS,
    );

    expect(next.traced.geometry[1].status).toBe("traced");
    expect(next.traced.geometry[1].path?.length).toBe(1900);
    expect(next.traced.geometry[0].status).toBe("pending");
    expect(next.traced.geometry[2].status).toBe("pending");
  });

  it("marks the step approximate when there is no path", () => {
    const start = beginRefinement(itinerary(), stations);
    const next = applyPath(start, start.outstanding[1], null, DEFAULT_PARAMETERS);

    expect(next.traced.geometry[1].status).toBe("approximate");
    expect(next.traced.geometry[1].path).toBeNull();
  });

  it("removes the request from outstanding", () => {
    const start = beginRefinement(itinerary(), stations);
    const next = applyPath(
      start,
      start.outstanding[1],
      path(1900),
      DEFAULT_PARAMETERS,
    );
    expect(next.outstanding).toHaveLength(2);
  });

  it("is idempotent: applying the same request twice changes nothing further", () => {
    const start = beginRefinement(itinerary(), stations);
    const once = applyPath(
      start,
      start.outstanding[1],
      path(1900),
      DEFAULT_PARAMETERS,
    );
    const twice = applyPath(
      once,
      start.outstanding[1],
      path(1900),
      DEFAULT_PARAMETERS,
    );
    expect(twice.traced.geometry).toEqual(once.traced.geometry);
    expect(twice.outstanding).toHaveLength(once.outstanding.length);
  });

  it("does not mutate the state it was given", () => {
    // The hook holds this in useState. A mutation would make React skip the
    // render and the rider would watch nothing happen.
    const start = beginRefinement(itinerary(), stations);
    const before = JSON.stringify(start.traced.geometry);
    applyPath(start, start.outstanding[1], path(1900), DEFAULT_PARAMETERS);
    expect(JSON.stringify(start.traced.geometry)).toBe(before);
  });

  it("discards a result for a request it did not ask for", () => {
    const start = beginRefinement(itinerary(), stations);
    const foreign = {
      from: { lat: 1, lon: 1 },
      to: { lat: 2, lon: 2 },
      profile: "bike" as const,
      stations: { fromId: "X", toId: "Y" },
    };
    const next = applyPath(start, foreign, path(999), DEFAULT_PARAMETERS);
    expect(next.traced.geometry.every((g) => g.status === "pending")).toBe(true);
  });

  it("refines the step's duration from the measured length", () => {
    const start = beginRefinement(itinerary(), stations);
    const next = applyPath(
      start,
      start.outstanding[1],
      path(3000),
      DEFAULT_PARAMETERS,
    );
    const step = next.traced.itinerary.steps[1];
    expect(step.kind).toBe("bike");
    if (step.kind !== "bike") return;
    // 3000 m at 15 km/h plus 90 s of overhead, not the 600 s the estimate had.
    expect(step.duration).toBeCloseTo(3000 / DEFAULT_PARAMETERS.cyclingSpeed + 90, 5);
  });

  it("reports the measured distance, not the estimate it replaced", () => {
    /*
     * A traced step must not keep the straight-line figure anywhere a rider can
     * read it. Leaving `distance` alone produced a step that drew a 2.6 km path,
     * derived its duration from 2.6 km, and printed "2.0 km" beside both. The
     * rider has no way to tell which of the three to believe, and the one that
     * is wrong is the only one they can check against a map.
     */
    const start = beginRefinement(itinerary(), stations);
    const before = start.traced.itinerary.steps[1];
    expect(before.kind === "bike" && before.distance).toBe(1800);

    const next = applyPath(
      start,
      start.outstanding[1],
      path(2600),
      DEFAULT_PARAMETERS,
    );

    const step = next.traced.itinerary.steps[1];
    expect(step.kind).toBe("bike");
    if (step.kind !== "bike") return;
    expect(step.distance).toBe(2600);
    // And it agrees with the duration derived from the same length.
    expect(step.duration).toBeCloseTo(
      2600 / DEFAULT_PARAMETERS.cyclingSpeed + DEFAULT_PARAMETERS.segmentOverhead,
      5,
    );
  });

  it("reports the measured distance on a walk leg too", () => {
    const start = beginRefinement(itinerary(), stations);
    const walk = start.outstanding.find((r) => r.profile === "foot")!;
    const next = applyPath(start, walk, path(420, "foot"), DEFAULT_PARAMETERS);

    const step = next.traced.itinerary.steps[0];
    expect(step.kind).toBe("walk");
    if (step.kind !== "walk") return;
    expect(step.distance).toBe(420);
  });

  it("leaves the estimated distance alone when there is no path", () => {
    const start = beginRefinement(itinerary(), stations);
    const next = applyPath(start, start.outstanding[1], null, DEFAULT_PARAMETERS);
    const step = next.traced.itinerary.steps[1];
    expect(step.kind === "bike" && step.distance).toBe(1800);
  });

  it("recomputes the total from refined durations", () => {
    const start = beginRefinement(itinerary(), stations);
    const next = applyPath(
      start,
      start.outstanding[1],
      path(3000),
      DEFAULT_PARAMETERS,
    );
    const sum = next.traced.itinerary.steps.reduce(
      (total, step) => total + (step.kind === "dock" ? step.cooldown : step.duration),
      0,
    );
    expect(next.traced.itinerary.totalDuration).toBeCloseTo(sum, 5);
  });
});

describe("nextAction", () => {
  it("asks for the outstanding requests while any remain", () => {
    const state = beginRefinement(itinerary(), stations);
    const action = nextAction(state, DEFAULT_PARAMETERS);
    expect(action.kind).toBe("fetch");
    if (action.kind !== "fetch") return;
    expect(action.requests).toHaveLength(3);
  });

  it("settles only once every step has left pending", () => {
    let state = beginRefinement(itinerary(), stations);
    const requests = [...state.outstanding];

    for (const request of requests.slice(0, 2)) {
      state = applyPath(state, request, path(500, request.profile), DEFAULT_PARAMETERS);
      expect(nextAction(state, DEFAULT_PARAMETERS).kind).toBe("fetch");
    }

    state = applyPath(state, requests[2], null, DEFAULT_PARAMETERS);
    expect(nextAction(state, DEFAULT_PARAMETERS).kind).toBe("settled");
    expect(state.traced.settled).toBe(true);
  });

  it("settles a plan that has a docking stop", () => {
    /*
     * A docking stop is a place, not a leg, so no request is ever made for it
     * and its geometry entry never leaves `pending`. Counting it as unresolved
     * meant any plan with an anchor stop reported itself as still being traced
     * forever, which is every plan the product exists to produce.
     */
    const withStop: Itinerary = {
      ...itinerary(),
      steps: [
        itinerary().steps[0],
        itinerary().steps[1],
        { kind: "dock", stationId: "B", cooldown: 60 },
        itinerary().steps[2],
      ],
      stopCount: 1,
    };

    let state = beginRefinement(withStop, stations);
    for (const request of [...state.outstanding]) {
      state = applyPath(state, request, null, DEFAULT_PARAMETERS);
    }

    expect(state.traced.settled).toBe(true);
    expect(nextAction(state, DEFAULT_PARAMETERS).kind).toBe("settled");
  });

  it("is a function of its arguments alone", () => {
    const state = beginRefinement(itinerary(), stations);
    const first = nextAction(state, DEFAULT_PARAMETERS);
    const second = nextAction(state, DEFAULT_PARAMETERS);
    expect(second).toEqual(first);
  });
});
