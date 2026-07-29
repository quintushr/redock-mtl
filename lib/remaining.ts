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
 * ---
 *
 * Measured against the whole free window, not against the usable budget.
 *
 * This reverses FR-108a, which held the safety margin back out of the reported
 * figure so it could not be spent in advance. The reasoning was sound about the
 * margin and wrong about the number. Two different jobs were being done by one
 * subtraction:
 *
 *   planning    where to put a stop            keeps the margin
 *   reporting   what the meter reads on arrival    must not
 *
 * `segmentBudget` still holds the margin back, and it is still what the planner
 * and the geometry correction budget against — so a segment is placed as
 * cautiously as it ever was. Nothing about the protection changed.
 *
 * What changed is the claim. The gauge is labelled "d'avance à l'arrivée": it
 * asserts what the rider will have left when they dock. With a 45 minute window
 * and a 5 minute margin, an 18 minute ride leaves 27 minutes on the operator's
 * meter. Reporting 22 stated something that was not true, was not derivable
 * from anything on screen, and could not be reconciled against the window —
 * least of all now that the line naming the window has been removed. A rider
 * who checked the arithmetic found it short by exactly five minutes and had
 * nothing to attribute that to.
 *
 * The margin has not stopped working; it has stopped being counted twice. It is
 * visible now as what it actually is: because the planner budgets segments at
 * `freeWindow - safetyMargin`, a well-planned ride arrives with *at least* the
 * margin in hand, so the gauge reads five minutes or better on every segment
 * the planner built. It drops below that only when measured geometry pushed a
 * segment past its budget and correction gave up — which is exactly the case a
 * rider should be alarmed by, and which the old denominator hid by making every
 * segment look five minutes tighter than it was.
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
 * The free window still in hand on arrival, after riding for this long.
 *
 * Never negative: a segment that overruns has no slack, which is different from
 * having negative slack and reads very differently in a gauge. Never above the
 * window either, so no rounding or nonsense input can report more time than the
 * subscription includes.
 */
export function remainingAfter(
  segmentDuration: Seconds,
  params: PlanningParameters,
): Seconds {
  const window = params.freeWindow;
  // Finite as well as positive. validateParameters now rejects a non-finite
  // free window before the planner ever runs, but this is a public pure
  // function and must not hand back Infinity to whoever calls it directly.
  if (!(window > 0) || !Number.isFinite(window)) return 0;
  return Math.min(window, Math.max(0, window - segmentDuration));
}

export function remainingStatus(remaining: Seconds): RemainingStatus {
  if (remaining > COMFORTABLE_ABOVE) return "comfortable";
  if (remaining < ALARMING_BELOW) return "alarming";
  return "neutral";
}

/**
 * Gauge fill, in [0, 1]. Full means the whole free window is in hand.
 *
 * The same denominator `remainingAfter` uses, and it has to be: the bar and the
 * figure beside it are two encodings of one quantity, and a bar measured
 * against the budget under a figure measured against the window would disagree
 * by the margin at every point.
 *
 * Returns 0 rather than NaN when the window is not positive: a `width: NaN%`
 * renders as a collapsed bar, which reads as a rendering bug rather than as a
 * degenerate parameter set.
 */
export function gaugeFraction(
  remaining: Seconds,
  params: PlanningParameters,
): number {
  const window = params.freeWindow;
  if (!(window > 0) || !Number.isFinite(window)) return 0;
  return Math.min(1, Math.max(0, remaining / window));
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
