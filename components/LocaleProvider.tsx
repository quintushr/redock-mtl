"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  STRINGS,
  isLocale,
  type Locale,
  type Strings,
} from "@/lib/strings";

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
 * No context and no state manager. The guidelines forbid the dependency, and
 * one value read straight from its store needs neither.
 */

const STORAGE_KEY = "redock.locale";

/** Same-tab notification. The `storage` event only fires in *other* tabs. */
const CHANGED = "redock:locale";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    // A browser with storage denied still gets a working planner in the
    // default language. Nothing here is worth failing a page load over.
    return DEFAULT_LOCALE;
  }
}

/** What the prerendered document was built in. */
function serverLocale(): Locale {
  return DEFAULT_LOCALE;
}

interface LocaleValue {
  locale: Locale;
  strings: Strings;
  setLocale: (next: Locale) => void;
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

  const setLocale = useCallback((next: Locale) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The switch still works for this render; it just will not be
      // remembered.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return { locale, strings: STRINGS[locale], setLocale };
}

/** The common case: a component that reads copy and never changes it. */
export function useStrings(): Strings {
  return useLocale().strings;
}
