import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/planner";
import { parseStationSnapshot } from "@/lib/gbfs";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type {
  BikeSegment,
  FeedAttribution,
  LatLon,
  PlanningParameters,
  StationSnapshot,
} from "@/lib/types";

import information from "../fixtures/montreal-station-information.json";
import status from "../fixtures/montreal-station-status.json";
import vehicleTypes from "../fixtures/montreal-vehicle-types.json";
import systemInformation from "../fixtures/montreal-system-information.json";

const FALLBACK: FeedAttribution = {
  operatorName: "BIXI Montréal",
  licenseUrl: null,
  licenseName: null,
};

const snapshot: StationSnapshot = (() => {
  const result = parseStationSnapshot(
    information,
    status,
    vehicleTypes,
    systemInformation,
    FALLBACK,
  );
  if (!result.ok) throw new Error("fixture must parse");
  return result.value;
})();

const usable = snapshot.stations.filter(
  (s) => s.isInstalled && s.isRenting && s.isReturning,
);
const sorted = [...usable].sort((a, b) => a.position.lon - b.position.lon);
const west = sorted[0].position;
const east = sorted[sorted.length - 1].position;

const near = (p: LatLon, dLat = 0.0015): LatLon => ({
  lat: p.lat + dLat,
  lon: p.lon,
});

const withParams = (patch: Partial<PlanningParameters>): PlanningParameters => ({
  ...DEFAULT_PARAMETERS,
  ...patch,
});

const bikeSegments = (steps: { kind: string }[]): BikeSegment[] =>
  steps.filter((s): s is BikeSegment => s.kind === "bike");

describe("planTrip on the real fixture", () => {
  it("plans a long cross-island trip", () => {
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
  });

  it("returns segments that all fit the budget (FR-004)", () => {
    // The single most important invariant in the codebase.
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const budget = segmentBudget(DEFAULT_PARAMETERS);
    const segments = bikeSegments(result.itinerary.steps);
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(segment.duration).toBeLessThanOrEqual(budget);
    }
  });

  it("splits a trip too long for one window into several segments", () => {
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.stopCount).toBeGreaterThan(0);
    expect(bikeSegments(result.itinerary.steps).length).toBeGreaterThan(1);
  });

  it("starts and ends with a walk", () => {
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const steps = result.itinerary.steps;
    expect(steps[0].kind).toBe("walk");
    expect(steps[steps.length - 1].kind).toBe("walk");
  });

  it("places a docking stop between consecutive bike segments", () => {
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const kinds = result.itinerary.steps.map((s) => s.kind);
    for (let i = 0; i < kinds.length - 1; i++) {
      // Two rides never touch: docking is what resets the counter.
      expect(kinds[i] === "bike" && kinds[i + 1] === "bike").toBe(false);
    }
  });

  it("counts one cooldown per stop in the total (FR-007, FR-009)", () => {
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sum = result.itinerary.steps.reduce(
      (acc, step) => acc + (step.kind === "dock" ? step.cooldown : step.duration),
      0,
    );
    expect(result.itinerary.totalDuration).toBeCloseTo(sum, 6);
    expect(result.itinerary.totalDuration).toBeGreaterThan(
      result.itinerary.freeWindowConsumed,
    );
  });

  it("excludes walking and cooldowns from the free window (FR-006, FR-019)", () => {
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rides = bikeSegments(result.itinerary.steps).reduce(
      (sum, s) => sum + s.duration,
      0,
    );
    expect(result.itinerary.freeWindowConsumed).toBeCloseTo(rides, 6);
  });

  it("carries the snapshot timestamp through, not the local clock (FR-014)", () => {
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itinerary.snapshotObservedAt).toEqual(snapshot.observedAt);
  });

  it("returns one itinerary, never a list (FR-034)", () => {
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.itinerary)).toBe(false);
    expect(result.itinerary.steps.length).toBeGreaterThan(0);
  });
});

