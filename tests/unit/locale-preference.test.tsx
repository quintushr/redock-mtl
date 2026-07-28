import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DocumentLanguage, useLocale } from "@/components/LocaleProvider";

/**
 * How the language preference behaves.
 *
 * Written to pass against the provider as it was *before* feature 003 rewrote
 * it, and kept so it still passes after. That order matters: a test written
 * after a rewrite proves only that the rewrite agrees with itself.
 *
 * Covers FR-204 (immediate, persisted, document language follows), FR-205
 * (storage denied still gives a working interface), and SC-007. None of these
 * is new behaviour; all of them are behaviour that would break quietly.
 *
 * Deliberately does not render a real screen. The subject is the preference,
 * not the wording, and a probe keeps this test independent of every component
 * the migration touches.
 */

function Probe() {
  const { locale, strings, setLocale } = useLocale();

  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="origin">{strings.fields.origin}</span>
      <button type="button" onClick={() => setLocale("en")}>
        to english
      </button>
      <button type="button" onClick={() => setLocale("fr")}>
        to french
      </button>
    </div>
  );
}

const app = (
  <DocumentLanguage>
    <Probe />
  </DocumentLanguage>
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "fr";
});

describe("before the reader has chosen", () => {
  it("speaks the default language", () => {
    render(app);
    expect(screen.getByTestId("locale").textContent).toBe("fr");
    expect(screen.getByTestId("origin").textContent).toBe("Départ");
  });
});

describe("switching language", () => {
  it("applies immediately, with no reload and no remount", () => {
    render(app);
    fireEvent.click(screen.getByRole("button", { name: "to english" }));

    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("origin").textContent).toBe("Start");
  });

  it("moves the document's language with it", async () => {
    // Not cosmetic: a screen reader picks its voice and its pronunciation
    // rules from this attribute, and French read by an English voice is
    // unintelligible.
    render(app);
    expect(document.documentElement.lang).toBe("fr");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "to english" }));
    });

    expect(document.documentElement.lang).toBe("en");
  });

  it("survives closing and reopening the browser", () => {
    render(app);
    fireEvent.click(screen.getByRole("button", { name: "to english" }));
    cleanup();

    // A fresh mount, reading the store the way a new tab would.
    render(app);
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("origin").textContent).toBe("Start");
  });

  it("can be switched back", () => {
    render(app);
    fireEvent.click(screen.getByRole("button", { name: "to english" }));
    fireEvent.click(screen.getByRole("button", { name: "to french" }));

    expect(screen.getByTestId("origin").textContent).toBe("Départ");
  });
});

describe("a stored value that is not a language", () => {
  it("is ignored in favour of the default", () => {
    // An old code, or a hand-edited one. Neither is worth a blank screen.
    window.localStorage.setItem("redock.locale", "kl");

    render(app);
    expect(screen.getByTestId("locale").textContent).toBe("fr");
  });
});

describe("a browser that denies storage", () => {
  it("still gives a working interface in the default language", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    render(app);
    expect(screen.getByTestId("locale").textContent).toBe("fr");
    expect(screen.getByTestId("origin").textContent).toBe("Départ");
  });

  it("still switches for the current session, it just will not be remembered", () => {
    // The one assertion here that did NOT hold before feature 003. The old
    // provider caught the write failure and carried on, but every read went
    // back to storage, so the switch had nowhere to live and silently did
    // nothing. Its comment claimed otherwise. FR-205 requires the switch to
    // work for the session, so the rewrite holds the choice in memory when
    // storage refuses it.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    render(app);
    fireEvent.click(screen.getByRole("button", { name: "to english" }));

    expect(screen.getByTestId("origin").textContent).toBe("Start");
  });
});
