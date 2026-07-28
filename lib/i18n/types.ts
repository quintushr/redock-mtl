/**
 * The shapes wording is made of.
 *
 * These types are the whole of what FR-207 permits a wording file to express:
 * a string, or a string that varies by plural category. There is deliberately
 * no way to write a function, a condition, or arithmetic. A translator cannot
 * put logic here because the compiler will not let them, which is a stronger
 * guarantee than a rule in a document.
 *
 * Nothing here knows which languages exist. That lives in ./languages.ts, so
 * that adding a language touches no type.
 */

/**
 * CLDR's plural categories. `other` is the only one every language has; the
 * rest are whatever a given language actually uses, which is what
 * `Intl.PluralRules` answers.
 */
export type PluralCategory =
  | "zero"
  | "one"
  | "two"
  | "few"
  | "many"
  | "other";

/**
 * A message that varies by count.
 *
 * `other` is required and the rest are optional, so French can write `one` and
 * `other`, Polish can write `one`, `few`, `many` and `other`, and a language
 * with no plural distinction can write `other` alone. None of them has to
 * repeat a comparison against 1 (FR-219).
 */
export type PluralMessage = Partial<Record<PluralCategory, string>> & {
  other: string;
};

export type Message = string | PluralMessage;

/**
 * Values substituted into a message. Counts arrive as numbers because
 * selecting a plural category needs one; everything else arrives already
 * formatted for the active language, because formatting is not wording.
 */
export type MessageValues = Record<string, string | number>;

/** A group of messages, named after the part of the interface it serves. */
export interface MessageTree {
  readonly [key: string]: Message | MessageTree;
}

/**
 * Widens a concrete wording tree into the shape every other language must
 * hold.
 *
 * The reference file is written as a plain object literal, so TypeScript infers
 * `string` for its text and the exact set of categories for each plural
 * message. Neither is what another language should be held to: English must be
 * free to write different words, and a language with three plural forms must be
 * free to write three. This widens the leaves and leaves the structure alone,
 * which is what makes a missing key a compile error and a different word not
 * one.
 *
 * A plural message is an object whose keys are *all* plural categories. The
 * weaker test — "has an `other` key" — is not enough: `placeKinds` has an
 * `other` entry, for a place the geocoder could not classify, and it is a group
 * of nine labels rather than a message with one plural form.
 */
export type Widen<T> = T extends string
  ? string
  : [keyof T] extends [PluralCategory]
    ? PluralMessage
    : { readonly [K in keyof T]: Widen<T[K]> };
