import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import LanguageToggle from "@/components/LanguageToggle";
import { DocumentLanguage } from "@/components/LocaleProvider";
import TripSummary from "@/components/TripSummary";
import { DEFAULT_PARAMETERS } from "@/lib/params";
import type { Itinerary } from "@/lib/types";

/**
 * The FR / EN switch.
 *
 * docs/ui-guidelines.md asks for an immediate, persisted toggle. "Immediate"
 * is testable here: the strings a sibling component renders change on the
 * click, with no reload and no remount. "Persisted" is checked through
 * localStorage, which is the only store a backend-free product has.
 */

afterEach(cleanup);

const itinerary: Itinerary = {
  steps: [],
  totalDuration: 20 * 60,
  stopCount: 0,
  freeWindowConsumed: 0,
  snapshotObservedAt: new Date("2026-07-27T12:00:00Z"),
};

const app = (
  <DocumentLanguage>
    <LanguageToggle />
    <TripSummary
      itinerary={itinerary}
      noStop={null}
      settled
      params={DEFAULT_PARAMETERS}
    />
  </DocumentLanguage>
);

beforeEach(() => {
  window.localStorage.clear();
});

describe("the toggle offers both languages", () => {
  it("names what each button does, not merely what it says", () => {
    render(app);
    // "EN" alone tells a screen-reader user nothing about the outcome.
    expect(screen.getByRole("button", { name: /English/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Français/i })).toBeTruthy();
  });

  it("marks the current language without relying on colour", () => {
    render(app);
    const french = screen.getByRole("button", { name: /Français/i });
    expect(french.getAttribute("aria-current")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /English/i })
        .getAttribute("aria-current"),
    ).toBeNull();
  });
});

describe("switching is immediate", () => {
  it("changes the copy of every component below it", () => {
    render(app);
    expect(screen.getByText(/aucun arrêt nécessaire/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /English/i }));

    expect(screen.getByText(/no stop needed/i)).toBeTruthy();
    expect(screen.queryByText(/aucun arrêt nécessaire/i)).toBeNull();
  });

  it("moves the current marker with it", () => {
    render(app);
    fireEvent.click(screen.getByRole("button", { name: /English/i }));

    expect(
      screen.getByRole("button", { name: /English/i }).getAttribute("aria-current"),
    ).toBe("true");
  });

  it("follows the document's lang, which a screen reader reads its voice from", () => {
    render(app);
    expect(document.documentElement.lang).toBe("fr");

    fireEvent.click(screen.getByRole("button", { name: /English/i }));
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("the choice is remembered", () => {
  it("stores it, so the next visit opens in the chosen language", () => {
    render(app);
    fireEvent.click(screen.getByRole("button", { name: /English/i }));
    expect(window.localStorage.getItem("redock.locale")).toBe("en");
  });

  it("reads it back on the next mount", () => {
    window.localStorage.setItem("redock.locale", "en");
    render(app);
    expect(screen.getByText(/no stop needed/i)).toBeTruthy();
  });

  it("ignores a stored value that is not a language we ship", () => {
    window.localStorage.setItem("redock.locale", "eo");
    render(app);
    expect(screen.getByText(/aucun arrêt nécessaire/i)).toBeTruthy();
  });
});
