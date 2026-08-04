import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/planner";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type {
  LatLon,
  PlanningFailureReason,
  PlanningParameters,
  Station,
  StationSnapshot,
} from "@/lib/types";
import { corridor, eastEnd, near, snapshot, westEnd } from "./fixture";

/**
 * Every failure reason must be reachable and distinguishable (T033).
 *
 * The distinction that matters most is out-of-coverage versus no-station-in-
 * range: FR-029b exists precisely because collapsing them tells a user their
 * network does not serve them when in fact they are just standing too far from
 * a dock, or the reverse.
 */

const params = DEFAULT_PARAMETERS;

const withParams = (patch: Partial<PlanningParameters>): PlanningParameters => ({
  ...params,
  ...patch,
});

const withStations = (stations: Station[]): StationSnapshot => ({
  ...snapshot,
  stations,
});

const expectFailure = (
  result: ReturnType<typeof planTrip>,
  reason: PlanningFailureReason,
): void => {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure.reason).toBe(reason);
  // FR-028: never a bare refusal.
  expect(result.failure.suggestions.length).toBeGreaterThan(0);
};

describe("out of coverage", () => {
  // Quebec City, far outside any cluster in the fixture.
  const faraway: LatLon = { lat: 46.81, lon: -71.21 };

  it("reports an origin outside the service area", () => {
    expectFailure(
      planTrip(faraway, near(eastEnd), snapshot, params),
      "origin-out-of-coverage",
    );
  });

  it("reports a destination outside the service area", () => {
    expectFailure(
      planTrip(near(westEnd), faraway, snapshot, params),
      "destination-out-of-coverage",
    );
  });
});

describe("out of coverage is not the same as no station in range (FR-029b)", () => {
  it("calls a point inside the footprint but far from docks a routing failure", () => {
    // Between two corridor stations, then pushed well off the corridor. Still
    // inside the network's footprint, but nothing is within walking distance.
    const middle = corridor[Math.floor(corridor.length / 2)].position;
    const insideButRemote: LatLon = { lat: middle.lat + 0.02, lon: middle.lon };

    const result = planTrip(
      insideButRemote,
      near(eastEnd),
      snapshot,
      withParams({ maxWalkDistance: 150 }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The point is served by the network; the user is simply too far from a
    // dock. Reporting out-of-coverage here would be a lie.
    expect(result.failure.reason).not.toBe("origin-out-of-coverage");
    expect(result.failure.reason).toBe("no-station-near-origin");
  });
});

describe("nothing in walking range", () => {
  it("reports no station near the origin", () => {
    // Inside the footprint, but with a walking tolerance too small to reach any
    // dock. Note the wrinkle this exposes: FR-029a ties the coverage buffer to
    // the user's maximum walking distance, so shrinking that distance also
    // shrinks the service area. The point must therefore sit inside the hull
    // itself, not merely inside the buffer, for the two failures to stay
    // distinguishable.
    const middle = corridor[Math.floor(corridor.length / 2)].position;
    expectFailure(
      planTrip(
        { lat: middle.lat + 0.0012, lon: middle.lon },
        near(eastEnd),
        snapshot,
        withParams({ maxWalkDistance: 40 }),
      ),
      "no-station-near-origin",
    );
  });

  it("reports no station near the destination", () => {
    /*
     * Only the two extremes of the corridor, with the destination halfway
     * between them. That point is inside the buffered hull, because the hull is
     * the segment joining the two and the buffer is the walking distance, and it
     * is several kilometres from either station. So coverage passes and the walk
     * fails, which is the pair FR-029b exists to keep distinct.
     *
     * This used to be built by stripping the docks from every eastern station.
     * That no longer excludes anything: an empty station is a station this
     * planner will route to, because occupancy is a fact about the present and a
     * route is a claim about the future (see canEndSegment in lib/gbfs.ts).
     * Taking those stations out of service instead does exclude them, but it
     * also shrinks the hull they defined, so the destination fell out of
     * coverage and the test proved a different thing. Sparse-but-in-service is
     * the construction that isolates the case.
     */
    const ends = [corridor[0], corridor[corridor.length - 1]];
    const midpoint: LatLon = {
      lat: (westEnd.lat + eastEnd.lat) / 2,
      lon: (westEnd.lon + eastEnd.lon) / 2,
    };
    expectFailure(
      planTrip(near(westEnd), midpoint, withStations(ends), params),
      "no-station-near-destination",
    );
  });
});

/*
 * "Only e-bikes nearby" stood here, asserting a `no-mechanical-bike-near-origin`
 * failure. Both the failure and the rule that produced it are gone: the planner
 * reads no station's contents, so it cannot know that the only bikes in range
 * are electric, and it no longer refuses to plan on that basis. What a station
 * holds, e-bikes included, is on the map for the rider to read before setting
 * off.
 */

describe("gap too large", () => {
  it("is reported when stations exist at both ends but cannot be linked", () => {
    // Keep only the two extremes. Both ends are reachable on foot, but the
    // ride between them cannot fit inside one free window.
    const stations = snapshot.stations.filter(
      (s) => s.id === corridor[0].id || s.id === corridor[corridor.length - 1].id,
    );
    expectFailure(
      planTrip(near(westEnd), near(eastEnd), withStations(stations), params),
      "gap-too-large",
    );
  });
});

describe("invalid parameters", () => {
  it("is reported when the margin swallows the free window", () => {
    expectFailure(
      planTrip(
        near(westEnd),
        near(eastEnd),
        snapshot,
        withParams({ safetyMargin: params.freeWindow }),
      ),
      "invalid-parameters",
    );
  });
});

describe("suggestions are concrete (FR-028)", () => {
  it("carries a value the interface can apply in one tap", () => {
    const middle = corridor[Math.floor(corridor.length / 2)].position;
    const result = planTrip(
      { lat: middle.lat + 0.0012, lon: middle.lon },
      near(eastEnd),
      snapshot,
      withParams({ maxWalkDistance: 40 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;

    for (const suggestion of result.failure.suggestions) {
      expect(Number.isFinite(suggestion.currentValue)).toBe(true);
      expect(Number.isFinite(suggestion.suggestedValue)).toBe(true);
      expect(suggestion.suggestedValue).not.toBe(suggestion.currentValue);
    }

    const walkSuggestion = result.failure.suggestions.find(
      (s) => s.kind === "increase-walk-distance",
    );
    expect(walkSuggestion).toBeDefined();
    expect(walkSuggestion!.suggestedValue).toBeGreaterThan(
      walkSuggestion!.currentValue,
    );
  });
});

describe("out-of-season network", () => {
  it("covers nothing, so any point is out of coverage", () => {
    const shutDown = snapshot.stations.map((s) => ({
      ...s,
      isInstalled: false,
    }));
    expectFailure(
      planTrip(near(westEnd), near(eastEnd), withStations(shutDown), params),
      "origin-out-of-coverage",
    );
  });
});
