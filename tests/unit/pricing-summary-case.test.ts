import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/planner";
import { noStopRide, summaryCase } from "@/lib/pricing";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { Itinerary, NoStopRide } from "@/lib/types";
import { corridor, eastEnd, near, snapshot, westEnd } from "./fixture";

/**
 * Which of four things the summary is saying.
 *
 * The decision order is the thing under test, not just the outcomes. Two rows
 * of the table are ordered for a reason and would pass a careless test either
 * way: `pending` comes first because FR-408a is unconditional, and the null
 * check comes before reading `cost` because a null ride has no cost to read.
 *
 * All three plan shapes come from the frozen Montreal snapshot (principle III).
 * Finding a real trip for each was the point: a hand-built itinerary would let
 * a case exist in the tests that the planner can never actually produce.
 */

const params = DEFAULT_PARAMETERS;

const planBetween = (from: typeof westEnd, to: typeof westEnd): Itinerary => {
  const result = planTrip(near(from), near(to), snapshot, params);
  if (!result.ok) throw new Error("fixture must plan");
  return result.itinerary;
};

/** One stop, and riding it straight through would be billed. */
const withSaving = planBetween(westEnd, eastEnd);

/**
 * One stop, but the direct ride still fits the free window.
 *
 * This trip exists because the planner cuts at the segment *budget* while the
 * operator bills at the free *window*, and the safety margin is the gap between
 * them. So a plan can carry a stop the rider does not strictly need.
 */
const withoutSaving = planBetween(corridor[0].position, corridor[9].position);

/** Short enough that the planner returns no stop at all. */
const noStopNeeded = planBetween(corridor[0].position, corridor[3].position);

/** A destination a few metres away: no ride, so nothing to compare. */
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

const rideFor = (itinerary: Itinerary): NoStopRide | null =>
  noStopRide(itinerary, snapshot.stations, params);

describe("summaryCase", () => {
  describe("the four cases", () => {
    it("prices nothing while the itinerary is still being revised", () => {
      const result = summaryCase(withSaving, rideFor(withSaving), false, params);
      expect(result.kind).toBe("pending");
    });

    it("says no stop is needed when the plan has none", () => {
      expect(noStopNeeded.stopCount).toBe(0);

      const result = summaryCase(noStopNeeded, rideFor(noStopNeeded), true, params);
      expect(result.kind).toBe("no-stop-needed");
    });

    it("says the stops save nothing when the direct ride is free", () => {
      const ride = rideFor(withoutSaving);
      expect(withoutSaving.stopCount).toBeGreaterThan(0);
      expect(ride?.cost).toBe(0);

      const result = summaryCase(withoutSaving, ride, true, params);
      expect(result.kind).toBe("nothing-saved");
    });

    it("makes the comparison when the stops save real money", () => {
      const ride = rideFor(withSaving);
      expect(ride?.cost).toBeGreaterThan(0);

      const result = summaryCase(withSaving, ride, true, params);
      expect(result.kind).toBe("comparison");
    });
  });

  describe("decision order", () => {
    it("defers before anything else, whatever the plan looks like", () => {
      // Every other input arrangement, all still pending. If precedence were
      // wrong, three of these would price a moving itinerary.
      for (const itinerary of [withSaving, withoutSaving, noStopNeeded, walkOnly]) {
        expect(summaryCase(itinerary, rideFor(itinerary), false, params).kind).toBe(
          "pending",
        );
      }
    });

    it("handles a missing ride without reading its cost", () => {
      // Reached when the plan's anchor stations have left the snapshot between
      // planning and rendering. The order matters: testing `cost` first would
      // throw here rather than degrade (FR-409).
      const result = summaryCase(withSaving, null, true, params);
      expect(result.kind).toBe("no-stop-needed");
    });

    it("says what it can for a plan with no ride to compare", () => {
      expect(rideFor(walkOnly)).toBeNull();

      const result = summaryCase(walkOnly, rideFor(walkOnly), true, params);
      expect(result.kind).toBe("no-stop-needed");
    });
  });

  describe("what the comparison carries", () => {
    it("reports the planned cost, the direct cost and the difference", () => {
      const ride = rideFor(withSaving);
      const result = summaryCase(withSaving, ride, true, params);
      if (result.kind !== "comparison") throw new Error("expected a comparison");

      expect(result.costs.planned).toBe(0);
      expect(result.costs.withoutStops).toBe(ride?.cost);
      expect(result.costs.saved).toBeCloseTo(
        result.costs.withoutStops - result.costs.planned,
        10,
      );
      expect(result.costs.saved).toBeGreaterThan(0);
    });

    it("carries the time comparison alongside the money", () => {
      // FR-410. Held here rather than left for the component to fetch off
      // NoStopRide: a figure from a different source than the amounts beside it
      // is one that can eventually disagree with them.
      const ride = rideFor(withSaving);
      const result = summaryCase(withSaving, ride, true, params);
      if (result.kind !== "comparison") throw new Error("expected a comparison");

      expect(result.directDuration).toBe(ride?.duration);
      expect(result.deltaAgainstPlan).toBe(ride?.deltaAgainstPlan);
    });

    it("never reports a negative saving", () => {
      for (const itinerary of [withSaving, withoutSaving, noStopNeeded]) {
        const result = summaryCase(itinerary, rideFor(itinerary), true, params);
        if (result.kind !== "comparison") continue;
        expect(result.costs.saved).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it("is deterministic", () => {
    const once = summaryCase(withSaving, rideFor(withSaving), true, params);
    const twice = summaryCase(withSaving, rideFor(withSaving), true, params);
    expect(twice).toEqual(once);
  });
});
