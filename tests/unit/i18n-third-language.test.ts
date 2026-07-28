import { describe, expect, it } from "vitest";
import { coverageOf, explain, passes } from "@/lib/i18n/coverage";
import { LANGUAGES } from "@/lib/i18n/languages";
import { referenceMessages } from "@/lib/i18n/registry";
import { leafPaths, overlay, plural, resolve } from "@/lib/i18n/resolve";
import type { MessageTree, PluralMessage } from "@/lib/i18n/types";

/**
 * Adding a language is a translation, not a project (FR-218, SC-004).
 *
 * The third language here is a placeholder, built inside this file and never
 * registered. Nothing ships. What is being tested is that the machinery would
 * accept one: that a partial translation degrades entry by entry rather than
 * all at once, that the checks name exactly what is missing, and that a
 * language with more plural forms than French or English can say what it needs
 * to say.
 *
 * Nothing outside this file changes to support any of it. That is the claim.
 */

/** Spanish, deliberately incomplete, as a real first contribution would be. */
const partial: MessageTree = {
  app: { name: "Redock" },
  fields: { origin: "Salida", destination: "Destino" },
  summary: {
    noStopNeeded: "Sin paradas: este viaje cabe en la ventana gratuita.",
    stops: {
      one: "{count} parada para no salir de la ventana gratuita.",
      other: "{count} paradas para no salir de la ventana gratuita.",
    },
  },
};

describe("registering a language", () => {
  it("needs a descriptor and a wording file, and nothing else", () => {
    // The registry is the single list. Everything the toggle shows is derived
    // from it, so there is no second place to keep in step (FR-221).
    const descriptor = { id: "es", name: "Español", code: "ES", formatting: "es-MX" };

    expect(Object.keys(descriptor).sort()).toEqual(
      Object.keys(LANGUAGES[0]).sort(),
    );
  });

  it("offers every registered language, and only those", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(["FR", "EN"]);
    expect(LANGUAGES.map((l) => l.name)).toEqual(["Français", "English"]);
  });
});

describe("a partial translation", () => {
  const resolved = overlay(referenceMessages, partial);

  it("uses what it has", () => {
    expect(resolved.fields.origin).toBe("Salida");
    expect(resolved.summary.noStopNeeded).toBe(
      "Sin paradas: este viaje cabe en la ventana gratuita.",
    );
  });

  it("falls back to the reference for what it lacks, entry by entry", () => {
    // FR-203. Not all-or-nothing: a translation that is a tenth done is a tenth
    // useful, and the rest is readable French rather than a blank.
    expect(resolved.fields.swap).toBe(referenceMessages.fields.swap);
    expect(resolved.trail.label).toBe(referenceMessages.trail.label);
    expect(resolved.settings.controls.freeWindow.label).toBe(
      referenceMessages.settings.controls.freeWindow.label,
    );
  });

  it("never renders a blank or an internal identifier", () => {
    for (const path of leafPaths(resolved)) {
      const rendered = resolve(
        // Every leaf is reachable and non-empty, whichever tree it came from.
        path.split(".").reduce<never>(
          (node, key) => (node as never)[key],
          resolved as never,
        ),
        "es-MX",
        { count: 2 },
      );

      expect(rendered.trim(), `${path} rendered empty`).not.toBe("");
      expect(rendered, `${path} leaked its key`).not.toBe(path);
    }
  });

  it("holds every entry the reference does, once overlaid", () => {
    expect(leafPaths(resolved)).toEqual(leafPaths(referenceMessages));
  });
});

describe("the coverage report for a partial translation", () => {
  const coverage = coverageOf(referenceMessages, partial);

  it("names exactly what is missing, and does not block on anything else", () => {
    expect(passes(coverage)).toBe(false);
    expect(coverage.missing).toContain("fields.swap");
    expect(coverage.missing).toContain("trail.label");
    expect(coverage.missing).not.toContain("fields.origin");
    expect(coverage.translated).toBeLessThan(coverage.total);
  });

  it("flags the product name it left in French, until it is declared", () => {
    // "Redock" is the same word in Spanish because it is a name. The checks
    // cannot know that, so the translator says so once.
    expect(coverage.suspectedUntranslated).toContain("app.name");

    const declared = coverageOf(referenceMessages, partial, ["app.name"]);
    expect(declared.suspectedUntranslated).not.toContain("app.name");
  });

  it("tells the translator what to do, not merely that something is wrong", () => {
    expect(explain("es", coverage)).toContain("Translate it");
  });
});

describe("a language with more plural forms than either language shipped", () => {
  // Polish has four. Nothing outside this tree changes to support it (SC-008,
  // FR-219) — which is the whole reason plural forms are a map rather than a
  // comparison written by hand in each language.
  const stops: PluralMessage = {
    one: "{count} przystanek",
    few: "{count} przystanki",
    many: "{count} przystanków",
    other: "{count} przystanku",
  };

  it("reaches every category its grammar has", () => {
    expect(plural(stops, 1, "pl")).toBe("1 przystanek");
    expect(plural(stops, 3, "pl")).toBe("3 przystanki");
    expect(plural(stops, 7, "pl")).toBe("7 przystanków");
    expect(plural(stops, 1.5, "pl")).toBe("1.5 przystanku");
  });

  it("is expressed entirely inside its own wording", () => {
    // Four categories where French declares two. The type permits it, and no
    // code branches on the language to make it work.
    expect(Object.keys(stops)).toHaveLength(4);
    expect(
      new Intl.PluralRules("pl").resolvedOptions().pluralCategories.length,
    ).toBeGreaterThan(
      new Intl.PluralRules("fr-CA").resolvedOptions().pluralCategories.length,
    );
  });
});
