import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/planner";
import { canEndSegment, canStartSegment, isOperational } from "@/lib/gbfs";
import { cyclingDuration } from "@/lib/geo";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type { BikeSegment, ItineraryStep, PlanningParameters } from "@/lib/types";
import { corridor, eastEnd, near, snapshot, westEnd } from "./fixture";

/**
 * Graph construction rules (T031). These assert the structure the planner is
 * allowed to build, independent of which path it eventually chooses.
 */

const params = DEFAULT_PARAMETERS;
const byId = new Map(snapshot.stations.map((s) => [s.id, s]));

const planned = (() => {
  const result = planTrip(near(westEnd), near(eastEnd), snapshot, params);
  if (!result.ok) throw new Error(`fixture must plan: ${result.failure.reason}`);
  return result.itinerary;
})();

const segments = planned.steps.filter(
  (s): s is BikeSegment => s.kind === "bike",
);

describe("edges only exist when a segment fits the budget", () => {
  it("keeps every chosen segment at or below the budget", () => {
    const budget = segmentBudget(params);
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(segment.duration).toBeLessThanOrEqual(budget);
    }
  });

  it("would have rejected any pair whose ride exceeds the budget", () => {
    // Proves the filter is real: pairs beyond the budget exist in the fixture
    // and none of them was used.
    const budget = segmentBudget(params);
    const overBudgetPairs: string[] = [];
    for (const a of corridor.slice(0, 20)) {
      for (const b of corridor.slice(-20)) {
        const ride =
          cyclingDuration(a.position, b.position, params) +
          params.segmentOverhead;
        if (ride > budget) overBudgetPairs.push(`${a.id}->${b.id}`);
      }
    }
    expect(overBudgetPairs.length).toBeGreaterThan(0);

    const used = new Set(
      segments.map((s) => `${s.fromStationId}->${s.toStationId}`),
    );
    for (const pair of overBudgetPairs) expect(used.has(pair)).toBe(false);
  });
});

describe("station roles", () => {
  it("requires a mechanical bike only at the first pickup (FR-011)", () => {
    const first = segments[0];
    const pickup = byId.get(first.fromStationId);
    expect(pickup).toBeDefined();
    expect(canStartSegment(pickup!, params)).toBe(true);
  });

  it("requires free docks at every segment end (FR-012)", () => {
    for (const segment of segments) {
      const end = byId.get(segment.toStationId);
      expect(end).toBeDefined();
      expect(canEndSegment(end!, params)).toBe(true);
    }
  });

  it("does not require a bike at intermediate stops (FR-011a)", () => {
    // Every station after the first only has to accept the bike back. This is
    // what removes the need for mid-trip walking transfers.
    for (const segment of segments.slice(1)) {
      const continuation = byId.get(segment.fromStationId);
      expect(continuation).toBeDefined();
      expect(canEndSegment(continuation!, params)).toBe(true);
    }
  });

  it("never routes through a non-operational station (FR-013)", () => {
    const touched = new Set<string>();
    for (const step of planned.steps) {
      if (step.kind === "bike") {
        touched.add(step.fromStationId);
        touched.add(step.toStationId);
      } else if (step.kind === "dock") {
        touched.add(step.stationId);
      }
    }
    expect(touched.size).toBeGreaterThan(0);
    for (const id of touched) {
      const station = byId.get(id);
      expect(station).toBeDefined();
      expect(isOperational(station!)).toBe(true);
    }
  });
});

describe("walk edges respect the walking limit", () => {
  it("never proposes an approach or exit walk beyond the maximum", () => {
    const walks = planned.steps.filter((s) => s.kind === "walk");
    expect(walks.length).toBeGreaterThan(0);
    for (const walk of walks) {
      expect(walk.distance).toBeLessThanOrEqual(params.maxWalkDistance + 1e-6);
    }
  });

  it("finds no plan at all once the walking limit is impossibly small", () => {
    const tiny: PlanningParameters = { ...params, maxWalkDistance: 1 };
    const result = planTrip(near(westEnd), near(eastEnd), snapshot, tiny);
    expect(result.ok).toBe(false);
  });
});

describe("step sequencing", () => {
  const kinds = planned.steps.map((s: ItineraryStep) => s.kind);

  it("starts and ends on foot", () => {
    expect(kinds[0]).toBe("walk");
    expect(kinds[kinds.length - 1]).toBe("walk");
  });

  it("puts exactly one dock between consecutive rides", () => {
    for (let i = 0; i < kinds.length - 1; i++) {
      expect(kinds[i] === "bike" && kinds[i + 1] === "bike").toBe(false);
    }
    expect(kinds.filter((k) => k === "dock")).toHaveLength(
      Math.max(0, segments.length - 1),
    );
  });

  it("chains the stations: each ride starts where the last one ended", () => {
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].fromStationId).toBe(segments[i - 1].toStationId);
    }
  });

  it("docks at the station the previous ride ended at", () => {
    const docks = planned.steps.filter((s) => s.kind === "dock");
    docks.forEach((dock, index) => {
      expect(dock.stationId).toBe(segments[index].toStationId);
    });
  });
});
