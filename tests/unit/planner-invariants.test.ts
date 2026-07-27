import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/planner";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type { LatLon, PlanningParameters, StationSnapshot } from "@/lib/types";
import { corridor, eastEnd, near, snapshot, westEnd } from "./fixture";

/**
 * planTrip must never throw, whatever it is handed (T034).
 *
 * A thrown error from the core would surface as a raw error in the UI, which
 * FR-030 forbids outright. Every failure has to come back as a PlanResult.
 */

const params = DEFAULT_PARAMETERS;

const withParams = (patch: Partial<PlanningParameters>): PlanningParameters => ({
  ...params,
  ...patch,
});

const hostileParameters: [string, PlanningParameters][] = [
  ["NaN free window", withParams({ freeWindow: Number.NaN })],
  ["infinite free window", withParams({ freeWindow: Number.POSITIVE_INFINITY })],
  ["negative margin", withParams({ safetyMargin: -600 })],
  ["margin above window", withParams({ safetyMargin: 100_000 })],
  ["zero speed", withParams({ cyclingSpeed: 0 })],
  ["negative speed", withParams({ cyclingSpeed: -5 })],
  ["NaN speed", withParams({ cyclingSpeed: Number.NaN })],
  ["zero walking speed", withParams({ walkingSpeed: 0 })],
  ["negative walk distance", withParams({ maxWalkDistance: -100 })],
  ["infinite walk distance", withParams({ maxWalkDistance: Number.POSITIVE_INFINITY })],
  ["detour below one", withParams({ detourFactor: 0.2 })],
  ["NaN detour", withParams({ detourFactor: Number.NaN })],
  ["negative cooldown", withParams({ dockCooldown: -60 })],
  ["huge cooldown", withParams({ dockCooldown: 10_000 })],
  ["overhead above budget", withParams({ segmentOverhead: 100_000 })],
  ["fractional reserves", withParams({ bikeReserve: 1.5, dockReserve: -2 })],
  ["enormous reserves", withParams({ bikeReserve: 9999, dockReserve: 9999 })],
];

const hostilePoints: [string, LatLon][] = [
  ["null island", { lat: 0, lon: 0 }],
  ["north pole", { lat: 90, lon: 0 }],
  ["antimeridian", { lat: 45.5, lon: 180 }],
  ["NaN coordinates", { lat: Number.NaN, lon: Number.NaN }],
  ["infinite coordinates", { lat: Number.POSITIVE_INFINITY, lon: 0 }],
];

const hostileSnapshots: [string, StationSnapshot][] = [
  ["no stations", { ...snapshot, stations: [] }],
  [
    "one station",
    { ...snapshot, stations: snapshot.stations.slice(0, 1) },
  ],
  [
    "all non-operational",
    {
      ...snapshot,
      stations: snapshot.stations.map((s) => ({ ...s, isInstalled: false })),
    },
  ],
  [
    "all counts zero",
    {
      ...snapshot,
      stations: snapshot.stations.map((s) => ({
        ...s,
        mechanicalBikesAvailable: 0,
        ebikesAvailable: 0,
        docksAvailable: 0,
      })),
    },
  ],
  [
    "duplicate stations",
    {
      ...snapshot,
      stations: [...snapshot.stations, ...snapshot.stations],
    },
  ],
];

describe("planTrip never throws", () => {
  it.each(hostileParameters)("survives %s", (_label, hostile) => {
    expect(() =>
      planTrip(near(westEnd), near(eastEnd), snapshot, hostile),
    ).not.toThrow();
  });

  it.each(hostilePoints)("survives %s as origin", (_label, point) => {
    expect(() => planTrip(point, near(eastEnd), snapshot, params)).not.toThrow();
  });

  it.each(hostilePoints)("survives %s as destination", (_label, point) => {
    expect(() => planTrip(near(westEnd), point, snapshot, params)).not.toThrow();
  });

  it.each(hostileSnapshots)("survives a snapshot with %s", (_label, hostile) => {
    expect(() =>
      planTrip(near(westEnd), near(eastEnd), hostile, params),
    ).not.toThrow();
  });

  it("survives identical origin and destination", () => {
    expect(() =>
      planTrip(near(westEnd), near(westEnd), snapshot, params),
    ).not.toThrow();
  });
});