describe("no unnecessary stops (FR-008)", () => {
  it("proposes no stop when one segment suffices", () => {
    // Two nearby stations, well inside a single free window.
    const a = sorted[10].position;
    const b = sorted[12].position;
    const result = planTrip(near(a), near(b), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    if (bikeSegments(result.itinerary.steps).length > 0) {
      expect(result.itinerary.stopCount).toBe(0);
    }
  });

  it("adds stops only as the budget shrinks", () => {
    const origin = near(west);
    const destination = near(east);

    const generous = planTrip(origin, destination, snapshot, DEFAULT_PARAMETERS);
    const strict = planTrip(
      origin,
      destination,
      snapshot,
      withParams({ safetyMargin: 30 * 60 }),
    );

    expect(generous.ok).toBe(true);
    if (!generous.ok || !strict.ok) return;
    // A tighter budget can never need fewer stops.
    expect(strict.itinerary.stopCount).toBeGreaterThanOrEqual(
      generous.itinerary.stopCount,
    );
  });

  it("keeps every segment under the tighter budget when the margin rises", () => {
    const tighter = withParams({ safetyMargin: 30 * 60 });
    const result = planTrip(near(west), near(east), snapshot, tighter);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const segment of bikeSegments(result.itinerary.steps)) {
      expect(segment.duration).toBeLessThanOrEqual(segmentBudget(tighter));
    }
  });
});

describe("walking beats riding when it should (FR-032)", () => {
  it("returns a walk-only itinerary for two close points away from any station", () => {
    // Offset well off the station corridor, so the nearest dock is a few
    // hundred metres away, then move only a short distance from there.
    // Detouring to a station and back cannot beat simply walking.
    const anchor = sorted[Math.floor(sorted.length / 2)].position;
    const origin: LatLon = { lat: anchor.lat + 0.003, lon: anchor.lon };
    const destination: LatLon = { lat: origin.lat + 0.0005, lon: origin.lon };

    const result = planTrip(origin, destination, snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(bikeSegments(result.itinerary.steps)).toHaveLength(0);
    expect(result.itinerary.steps).toHaveLength(1);
    expect(result.itinerary.steps[0].kind).toBe("walk");
    expect(result.itinerary.stopCount).toBe(0);
  });

  it("does not propose an absurdly short ride between adjacent stations", () => {
    // Two stations in the captured feed sit 47 m apart. Without a per-segment
    // overhead the model proposed a 65 m ride "taking 16 seconds", beating a
    // 62 m walk. Charging the time to unlock, adjust and dock a bike removes
    // that, which is what principle IV's ban on flattering estimates requires.
    const origin = sorted[20].position;
    const destination: LatLon = { lat: origin.lat + 0.0004, lon: origin.lon };

    const result = planTrip(origin, destination, snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(bikeSegments(result.itinerary.steps)).toHaveLength(0);
  });

  it("charges the overhead against the free window on every segment", () => {
    // The meter runs from unlock to dock, not from the first pedal stroke, so
    // the overhead is inside the rental period and consumes budget.
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const segment of bikeSegments(result.itinerary.steps)) {
      expect(segment.duration).toBeGreaterThanOrEqual(
        DEFAULT_PARAMETERS.segmentOverhead,
      );
    }
  });
});

describe("optimality", () => {
  it("minimizes total duration, not stop count or distance (FR-009)", () => {
    const result = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // A plan that merely satisfied the constraints could pick any feasible
    // chain. Dijkstra's result must be no worse than any greedy alternative we
    // can construct, and the cheapest check is that raising the cooldown, which
    // penalises stops, never lowers the total.
    const costlier = planTrip(
      near(west),
      near(east),
      snapshot,
      withParams({ dockCooldown: 600 }),
    );
    expect(costlier.ok).toBe(true);
    if (!costlier.ok) return;
    expect(costlier.itinerary.totalDuration).toBeGreaterThanOrEqual(
      result.itinerary.totalDuration,
    );
  });

  it("is deterministic, which is what makes fixture tests meaningful", () => {
    const a = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    const b = planTrip(near(west), near(east), snapshot, DEFAULT_PARAMETERS);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
