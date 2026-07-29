import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThemeToggle from "@/components/ThemeToggle";
import { THEME_SCRIPT, THEME_STORAGE_KEY } from "@/components/ThemeProvider";

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
