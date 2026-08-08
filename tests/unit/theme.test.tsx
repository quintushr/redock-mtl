import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThemeToggle from "@/components/ThemeToggle";
import {
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  followSystem,
  followsSystem,
} from "@/components/ThemeProvider";

/**
 * Light or dark, remembered, and applied before the first paint.
 *
 * docs/ui-guidelines.md defines one palette and says so. This is a second, added
 * on request, and these tests hold the parts that are logic rather than colour:
 * what the toggle does, what survives a reload, what happens when storage is
 * denied, and that the no-flash script agrees with the React path about where
 * the theme is written.
 *
 * NOT covered here, because jsdom resolves no custom properties and computes no
 * contrast: that the dark values actually meet their stated ratios. Those were
 * computed by hand per token and are recorded against each group in
 * app/globals.css.
 */

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

/** jsdom ships no matchMedia. The store must not fall over without one. */
function withSystem(prefersDark: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: prefersDark && query.includes("dark"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

/**
 * The same stub, but one that can change its mind and say so — which is the
 * whole of what "follow the device" means and the part a static `matches`
 * cannot exercise.
 *
 * Returns the switch. Calling it flips the preference and fires `change` at
 * every listener, exactly as an operating system does at sunset.
 */
function withSwitchableSystem(prefersDark: boolean): (next: boolean) => void {
  let dark = prefersDark;
  const listeners = new Set<() => void>();

  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return dark && query.includes("dark");
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));

  return (next: boolean) => {
    dark = next;
    for (const fn of [...listeners]) fn();
  };
}

describe("the toggle", () => {
  it("offers dark while light is in force, and says which", () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: /passer au thème sombre/i }),
    ).toBeTruthy();
  });

  it("switches, and names the way back", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));

    expect(
      screen.getByRole("button", { name: /passer au thème clair/i }),
    ).toBeTruthy();
  });

  it("writes the theme where the stylesheet reads it", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("remembers the choice", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("reads a stored choice back on the next visit", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    // Already dark, so what it offers is the way out of it.
    expect(
      screen.getByRole("button", { name: /passer au thème clair/i }),
    ).toBeTruthy();
  });

  /**
   * A stored choice outranks the system. That is the case a media query alone
   * cannot serve, and the reason this is not just CSS.
   */
  it("keeps a stored choice even when the system disagrees", () => {
    withSystem(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: /passer au thème sombre/i }),
    ).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("follows the system when nothing has been chosen", () => {
    withSystem(true);
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: /passer au thème clair/i }),
    ).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("opens light rather than throwing where matchMedia does not exist", () => {
    // jsdom's default. A planner that crashes on mount because the environment
    // lacks a media query is worse than one that opens light.
    expect(() => render(<ThemeToggle />)).not.toThrow();
    expect(
      screen.getByRole("button", { name: /passer au thème sombre/i }),
    ).toBeTruthy();
  });
});

/**
 * Following the device, rather than having read it once.
 *
 * The system preference used to be consulted a single time, by the inline
 * script at load. Everything here is about the moments after that.
 */
describe("following the device", () => {
  it("changes with the device while nothing has been pinned", () => {
    const flip = withSwitchableSystem(false);
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: /passer au thème sombre/i }),
    ).toBeTruthy();

    act(() => flip(true));

    // The rendered control followed, and so did the attribute the stylesheet
    // reads — the two must not drift apart.
    expect(
      screen.getByRole("button", { name: /passer au thème clair/i }),
    ).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe("dark");
    vi.unstubAllGlobals();
  });

  it("ignores the device once a choice has been pinned", () => {
    const flip = withSwitchableSystem(false);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button")); // pins dark

    act(() => flip(true));
    act(() => flip(false));

    // Still dark. A pinned choice is the case a media query alone cannot serve,
    // and it must survive the device changing its mind twice.
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    vi.unstubAllGlobals();
  });

  it("hands the choice back, and resumes following from there", () => {
    const flip = withSwitchableSystem(false);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    act(() => followSystem());

    // The pin is gone rather than rewritten to the device's current answer:
    // storing "light" here would stop following an hour later.
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("light");

    act(() => flip(true));
    expect(document.documentElement.dataset.theme).toBe("dark");
    vi.unstubAllGlobals();
  });

  it("reports which of the two is deciding", () => {
    withSystem(false);
    expect(followsSystem()).toBe(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(followsSystem()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("does not fall over where matchMedia does not exist", () => {
    // jsdom's default. Subscribing must not require a media query to exist.
    expect(() => render(<ThemeToggle />)).not.toThrow();
    expect(followsSystem()).toBe(true);
  });
});

describe("when storage is denied", () => {
  it("still switches, and still paints", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    render(<ThemeToggle />);
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");

    setItem.mockRestore();
  });
});

/**
 * The script that runs before React exists.
 *
 * It duplicates the store's fallback chain on purpose — importing a module
 * before paint is the cost it exists to avoid — so the thing worth pinning is
 * that the two agree about *where* the theme goes. If they ever disagreed the
 * page would flip theme the moment React took over, which is the exact flash
 * the script is for.
 */
describe("the no-flash script", () => {
  it("writes the same attribute the React path writes", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("falls back to the system when nothing is stored", () => {
    withSystem(true);
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    vi.unstubAllGlobals();
  });

  it("ignores a junk value rather than trusting it", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "chartreuse");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("never throws, whatever storage does", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    expect(() => new Function(THEME_SCRIPT)()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");

    getItem.mockRestore();
  });
});
