import { describe, expect, it } from "vitest";
import { coverageOf, explain, passes } from "@/lib/i18n/coverage";
import { LANGUAGES, REFERENCE } from "@/lib/i18n/languages";
import {
  declarationsFor,
  messagesFor,
  referenceMessages,
} from "@/lib/i18n/registry";
import { leafPaths } from "@/lib/i18n/resolve";
import type { MessageTree } from "@/lib/i18n/types";

/**
 * The checks that keep two languages in step.
 *
 * Over three-line trees rather than the real wording, because a check that can
 * only be exercised against the shipped files is a check nobody can reason
 * about. The run against the real files lives further down, and it is the one
 * that blocks a merge.
 */

const reference: MessageTree = {
  app: { name: "Redock" },
  fields: { origin: "Départ", destination: "Destination" },
  trail: { rideTo: "Roule jusqu'à {place}" },
  summary: { stops: { one: "{count} arrêt", other: "{count} arrêts" } },
};

describe("a language that is complete", () => {
  const complete: MessageTree = {
    app: { name: "Redock" },
    fields: { origin: "Start", destination: "Destination" },
    trail: { rideTo: "Ride to {place}" },
    summary: { stops: { one: "{count} stop", other: "{count} stops" } },
  };

  it("passes once its deliberate duplicates are declared", () => {
    const coverage = coverageOf(reference, complete, [
      "app.name",
      "fields.destination",
    ]);

    expect(passes(coverage)).toBe(true);
    expect(explain("en", coverage)).toBe("");
    expect(coverage.total).toBe(5);
    expect(coverage.translated).toBe(5);
  });
});

describe("a missing entry", () => {
  it("is named, with the language that lacks it", () => {
    const partial: MessageTree = {
      app: { name: "Redock" },
      fields: { origin: "Start" },
      trail: { rideTo: "Ride to {place}" },
      summary: { stops: { one: "{count} stop", other: "{count} stops" } },
    };

    const coverage = coverageOf(reference, partial, ["app.name"]);

    expect(coverage.missing).toEqual(["fields.destination"]);
    expect(passes(coverage)).toBe(false);
    expect(explain("en", coverage)).toContain('en: "fields.destination" is missing');
  });

  it("is not counted as translated", () => {
    const coverage = coverageOf(reference, { app: { name: "Redock" } }, [
      "app.name",
    ]);

    expect(coverage.total).toBe(5);
    expect(coverage.translated).toBe(1);
  });
});

describe("an entry the reference does not have", () => {
  it("is reported as an orphan", () => {
    const extra: MessageTree = {
      app: { name: "Redock" },
      fields: { origin: "Start", destination: "Destination" },
      trail: { rideTo: "Ride to {place}", leftover: "Nobody asked for this" },
      summary: { stops: { one: "{count} stop", other: "{count} stops" } },
    };

    const coverage = coverageOf(reference, extra, [
      "app.name",
      "fields.destination",
    ]);

    expect(coverage.orphaned).toEqual(["trail.leftover"]);
    expect(passes(coverage)).toBe(false);
    expect(explain("en", coverage)).toContain("is not in the reference");
  });
});

describe("placeholders", () => {
  it("fails when a language drops one", () => {
    const dropped: MessageTree = {
      app: { name: "Redock" },
      fields: { origin: "Start", destination: "Destination" },
      trail: { rideTo: "Ride to the station" },
      summary: { stops: { one: "{count} stop", other: "{count} stops" } },
    };

    const coverage = coverageOf(reference, dropped, [
      "app.name",
      "fields.destination",
    ]);

    expect(coverage.placeholderMismatch).toEqual([
      { path: "trail.rideTo", expected: ["place"], actual: [] },
    ]);
    expect(passes(coverage)).toBe(false);
  });

  it("fails when a language invents one", () => {
    const invented: MessageTree = {
      app: { name: "Redock" },
      fields: { origin: "Start", destination: "Destination" },
      trail: { rideTo: "Ride to {place} in {minutes}" },
      summary: { stops: { one: "{count} stop", other: "{count} stops" } },
    };

    const coverage = coverageOf(reference, invented, [
      "app.name",
      "fields.destination",
    ]);

    expect(coverage.placeholderMismatch[0].actual).toEqual(["minutes", "place"]);
    expect(explain("en", coverage)).toContain("Use the same set");
  });

  it("accepts a plural form that omits the count where the reference also can", () => {
    // "one stop" needs no number; "{count} stops" does. The union is compared,
    // so this is not a mismatch.
    const coverage = coverageOf(
      { summary: { stops: { one: "{count} arrêt", other: "{count} arrêts" } } },
      { summary: { stops: { one: "one stop", other: "{count} stops" } } },
    );

    expect(coverage.placeholderMismatch).toEqual([]);
  });
});

describe("a translation identical to the reference", () => {
  it("fails when it is not declared", () => {
    const coverage = coverageOf(reference, {
      app: { name: "Redock" },
      fields: { origin: "Départ", destination: "Destination" },
      trail: { rideTo: "Ride to {place}" },
      summary: { stops: { one: "{count} stop", other: "{count} stops" } },
    });

    expect(coverage.suspectedUntranslated).toEqual([
      "app.name",
      "fields.destination",
      "fields.origin",
    ]);
    expect(passes(coverage)).toBe(false);
    expect(explain("en", coverage)).toContain("declare it in intentionallyIdentical");
  });

  it("passes when it is declared, which is the way out", () => {
    const coverage = coverageOf(
      reference,
      {
        app: { name: "Redock" },
        fields: { origin: "Start", destination: "Destination" },
        trail: { rideTo: "Ride to {place}" },
        summary: { stops: { one: "{count} stop", other: "{count} stops" } },
      },
      ["app.name", "fields.destination"],
    );

    expect(coverage.suspectedUntranslated).toEqual([]);
    expect(passes(coverage)).toBe(true);
  });

  it("compares every category of a plural message, not only the default", () => {
    const coverage = coverageOf(
      { summary: { stops: { one: "{count} arrêt", other: "{count} arrêts" } } },
      { summary: { stops: { one: "{count} arrêt", other: "{count} stops" } } },
    );

    // One category differs, so this is a partial translation rather than an
    // untouched one. Flagging it would be a false failure.
    expect(coverage.suspectedUntranslated).toEqual([]);
  });
});

/**
 * The same checks, against the wording that actually ships.
 *
 * This is the block: a language that is incomplete, has an entry the reference
 * does not, uses a placeholder the reference does not, or leaves a string
 * untranslated without saying so, fails `npm test` and cannot be merged
 * (FR-211, FR-212, FR-214, FR-215, FR-217a).
 *
 * `unreferenced` is absent by design. It never blocks, and it is not computed
 * here — it needs to read the source tree, which a domain module may not do.
 * `npm run i18n:report` is where it lives.
 */
describe("the wording that ships", () => {
  it.each(
    LANGUAGES.filter((language) => language.id !== REFERENCE).map((l) => l.id),
  )("%s is complete and translated", (id) => {
    const coverage = coverageOf(
      referenceMessages,
      messagesFor(id),
      declarationsFor(id),
    );

    // The message, not just the boolean: a translator completing a language
    // wants the whole list, not the first line of it.
    expect(explain(id, coverage)).toBe("");
    expect(passes(coverage)).toBe(true);
    expect(coverage.translated).toBe(coverage.total);
  });

  it("holds every entry the interface could ask for", () => {
    // A floor rather than an exact count, so adding wording does not fail this
    // test. It is here to catch a tree that silently collapsed.
    expect(leafPaths(referenceMessages).length).toBeGreaterThan(140);
  });
});
