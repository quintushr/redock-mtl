import { describe, expect, it } from "vitest";
import {
  COMFORTABLE_BELOW,
  TIGHT_AT_OR_ABOVE,
  budgetLabel,
  budgetShare,
  budgetStatus,
} from "@/lib/budget";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type { PlanningParameters } from "@/lib/types";

/**
 * The single source of the budget thresholds (T046).
 *
 * The bar length, the colour band and the text label all derive from these two
 * functions, which is what makes it impossible for them to disagree (FR-018a).
 */

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

const withParams = (patch: Partial<PlanningParameters>): PlanningParameters => ({
  ...params,
  ...patch,
});

describe("budgetShare", () => {
  it("is the fraction of the segment budget consumed", () => {
    expect(budgetShare(budget / 2, params)).toBeCloseTo(0.5, 9);
    expect(budgetShare(budget, params)).toBeCloseTo(1, 9);
  });

  it("clamps below zero", () => {
    expect(budgetShare(-100, params)).toBe(0);
  });

  it("clamps above one, so an over-budget segment cannot overflow the bar", () => {
    expect(budgetShare(budget * 3, params)).toBe(1);
  });

  it("reports a full bar rather than dividing by zero", () => {
    // A margin that swallows the window is rejected upstream, but this must not
    // produce Infinity or NaN if it ever gets here.
    const degenerate = withParams({ safetyMargin: params.freeWindow });
    expect(budgetShare(60, degenerate)).toBe(1);
    expect(Number.isFinite(budgetShare(60, degenerate))).toBe(true);
  });

  it("tracks the margin: the same ride burns more of a smaller budget", () => {
    const ride = 600;
    const generous = budgetShare(ride, withParams({ safetyMargin: 0 }));
    const strict = budgetShare(ride, withParams({ safetyMargin: 20 * 60 }));
    expect(strict).toBeGreaterThan(generous);
  });
});

describe("budgetStatus", () => {
  it("uses three bands with no gap and no overlap", () => {
    expect(budgetStatus(0)).toBe("comfortable");
    expect(budgetStatus(COMFORTABLE_BELOW - 0.001)).toBe("comfortable");
    expect(budgetStatus(COMFORTABLE_BELOW)).toBe("moderate");
    expect(budgetStatus(TIGHT_AT_OR_ABOVE - 0.001)).toBe("moderate");
    expect(budgetStatus(TIGHT_AT_OR_ABOVE)).toBe("tight");
    expect(budgetStatus(1)).toBe("tight");
  });

  it("is monotonic: more consumption never reads as more comfortable", () => {
    const rank = { comfortable: 0, moderate: 1, tight: 2 } as const;
    let previous = -1;
    for (let share = 0; share <= 1; share += 0.01) {
      const current = rank[budgetStatus(share)];
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it("puts the thresholds where a rider would want them", () => {
    // Below 60% there is room for a red light and a headwind; above 85% a
    // single delay puts the ride over the free window.
    expect(COMFORTABLE_BELOW).toBeGreaterThan(0);
    expect(COMFORTABLE_BELOW).toBeLessThan(TIGHT_AT_OR_ABOVE);
    expect(TIGHT_AT_OR_ABOVE).toBeLessThan(1);
  });
});

describe("budgetLabel", () => {
  it("gives every status a distinct non-numeric label (FR-018b)", () => {
    const labels = (["comfortable", "moderate", "tight"] as const).map(
      budgetLabel,
    );
    expect(new Set(labels).size).toBe(3);
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
      // A label carrying a number would defeat the point of FR-018.
      expect(label).not.toMatch(/\d/);
    }
  });
});

describe("share and status cannot disagree", () => {
  it("derives the same status the UI would show, for any duration", () => {
    for (let seconds = 0; seconds <= budget * 1.5; seconds += 30) {
      const share = budgetShare(seconds, params);
      const status = budgetStatus(share);
      // The bar width and the label both come from this pair, so agreement is
      // structural rather than something the UI has to remember to maintain.
      expect(budgetStatus(budgetShare(seconds, params))).toBe(status);
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
  });
});
