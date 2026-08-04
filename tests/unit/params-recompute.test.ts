import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/planner";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type { BikeSegment, PlanningParameters } from "@/lib/types";
import { eastEnd, near, snapshot, westEnd } from "./fixture";

/**
 * How the plan reacts when the user changes their assumptions (T056).
 *
 * US3's promise is that adjusting a parameter produces a plan consistent with
 * the new value. These assert the relationships that promise implies.
 */

const params = DEFAULT_PARAMETERS;
const origin = near(westEnd);
const destination = near(eastEnd);

const withParams = (patch: Partial<PlanningParameters>): PlanningParameters => ({
  ...params,
  ...patch,
});

const plan = (p: PlanningParameters) => planTrip(origin, destination, snapshot, p);

const segmentsOf = (p: PlanningParameters): BikeSegment[] => {
  const result = plan(p);
  if (!result.ok) return [];
  return result.itinerary.steps.filter(
    (s): s is BikeSegment => s.kind === "bike",
  );
};

describe("raising the safety margin", () => {
  it("never leaves a segment longer than the new budget", () => {
    // The invariant US3 scenario 3 states outright.
    for (const margin of [0, 5, 10, 15, 20, 25, 30]) {
      const tighter = withParams({ safetyMargin: margin * 60 });
      const budget = segmentBudget(tighter);
      for (const segment of segmentsOf(tighter)) {
        expect(
          segment.duration,
          `margin ${margin} min produced an over-budget segment`,
        ).toBeLessThanOrEqual(budget);
      }
    }
  });

  it("never reduces the number of stops", () => {
    let previousStops = -1;
    for (const margin of [0, 10, 20, 30]) {
      const result = plan(withParams({ safetyMargin: margin * 60 }));
      if (!result.ok) continue;
      expect(result.itinerary.stopCount).toBeGreaterThanOrEqual(previousStops);
      previousStops = result.itinerary.stopCount;
    }
  });
});

describe("raising the cycling speed", () => {
  it("never lengthens the total", () => {
    const slow = plan(withParams({ cyclingSpeed: params.cyclingSpeed * 0.7 }));
    const fast = plan(withParams({ cyclingSpeed: params.cyclingSpeed * 1.3 }));
    expect(slow.ok && fast.ok).toBe(true);
    if (!slow.ok || !fast.ok) return;
    expect(fast.itinerary.totalDuration).toBeLessThanOrEqual(
      slow.itinerary.totalDuration,
    );
  });

  it("never increases the number of stops", () => {
    const slow = plan(withParams({ cyclingSpeed: params.cyclingSpeed * 0.7 }));
    const fast = plan(withParams({ cyclingSpeed: params.cyclingSpeed * 1.3 }));
    if (!slow.ok || !fast.ok) return;
    expect(fast.itinerary.stopCount).toBeLessThanOrEqual(
      slow.itinerary.stopCount,
    );
  });
});

describe("raising the walking distance", () => {
  it("never worsens the total, because it only adds options", () => {
    const near800 = plan(withParams({ maxWalkDistance: 800 }));
    const near1600 = plan(withParams({ maxWalkDistance: 1600 }));
    expect(near800.ok && near1600.ok).toBe(true);
    if (!near800.ok || !near1600.ok) return;
    expect(near1600.itinerary.totalDuration).toBeLessThanOrEqual(
      near800.itinerary.totalDuration + 1e-6,
    );
  });
});

describe("raising the cooldown", () => {
  it("never lowers the total, because every stop costs more", () => {
    const cheap = plan(withParams({ dockCooldown: 30 }));
    const dear = plan(withParams({ dockCooldown: 300 }));
    expect(cheap.ok && dear.ok).toBe(true);
    if (!cheap.ok || !dear.ok) return;
    expect(dear.itinerary.totalDuration).toBeGreaterThanOrEqual(
      cheap.itinerary.totalDuration,
    );
  });
});

/*
 * "Raising the reserves never widens the set of usable stations" used to be
 * here, over `bikeReserve` and `dockReserve`. Both parameters are gone: nothing
 * in the planner reads a station's counts any more, so a reserve on a count
 * could only have been a control that changed nothing, and principle IV rules
 * out showing one of those. See canStartSegment in lib/gbfs.ts.
 */

describe("no parameter in the panel is inert", () => {
  // Constitution principle IV requires influencing parameters to be visible and
  // adjustable. The converse matters too: a control that changes nothing is
  // clutter, and worse, it implies a precision the model does not have.
  //
  // Note what this does not claim. A parameter can legitimately leave a given
  // optimum untouched: widening the walking allowance when the nearest station
  // is already the best one changes the feasible set without changing the
  // answer. So each parameter is pushed far enough to force a visible
  // difference, which is what proves it is wired into the computation at all.
  const baseline = plan(params);

  it.each([
    ["freeWindow", withParams({ freeWindow: 20 * 60 })],
    ["safetyMargin", withParams({ safetyMargin: 25 * 60 })],
    ["cyclingSpeed", withParams({ cyclingSpeed: params.cyclingSpeed * 0.5 })],
    ["walkingSpeed", withParams({ walkingSpeed: params.walkingSpeed * 0.5 })],
    ["maxWalkDistance", withParams({ maxWalkDistance: 30 })],
    ["dockCooldown", withParams({ dockCooldown: 600 })],
    ["segmentOverhead", withParams({ segmentOverhead: 600 })],
    ["detourFactor", withParams({ detourFactor: 1.9 })],
  ])("changing %s changes the outcome", (_label, changed) => {
    expect(baseline.ok).toBe(true);
    const altered = plan(changed);
    expect(JSON.stringify(altered)).not.toBe(JSON.stringify(baseline));
  });
});