describe("planTrip always returns a well-formed result", () => {
  const everyCase = [
    ...hostileParameters.map(
      (entry) => () => planTrip(near(westEnd), near(eastEnd), snapshot, entry[1]),
    ),
    ...hostilePoints.map(
      (entry) => () => planTrip(entry[1], near(eastEnd), snapshot, params),
    ),
    ...hostileSnapshots.map(
      (entry) => () => planTrip(near(westEnd), near(eastEnd), entry[1], params),
    ),
  ];

  it("never returns a failure without a suggestion (FR-028)", () => {
    for (const run of everyCase) {
      const result = run();
      if (!result.ok) {
        expect(result.failure.suggestions.length).toBeGreaterThan(0);
      }
    }
  });

  it("never returns a success that breaks the budget invariant", () => {
    // The single most important invariant in the codebase: if a plan comes
    // back at all, every segment fits.
    for (const [label, hostile] of hostileParameters) {
      const result = planTrip(near(westEnd), near(eastEnd), snapshot, hostile);
      if (!result.ok) continue;
      const budget = segmentBudget(hostile);
      for (const step of result.itinerary.steps) {
        if (step.kind === "bike") {
          expect(
            step.duration,
            `${label} produced an over-budget segment`,
          ).toBeLessThanOrEqual(budget);
        }
      }
    }
  });

  it("never returns NaN durations", () => {
    for (const run of everyCase) {
      const result = run();
      if (!result.ok) continue;
      expect(Number.isFinite(result.itinerary.totalDuration)).toBe(true);
      expect(Number.isFinite(result.itinerary.freeWindowConsumed)).toBe(true);
      for (const step of result.itinerary.steps) {
        const value = step.kind === "dock" ? step.cooldown : step.duration;
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("keeps budgetShare within [0, 1] whatever the inputs", () => {
    for (const run of everyCase) {
      const result = run();
      if (!result.ok) continue;
      for (const step of result.itinerary.steps) {
        if (step.kind !== "bike") continue;
        expect(step.budgetShare).toBeGreaterThanOrEqual(0);
        expect(step.budgetShare).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("purity", () => {
  it("does not mutate the snapshot or the parameters it is given", () => {
    const snapshotBefore = JSON.stringify(snapshot);
    const paramsBefore = JSON.stringify(params);
    planTrip(near(westEnd), near(eastEnd), snapshot, params);
    expect(JSON.stringify(snapshot)).toBe(snapshotBefore);
    expect(JSON.stringify(params)).toBe(paramsBefore);
  });

  it("consults no clock: repeated calls are byte-identical", () => {
    const first = JSON.stringify(
      planTrip(near(westEnd), near(eastEnd), snapshot, params),
    );
    const second = JSON.stringify(
      planTrip(near(westEnd), near(eastEnd), snapshot, params),
    );
    expect(second).toBe(first);
  });

  it("is unaffected by the order stations arrive in", () => {
    // A plan that depended on input order would make fixture tests meaningless
    // and would drift as the provider reorders its feed.
    const reversed: StationSnapshot = {
      ...snapshot,
      stations: [...snapshot.stations].reverse(),
    };
    const forward = planTrip(near(westEnd), near(eastEnd), snapshot, params);
    const backward = planTrip(near(westEnd), near(eastEnd), reversed, params);

    expect(forward.ok).toBe(backward.ok);
    if (!forward.ok || !backward.ok) return;
    expect(backward.itinerary.totalDuration).toBeCloseTo(
      forward.itinerary.totalDuration,
      6,
    );
  });
});

describe("the corridor fixture is what these tests assume", () => {
  it("is dense enough to plan and long enough to need stops", () => {
    // Guards against the fixture silently drifting: a sparse corridor made
    // every planner test fail once already, and the fault was the fixture.
    expect(corridor.length).toBeGreaterThan(20);
    const result = planTrip(near(westEnd), near(eastEnd), snapshot, params);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.stopCount).toBeGreaterThan(0);
  });
});
