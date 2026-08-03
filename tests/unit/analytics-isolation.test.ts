import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nobody talks to the tracker except the module written to talk to it.
 *
 * `normalizePagePath` only protects the call sites that go through it. One
 * `window.umami.track({ url: location.href })` written somewhere else, in good
 * faith, on a day when the URL happens to carry a destination, and every
 * guarantee this feature makes is gone — and nothing fails, because the
 * application still works perfectly.
 *
 * So the guarantee is enforced here rather than documented: the shipped tree is
 * read, and the two names that reach the tracker may appear in exactly one file
 * each. Same instrument, and same reasoning, as the eslint rule that confines
 * the i18n registry to one importer.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const TREES = ["app", "components", "lib"];

/** Where the tracker itself is called. The only file that may. */
const TRACKER_MODULE = "lib/analytics.ts";

/**
 * Who may import that module at all, and what each is allowed it for.
 *
 * Kept short on purpose: a third entry should have to be argued for in a
 * review, which is what a list that fails the build gives you.
 */
const IMPORTERS = new Set([
  TRACKER_MODULE,
  // Starts the tracker and reports pages. The one caller of `trackPage`.
  "components/Analytics.tsx",
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }

  return found;
}

const SOURCES = TREES.flatMap(sourceFiles).map((path) => ({
  path: relative(".", path).split("\\").join("/"),
  text: readFileSync(join(ROOT, path), "utf8"),
}));

describe("the shipped source", () => {
  it("was actually read", () => {
    // A glob that silently matches nothing would make every check below pass.
    expect(SOURCES.length).toBeGreaterThan(20);
    expect(SOURCES.map((file) => file.path)).toContain(TRACKER_MODULE);
  });

  it("reaches for the tracker object in one file only", () => {
    /*
     * The tracker installs itself as a property of `window`, so every way to
     * reach it goes through a property access — `window.umami`, `win.umami`,
     * `globalThis.umami`. Naming the tool in prose does not, which is why the
     * about page and the wording files can say "Umami" as often as they need
     * to and this still means something.
     */
    const offenders = SOURCES.filter(
      (file) => file.path !== TRACKER_MODULE && /\.umami\b/i.test(file.text),
    ).map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it("calls track() in one file only", () => {
    // `.trackPage(` deliberately does not match: that is this feature's own
    // normalising entry point, and the point is that it is the only way in.
    const offenders = SOURCES.filter(
      (file) => file.path !== TRACKER_MODULE && /\.track\s*\(/.test(file.text),
    ).map((file) => file.path);

    expect(offenders).toEqual([]);
  });

  it("imports the analytics module only where it is accounted for", () => {
    const offenders = SOURCES.filter(
      (file) =>
        !IMPORTERS.has(file.path) &&
        /from\s+["'](@\/lib\/analytics|\.\/analytics|\.\.\/lib\/analytics)["']/.test(
          file.text,
        ),
    ).map((file) => file.path);

    expect(offenders).toEqual([]);
  });
});
