import { describe, expect, it } from "vitest";
import {
  fill,
  leafPaths,
  messageAt,
  placeholders,
  plural,
  resolve,
} from "@/lib/i18n/resolve";
import type { MessageTree, PluralMessage } from "@/lib/i18n/types";

/**
 * Substitution and plural selection.
 *
 * These are the only two things a wording file is allowed to do (FR-207), so
 * they are the only two things that can go wrong inside one. Pure functions
 * over data: no DOM, no store, no fixtures beyond the trees written here.
 */

describe("filling placeholders", () => {
  it("substitutes a named value", () => {
    expect(fill("Roule jusqu'à {place}", { place: "Station Mont-Royal" })).toBe(
      "Roule jusqu'à Station Mont-Royal",
    );
  });

  it("substitutes several, including the same one twice", () => {
    expect(
      fill("{a} puis {b}, et encore {a}", { a: "un", b: "deux" }),
    ).toBe("un puis deux, et encore un");
  });

  it("leaves an unknown placeholder visible rather than blanking it", () => {
    // A visible {plaec} is a bug someone reports. A silent gap is a bug nobody
    // sees until a rider is standing at the wrong station.
    expect(fill("Roule jusqu'à {plaec}", { place: "X" })).toBe(
      "Roule jusqu'à {plaec}",
    );
  });

  it("does not rescan what it has just written", () => {
    // OpenStreetMap place names contain braces. A second pass would treat this
    // substituted value as a placeholder of its own.
    expect(fill("Marche jusqu'à {place}", { place: "{secret}" })).toBe(
      "Marche jusqu'à {secret}",
    );
  });

  it("returns the template untouched when there is nothing to substitute", () => {
    expect(fill("Aucun arrêt.")).toBe("Aucun arrêt.");
  });

  it("accepts numbers as values", () => {
    expect(fill("{minutes} min", { minutes: 5 })).toBe("5 min");
  });
});

describe("selecting a plural category", () => {
  const stops: PluralMessage = {
    one: "{count} arrêt",
    other: "{count} arrêts",
  };

  it("uses the singular for one", () => {
    expect(plural(stops, 1, "fr-CA")).toBe("1 arrêt");
  });

  it("uses the plural for two", () => {
    expect(plural(stops, 2, "fr-CA")).toBe("2 arrêts");
  });

  it("puts zero in the singular in French and the plural in English", () => {
    // The reason this is not a comparison against 1 written by hand. CLDR maps
    // zero to `one` in French and to `other` in English, and the code that used
    // to live in lib/strings.ts got French wrong.
    expect(plural(stops, 0, "fr-CA")).toBe("0 arrêt");
    expect(
      plural({ one: "{count} stop", other: "{count} stops" }, 0, "en-CA"),
    ).toBe("0 stops");
  });

  it("makes the count available without it being passed twice", () => {
    expect(plural({ other: "{count} minutes" }, 7, "fr-CA")).toBe("7 minutes");
  });

  it("reaches every category of a language that has four", () => {
    // Polish, which is why the plural map is a map and not a pair. Nothing
    // outside this tree changes to support it (SC-008, FR-219).
    const polish: PluralMessage = {
      one: "{count} przystanek",
      few: "{count} przystanki",
      many: "{count} przystanków",
      other: "{count} przystanku",
    };

    expect(new Intl.PluralRules("pl").resolvedOptions().pluralCategories).toEqual(
      expect.arrayContaining(["one", "few", "many", "other"]),
    );

    expect(plural(polish, 1, "pl")).toBe("1 przystanek");
    expect(plural(polish, 2, "pl")).toBe("2 przystanki");
    expect(plural(polish, 5, "pl")).toBe("5 przystanków");
    expect(plural(polish, 1.5, "pl")).toBe("1.5 przystanku");
  });

  it("falls back to other when a language lacks the selected category", () => {
    expect(plural({ other: "{count} arrêts" }, 1, "fr-CA")).toBe("1 arrêts");
  });

  it("substitutes other values alongside the count", () => {
    expect(
      plural(
        { one: "{count} arrêt, {margin} de marge", other: "{count} arrêts, {margin} de marge" },
        2,
        "fr-CA",
        { margin: "2 min" },
      ),
    ).toBe("2 arrêts, 2 min de marge");
  });
});

describe("resolving a message of either kind", () => {
  it("fills a plain string", () => {
    expect(resolve("Départ", "fr-CA")).toBe("Départ");
  });

  it("selects a category when the message varies by count", () => {
    expect(
      resolve({ one: "{count} arrêt", other: "{count} arrêts" }, "fr-CA", {
        count: 3,
      }),
    ).toBe("3 arrêts");
  });
});

describe("walking a tree", () => {
  const tree: MessageTree = {
    fields: { origin: "Départ", destination: "Destination" },
    summary: { stops: { one: "{count} arrêt", other: "{count} arrêts" } },
  };

  it("lists every leaf as a sorted dotted path", () => {
    expect(leafPaths(tree)).toEqual([
      "fields.destination",
      "fields.origin",
      "summary.stops",
    ]);
  });

  it("treats a plural message as one leaf, not as a group", () => {
    expect(leafPaths(tree)).not.toContain("summary.stops.other");
  });

  it("reads a leaf back by its path", () => {
    expect(messageAt(tree, "fields.origin")).toBe("Départ");
    expect(messageAt(tree, "summary.stops")).toEqual({
      one: "{count} arrêt",
      other: "{count} arrêts",
    });
  });

  it("returns undefined for a path that is not there", () => {
    expect(messageAt(tree, "fields.nowhere")).toBeUndefined();
    expect(messageAt(tree, "nothing.at.all")).toBeUndefined();
  });
});

describe("extracting placeholders", () => {
  it("finds the names a string uses", () => {
    expect([...placeholders("{a} et {b}")].sort()).toEqual(["a", "b"]);
  });

  it("unions across every category of a plural message", () => {
    // "1 arrêt" carries no count and "{count} arrêts" does. Dropping it from
    // one form is correct, so the union is what FR-214 must compare.
    expect(
      [...placeholders({ one: "un arrêt", other: "{count} arrêts" })],
    ).toEqual(["count"]);
  });

  it("finds nothing in a string with no placeholders", () => {
    expect(placeholders("Aucun arrêt.").size).toBe(0);
  });
});
