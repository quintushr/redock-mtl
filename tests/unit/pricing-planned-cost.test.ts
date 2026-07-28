import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/planner";
import { plannedCost } from "@/lib/pricing";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type { BikeSegment, Itinerary, PlanningParameters } from "@/lib/types";
import { corridor, eastEnd, near, snapshot, westEnd } from "./fixture";

/**
 * What the plan itself costs.
 *
 * The interesting claim is that this is *not* always zero, which is the whole
 * reason the function exists. TripSummary used to assert a planned trip was
 * free, reasoning from how the plan was built: the planner only creates edges
 * whose ride fits the budget, so every segment it returns is inside the free
 * window. That reasoning was correct until feature 004 started replacing
 * estimated durations with measured ones, and it is now a claim about the past.
 *
 * Frozen fixtures throughout (principle III). Every itinerary here is planned
 * over the committed Montreal snapshot rather than written by hand, including
 * the over-budget case: rather than fabricate a corrected itinerary, the same
 * real plan is costed against a shorter free window, which exercises the same
 * arithmetic on the same data.
 */

const params = DEFAULT_PARAMETERS;

/** The real corridor trip: one stop, two rides. */
const planned: Itinerary = (() => {
  const result = planTrip(near(westEnd), near(eastEnd), snapshot, params);
  if (!result.ok) throw new Error("fixture must plan");
  return result.itinerary;
})();

/** A destination a few metres away, which no ride can improve on. */
const walkOnly: Itinerary = (() => {
  const origin = corridor[0].position;
  const result = planTrip(
    origin,
    { lat: origin.lat + 0.0008, lon: origin.lon },
    snapshot,
    params,
  );
  if (!result.ok) throw new Error("fixture must plan");
  return result.itinerary;
})();

const rides = (itinerary: Itinerary): BikeSegment[] =>
  itinerary.steps.filter((step): step is BikeSegment => step.kind === "bike");

/** The overage the operator would bill, summed the way the meter runs. */
const expectedFor = (
  itinerary: Itinerary,
  p: PlanningParameters,
): number =>
  rides(itinerary).reduce(
    (sum, ride) => sum + (Math.max(0, ride.duration - p.freeWindow) / 60) * p.overageRate,
    0,
  );

describe("plannedCost", () => {
  it("is zero for a plan as the planner built it", () => {
    // Not a coincidence and not worth asserting loosely: the planner drops any
    // edge whose ride exceeds the budget, and the budget is shorter than the
    // free window by the safety margin.
    for (const ride of rides(planned)) {
      expect(ride.duration).toBeLessThanOrEqual(segmentBudget(params));
    }

    expect(plannedCost(planned, params)).toBe(0);
  });

  it("is zero for an itinerary with no ride at all", () => {
    expect(rides(walkOnly)).toHaveLength(0);
    expect(plannedCost(walkOnly, params)).toBe(0);
  });

  it("bills each ride that exceeds the free window, and only the excess", () => {
    // The same real plan against a 30-minute window: the first ride is over,
    // the second is not. A trip is not one ride, and charging the total would
    // invent a fee on a segment that fits.
    const tight: PlanningParameters = { ...params, freeWindow: 30 * 60 };
    const over = rides(planned).filter((r) => r.duration > tight.freeWindow);

    expect(over.length).toBeGreaterThan(0);
    expect(over.length).toBeLessThan(rides(planned).length);
    expect(plannedCost(planned, tight)).toBeCloseTo(expectedFor(planned, tight), 10);
  });

  it("charges per ride rather than over the whole trip", () => {
    const tight: PlanningParameters = { ...params, freeWindow: 30 * 60 };

    // The distinction that matters: the trip lasts longer than any of its
    // rides, so costing the total would produce a strictly larger figure.
    const asOneRide =
      (Math.max(0, planned.totalDuration - tight.freeWindow) / 60) * tight.overageRate;

    expect(plannedCost(planned, tight)).toBeLessThan(asOneRide);
  });

  it("ignores the safety margin", () => {
    // The margin is our own caution. The operator does not know about it and
    // does not bill for it, and charging the rider for it would invent a fee.
    const cautious: PlanningParameters = { ...params, freeWindow: 30 * 60, safetyMargin: 15 * 60 };
    const bold: PlanningParameters = { ...params, freeWindow: 30 * 60, safetyMargin: 0 };

    expect(plannedCost(planned, cautious)).toBe(plannedCost(planned, bold));
  });

  it("is zero when the rider's plan bills nothing for overage", () => {
    // Legal, and true for them: a rate of zero is a rider whose subscription
    // does not charge by the minute.
    const free: PlanningParameters = { ...params, freeWindow: 30 * 60, overageRate: 0 };

    expect(plannedCost(planned, free)).toBe(0);
  });

  it("never returns a negative amount", () => {
    const generous: PlanningParameters = { ...params, freeWindow: 10 * 60 * 60 };
    expect(plannedCost(planned, generous)).toBe(0);
  });
});
