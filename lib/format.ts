import type { Metres, Seconds } from "./types";

/**
 * Wording for durations and distances.
 *
 * Pure, and deliberately outside the components: both the summary and the trail
 * word the same figures, and two copies of this rounding would drift. Principle
 * III also forbids logic expressible as a pure function from living in a
 * component.
 *
 * Every duration here is an estimate and is worded as one (FR-113, principle
 * IV). Nothing in this module can produce a clock time.
 */

/**
 * Rounds to a coarse figure and words it as an estimate. Never a precise minute
 * count, because a precise number reads as a promise.
 */
export function approximateDuration(seconds: Seconds): string {
  const minutes = seconds / 60;
  if (minutes < 1) return "moins d'une minute";
  if (minutes < 10) return `environ ${Math.round(minutes)} min`;
  // Beyond ten minutes, round to five so the figure cannot be mistaken for a
  // measurement.
  return `environ ${Math.round(minutes / 5) * 5} min`;
}

/**
 * The bare figure, for the gauge and the trail's right-hand column where the
 * word "about" is already carried by the surrounding sentence and repeating it
 * on every row would be noise.
 *
 * Still rounded, so it still cannot be read as a measurement.
 */
export function roundedMinutes(seconds: Seconds): number {
  const minutes = seconds / 60;
  return minutes < 10 ? Math.round(minutes) : Math.round(minutes / 5) * 5;
}

export function formatDistance(metres: Metres): string {
  return metres < 1000
    ? `${Math.round(metres / 10) * 10} m`
    : `${formatDecimal(metres / 1000, 1)} km`;
}

/**
 * A decimal for a French-speaking reader: comma separator, fixed number of
 * digits so a value cannot appear to gain precision as it changes.
 */
export function formatDecimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(".", ",");
}

/**
 * An amount in Canadian dollars.
 *
 * Through Intl rather than a template, because the position of the sign and
 * the space before it are conventions of the locale, not of this codebase.
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}
