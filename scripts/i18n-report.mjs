/**
 * Where every language stands.
 *
 * Run: npm run i18n:report
 *
 * Two jobs, deliberately in one place. The completeness figures come from
 * lib/i18n/coverage.ts, the same pure module the blocking test uses, so the
 * report and the gate cannot disagree about what "complete" means (FR-216,
 * SC-005).
 *
 * The unreferenced scan lives *here* rather than in lib/, because deciding
 * whether an entry is read anywhere means reading the source tree, and a domain
 * module may not do that (Principle III). That is also why it can only advise:
 * it is not in the code that gates the test run (FR-213).
 *
 * Nothing here blocks. This prints and exits zero even when it has bad news.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { register } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-resolve-hook.mjs", import.meta.url);

const { coverageOf } = await import("../lib/i18n/coverage.ts");
const { LANGUAGES, REFERENCE } = await import("../lib/i18n/languages.ts");
const { declarationsFor, messagesFor, referenceMessages } = await import(
  "../lib/i18n/registry.ts"
);
const { leafPaths } = await import("../lib/i18n/resolve.ts");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_DIRS = ["app", "components", "lib"];

/**
 * Groups reached by a key computed at runtime.
 *
 * A scan cannot tell these from dead copy: nothing in the source ever spells
 * `t.plan.failures["gap-too-large"]`, it spells `t.plan.failures[reason]`.
 * Declaring the roots keeps the report from crying wolf about forty entries
 * every time it runs, which is how a report gets ignored.
 */
const COMPUTED_ROOTS = [
  "placeKinds",
  "feed.unavailable",
  "plan.failures",
  "plan.suggestions",
  "settings.controls",
  "gauge.states",
  "corrections.byKey",
];

function sourceFiles() {
  const found = [];

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // The wording files are not a *use* of the wording. Everything else
        // under lib/i18n/ is: static-metadata.ts reads app.title, and excluding
        // it reported that entry as dead when it is the page's own name.
        if (full.endsWith(join("i18n", "messages"))) continue;
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(full)) found.push(full);
    }
  }

  for (const dir of SOURCE_DIRS) walk(join(ROOT, dir));
  return found;
}

/** Every `something.a.b.c` path the source mentions, however it is spelled. */
function referencedPaths() {
  const mentioned = new Set();

  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\b[a-zA-Z_$][\w$]*\.((?:\w+\.)*\w+)/g)) {
      const path = match[1];
      mentioned.add(path);
      // A leaf is reached through its group, so record the prefixes too:
      // `t.settings.controls[key]` mentions `settings.controls`.
      const parts = path.split(".");
      for (let i = 1; i <= parts.length; i += 1) {
        mentioned.add(parts.slice(0, i).join("."));
        mentioned.add(parts.slice(-i).join("."));
      }
    }
  }

  return mentioned;
}

function unreferenced() {
  const mentioned = referencedPaths();

  return leafPaths(referenceMessages).filter((path) => {
    if (COMPUTED_ROOTS.some((root) => path.startsWith(`${root}.`))) return false;
    return !mentioned.has(path);
  });
}

const bar = (done, total) => {
  const filled = total === 0 ? 0 : Math.round((done / total) * 24);
  return `${"=".repeat(filled)}${" ".repeat(24 - filled)}`;
};

console.log("\nTranslation coverage\n");

let blocking = 0;

for (const language of LANGUAGES) {
  if (language.id === REFERENCE) {
    const total = leafPaths(referenceMessages).length;
    console.log(
      `  ${language.code}  [${bar(total, total)}] ${total}/${total}  reference`,
    );
    continue;
  }

  const coverage = coverageOf(
    referenceMessages,
    messagesFor(language.id),
    declarationsFor(language.id),
  );

  console.log(
    `  ${language.code}  [${bar(coverage.translated, coverage.total)}] ` +
      `${coverage.translated}/${coverage.total}`,
  );

  const report = (label, items, format = (x) => x) => {
    if (items.length === 0) return;
    blocking += items.length;
    console.log(`        ${label}: ${items.length}`);
    for (const item of items.slice(0, 10)) {
      console.log(`          ${format(item)}`);
    }
    if (items.length > 10) console.log(`          ... and ${items.length - 10} more`);
  };

  report("missing", coverage.missing);
  report("not in the reference", coverage.orphaned);
  report(
    "placeholder mismatch",
    coverage.placeholderMismatch,
    (m) => `${m.path}: uses {${m.actual.join("}, {")}}, reference has {${m.expected.join("}, {")}}`,
  );
  report("identical to the reference, undeclared", coverage.suspectedUntranslated);
}

const dead = unreferenced();

console.log("\nEntries no source file appears to read\n");

if (dead.length === 0) {
  console.log("  none\n");
} else {
  for (const path of dead) console.log(`  ${path}`);
  console.log(
    `\n  ${dead.length} entries. This is advice, not a verdict: read the list,\n` +
      "  do not obey it. Wording reached by a computed key is excluded already,\n" +
      "  but a scan cannot prove an entry is dead.\n",
  );
}

if (blocking > 0) {
  console.log(
    `${blocking} blocking problems. \`npm test\` will fail on these.\n`,
  );
} else {
  console.log("Every language is complete.\n");
}
