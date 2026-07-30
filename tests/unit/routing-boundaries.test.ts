import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The six prohibitions from
 * specs/004-real-route-geometry/contracts/core-modules.md, each backed by a test
 * because each is the kind of thing that erodes quietly.
 *
 * The one that matters most is the third. The obvious implementation of this
 * feature is a fetch inside a useEffect in MapView, with the correction loop
 * written inline beside it. It would work. It would also put retrieval, caching
 * and the replan decision inside a component that cannot be instantiated without
 * WebGL, which would make the one case this feature exists to handle reachable
 * only through React, jsdom and fake timers. Principle III forbids it, and so
 * does this file.
 */

const read = (path: string): string => readFileSync(path, "utf8");

/**
 * What a file actually imports, ignoring comments.
 *
 * These test files describe the rules they obey in their own docstrings, so a
 * plain text search finds "@testing-library" in a file whose whole point is not
 * using it. What matters is what the module graph contains, not what the prose
 * mentions.
 */
const importsOf = (path: string): string =>
  (read(path).match(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?$/gm) ?? []).join(
    "\n",
  );

function filesIn(dir: string, extensions: string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(path, extensions);
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [path] : [];
  });
}

const LIB_FILES = filesIn("lib", [".ts"]);
const COMPONENTS = filesIn("components", [".ts", ".tsx"]);
const TESTS = filesIn("tests", [".ts", ".tsx"]);

/** Modules that hold rules and must never learn that a network exists. */
const PURE_MODULES = [
  "lib/planner.ts",
  "lib/geo.ts",
  "lib/params.ts",
  "lib/remaining.ts",
  "lib/pricing.ts",
  "lib/gbfs.ts",
  "lib/route-geometry.ts",
  "lib/route-refinement.ts",
];

