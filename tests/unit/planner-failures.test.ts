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
    const stations = snapshot.stations.map((station) =>
      // Strip docks from everything near the eastern end so nothing can receive
      // the bike there, while the west stays plannable.
      station.position.lon > eastEnd.lon - 0.01
        ? { ...station, docksAvailable: 0 }
        : station,
    );
    const result = planTrip(
      near(westEnd),
      near(eastEnd),
      withStations(stations),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect([
      "no-station-near-destination",
      "gap-too-large",
    ]).toContain(result.failure.reason);
  });
});

describe("only e-bikes nearby (FR-031)", () => {
  it("says so explicitly rather than reporting a generic absence", () => {
    // Every station keeps its docks but loses its mechanical bikes, and gains
    // e-bikes. The user is not out of luck for a generic reason: the free
    // window simply does not apply to the bikes that are there.
    const stations = snapshot.stations.map((station) => ({
      ...station,
      mechanicalBikesAvailable: 0,
      ebikesAvailable: 4,
    }));
    expectFailure(
      planTrip(near(westEnd), near(eastEnd), withStations(stations), params),
      "no-mechanical-bike-near-origin",
    );
  });

  it("is distinct from a station that simply has nothing", () => {
    const stations = snapshot.stations.map((station) => ({
      ...station,
      mechanicalBikesAvailable: 0,
      ebikesAvailable: 0,
    }));
    const result = planTrip(
      near(westEnd),
      near(eastEnd),
      withStations(stations),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).not.toBe("no-mechanical-bike-near-origin");
  });
});

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
