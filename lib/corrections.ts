import type { Messages } from "./i18n/messages/fr";
import type { PlanningParameters } from "./types";

/**
 * Why a parameter set was rejected.
 *
 * `validateParameters` returns its explanation as English prose with no code to
 * key on, and it belongs to the planning logic this work may not touch. Rather
 * than matching on that sentence, which would break the moment its wording
 * changed, this reads the *corrected* set the domain hands back and words the
 * field it had to fix. The domain stays the authority on what is wrong; only
 * the wording is ours.
 *
 * Pure, and it takes the wording as an argument rather than reaching for a
 * language: the same correction is worded differently in each, and neither this
 * function nor the domain has any business knowing which is active.
 */
export function describeCorrection(
  parameters: PlanningParameters,
  corrected: PlanningParameters,
  t: Messages,
): string {
  const keys = Object.keys(corrected) as (keyof PlanningParameters)[];

  for (const key of keys) {
    if (parameters[key] === corrected[key]) continue;
    const message = t.corrections.byKey[key];
    if (message !== undefined) return message;
  }

  return t.corrections.fallback;
}
