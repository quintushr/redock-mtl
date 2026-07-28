import type { LanguageDescriptor } from "./i18n/languages";
import type { Messages } from "./i18n/messages/fr";
import { fill } from "./i18n/resolve";
import type { Metres, Seconds } from "./types";

/**
 * Wording for durations, distances and amounts.
 *
 * Pure, and deliberately outside the components: both the summary and the trail
 * word the same figures, and two copies of this rounding would drift. Principle
 * III also forbids logic expressible as a pure function from living in a
 * component.
 *
 * The arithmetic lives here and the words live in lib/i18n/messages/. That
 * split is the point: the hours/minutes decomposition used to be written twice,
 * once inside each language's bundle, in identical form. Which parts of a
 * duration are non-zero is not a question any language answers differently, so
 * it is answered once, here, and each shape gets its own entry (FR-207a).
 *
 * Every function that formats a figure takes the active language's descriptor,
 * because the separator, the currency position and the plural categories are
 * conventions of the language rather than of this codebase (FR-220).
 *
 * Every duration here is an estimate and is worded as one (FR-113, FR-223,
 * principle IV). Nothing in this module can produce a clock time.
 */

/**
 * Rounds to a coarse figure and words it as an estimate. Never a precise minute
 * count, because a precise number reads as a promise.
 *
 * Takes no descriptor: the three duration entries are plain strings, so nothing
 * here selects a plural category. If they ever become plural maps — and
 * "1 minutes" says they should — this gains one.
 */
export function approximateDuration(seconds: Seconds, t: Messages): string {
  const minutes = seconds / 60;
  if (minutes < 1) return t.units.underAMinute;

  // Beyond ten minutes, round to five so the figure cannot be mistaken for a
  // measurement.
  const rounded =
    minutes < 10 ? Math.round(minutes) : Math.round(minutes / 5) * 5;

  return wordDuration(rounded, t);
}

/**
 * Words a whole number of minutes, choosing among the three shapes a duration
 * can take. The choice is arithmetic, so it is made here rather than inside
 * each language.
 */
function wordDuration(totalMinutes: number, t: Messages): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return fill(t.units.durationMinutes, { minutes });
  }

  if (minutes === 0) {
    return fill(t.units.durationHours, { hours });
  }

  return fill(t.units.durationHoursMinutes, { hours, minutes });
}

/**
 * The bare figure, for the gauge and the trail's right-hand column where the
 * word "about" is already carried by the surrounding sentence and repeating it
 * on every row would be noise.
 *
 * Still rounded, so it still cannot be read as a measurement. Language-free: a
 * number is a number, which is why this one keeps its signature.
 */
export function roundedMinutes(seconds: Seconds): number {
  const minutes = seconds / 60;
  return minutes < 10 ? Math.round(minutes) : Math.round(minutes / 5) * 5;
}

export function formatDistance(
  metres: Metres,
  t: Messages,
  lang: LanguageDescriptor,
): string {
  return metres < 1000
    ? fill(t.units.metres, { metres: Math.round(metres / 10) * 10 })
    : fill(t.units.kilometres, {
        value: formatDecimal(metres / 1000, 1, lang),
      });
}

/**
 * A decimal with a fixed number of digits, so a value cannot appear to gain
 * precision as it changes. Through Intl, because the separator is a convention
 * of the language and not of this codebase.
 */
export function formatDecimal(
  value: number,
  digits: number,
  lang: LanguageDescriptor,
): string {
  return new Intl.NumberFormat(lang.formatting, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * An amount in Canadian dollars.
 *
 * Through Intl as well: the position of the sign, and the space before it, are
 * conventions of the locale.
 */
export function formatMoney(
  amount: number,
  lang: LanguageDescriptor,
): string {
  return new Intl.NumberFormat(lang.formatting, {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}
