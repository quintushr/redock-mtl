/**
 * Which languages the interface speaks, and what each needs beyond its wording.
 *
 * Registering a descriptor here, next to a wording file, is the whole of adding
 * a language (FR-218). Everything the toggle shows is derived from this list,
 * so there is no second list to fall out of step with it (FR-221) — the three
 * parallel exports the old lib/strings.ts carried are gone.
 *
 * Descriptors only. No wording is imported here, which keeps this file
 * independent of the message files and lets it be read by anything.
 */

/**
 * A language the interface can speak.
 *
 * `formatting` is deliberately separate from `id`. The language is French; the
 * conventions are Quebec's. A reader in Montreal wants `1,20 $`, and the tag
 * that produces it is not the tag that goes in the document's `lang`
 * attribute.
 */
export interface LanguageDescriptor {
  readonly id: string;
  /** How the language names itself, never how another language names it. */
  readonly name: string;
  /** The short form the toggle shows. */
  readonly code: string;
  /** BCP 47 tag driving Intl for numbers, amounts and plural categories. */
  readonly formatting: string;
}

/**
 * The registry. Adding an entry, and a matching wording file, makes a language
 * available everywhere.
 *
 * French is first because it is the default: Montreal's network is a
 * French-speaking one, and a rider who wants English asks for it.
 */
export const LANGUAGES = [
  { id: "fr", name: "Français", code: "FR", formatting: "fr-CA" },
  { id: "en", name: "English", code: "EN", formatting: "en-CA" },
] as const satisfies readonly LanguageDescriptor[];

export type LanguageId = (typeof LANGUAGES)[number]["id"];

/**
 * The language whose wording defines the shape every other must hold, and what
 * an untranslated entry falls back to (FR-203).
 */
export const REFERENCE: LanguageId = "fr";

/** The language a reader gets before they have chosen one. */
export const DEFAULT_LANGUAGE: LanguageId = REFERENCE;

export function isLanguageId(value: unknown): value is LanguageId {
  return LANGUAGES.some((language) => language.id === value);
}

export function describe(id: LanguageId): LanguageDescriptor {
  const found = LANGUAGES.find((language) => language.id === id);
  if (found === undefined) {
    // Unreachable through `LanguageId`, but a hand-edited stored value can
    // arrive here. Falling back beats throwing on a page load.
    return LANGUAGES[0];
  }
  return found;
}
