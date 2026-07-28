import { describe, expect, it } from "vitest";
import { durationFromPath, overBudgetSteps } from "@/lib/route-geometry";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type {
  Itinerary,
  StepGeometry,
  TracedItinerary,
  TracedPath,
} from "@/lib/types";

/**
 * Which measured durations break the plan (FR-315), and how a measured length
 * becomes a duration at all (FR-313).
 */

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

const A = { lat: 45.5, lon: -73.6 };
const B = { lat: 45.52, lon: -73.58 };

const path = (length: number, profile: "bike" | "foot" = "bike"): TracedPath => ({
  coordinates: [A, B],
  length,
  profile,
});

/** walk, ride, walk */
const plan: Itinerary = {
  steps: [
    { kind: "walk", from: A, to: A, toStationId: "a", duration: 200, distance: 250 },
    {
      kind: "bike",
      fromStationId: "a",
      toStationId: "b",
      duration: budget * 0.5,
      distance: 2000,
      remaining: budget * 0.5,
      remainingStatus: "comfortable",
    },
    { kind: "walk", from: B, to: B, toStationId: null, duration: 150, distance: 180 },
  ],
  totalDuration: 350 + budget * 0.5,
  stopCount: 0,
  freeWindowConsumed: budget * 0.5,
  snapshotObservedAt: new Date("2026-07-28T10:00:00Z"),
};

const traced = (geometry: StepGeometry[]): TracedItinerary => ({
  itinerary: plan,
  geometry,
  settled: true,
  corrections: 0,
});

const none: StepGeometry = { status: "approximate", path: null };

/** A length whose duration lands exactly on the budget. */
const atBudget = (budget - params.segmentOverhead) * params.cyclingSpeed;

describe("durationFromPath", () => {
  it("charges a ride the segment overhead", () => {
    // The meter runs from unlock to dock, not from the first pedal stroke.
    expect(durationFromPath(path(3000), params)).toBeCloseTo(
      3000 / params.cyclingSpeed + params.segmentOverhead,
      5,
    );
  });

  it("charges a walk no overhead", () => {
    // There is nothing to unlock on foot.
    expect(durationFromPath(path(600, "foot"), params)).toBeCloseTo(
      600 / params.walkingSpeed,
      5,
    );
  });

  it("uses the rider's speed, not the source's", () => {
    const faster = { ...params, cyclingSpeed: params.cyclingSpeed * 2 };
    expect(durationFromPath(path(3000), faster)).toBeLessThan(
      durationFromPath(path(3000), params),
    );
  });
});

describe("overBudgetSteps", () => {
  it("finds nothing when every measured ride fits", () => {
    expect(
      overBudgetSteps(traced([none, { status: "traced", path: path(2000) }, none]), params),
    ).toEqual([]);
  });

  it("names the index of a ride that no longer fits", () => {
    const over = overBudgetSteps(
      traced([none, { status: "traced", path: path(atBudget * 1.5) }, none]),
      params,
    );
    expect(over).toEqual([1]);
  });

  it("treats a duration exactly on the budget as fitting", () => {
    // The budget is what a rider may spend, not what they may not reach.
    expect(
      overBudgetSteps(
        traced([none, { status: "traced", path: path(atBudget) }, none]),
        params,
      ),
    ).toEqual([]);
  });

  it("ignores a walk leg however long it turns out to be", () => {
    // Walking never spends the free window, so a longer walk is a worse
    // estimate and never an invalid plan.
    const over = overBudgetSteps(
      traced([
        { status: "traced", path: path(50_000, "foot") },
        { status: "traced", path: path(2000) },
        { status: "traced", path: path(50_000, "foot") },
      ]),
      params,
    );
    expect(over).toEqual([]);
  });

  it("ignores a step with no measurement", () => {
    // An unmeasured segment keeps the estimate the planner already accepted.
    expect(overBudgetSteps(traced([none, none, none]), params)).toEqual([]);
  });

  it("respects a changed safety margin", () => {
    // A tighter margin leaves less usable budget, so the same measurement can
    // break a plan that a looser margin tolerated.
    const geometry = [none, { status: "traced" as const, path: path(atBudget) }, none];
    expect(overBudgetSteps(traced(geometry), params)).toEqual([]);

    const strict = { ...params, safetyMargin: params.safetyMargin + 600 };
    expect(overBudgetSteps(traced(geometry), strict)).toEqual([1]);
  });
});
