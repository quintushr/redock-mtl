import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/planner";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type { LatLon, PlanningParameters, Station, StationSnapshot } from "@/lib/types";

/**
 * The corridor changes which stop the planner chooses.
 *
 * tests/unit/geo-corridor.test.ts covers the geometry. This covers the thing the
 * geometry was added for, and it is a different claim: that a better estimate
 * actually reaches the search and changes its answer. An estimator can be
 * perfect and still be ignored.
 *
 * The fixture is built rather than captured, because the case needs a specific
 * shape that no snapshot of a real network is guaranteed to hold: a decoy
 * station sitting on the straight line but off the ridable route, and an honest
 * one sitting on the route but off the straight line. That is the geometry of
 * the Lachine trip, reduced to its skeleton and to round numbers.
 *
 *   O ------------------------------- D      the straight line
 *                  X                          the decoy, on the line
 *          \                    /
 *            ------- Y --------             the corridor, and the honest stop
 *
 * A rider cannot fly, so X is only reachable by leaving the corridor.
 */

const params: PlanningParameters = {
  ...DEFAULT_PARAMETERS,
  // A one-hour window with no margin, so the arithmetic below is legible and the
  // budget is exactly the free window.
  freeWindow: 3600,
  safetyMargin: 0,
  segmentOverhead: 0,
  // Non-zero, and it has to be: the itinerary emits a docking step only where a
  // cooldown is actually paid, so a zero cooldown produces two consecutive rides
  // with no stop between them and nothing for these tests to read.
  dockCooldown: 60,
  // The real default, and load-bearing here. It is the conservative multiplier
  // applied to every pair the corridor cannot speak for, and it is what makes an
  // honest corridor estimate competitive against an optimistic straight line.
  detourFactor: 1.5,
  maxWalkDistance: 300,
};

const station = (id: string, position: LatLon): Station => ({
  id,
  name: id,
  position,
  capacity: 20,
  mechanicalBikesAvailable: 5,
  ebikesAvailable: 0,
  docksAvailable: 5,
  isInstalled: true,
  isRenting: true,
  isReturning: true,
});

/** Due east along one parallel: 0.01 degrees of longitude is about 780 m here. */
const ORIGIN: LatLon = { lat: 45.5, lon: -73.7 };
const DESTINATION: LatLon = { lat: 45.5, lon: -73.5 };

/** On the straight line, exactly halfway. The decoy. */
const DECOY: LatLon = { lat: 45.5, lon: -73.6 };

/**
 * Halfway along, but 700 m south of the line: far enough to be outside
 * CORRIDOR_MAX_OFFSET of the straight line, and on the corridor below.
 */
const HONEST: LatLon = { lat: 45.4937, lon: -73.6 };

/** The route a rider can actually take: it dips south and misses the decoy. */
const corridor: LatLon[] = [
  ORIGIN,
  { lat: 45.4937, lon: -73.665 },
  { lat: 45.4937, lon: -73.63 },
  HONEST,
  { lat: 45.4937, lon: -73.57 },
  { lat: 45.4937, lon: -73.535 },
  DESTINATION,
];

const stations = [
  station("start", ORIGIN),
  station("decoy", DECOY),
  station("honest", HONEST),
  station("end", DESTINATION),
];

const snapshot: StationSnapshot = {
  stations,
  observedAt: new Date("2026-07-30T05:00:00Z"),
  ttl: 10,
  attribution: { operatorName: "Test", licenseUrl: null, licenseName: null },
};

/** Which stations the plan actually docks at, in order. */
function stops(result: ReturnType<typeof planTrip>): string[] {
  if (!result.ok) return [];
  return result.itinerary.steps
    .filter((step) => step.kind === "dock")
    .map((step) => (step as { stationId: string }).stationId);
}

describe("without a corridor, the straight line decides", () => {
  it("picks the station on the line, which is what it has always done", () => {
    const result = planTrip(ORIGIN, DESTINATION, snapshot, params);
    expect(result.ok).toBe(true);
    // Not a bug being pinned, a baseline. On a great-circle metric the decoy is
    // the exact midpoint and the honest station is a detour, so this answer is
    // correct for the information available.
    expect(stops(result)).toEqual(["decoy"]);
  });
});

describe("with a corridor, the ridable route decides", () => {
  it("picks the station on the corridor instead", () => {
    const result = planTrip(ORIGIN, DESTINATION, snapshot, params, undefined, corridor);
    expect(result.ok).toBe(true);
    expect(stops(result)).toEqual(["honest"]);
  });

  it("still plans when the corridor is empty, falling back unchanged", () => {
    // The router is allowed to be unreachable. A plan must exist anyway, and it
    // must be exactly the plan the old estimator produced.
    const withCorridor = planTrip(ORIGIN, DESTINATION, snapshot, params, undefined, []);
    const without = planTrip(ORIGIN, DESTINATION, snapshot, params);
    expect(JSON.stringify(withCorridor)).toBe(JSON.stringify(without));
  });

  it("leaves a plan that needs no stop alone", () => {
    // The corridor is an estimator, not an instruction to stop. A trip that fits
    // one window must still be ridden in one go.
    const roomy = { ...params, freeWindow: 36000 };
    const result = planTrip(ORIGIN, DESTINATION, snapshot, roomy, undefined, corridor);
    expect(result.ok).toBe(true);
    expect(stops(result)).toEqual([]);
  });
});

describe("a measured distance still outranks the corridor", () => {
  it("uses the measurement where there is one", () => {
    /*
     * The order of precedence, asserted rather than assumed: measured, then
     * corridor, then great-circle. Here the decoy's two legs are measured as
     * very short, which no corridor estimate would suggest, and the plan follows
     * the measurement.
     */
    const measured = (from: string, to: string): number | undefined => {
      const pair = [from, to].sort().join("|");
      if (pair === "decoy|start") return 100;
      if (pair === "decoy|end") return 100;
      return undefined;
    };
    const result = planTrip(ORIGIN, DESTINATION, snapshot, params, measured, corridor);
    expect(result.ok).toBe(true);
    expect(stops(result)).toEqual(["decoy"]);
  });
});

describe("the budget is still a hard filter", () => {
  it("refuses a corridor-estimated segment that does not fit", () => {
    // A better estimator must not become a way to smuggle an over-long segment
    // past the free window: the edge filter runs on whatever distance won.
    const tight = { ...params, freeWindow: 600 };
    expect(segmentBudget(tight)).toBe(600);
    const result = planTrip(ORIGIN, DESTINATION, snapshot, tight, undefined, corridor);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("gap-too-large");
  });
});
