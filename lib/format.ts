import type { Strings } from "./strings";
import type { Metres, Seconds } from "./types";

/**
 * Wording for durations, distances and amounts.
 *
 * Pure, and deliberately outside the components: both the summary and the trail
 * word the same figures, and two copies of this rounding would drift. Principle
 * III also forbids logic expressible as a pure function from living in a
 * component.
 *
 * Every function takes the string bundle rather than reading a global, because
 * "about 5 min" and "environ 5 min" are the same rounding in two languages. The
 * arithmetic lives here, the words live in lib/strings.ts, and neither has to
 * know the other's business.
 *
 * Every duration here is an estimate and is worded as one (FR-113, principle
 * IV). Nothing in this module can produce a clock time.
 */

/**
 * Rounds to a coarse figure and words it as an estimate. Never a precise minute
 * count, because a precise number reads as a promise.
 */
export function approximateDuration(seconds: Seconds, t: Strings): string {
  const minutes = seconds / 60;
  if (minutes < 1) return t.units.underAMinute;
  if (minutes < 10) return t.units.approximateMinutes(Math.round(minutes));
  // Beyond ten minutes, round to five so the figure cannot be mistaken for a
  // measurement.
  return t.units.approximateMinutes(Math.round(minutes / 5) * 5);
}

/**
 * The bare figure, for the gauge and the trail's right-hand column where the
 * word "about" is already carried by the surrounding sentence and repeating it
 * on every row would be noise.
 *
 * Still rounded, so it still cannot be read as a measurement. Language-free: a
 * number is a number.
 */
export function roundedMinutes(seconds: Seconds): number {
  const minutes = seconds / 60;
  return minutes < 10 ? Math.round(minutes) : Math.round(minutes / 5) * 5;
}

export function formatDistance(metres: Metres, t: Strings): string {
  return metres < 1000
    ? t.units.metres(Math.round(metres / 10) * 10)
    : t.units.kilometres(formatDecimal(metres / 1000, 1, t));
}

/**
 * A decimal with a fixed number of digits, so a value cannot appear to gain
 * precision as it changes. Through Intl, because the separator is a convention
 * of the language and not of this codebase.
 */
export function formatDecimal(
  value: number,
  digits: number,
  t: Strings,
): string {
  return new Intl.NumberFormat(t.units.locale, {
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
export function formatMoney(amount: number, t: Strings): string {
  return new Intl.NumberFormat(t.units.locale, {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}
