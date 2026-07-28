import { describe, expect, it } from "vitest";
import baseline from "@/tests/fixtures/i18n-baseline.json";
import { describe as descriptorFor, LANGUAGES } from "@/lib/i18n/languages";
import { messagesFor } from "@/lib/i18n/registry";
import { approximateDuration } from "@/lib/format";
import { resolve } from "@/lib/i18n/resolve";
import type { Messages } from "@/lib/i18n/messages/fr";

/**
 * TEMPORARY. Task T037 deletes this file, the fixture it reads, and the script
 * that produced them.
 *
 * It proves one thing, once: that moving ~200 entries out of lib/strings.ts and
 * into lib/i18n/messages/ changed nothing a rider reads (FR-222a). Every row of
 * the baseline was captured from the old bundle before it was touched, and
 * every row is reproduced here from the new one.
 *
 * Keeping it afterwards would make every later correction to a sentence a
 * two-file edit, one of them a fixture, which is the friction this feature
 * exists to remove (FR-222b).
 *
 * Two rows are expected to differ, and only two. Both are the same defect: the
 * old code chose its plural form with a hand-written comparison against 1, and
 * CLDR puts zero in French's `one` category. They are listed below rather than
 * skipped, so the correction is stated rather than hidden.
 */

type Baseline = Record<string, Record<string, string>>;

const rows = baseline as Baseline;

/**
 * The corrections this migration is allowed to make. Anything else that differs
 * is a mistake.
 */
const CORRECTED: Record<string, { was: string; because: string }> = {
  "fr|summary.stops(0)": {
    was: "0 arrêts pour rester dans la fenêtre gratuite. Ce trajet est gratuit.",
    because:
      "CLDR puts zero in French's `one` category, so the singular is correct.",
  },
  "fr|settings.summaryChanged(\"2 min\", 0)": {
    was: "2 min de marge, 0 valeurs modifiées",
    because:
      "The same defect, in the other count-dependent sentence in the product.",
  },
};

/**
 * Rows the migration deliberately dropped, with where each went.
 *
 * `units.locale` became a field on the language descriptor: it is a formatting
 * convention, not wording (FR-220). `feed.retryable` became a constant beside
 * the failure reasons it names: it is policy, and equally true in every
 * language. `units.approximateMinutes` and `map.hintPicking` were functions
 * that decided something, which wording may no longer do; each became a set of
 * named entries, checked separately below.
 */
const RETIRED = new Set([
  "units.locale",
  "feed.retryable",
  "map.hintPicking(\"origin\")",
  "map.hintPicking(\"destination\")",
  "units.approximateMinutes(45)",
  "units.approximateMinutes(120)",
  "units.approximateMinutes(150)",
]);

/** The same sample arguments the capture script committed. */
const SAMPLES: Record<string, Array<[unknown[], Record<string, unknown>]>> = {
  "language.switchTo": [
    [["Français"], { name: "Français" }],
    [["English"], { name: "English" }],
  ],
  "units.metres": [[[250], { metres: 250 }]],
  "units.kilometres": [[["1,5"], { value: "1,5" }]],
  "summary.stops": [
    [[0], { count: 0 }],
    [[1], { count: 1 }],
    [[2], { count: 2 }],
  ],
  "trail.anchor": [[["5 min"], { wait: "5 min" }]],
  "trail.walkTo": [[["Station Sample"], { place: "Station Sample" }]],
  "trail.rideTo": [[["Station Sample"], { place: "Station Sample" }]],
  "trail.unknownStation": [[["42"], { id: "42" }]],
  "gauge.spoken": [
    [[10, "confortable"], { minutes: 10, state: "confortable" }],
    [[10, "comfortable"], { minutes: 10, state: "comfortable" }],
  ],
  "gauge.remaining": [[[10], { minutes: 10 }]],
  "noStop.inOneGo": [[["3 min de moins"], { delta: "3 min de moins" }]],
  "noStop.faster": [[["3 min"], { magnitude: "3 min" }]],
  "noStop.slower": [[["3 min"], { magnitude: "3 min" }]],
  "noStop.wouldPayAfter": [[["5 min"], { overage: "5 min" }]],
  "noStop.rateNote": [[["0,17 $"], { rate: "0,17 $" }]],
  "settings.summaryDefaults": [[["2 min"], { margin: "2 min" }]],
  "settings.summaryChanged": [
    [["2 min", 0], { margin: "2 min", count: 0 }],
    [["2 min", 1], { margin: "2 min", count: 1 }],
    [["2 min", 2], { margin: "2 min", count: 2 }],
  ],
  "feed.stale": [[[7], { minutes: 7 }]],
  "feed.freshness": [[["12:30"], { time: "12:30" }]],
  "empty.lead": [[["30 min"], { window: "30 min" }]],
};

