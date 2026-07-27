import { segmentBudget } from "./params";
import type { PlanningParameters, RemainingStatus, Seconds } from "./types";

/**
 * How much of the free window is still in hand.
 *
 * This module is the single source of the remaining-time thresholds. The gauge
 * fill, the three-state band and the text label all derive from these
 * functions, so they cannot disagree.
 *
 * It replaces lib/budget.ts, which expressed the same idea inverted, as share
 * *consumed*. FR-109 forbids showing consumed time or a consumed percentage
 * anywhere, and docs/ui-guidelines.md lists it among the outright prohibitions:
 * a rider who reads "18 of 45 min" has to do the subtraction themselves, and
 * the answer they actually want is the one that is left.
 *
 * Measured against the *usable* budget, not the whole free window. The safety
 * margin is held back on purpose, to absorb a red light or a dock that refuses
 * the bike on the first try. Offering it as time in hand would spend it in
 * advance and make the estimate optimistic, which principle IV forbids.
 */

/**
 * Band boundaries, in seconds of remaining budget, from docs/ui-guidelines.md.
 *
 * Absolute durations rather than shares. A rider does not care that 12% of a
 * budget is left; they care that it is four minutes, and four minutes is four
 * minutes whether the window is 30 or 60.
 */
export const COMFORTABLE_ABOVE: Seconds = 15 * 60;
export const ALARMING_BELOW: Seconds = 5 * 60;

/**
 * The usable budget still in hand on arrival, after riding for this long.
 *
 * Never negative: a segment that overruns has no slack, which is different from
 * having negative slack and reads very differently in a gauge. Never above the
 * budget either, so no rounding or nonsense input can hand back the margin.
 */
export function remainingAfter(
  segmentDuration: Seconds,
  params: PlanningParameters,
): Seconds {
  const budget = segmentBudget(params);
  // Finite as well as positive. validateParameters now rejects a non-finite
  // free window before the planner ever runs, but this is a public pure
  // function and must not hand back Infinity to whoever calls it directly.
  if (!(budget > 0) || !Number.isFinite(budget)) return 0;
  return Math.min(budget, Math.max(0, budget - segmentDuration));
}

export function remainingStatus(remaining: Seconds): RemainingStatus {
  if (remaining > COMFORTABLE_ABOVE) return "comfortable";
  if (remaining < ALARMING_BELOW) return "alarming";
  return "neutral";
}

/**
 * Gauge fill, in [0, 1]. Full means the whole usable budget is in hand.
 *
 * Returns 0 rather than NaN when the budget is not positive: a `width: NaN%`
 * renders as a collapsed bar, which reads as a rendering bug rather than as a
 * degenerate parameter set.
 */
export function gaugeFraction(
  remaining: Seconds,
  params: PlanningParameters,
): number {
  const budget = segmentBudget(params);
  if (!(budget > 0) || !Number.isFinite(budget)) return 0;
  return Math.min(1, Math.max(0, remaining / budget));
}

/**
 * Non-numeric label exposed to assistive technology, so the state is never
 * carried by colour alone (FR-112).
 *
 * A screen reader sees no colour and no bar. If the state is not in the words,
 * it does not exist for that user.
 */
export function remainingLabel(status: RemainingStatus): string {
  switch (status) {
    case "comfortable":
      return "comfortable";
    case "neutral":
      return "some slack";
    case "alarming":
      return "cutting it fine";
  }
}
