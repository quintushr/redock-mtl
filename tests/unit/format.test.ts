import { describe, expect, it } from "vitest";
import {
  approximateDuration,
  formatDistance,
  roundedMinutes,
} from "@/lib/format";
import { describe as descriptorFor } from "@/lib/i18n/languages";
import { messages as fr } from "@/lib/i18n/messages/fr";
import { messages as en } from "@/lib/i18n/messages/en";

const FR = descriptorFor("fr");
const EN = descriptorFor("en");

/**
 * Duration wording (FR-113, FR-138, constitution principle IV).
 *
 * The point of this module is that a figure can never be mistaken for a
 * promise. These tests guard the wording, not the arithmetic.
 *
 * The rounding is the same in both languages, so the English cases below check
 * the wording rather than repeating every boundary.
 */

describe("approximateDuration", () => {
  it("never returns a bare number: every value is hedged", () => {
    for (const seconds of [0, 30, 59, 60, 300, 599, 600, 1800, 5400]) {
      expect(approximateDuration(seconds, fr)).toMatch(/^(environ |moins d')/);
    }
  });

  it("says under a minute rather than zero", () => {
    expect(approximateDuration(0, fr)).toBe("moins d'une minute");
    expect(approximateDuration(59, fr)).toBe("moins d'une minute");
  });

  it("rounds to the minute below ten minutes", () => {
    expect(approximateDuration(5 * 60, fr)).toBe("environ 5 min");
    expect(approximateDuration(5 * 60 + 20, fr)).toBe("environ 5 min");
  });

  it("rounds to five minutes beyond ten, so it cannot read as a measurement", () => {
    expect(approximateDuration(23 * 60, fr)).toBe("environ 25 min");
    expect(approximateDuration(47 * 60, fr)).toBe("environ 45 min");
  });

  it("never produces anything resembling a clock time", () => {
    for (const seconds of [0, 61, 900, 3600, 7200, 86_399]) {
      expect(approximateDuration(seconds, fr)).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    }
  });
});

describe("the same rounding, worded in English", () => {
  it("hedges every value too", () => {
    for (const seconds of [0, 30, 59, 60, 300, 599, 600, 1800, 5400]) {
      expect(approximateDuration(seconds, en)).toMatch(/^(about |under )/);
    }
  });

  it("rounds identically, and words it in the reader's language", () => {
    expect(approximateDuration(0, en)).toBe("under a minute");
    expect(approximateDuration(5 * 60 + 20, en)).toBe("about 5 min");
    expect(approximateDuration(23 * 60, en)).toBe("about 25 min");
  });

  it("switches the decimal separator with the language", () => {
    expect(formatDistance(4237, fr, FR)).toBe("4,2 km");
    expect(formatDistance(4237, en, EN)).toBe("4.2 km");
  });
});

describe("roundedMinutes", () => {
  it("matches the rounding approximateDuration uses", () => {
    expect(roundedMinutes(5 * 60 + 20)).toBe(5);
    expect(roundedMinutes(23 * 60)).toBe(25);
    expect(roundedMinutes(0)).toBe(0);
  });
});

describe("formatDistance", () => {
  it("uses metres below a kilometre, rounded to ten", () => {
    expect(formatDistance(0, fr, FR)).toBe("0 m");
    expect(formatDistance(347, fr, FR)).toBe("350 m");
  });

  it("switches to kilometres at a kilometre", () => {
    expect(formatDistance(1000, fr, FR)).toBe("1,0 km");
    expect(formatDistance(4237, fr, FR)).toBe("4,2 km");
  });
});
