"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_LANGUAGE,
  describe,
  isLanguageId,
  type LanguageDescriptor,
  type LanguageId,
} from "@/lib/i18n/languages";
import { type Messages, resolvedMessagesFor } from "@/lib/i18n/registry";
import { resolve } from "@/lib/i18n/resolve";
import type { Message, MessageValues } from "@/lib/i18n/types";

/**
 * Which language the interface speaks.
 *
 * The choice is persisted and applied immediately, as docs/ui-guidelines.md
 * requires of the FR/EN entry. localStorage is the store, because a product
 * with no backend has no other, and it is read through `useSyncExternalStore`
 * rather than copied into React state: that is what the hook is for, it keeps
 * two tabs of the same planner in step, and it gives the prerendered HTML a
 * defined snapshot instead of a hydration mismatch.
 *
 * This module is the only door to the wording. `lib/i18n/registry` is the only
 * place that turns a language id into text, and `eslint.config.mjs` confines it
 * to this file — so no component can ask for French by name, which is what
 * FR-202 means by making the mistake structurally impossible rather than
 * forbidden by convention.
 *
 * No context and no state manager. The guidelines forbid the dependency, and
 * one value read straight from its store needs neither.
 */

const STORAGE_KEY = "redock.locale";

/** Same-tab notification. The `storage` event only fires in *other* tabs. */
const CHANGED = "redock:locale";

/**
 * The choice, when storage will not hold it.
 *
 * A browser with storage denied still gets a working switch for the session
 * (FR-205). Before this existed the write failed, was caught, and every
 * subsequent read went back to the empty store, so the switch silently did
 * nothing. Storage stays authoritative when it works, which is what keeps two
 * tabs in step.
 */
let sessionLocale: LanguageId | null = null;

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readLocale(): LanguageId {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguageId(saved)) return saved;
  } catch {
    // A browser with storage denied still gets a working planner. Nothing here
    // is worth failing a page load over.
  }

  return sessionLocale ?? DEFAULT_LANGUAGE;
}

/** What the prerendered document was built in. */
function serverLocale(): LanguageId {
  return DEFAULT_LANGUAGE;
}

interface LocaleValue {
  locale: LanguageId;
  strings: Messages;
  setLocale: (next: LanguageId) => void;
}

/**
 * Keeps the document's `lang` on the language the interface is speaking.
 *
 * Not cosmetic: a screen reader picks its voice and its pronunciation rules
 * from that attribute, and French read by an English voice is unintelligible.
 * The prerendered document ships with `lang="fr"`, and this moves it.
 *
 * It provides nothing, despite sitting where a provider would: the language
 * lives in the browser's storage, not in a React tree, so components read it
 * directly. This is here because updating something outside React is exactly
 * what an effect is for.
 */
export function DocumentLanguage({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <>{children}</>;
}

/**
 * The strings, and the means to change them.
 *
 * Works outside any provider: the store is the browser, not a React tree, so a
 * component rendered on its own in a test reads the same value the application
 * does.
 */
export function useLocale(): LocaleValue {
  const locale = useSyncExternalStore(subscribe, readLocale, serverLocale);

  const setLocale = useCallback((next: LanguageId) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      // Storage holds the choice now, so the in-memory fallback must stop
      // speaking for it. Leaving it set would let a stale value outlive the
      // store that superseded it.
      sessionLocale = null;
    } catch {
      // The switch still works for this session through `sessionLocale`; it
      // just will not survive a reload.
      sessionLocale = next;
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return { locale, strings: resolvedMessagesFor(locale), setLocale };
}

/** The common case: a component that reads copy and never changes it. */
export function useStrings(): Messages {
  return useLocale().strings;
}

/**
 * The active language's conventions, for the few places that format a figure
 * rather than word one. Separate from `useStrings` so that the wording call
 * sites keep reading `t.group.entry` and are untouched by formatting.
 */
export function useLanguage(): LanguageDescriptor {
  return describe(useLocale().locale);
}

/**
 * Turns a message into a sentence: substitutes values, and picks the plural
 * category when the message varies by count.
 *
 * One hook for both kinds, so a call site does not have to know which it is
 * holding — and so that turning a plain entry into a plural one later is a
 * change to the wording file alone.
 */
export function useResolve(): (
  message: Message,
  values?: MessageValues,
) => string {
  const { formatting } = useLanguage();

  return useCallback(
    (message: Message, values?: MessageValues) =>
      resolve(message, formatting, values),
    [formatting],
  );
}

export type { Messages, LanguageId };
