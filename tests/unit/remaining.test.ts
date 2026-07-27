import { describe, expect, it } from "vitest";
import {
  ALARMING_BELOW,
  COMFORTABLE_ABOVE,
  gaugeFraction,
  remainingAfter,
  remainingLabel,
  remainingStatus,
} from "@/lib/remaining";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import { planTrip } from "@/lib/planner";
import type { PlanningParameters } from "@/lib/types";
import { eastEnd, near, snapshot, westEnd } from "./fixture";

/**
 * The single source of the remaining-time thresholds.
 *
 * The gauge fill, the three-state band and the accessible label all derive from
 * this module, which is what makes it impossible for them to disagree. It
 * replaces lib/budget.ts, which computed the same idea inverted: share
 * *consumed*, which FR-109 now forbids displaying anywhere.
 */

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

const withParams = (patch: Partial<PlanningParameters>): PlanningParameters => ({
  ...params,
  ...patch,
});

describe("remainingAfter", () => {
  it("returns the whole usable budget when nothing has been spent", () => {
    expect(remainingAfter(0, params)).toBeCloseTo(budget, 9);
  });

  it("subtracts the segment from the budget", () => {
    expect(remainingAfter(budget / 4, params)).toBeCloseTo((budget * 3) / 4, 9);
  });

  it("clamps at zero: a segment has no slack, not negative slack", () => {
    expect(remainingAfter(budget, params)).toBe(0);
    expect(remainingAfter(budget * 3, params)).toBe(0);
  });

  it("never exceeds the usable budget, so the safety margin is never offered as time in hand (FR-108a)", () => {
    for (const seconds of [0, 60, budget / 2, budget, budget * 2]) {
      expect(remainingAfter(seconds, params)).toBeLessThanOrEqual(budget);
    }
    // The margin is held back: with a 45 minute window and a 5 minute margin,
    // an 18 minute ride leaves 22 minutes, not 27.
    const eighteen = remainingAfter(18 * 60, params);
    expect(eighteen).toBeCloseTo(22 * 60, 9);
    expect(eighteen).not.toBeCloseTo(27 * 60, 9);
  });

  it("falls when the safety margin rises, for a fixed segment", () => {
    const ride = 15 * 60;
    const cautious = withParams({ safetyMargin: 10 * 60 });
    expect(remainingAfter(ride, cautious)).toBeLessThan(
      remainingAfter(ride, params),
    );
  });

  it("is zero rather than NaN when the margin swallows the window", () => {
    const degenerate = withParams({
      freeWindow: 45 * 60,
      safetyMargin: 45 * 60,
    });
    expect(remainingAfter(0, degenerate)).toBe(0);
    expect(Number.isNaN(remainingAfter(60, degenerate))).toBe(false);
  });
});

describe("remainingStatus band boundaries", () => {
  it("puts the boundaries exactly where docs/ui-guidelines.md puts them", () => {
    expect(COMFORTABLE_ABOVE).toBe(15 * 60);
    expect(ALARMING_BELOW).toBe(5 * 60);
  });

  it("treats fifteen minutes as neutral and anything above as comfortable", () => {
    expect(remainingStatus(15 * 60)).toBe("neutral");
    expect(remainingStatus(15 * 60 + 1)).toBe("comfortable");
  });

  it("treats five minutes as neutral and anything below as alarming", () => {
    expect(remainingStatus(5 * 60)).toBe("neutral");
    expect(remainingStatus(5 * 60 - 1)).toBe("alarming");
  });

  it("calls no slack at all alarming", () => {
    expect(remainingStatus(0)).toBe("alarming");
  });
});

describe("gaugeFraction", () => {
  it("is full when nothing has been spent and empty when the budget is gone", () => {
    expect(gaugeFraction(budget, params)).toBe(1);
    expect(gaugeFraction(0, params)).toBe(0);
  });

  it("decreases as the remaining time decreases", () => {
    const points = [budget, (budget * 3) / 4, budget / 2, budget / 4, 0];
    const fractions = points.map((r) => gaugeFraction(r, params));
    for (let i = 1; i < fractions.length; i += 1) {
      expect(fractions[i]).toBeLessThan(fractions[i - 1]);
    }
  });

  it("stays inside [0, 1] even for nonsense input", () => {
    expect(gaugeFraction(-500, params)).toBe(0);
    expect(gaugeFraction(budget * 5, params)).toBe(1);
  });

  it("never returns NaN when the budget is not positive", () => {
    // A style attribute of `width: NaN%` renders as a collapsed bar and reads
    // as a rendering bug rather than as a degenerate parameter set.
    const degenerate = withParams({ safetyMargin: DEFAULT_PARAMETERS.freeWindow });
    expect(Number.isNaN(gaugeFraction(0, degenerate))).toBe(false);
    expect(gaugeFraction(0, degenerate)).toBe(0);
  });
});

describe("remainingLabel", () => {
  it("gives three distinguishable non-numeric labels", () => {
    const labels = [
      remainingLabel("comfortable"),
      remainingLabel("neutral"),
      remainingLabel("alarming"),
    ];
    expect(new Set(labels).size).toBe(3);
    // A screen reader sees no colour and no bar. If the state is not in words,
    // it does not exist for that user (FR-112).
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });
});

describe("the free window resets at every anchor stop (FR-108b)", () => {
  it("measures each segment against the full budget, never a running total", () => {
    const plan = planTrip(near(westEnd), eastEnd, snapshot, params);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const rides = plan.itinerary.steps.filter((s) => s.kind === "bike");
    expect(rides.length).toBeGreaterThan(1);

    for (const ride of rides) {
      if (ride.kind !== "bike") continue;
      // Each segment's remaining is exactly what its own duration implies. If
      // the window accumulated across stops, later segments would report less
      // than this, and docking would stop meaning anything.
      expect(ride.remaining).toBeCloseTo(
        remainingAfter(ride.duration, params),
        6,
      );
      expect(ride.remainingStatus).toBe(remainingStatus(ride.remaining));
    }

    // The last ride is not systematically tighter than the first, which is the
    // observable consequence of the reset.
    const last = rides[rides.length - 1];
    if (last.kind === "bike") {
      expect(last.remaining).toBeGreaterThanOrEqual(0);
      expect(last.remaining).toBeLessThanOrEqual(budget);
    }
  });
});
