import { LANGUAGES, REFERENCE, type LanguageId } from "./languages";
import { overlay } from "./resolve";
import {
  intentionallyIdentical as enIdentical,
  messages as en,
} from "./messages/en";
import { type Messages, messages as fr } from "./messages/fr";

/**
 * Which wording belongs to which language.
 *
 * The one place a language id is turned into wording, and deliberately the
 * only one. Nothing outside `components/LocaleProvider.tsx` may import this
 * module — `eslint.config.mjs` enforces it — because a component that could
 * ask for French by name is a component that will eventually ship French to an
 * English reader. That is not a hypothetical: it is the defect this feature was
 * written to fix.
 *
 * Everything a rider sees goes through the provider, which knows only which
 * language is active, never which languages exist.
 *
 * Adding a language is two lines here and one in ./languages.ts (FR-218).
 */

interface LanguageModule {
  readonly messages: Messages;
  /** Entries this language keeps identical to the reference on purpose. */
  readonly intentionallyIdentical: readonly string[];
}

const MODULES: Record<LanguageId, LanguageModule> = {
  fr: { messages: fr, intentionallyIdentical: [] },
  en: { messages: en, intentionallyIdentical: enIdentical },
};

/** The wording a language actually declares. What the checks measure. */
export function messagesFor(id: LanguageId): Messages {
  return MODULES[id]?.messages ?? MODULES[REFERENCE].messages;
}

/**
 * The wording the interface reads: the language laid over the reference, so an
 * untranslated entry falls back rather than rendering blank (FR-203).
 *
 * Built once per language at module load. Overlaying on every read would be
 * work repeated on every keystroke for a result that cannot change.
 */
const RESOLVED: Record<string, Messages> = Object.fromEntries(
  LANGUAGES.map(({ id }) => [
    id,
    id === REFERENCE
      ? MODULES[REFERENCE].messages
      : overlay(MODULES[REFERENCE].messages, MODULES[id].messages),
  ]),
);

export function resolvedMessagesFor(id: LanguageId): Messages {
  return RESOLVED[id] ?? MODULES[REFERENCE].messages;
}

export function declarationsFor(id: LanguageId): readonly string[] {
  return MODULES[id]?.intentionallyIdentical ?? [];
}

/** The reference wording, for the fallback path and for the checks. */
export const referenceMessages: Messages = MODULES[REFERENCE].messages;

export type { Messages };
