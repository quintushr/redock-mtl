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
 *
 * Two things were missing from that, and both are here now.
 *
 * The device was consulted exactly once, at load, by the inline script. A
 * machine that switches to dark at sunset, or a reader who changes the system
 * setting in another window, left this tab on whatever it had opened with until
 * it was reloaded. `subscribe` watches the media query, so following the device
 * now means following it rather than having read it.
 *
 * And the first press opted out of the device permanently: nothing short of
 * clearing site data put it back in charge. `followSystem` is the way back, and
 * it is deliberately not "set the theme the device currently asks for" — that
 * would pin a value that stops following an hour later. It removes the pin, so
 * the question is asked afresh every time. The toggle stays two states; the way
 * back lives in the settings, beside the other controls that undo something.
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
function systemQuery(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  if (typeof window.matchMedia !== "function") return null;
  return window.matchMedia("(prefers-color-scheme: dark)");
}

export function systemTheme(): Theme {
  return systemQuery()?.matches === true ? "dark" : "light";
}

/**
 * Whether the reader has pinned a theme of their own.
 *
 * False means the device decides, now and whenever it changes its mind. It is
 * the state the application opens in and the one `followSystem` returns to.
 */
export function followsSystem(): boolean {
  if (sessionTheme !== null) return false;
  try {
    return !isTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return true;
  }
}

/**
 * Hand the choice back to the device.
 *
 * Not the same as setting the theme the device currently asks for: that would
 * pin a value that stops following it an hour later. This removes the pin, so
 * the answer is recomputed every time the question is asked — including when
 * the operating system changes its mind while the tab is open.
 */
export function followSystem(): void {
  sessionTheme = null;
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Storage denied. Clearing the in-memory pin above was the whole of it.
  }
  applyTheme(systemTheme());
  window.dispatchEvent(new Event(CHANGED));
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

/**
 * Everything that can change the answer, including the device itself.
 *
 * The media query is the addition, and it is what "follow the device" actually
 * means. The system preference used to be read exactly once, by the inline
 * script at load: a reader whose machine switches to dark at sunset, or who
 * flips the system setting in another window, kept whatever this tab had been
 * opened with until they reloaded it. Reading a preference once is not
 * following it.
 *
 * The handler applies before it notifies. `readTheme` already encodes the
 * precedence — a pinned choice outranks the device — so a system change that
 * the reader has overruled resolves to the same value and writing it is a
 * no-op. Applying here rather than in an effect keyed on the rendered value is
 * deliberate: an effect would also fire on the hydration render, where
 * `getServerSnapshot` says light by construction, and would repaint the
 * document light for a frame on every dark-themed load — the exact flash the
 * inline script exists to prevent.
 */
function subscribe(onChange: () => void): () => void {
  const react = (): void => {
    applyTheme(readTheme());
    onChange();
  };

  const media = systemQuery();
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", react);
  media?.addEventListener("change", react);

  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", react);
    media?.removeEventListener("change", react);
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
 * the inline script at load, by `setTheme` afterwards, and by `subscribe` when
 * the device changes its mind. A component that only reads gets a value and
 * nothing else happens.
 */
export function useTheme(): {
  theme: Theme;
  /** False once the reader has pinned a theme of their own. */
  following: boolean;
  setTheme: (next: Theme) => void;
  toggle: () => void;
  /** Drops the pin, so the device decides again. */
  follow: () => void;
} {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);
  /*
   * Same store, same subscription, so this cannot disagree with `theme` about
   * which of them is in force. `serverTheme` has a counterpart here for the same
   * reason it has one there: the build has no reader and no device, so the
   * prerendered markup has to say the thing that is true before either exists.
   */
  const following = useSyncExternalStore(subscribe, followsSystem, () => true);

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

  const follow = useCallback(() => followSystem(), []);

  return { theme, following, setTheme, toggle, follow };
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
