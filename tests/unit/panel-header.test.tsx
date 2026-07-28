import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PanelHeader from "@/components/PanelHeader";
import { messages as fr } from "@/lib/i18n/messages/fr";
import { messages as en } from "@/lib/i18n/messages/en";
import { LANGUAGES } from "@/lib/i18n/languages";
import { messagesFor } from "@/lib/i18n/registry";

/**
 * The header, which now carries the sentence that explains the product.
 *
 * Putting it here rather than behind a control is the whole design: a sentence
 * that never leaves cannot need a mechanism to bring it back, which is why
 * FR-417 became a prohibition rather than an obligation. These tests exist to
 * catch the regression where someone "tidies up" by moving it into an overlay.
 *
 * NOT covered here, because jsdom has no layout: that the sentence wraps rather
 * than truncating at 360px, and that the header still costs only one line of
 * content. Measured by hand against quickstart.md.
 */

afterEach(cleanup);

describe("the product's own sentence", () => {
  it("sits in the header, under the name", () => {
    render(<PanelHeader />);
    expect(screen.getByText(fr.app.tagline)).toBeTruthy();
    expect(screen.getByText(fr.app.name)).toBeTruthy();
  });

  it("names the operator whose stations it plans against", () => {
    // FR-419, discharged wherever the reader is in the flow rather than only on
    // the empty screen they may never see again.
    render(<PanelHeader />);
    expect(screen.getByText(/BIXI/)).toBeTruthy();
  });

  it("says why stopping saves money, not merely what the app is", () => {
    // The sense FR-414 fixes. A tagline that named the product without naming
    // the mechanism would leave a two-stop plan looking like a worse route.
    expect(fr.app.tagline).toMatch(/supplément|surcoût/i);
    expect(en.app.tagline).toMatch(/overage|surcharge/i);
  });

  it("opens no control to show itself", () => {
    // FR-417. The language toggle is the only button the header may hold.
    render(<PanelHeader />);
    expect(screen.getAllByRole("button").length).toBeLessThanOrEqual(
      LANGUAGES.length,
    );
  });
});

describe("every language ships one", () => {
  it("declares a tagline, and not the reference's", () => {
    // A missing tagline would fall back to French under a reader who chose
    // English, which is the defect feature 003 exists to make impossible.
    for (const language of LANGUAGES) {
      const messages = messagesFor(language.id);
      expect(messages.app.tagline.length).toBeGreaterThan(0);
      expect(messages.app.tagline).toMatch(/BIXI/);
    }
  });

  it("keeps it to one sentence", () => {
    // Not a style rule: the header is one line of content and nothing else may
    // join it, because it costs panel height on every screen including the
    // collapsed rest position (FR-419a).
    for (const language of LANGUAGES) {
      const tagline = messagesFor(language.id).app.tagline;
      expect(tagline.split(/[.!?]\s/).length).toBe(1);
      expect(tagline.length).toBeLessThanOrEqual(80);
    }
  });
});
