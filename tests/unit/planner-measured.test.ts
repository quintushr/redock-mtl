import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/planner";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import { eastEnd, near, snapshot, westEnd } from "./fixture";
import type { LatLon } from "@/lib/types";

/**
 * The optional measured-distance lookup on planTrip.
 *
 * The first property is the important one: without the lookup, the planner
 * behaves exactly as it always has. That is what lets a feature about network
 * geometry sit on top of a pure domain core without touching it, and what keeps
 * every planner test written before this feature honest.
 */

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

const pairs: [LatLon, LatLon][] = [
  [near(westEnd), near(eastEnd)],
  [near(eastEnd), near(westEnd)],
  [near(westEnd, 0.004), near(eastEnd, -0.002)],
];

describe("without the lookup, nothing changes", () => {
  for (const [index, [origin, destination]] of pairs.entries()) {
    it(`pair ${index} plans identically to the four-argument form`, () => {
      const before = planTrip(origin, destination, snapshot, params);
      const after = planTrip(origin, destination, snapshot, params, undefined);
      expect(after).toEqual(before);
    });
  }

  it("is unchanged by a lookup that knows nothing", () => {
    // An empty lookup is not a special case in the planner; it simply never
    // answers, and every edge falls back to the estimate.
    const [origin, destination] = pairs[0];
    const before = planTrip(origin, destination, snapshot, params);
    const after = planTrip(origin, destination, snapshot, params, () => undefined);
    expect(after).toEqual(before);
  });
});

describe("with the lookup, measured pairs use the measured distance", () => {
  it("reports the measured distance on the step it describes", () => {
    const [origin, destination] = pairs[0];
    const first = planTrip(origin, destination, snapshot, params);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const ride = first.itinerary.steps.find((s) => s.kind === "bike");
    if (ride === undefined || ride.kind !== "bike") throw new Error("no ride");

    // Slightly longer than estimated, but still inside the budget, so the same
    // edge survives and we can read its distance back.
    const measuredLength = ride.distance * 1.05;
    const after = planTrip(origin, destination, snapshot, params, (from, to) =>
      from === ride.fromStationId && to === ride.toStationId
        ? measuredLength
        : undefined,
    );
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    const sameRide = after.itinerary.steps.find(
      (s) =>
        s.kind === "bike" &&
        s.fromStationId === ride.fromStationId &&
        s.toStationId === ride.toStationId,
    );
    if (sameRide === undefined || sameRide.kind !== "bike") return;
    expect(sameRide.distance).toBeCloseTo(measuredLength, 5);
  });

  it("leaves every unmeasured pair on its estimate", () => {
    const [origin, destination] = pairs[0];
    const first = planTrip(origin, destination, snapshot, params);
    if (!first.ok) return;

    const ride = first.itinerary.steps.find((s) => s.kind === "bike");
    if (ride === undefined || ride.kind !== "bike") throw new Error("no ride");

    // A lookup answering about a pair that is not in this plan changes nothing.
    const after = planTrip(origin, destination, snapshot, params, (from) =>
      from === "a-station-that-is-not-here" ? 99_999 : undefined,
    );
    expect(after).toEqual(first);
  });

  it("drops an edge whose measured distance no longer fits the budget", () => {
    // The whole correction mechanism, in one assertion: the budget filter that
    // has always been in planTrip does the work, and no repair step exists.
    const [origin, destination] = pairs[0];
    const first = planTrip(origin, destination, snapshot, params);
    if (!first.ok) return;

    const ride = first.itinerary.steps.find((s) => s.kind === "bike");
    if (ride === undefined || ride.kind !== "bike") throw new Error("no ride");

    const tooFar = (budget + 900) * params.cyclingSpeed;
    const after = planTrip(origin, destination, snapshot, params, (from, to) =>
      from === ride.fromStationId && to === ride.toStationId ? tooFar : undefined,
    );
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    const stillUsed = after.itinerary.steps.some(
      (s) =>
        s.kind === "bike" &&
        s.fromStationId === ride.fromStationId &&
        s.toStationId === ride.toStationId,
    );
    expect(stillUsed).toBe(false);
  });

  it("keeps FR-004 whatever the lookup says", () => {
    const [origin, destination] = pairs[0];
    const inflate = (): number => 3000;
    const result = planTrip(origin, destination, snapshot, params, inflate);
    if (!result.ok) return;

    for (const step of result.itinerary.steps) {
      if (step.kind === "bike") {
        expect(step.duration).toBeLessThanOrEqual(budget);
      }
    }
  });

  it("stays pure: the lookup is never called with anything but station ids", () => {
    const [origin, destination] = pairs[0];
    const seen: string[] = [];
    planTrip(origin, destination, snapshot, params, (from, to) => {
      seen.push(from, to);
      return undefined;
    });

    const ids = new Set(snapshot.stations.map((s) => s.id));
    expect(seen.length).toBeGreaterThan(0);
    for (const id of seen) expect(ids.has(id)).toBe(true);
  });
});
