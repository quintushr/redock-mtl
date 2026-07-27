import { describe, expect, it } from "vitest";
import { noStopRide, overageCost } from "@/lib/pricing";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import { remainingAfter, remainingStatus } from "@/lib/remaining";
import type { Itinerary, PlanningParameters, Station } from "@/lib/types";

/**
 * What the same trip would cost ridden straight through.
 *
 * The comparison exists to let a rider judge whether the stops are worth the
 * trouble, so the only thing allowed to differ between the plan and this ride
 * is the stops themselves. Same endpoints, same walks, same station pair, same
 * cost model.
 */

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

const withParams = (patch: Partial<PlanningParameters>): PlanningParameters => ({
  ...params,
  ...patch,
});

const station = (id: string, lat: number, lon: number): Station => ({
  id,
  name: `Station ${id.toUpperCase()}`,
  position: { lat, lon },
  capacity: 20,
  mechanicalBikesAvailable: 4,
  ebikesAvailable: 0,
  docksAvailable: 6,
  isInstalled: true,
  isRenting: true,
  isReturning: true,
});

// Roughly west to east across Montreal, far enough apart that a direct ride
// overruns the free window comfortably.
const stations: Station[] = [
  station("a", 45.45, -73.68),
  station("b", 45.5, -73.6),
  station("c", 45.55, -73.52),
];

const ride = (from: string, to: string, seconds: number) => ({
  kind: "bike" as const,
  fromStationId: from,
  toStationId: to,
  duration: seconds,
  distance: 5000,
  remaining: remainingAfter(seconds, params),
  remainingStatus: remainingStatus(remainingAfter(seconds, params)),
});

const walk = (toStationId: string | null, seconds: number) => ({
  kind: "walk" as const,
  from: { lat: 45.449, lon: -73.681 },
  to: { lat: 45.45, lon: -73.68 },
  toStationId,
  duration: seconds,
  distance: 300,
});

/** Walk, ride, dock, ride, dock, ride, walk: two anchor stops. */
const twoStops: Itinerary = {
  steps: [
    walk("a", 240),
    ride("a", "b", budget * 0.8),
    { kind: "dock", stationId: "b", cooldown: 60 },
    ride("b", "c", budget * 0.8),
    { kind: "dock", stationId: "c", cooldown: 60 },
    ride("c", "a", budget * 0.4),
    walk(null, 180),
  ],
  totalDuration: 240 + budget * 2 + 120 + 180,
  stopCount: 2,
  freeWindowConsumed: budget * 2,
  snapshotObservedAt: new Date("2026-07-26T05:00:00Z"),
};

const walkOnly: Itinerary = {
  steps: [walk(null, 600)],
  totalDuration: 600,
  stopCount: 0,
  freeWindowConsumed: 0,
  snapshotObservedAt: new Date("2026-07-26T05:00:00Z"),
};

describe("overageCost", () => {
  it("is zero for anything inside the free window", () => {
    expect(overageCost(0, params)).toBe(0);
    expect(overageCost(params.freeWindow / 2, params)).toBe(0);
  });

  it("is zero exactly at the free window, not a fraction of a cent", () => {
    expect(overageCost(params.freeWindow, params)).toBe(0);
  });

  it("bills against the free window, never against the segment budget", () => {
    // The safety margin is our own caution. The operator does not know about it
    // and does not bill for it, so a ride that overruns the budget but fits the
    // window is free.
    expect(budget).toBeLessThan(params.freeWindow);
    expect(overageCost(budget + 60, params)).toBe(0);
  });

  it("charges the rate per minute beyond the window", () => {
    const cost = overageCost(params.freeWindow + 600, params);
    expect(cost).toBeCloseTo(10 * params.overageRate, 9);
  });

  it("follows the rate the rider set", () => {
    const dearer = withParams({ overageRate: 0.5 });
    expect(overageCost(dearer.freeWindow + 600, dearer)).toBeCloseTo(5, 9);
  });

  it("costs nothing at all when the rate is zero", () => {
    const free = withParams({ overageRate: 0 });
    expect(overageCost(free.freeWindow * 10, free)).toBe(0);
  });
});

describe("noStopRide", () => {
  it("is absent when the plan contains no ride to compare", () => {
    expect(noStopRide(walkOnly, stations, params)).toBeNull();
  });

  it("runs between the plan's own first pickup and last drop-off", () => {
    const direct = noStopRide(twoStops, stations, params);
    expect(direct).not.toBeNull();
    if (direct === null) return;

    // First bike step leaves a, last bike step arrives at a. The middle
    // stations must not be chosen: they are exactly what this ride skips.
    expect(direct.fromStationId).toBe("a");
    expect(direct.toStationId).toBe("a");
  });

  it("charges the per-segment overhead once, not once per skipped stop", () => {
    const direct = noStopRide(twoStops, stations, params);
    if (direct === null) throw new Error("expected a ride");

    const heavier = noStopRide(
      twoStops,
      stations,
      withParams({ segmentOverhead: params.segmentOverhead + 100 }),
    );
    if (heavier === null) throw new Error("expected a ride");

    expect(heavier.duration - direct.duration).toBeCloseTo(100, 6);
  });

  it("reports an overage and a cost when the direct ride overruns the window", () => {
    const spread = [
      station("a", 45.4, -73.75),
      station("b", 45.5, -73.6),
      station("c", 45.62, -73.45),
    ];
    const long: Itinerary = {
      ...twoStops,
      steps: [
        walk("a", 240),
        ride("a", "b", budget * 0.9),
        { kind: "dock", stationId: "b", cooldown: 60 },
        ride("b", "c", budget * 0.9),
        walk(null, 180),
      ],
      stopCount: 1,
    };

    const direct = noStopRide(long, spread, params);
    if (direct === null) throw new Error("expected a ride");

    expect(direct.fromStationId).toBe("a");
    expect(direct.toStationId).toBe("c");
    expect(direct.overage).toBeGreaterThan(0);
    expect(direct.cost).toBeCloseTo(
      (direct.overage / 60) * params.overageRate,
      9,
    );
  });

  it("never reports a negative overage", () => {
    const near: Itinerary = {
      ...twoStops,
      steps: [walk("a", 240), ride("a", "b", 300), walk(null, 180)],
      stopCount: 0,
    };
    const direct = noStopRide(near, [stations[0], stations[1]], params);
    if (direct === null) throw new Error("expected a ride");
    expect(direct.overage).toBeGreaterThanOrEqual(0);
    expect(direct.cost).toBeGreaterThanOrEqual(0);
  });

  it("says how it compares with the plan, signed", () => {
    const direct = noStopRide(twoStops, stations, params);
    if (direct === null) throw new Error("expected a ride");
    // Skipping two cooldowns and a leg of riding should come out faster.
    expect(direct.deltaAgainstPlan).toBeLessThan(0);
    expect(Number.isFinite(direct.deltaAgainstPlan)).toBe(true);
  });

  it("is absent when a station in the plan is missing from the snapshot", () => {
    // Defensive: the snapshot the panel holds and the itinerary it renders come
    // from the same fetch, but a stale render must not throw.
    expect(noStopRide(twoStops, [], params)).toBeNull();
  });
});
