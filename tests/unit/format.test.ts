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
 * Duration wording.
 *
 * The hedge is gone: "environ" and "about" were removed from all three shapes
 * on request, so a duration no longer says out loud that it is an estimate.
 * FR-113, FR-138 and principle IV asked for that hedge; what is left standing
 * in its place is the rounding, which these tests now guard on its own, and the
 * standing guarantee that nothing here can produce a clock time.
 *
 * The rounding is the same in both languages, so the English cases below check
 * the wording rather than repeating every boundary.
 */

describe("approximateDuration", () => {
  it("no longer hedges any value", () => {
    // Pinned as an absence: the hedge was a requirement before it was removed,
    // so its return should be a decision rather than a stray edit.
    for (const seconds of [0, 30, 59, 60, 300, 599, 600, 1800, 5400]) {
      expect(approximateDuration(seconds, fr)).not.toMatch(/environ/);
    }
  });

  it("still rounds, which is the only thing left stopping a false promise", () => {
    // 23 minutes is not reported as 23. That coarseness is now carrying the
    // whole of principle IV on its own.
    expect(approximateDuration(23 * 60, fr)).not.toMatch(/\b23\b/);
    expect(approximateDuration(47 * 60, fr)).not.toMatch(/\b47\b/);
  });

  it("says under a minute rather than zero", () => {
    expect(approximateDuration(0, fr)).toBe("moins d'une minute");
    expect(approximateDuration(59, fr)).toBe("moins d'une minute");
  });

  it("rounds to the minute below ten minutes", () => {
    expect(approximateDuration(5 * 60, fr)).toBe("5 min");
    expect(approximateDuration(5 * 60 + 20, fr)).toBe("5 min");
  });

  it("rounds to five minutes beyond ten, so it cannot read as a measurement", () => {
    expect(approximateDuration(23 * 60, fr)).toBe("25 min");
    expect(approximateDuration(47 * 60, fr)).toBe("45 min");
  });

  it("never produces anything resembling a clock time", () => {
    for (const seconds of [0, 61, 900, 3600, 7200, 86_399]) {
      expect(approximateDuration(seconds, fr)).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    }
  });
});

describe("the same rounding, worded in English", () => {
  it("drops the hedge too", () => {
    for (const seconds of [0, 30, 59, 60, 300, 599, 600, 1800, 5400]) {
      expect(approximateDuration(seconds, en)).not.toMatch(/about/);
    }
  });

  it("rounds identically, and words it in the reader's language", () => {
    expect(approximateDuration(0, en)).toBe("under a minute");
    expect(approximateDuration(5 * 60 + 20, en)).toBe("5 min");
    expect(approximateDuration(23 * 60, en)).toBe("25 min");
  });

  it("switches the decimal separator with the language", () => {
    expect(formatDistance(4237, fr, FR)).toBe("4,2 km");
    expect(formatDistance(4237, en, EN)).toBe("4.2 km");
  });
});

/**
 * The clock convention: an hour and five minutes is "1 h 05", never "1 h 5".
 *
 * The unpadded form read as a typo, which is what prompted this. The padding is
 * in lib/format.ts rather than in either language's bundle, because no language
 * writes it differently and a rule restated per language is a rule one of them
 * eventually gets wrong (FR-207a).
 */
describe("hours and minutes together", () => {
  it("pads the minutes to two digits", () => {
    expect(approximateDuration(65 * 60, fr)).toBe("1 h 05");
    expect(approximateDuration(65 * 60, en)).toBe("1 h 05");
  });

  it("pads in both languages at every single-digit minute", () => {
    // Rounding to five past ten minutes means 05 is the only single digit
    // reachable, but the padding is not written to depend on that.
    expect(approximateDuration(125 * 60, fr)).toBe("2 h 05");
    expect(approximateDuration(70 * 60, fr)).toBe("1 h 10");
  });

  it("does not pad a duration that is only minutes", () => {
    // "05 min" would be wrong; the convention is a clock convention and it
    // applies to the pair, not to a bare count.
    expect(approximateDuration(5 * 60, fr)).toBe("5 min");
  });

  it("drops the minutes entirely on the hour", () => {
    expect(approximateDuration(60 * 60, fr)).toBe("1 h");
    expect(approximateDuration(120 * 60, fr)).toBe("2 h");
  });

  it("still never produces a clock time", () => {
    // "1 h 05" must not become "1:05". The colon is what FR-138 forbids.
    for (const seconds of [65 * 60, 125 * 60, 3600, 7200]) {
      expect(approximateDuration(seconds, fr)).not.toMatch(/\d:\d/);
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
    expect(formatDistance(0, fr, FR)).toBe("0 m");
    expect(formatDistance(347, fr, FR)).toBe("350 m");
  });

  it("switches to kilometres at a kilometre", () => {
    expect(formatDistance(1000, fr, FR)).toBe("1,0 km");
    expect(formatDistance(4237, fr, FR)).toBe("4,2 km");
  });
});
