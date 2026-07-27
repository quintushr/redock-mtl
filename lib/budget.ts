import { segmentBudget } from "./params";
import type { BudgetStatus, PlanningParameters, Seconds } from "./types";

/**
 * How much of the free window a segment consumes.
 *
 * This module is the single source of the thresholds. The bar length, the
 * colour band, and the text label in the UI all derive from these two
 * functions, so they cannot disagree (FR-018a).
 */

/**
 * Band boundaries, as a share of the usable segment budget.
 *
 * Chosen so the labels mean something to a rider rather than to a developer:
 * below 60% there is room for a red light and a headwind; between 60 and 85%
 * the segment works but has little slack; above 85% a single delay puts the
 * ride over the free window.
 */
export const COMFORTABLE_BELOW = 0.6;
export const TIGHT_AT_OR_ABOVE = 0.85;

/** Share of the segment budget consumed, clamped to [0, 1]. */
export function budgetShare(
  segment: Seconds,
  params: PlanningParameters,
): number {
  const budget = segmentBudget(params);
  if (!(budget > 0)) return 1;
  return Math.min(1, Math.max(0, segment / budget));
}

export function budgetStatus(share: number): BudgetStatus {
  if (share < COMFORTABLE_BELOW) return "comfortable";
  if (share < TIGHT_AT_OR_ABOVE) return "moderate";
  return "tight";
}

/**
 * Non-numeric label exposed to assistive technology, so budget status is never
 * carried by colour alone (FR-018b).
 */
export function budgetLabel(status: BudgetStatus): string {
  switch (status) {
    case "comfortable":
      return "comfortable";
    case "moderate":
      return "some slack";
    case "tight":
      return "tight";
  }
}
