import { describe, expect, it } from "vitest";
import { planTrip } from "@/lib/planner";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import { corridor, eastEnd, near, snapshot, westEnd } from "./fixture";

/**
 * SC-012: a plan is computed within one second on a mid-range phone (T061).
 *
 * SC-012 is a testable claim, so it gets a test rather than an assumption.
 *
 * The budget here is deliberately tighter than one second. This machine is not
 * a mid-range phone, and the point of the test is to catch an algorithmic
 * regression long before it reaches a real device rather than to certify
 * phone performance, which no unit test can do.
 */

const params = DEFAULT_PARAMETERS;

/** Headroom for the gap between a development machine and a phone. */
const BUDGET_MS = 150;

const timed = (run: () => void): number => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

describe("plan computation stays inside the budget", () => {
  it("plans the longest trip in the fixture quickly", () => {
    const origin = near(westEnd);
    const destination = near(eastEnd);

    // Warm up so the measurement is not dominated by first-call JIT.
    planTrip(origin, destination, snapshot, params);

    const runs = 10;
    const elapsed = timed(() => {
      for (let i = 0; i < runs; i++) {
        planTrip(origin, destination, snapshot, params);
      }
    });

    const perPlan = elapsed / runs;
    expect(
      perPlan,
      `plan took ${perPlan.toFixed(1)} ms, budget ${BUDGET_MS} ms. ` +
        "If this is a genuine need rather than a regression, the escalation " +
        "order recorded in research R11 is A* first, then a web worker, each " +
        "justified in the plan's Complexity Tracking table.",
    ).toBeLessThan(BUDGET_MS);
  });

  it("stays inside the budget across a spread of trips", () => {
    const samples = [
      [0, corridor.length - 1],
      [0, Math.floor(corridor.length / 2)],
      [Math.floor(corridor.length / 4), Math.floor((3 * corridor.length) / 4)],
      [2, 8],
    ];

    for (const [from, to] of samples) {
      const origin = near(corridor[from].position);
      const destination = near(corridor[to].position);
      planTrip(origin, destination, snapshot, params);
      const elapsed = timed(() => {
        planTrip(origin, destination, snapshot, params);
      });
      expect(
        elapsed,
        `trip ${from} to ${to} took ${elapsed.toFixed(1)} ms`,
      ).toBeLessThan(BUDGET_MS);
    }
  });

  it("stays inside the budget when a parameter change forces a recompute", () => {
    // US3's live recomputation is the hot path: this runs on every slider move,
    // not once per page load.
    const origin = near(westEnd);
    const destination = near(eastEnd);
    planTrip(origin, destination, snapshot, params);

    for (const margin of [0, 5, 10, 15, 20]) {
      const elapsed = timed(() => {
        planTrip(origin, destination, snapshot, {
          ...params,
          safetyMargin: margin * 60,
        });
      });
      expect(
        elapsed,
        `margin ${margin} min took ${elapsed.toFixed(1)} ms`,
      ).toBeLessThan(BUDGET_MS);
    }
  });

  it("does not degrade when the network is far larger than the pruned set", () => {
    // Guards the ellipse pruning: with ten times the stations, only the ones
    // near the corridor should enter the graph, so the time should not scale
    // with the raw feed size.
    const inflated = {
      ...snapshot,
      stations: Array.from({ length: 10 }, (_, copy) =>
        snapshot.stations.map((s) => ({
          ...s,
          id: `${s.id}-copy-${copy}`,
          position: {
            // Scatter the copies well outside the corridor so pruning must
            // discard them.
            lat: s.position.lat + copy * 0.05,
            lon: s.position.lon + copy * 0.05,
          },
        })),
      ).flat(),
    };

    const origin = near(westEnd);
    const destination = near(eastEnd);
    planTrip(origin, destination, inflated, params);

    const elapsed = timed(() => {
      planTrip(origin, destination, inflated, params);
    });
    expect(
      elapsed,
      `inflated network took ${elapsed.toFixed(1)} ms with ${inflated.stations.length} stations`,
    ).toBeLessThan(BUDGET_MS * 4);
  });
});
