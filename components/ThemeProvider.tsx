"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Light or dark, remembered.
 *
 * Same shape as LocaleProvider on purpose: the store is the browser, not a
 * React tree, so a component rendered on its own in a test reads the same value
 * the application does and nothing has to be wrapped in a provider to work.
 *
 * Two states and no third. A "system" option would be a third thing to explain
 * in a control the guidelines allow one row for, and it is not needed to honour
 * the system: with nothing stored, the preference *is* the system's, and the
 * first press is what turns that into a choice. What a stored value buys is the
 * reader who wants dark on a machine set to light, which is the case a pure
 * media query cannot serve at all.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "redock.theme";

/** Broadcast so every subscriber re-reads at once, in this tab. */
const CHANGED = "redock:theme";

/**
 * The choice, when storage refused to keep it.
 *
 * A browser with storage denied still gets a working toggle; it just will not
 * survive a reload. Same fallback LocaleProvider uses, for the same reason.
 */
let sessionTheme: Theme | null = null;

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * What the system asks for, when the reader has not asked for anything.
 *
 * Guarded rather than assumed: `matchMedia` is absent in jsdom by default, and
 * a planner that throws on mount because a test environment lacks a media query
 * is worse than one that opens light.
 */
export function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    // Storage denied. Nothing here is worth failing a page load over.
  }

  return sessionTheme ?? systemTheme();
}

/**
 * What the prerendered document was built as.
 *
 * Static export has no reader, so the HTML ships light and the inline script in
 * app/layout.tsx corrects the attribute before first paint. This value is only
 * what `useSyncExternalStore` hands the very first render, and returning
 * anything else here would make that render disagree with the served markup.
 */
function serverTheme(): Theme {
  return "light";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Puts the theme on the document, where the stylesheet can see it.
 *
 * Shared with the inline script below so the attribute is written the same way
 * before hydration and after it. If these two ever disagreed the page would
 * flip theme the moment React took over, which is the exact flash the script
 * exists to prevent.
 */
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * The theme, and the means to change it.
 *
 * Reading it does not touch the DOM: the attribute is already correct, set by
 * the inline script at load and by `setTheme` afterwards. A component that only
 * reads gets a value and nothing else happens.
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
} {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      // Storage holds the choice now, so the in-memory fallback must stop
      // speaking for it.
      sessionTheme = null;
    } catch {
      sessionTheme = next;
    }
    // Before the event, so the paint that follows the re-render already has the
    // right custom properties resolved.
    applyTheme(next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  const toggle = useCallback(() => {
    setTheme(readTheme() === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggle };
}

/**
 * The no-flash script, inlined into the document head.
 *
 * It runs before the first paint and before React exists, which is the only
 * moment at which this can be fixed: the served HTML is light, and a reader who
 * chose dark would otherwise watch a white panel for however long hydration
 * takes. On a cold load over a slow connection that is not a frame, it is a
 * second of the wrong colour.
 *
 * Wrapped in try/catch because a browser with storage denied must still render
 * the page, and written as a string because it has to be a literal in the
 * document rather than a module the bundler defers.
 *
 * It duplicates `readTheme`'s logic, and that duplication is deliberate and
 * bounded: importing anything here would mean shipping a module before paint,
 * which is the cost this exists to avoid. The i18n rule against restating logic
 * per language does not apply — this is one copy, in one place, with a comment
 * pointing at the other.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;
