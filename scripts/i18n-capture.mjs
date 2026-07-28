/**
 * Captures the exact wording the interface produces today, before the move to
 * lib/i18n/ (spec 003, FR-222a).
 *
 * This is the only evidence that the migration changed nothing a rider reads.
 * It must run, and its output must be committed, BEFORE lib/strings.ts is
 * edited. Afterwards it cannot be reconstructed.
 *
 * TEMPORARY. Task T037 deletes this file, its output, and the test that reads
 * it, once the parity test has passed. Keeping it would make every later copy
 * correction a two-file edit, which is what FR-222b forbids.
 *
 * Run: node scripts/i18n-capture.mjs
 */

import { writeFileSync } from "node:fs";
import { STRINGS } from "../lib/strings.ts";

/**
 * Sample arguments, keyed by the dotted path of the entry they belong to.
 *
 * Explicit rather than derived from arity: the point of the capture is that it
 * is reproducible, and a heuristic that guessed differently on a later run
 * would prove nothing. Each entry lists one or more argument tuples; a tuple
 * produces its own row, suffixed with the arguments, so a plural entry is
 * captured in every form it can take.
 *
 * The counts are 0, 1 and 2 because those are the three plural shapes CLDR
 * distinguishes here, and the durations are 45 min, exactly 2 h, and 2 h 30 min
 * because those are the three shapes the hours/minutes wording can take.
 */
const SAMPLES = {
  "language.switchTo": [["Français"], ["English"]],

  "units.approximateMinutes": [[45], [120], [150]],
  "units.metres": [[250]],
  "units.kilometres": [["1,5"]],

  "map.hintPicking": [["origin"], ["destination"]],

  "summary.stops": [[0], [1], [2]],

  "trail.anchor": [["5 min"]],
  "trail.walkTo": [["Station Sample"]],
  "trail.rideTo": [["Station Sample"]],
  "trail.unknownStation": [["42"]],

  "gauge.spoken": [
    [10, "confortable"],
    [10, "comfortable"],
  ],
  "gauge.remaining": [[10]],

  "noStop.inOneGo": [["3 min de moins"]],
  "noStop.faster": [["3 min"]],
  "noStop.slower": [["3 min"]],
  "noStop.wouldPayAfter": [["5 min"]],
  "noStop.rateNote": [["0,17 $"]],

  "settings.summaryDefaults": [["2 min"]],
  "settings.summaryChanged": [
    ["2 min", 0],
    ["2 min", 1],
    ["2 min", 2],
  ],

  "feed.stale": [[7]],
  "feed.freshness": [["12:30"]],

  "empty.lead": [["30 min"]],
};

/** Every leaf, rendered. Sorted, so two runs produce identical files. */
function capture(bundle) {
  const rows = {};

  function walk(node, path) {
    if (typeof node === "string") {
      rows[path] = node;
      return;
    }

    if (typeof node === "function") {
      const samples = SAMPLES[path];
      if (samples === undefined) {
        throw new Error(
          `No sample arguments for the function entry "${path}". Add it to ` +
            `SAMPLES in scripts/i18n-capture.mjs; guessing would make the ` +
            `capture unreproducible.`,
        );
      }
      for (const args of samples) {
        rows[`${path}(${args.map((a) => JSON.stringify(a)).join(", ")})`] =
          node(...args);
      }
      return;
    }

    if (Array.isArray(node)) {
      // feed.retryable is a policy rather than wording, but it is in the bundle
      // today and the capture records the bundle as it is.
      rows[path] = JSON.stringify(node);
      return;
    }

    if (node !== null && typeof node === "object") {
      for (const key of Object.keys(node)) {
        walk(node[key], path === "" ? key : `${path}.${key}`);
      }
      return;
    }

    rows[path] = JSON.stringify(node);
  }

  walk(bundle, "");

  return Object.fromEntries(
    Object.keys(rows)
      .sort()
      .map((key) => [key, rows[key]]),
  );
}

const baseline = {};
for (const locale of Object.keys(STRINGS).sort()) {
  baseline[locale] = capture(STRINGS[locale]);
}

const target = new URL("../tests/fixtures/i18n-baseline.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(baseline, null, 2)}\n`);

for (const locale of Object.keys(baseline)) {
  console.log(`${locale}: ${Object.keys(baseline[locale]).length} rows`);
}
console.log(`written to ${target.pathname}`);
