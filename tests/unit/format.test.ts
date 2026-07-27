import { describe, expect, it } from "vitest";
import {
  approximateDuration,
  formatDistance,
  roundedMinutes,
} from "@/lib/format";

/**
 * Duration wording (FR-113, FR-138, constitution principle IV).
 *
 * The point of this module is that a figure can never be mistaken for a
 * promise. These tests guard the wording, not the arithmetic.
 */

describe("approximateDuration", () => {
  it("never returns a bare number: every value is hedged", () => {
    for (const seconds of [0, 30, 59, 60, 300, 599, 600, 1800, 5400]) {
      expect(approximateDuration(seconds)).toMatch(/^(environ |moins d')/);
    }
  });

  it("says under a minute rather than zero", () => {
    expect(approximateDuration(0)).toBe("moins d'une minute");
    expect(approximateDuration(59)).toBe("moins d'une minute");
  });

  it("rounds to the minute below ten minutes", () => {
    expect(approximateDuration(5 * 60)).toBe("environ 5 min");
    expect(approximateDuration(5 * 60 + 20)).toBe("environ 5 min");
  });

  it("rounds to five minutes beyond ten, so it cannot read as a measurement", () => {
    expect(approximateDuration(23 * 60)).toBe("environ 25 min");
    expect(approximateDuration(47 * 60)).toBe("environ 45 min");
  });

  it("never produces anything resembling a clock time", () => {
    for (const seconds of [0, 61, 900, 3600, 7200, 86_399]) {
      expect(approximateDuration(seconds)).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    }
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
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(347)).toBe("350 m");
  });

  it("switches to kilometres at a kilometre", () => {
    expect(formatDistance(1000)).toBe("1,0 km");
    expect(formatDistance(4237)).toBe("4,2 km");
  });
});