describe("1. the domain core does not know about I/O", () => {
  for (const pure of PURE_MODULES) {
    it(`${pure} imports neither routing.ts nor path-store.ts`, () => {
      const source = read(pure);
      expect(source).not.toMatch(/from\s+["'].*\/?routing["']/);
      expect(source).not.toMatch(/from\s+["'].*\/?path-store["']/);
    });
  }

  it("route-refinement.ts does not import the planner", () => {
    // It hands back a MeasuredDistance and lets the caller replan. Importing
    // planTrip would make the state machine responsible for running the search,
    // and the two would have to be tested together.
    expect(read("lib/route-refinement.ts")).not.toMatch(
      /from\s+["'].*\/?planner["']/,
    );
  });
});

describe("2. only three modules under lib/ perform I/O", () => {
  /**
   * The third entry is new and is the narrowest of the three.
   *
   * lib/runtime-config.ts reads one file from our own origin, `/config.json`, and
   * it is what lets a self-hosted image be pointed at another provider without
   * being rebuilt — a `NEXT_PUBLIC_` value is inlined at build time and cannot do
   * it. It contacts no third party, holds no domain logic, and everything in it
   * that decides anything is `parseRuntimeConfig`, which is pure and takes an
   * unknown value.
   *
   * Widening this set is how the rule dies, so the bar is the same as for the
   * other two: a module belongs here only if it exists to perform I/O and has
   * pushed every judgement out into something testable without it.
   */
  const allowed = new Set([
    "lib/feed-client.ts",
    "lib/routing.ts",
    "lib/runtime-config.ts",
  ]);

  for (const file of LIB_FILES) {
    if (allowed.has(file)) continue;
    it(`${file} does not call fetch`, () => {
      expect(read(file)).not.toMatch(/\bfetch\s*\(/);
    });
  }
});

describe("3. only the adapter hook may reach the path source", () => {
  /**
   * SearchField.tsx fetches the geocoder and predates this feature. It is the
   * one standing exception, and it is a narrow one: it queries Photon for
   * address suggestions and holds no geometry, no cache and no plan. Widening
   * this set is how the rule dies, so a new entry needs the same kind of
   * justification.
   */
  const mayFetch = new Set([
    "components/useTracedItinerary.ts",
    "components/SearchField.tsx",
  ]);

  for (const file of COMPONENTS) {
    if (!mayFetch.has(file)) {
      it(`${file} does not call fetch or XMLHttpRequest`, () => {
        const source = read(file);
        expect(source).not.toMatch(/\bfetch\s*\(/);
        expect(source).not.toMatch(/XMLHttpRequest/);
      });
    }

    // No exception at all to this one: the path source is reached from exactly
    // one place.
    if (file === "components/useTracedItinerary.ts") continue;
    it(`${file} does not import lib/routing`, () => {
      expect(read(file)).not.toMatch(/from\s+["']@?\/?(lib\/)?routing["']/);
    });
  }

  it("MapView.tsx in particular performs no I/O", () => {
    // Named explicitly rather than left to the loop above, because this is the
    // exact file the obvious-but-wrong implementation would put a fetch in.
    const source = read("components/MapView.tsx");
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/lib\/routing/);
    expect(source).not.toMatch(/path-store/);
  });
});

describe("4. no test performs network I/O", () => {
  for (const file of TESTS) {
    it(`${file} does not hit the network`, () => {
      const source = read(file);
      // A test that fetches is a test that fails when a public service is down,
      // which teaches everyone to ignore it.
      expect(source).not.toMatch(/\bawait\s+fetch\s*\(/);
      expect(source).not.toMatch(/https?:\/\/(?!.*(?:example|localhost))/);
    });
  }

  it("the state machine's own tests need neither React nor jsdom", () => {
    /*
     * If this ever fails, the correction decision has drifted back into a
     * component and the most important path in the feature has become the
     * hardest one to exercise.
     *
     * Scoped to the state machine's own test files rather than to everything
     * that imports it. A component test may legitimately use `beginRefinement`
     * to build a fixture — tests/unit/traced-itinerary-degraded.test.tsx does
     * exactly that to prove the panel still renders with every path missing.
     * What must stay true is that the rules themselves are exercised without a
     * renderer.
     */
    const own = TESTS.filter((file) =>
      /tests\/unit\/route-refinement.*\.test\.ts$/.test(file),
    );
    expect(own.length).toBeGreaterThan(0);

    for (const file of own) {
      const imports = importsOf(file);
      expect(imports, `${file} must not need React`).not.toMatch(/@testing-library/);
      expect(imports, `${file} must not need React`).not.toMatch(/["']react/);
      expect(imports, `${file} must not import components`).not.toMatch(/@\/components/);
    }
  });

  it("the correction case is covered without a renderer", () => {
    // Named specifically, because this is the case the feature exists for and
    // the one a future refactor is most likely to make untestable.
    const correction = "tests/unit/route-refinement-correction.test.ts";
    expect(TESTS).toContain(correction);
    expect(read(correction)).toMatch(/nextAction/);
    expect(read(correction)).toMatch(/replan/);
    expect(importsOf(correction)).not.toMatch(/@testing-library/);
  });
});

describe("5. no arrival time anywhere", () => {
  /**
   * The prohibition is on arrival times, not on clocks.
   *
   * The panel footer states the moment the station snapshot was taken, which
   * FR-014 positively requires: availability is a snapshot and the rider has to
   * know how old it is. What principle IV forbids is telling someone they will
   * get there at 14:32. So this looks for a time derived from a duration, which
   * is the only way an arrival time can be constructed here.
   */
  const arrivalShaped = [
    /Date\.now\(\)\s*\+/,
    /new Date\([^)]*\+\s*\w*[Dd]uration/,
    /setMinutes|setSeconds|setHours/,
  ];

  for (const file of COMPONENTS) {
    it(`${file} builds no arrival time`, () => {
      const source = read(file);
      for (const pattern of arrivalShaped) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it("the footer's clock is the snapshot's own timestamp, not a projection", () => {
    // The one place a clock time is rendered, and it moved here when
    // docs/ui-guidelines.md put the freshness in the footer's second row.
    // Guarded rather than exempted, so an arrival time cannot be smuggled in
    // beside it.
    const source = read("components/PanelFooter.tsx");
    expect(source).toMatch(/observedAt\.toLocaleTimeString/);
    // Visibly relative, per the guidelines; the clock is the detail underneath.
    expect(source).toMatch(/relativeAge/);
  });

  it("the age is measured against now, so it grows while the tab is open", () => {
    // The feed's own `status.age` was measured when the snapshot arrived and
    // does not move. A footer row that says "3 min ago" for a quarter of an
    // hour is a clock time that lies, which is worse than the clock time it
    // replaced. So: a clock read on a timer, and never that frozen field.
    const source = read("components/PanelFooter.tsx");
    expect(source).toMatch(/Date\.now\(\)/);
    expect(source).toMatch(/setInterval/);
    // The load-bearing half. The other two can be satisfied by a clock that is
    // read once; this one cannot be satisfied at all by the frozen field, which
    // is the mistake worth guarding. tests/unit/panel-footer.test.tsx asserts
    // the behaviour; this asserts the shortcut was not taken.
    expect(source).not.toMatch(/status\.age/);
  });
});

describe("6. traced and approximate differ by weight, never by colour", () => {
  it("MapView uses one accent for the route line", () => {
    const source = read("components/MapView.tsx");
    const colours = source.match(/"line-color":\s*[^,\n]+/g) ?? [];
    // One line-color declaration, and it is the brand accent. A second hue would
    // be a colour code, which docs/ui-guidelines.md forbids on the map.
    expect(colours).toHaveLength(1);
    expect(colours[0]).toContain("palette.brand");
  });
});