function messageAtPath(tree: Messages, path: string): unknown {
  let node: unknown = tree;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Rebuilds a baseline row key from a path and its captured arguments. */
function rowKey(path: string, args: unknown[]): string {
  return `${path}(${args.map((a) => JSON.stringify(a)).join(", ")})`;
}

describe.each(LANGUAGES.map((l) => l.id))("%s reproduces the baseline", (id) => {
  const captured = rows[id];
  const t = messagesFor(id);
  const lang = descriptorFor(id);

  it("renders every captured row identically", () => {
    const differences: string[] = [];

    for (const [key, expected] of Object.entries(captured)) {
      if (RETIRED.has(key)) continue;

      const open = key.indexOf("(");
      const path = open === -1 ? key : key.slice(0, open);
      const message = messageAtPath(t, path);

      if (message === undefined) {
        differences.push(`${key}: gone from the new wording`);
        continue;
      }

      let actual: string;
      if (open === -1) {
        actual = resolve(message as never, lang.formatting);
      } else {
        const sample = SAMPLES[path]?.find(
          ([args]) => rowKey(path, args) === key,
        );
        if (sample === undefined) {
          differences.push(`${key}: no sample arguments`);
          continue;
        }
        actual = resolve(
          message as never,
          lang.formatting,
          sample[1] as never,
        );
      }

      const correction = CORRECTED[`${id}|${key}`];
      if (correction !== undefined) {
        // The allowed change: it must differ, and it must differ from exactly
        // the string the capture recorded.
        expect(expected).toBe(correction.was);
        expect(actual).not.toBe(expected);
        continue;
      }

      if (actual !== expected) {
        differences.push(
          `${key}\n    was: ${JSON.stringify(expected)}\n    now: ${JSON.stringify(actual)}`,
        );
      }
    }

    expect(differences.join("\n  ")).toBe("");
  });

  it("splits durations as the old bundle did, and hedges them as it no longer did", () => {
    // The one entry that became three. lib/format.ts now does the division the
    // wording used to do twice, so the check is on what a reader ends up
    // seeing, not on how it was assembled.
    //
    // The captured rows are NOT reproduced here, and that is the third
    // authorised correction. Commit 5d5db95 added the hours/minutes split —
    // deliberately, and it is kept — but dropped the "environ"/"about" that had
    // been there before it, leaving a bare "45 minutes" that reads as a
    // measurement. Principle IV requires explicit uncertainty, and the repo's
    // own tests had been failing on its absence ever since.
    //
    // So: the split is preserved, the hedge is restored.
    const hedge = id === "fr" ? "environ" : "about";

    expect(captured["units.approximateMinutes(45)"]).toBe("45 minutes");
    expect(approximateDuration(45 * 60, t)).toBe(`${hedge} 45 min`);

    expect(approximateDuration(120 * 60, t)).toBe(`${hedge} 2 h`);
    expect(approximateDuration(150 * 60, t)).toBe(`${hedge} 2 h 30 min`);

    // Whatever the shape, it is never a bare number.
    for (const seconds of [60, 300, 2700, 7200, 9000]) {
      expect(approximateDuration(seconds, t)).toMatch(new RegExp(`^${hedge} `));
    }
  });

  it("keeps both map hints, one entry each instead of one that chose", () => {
    expect(t.map.hintPickingOrigin).toBe(captured['map.hintPicking("origin")']);
    expect(t.map.hintPickingDestination).toBe(
      captured['map.hintPicking("destination")'],
    );
  });
});
