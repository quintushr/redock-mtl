import { describe, expect, it } from "vitest";
import {
  formatCoordinates,
  parseCoordinates,
  parseGeocoderResults,
} from "@/lib/geocode";

import photon from "../fixtures/photon-housenumber.json";

/**
 * Address labelling and manual coordinate entry.
 *
 * The fixture is a real Photon answer to "1000 rue de la Gauchetière Montreal",
 * captured 2026-07-26. It contains the case that matters: two features with a
 * `housenumber` and a `street` but no `name` at all. A label built from name,
 * street and city drops the number from both, renders them as the same string,
 * and leaves the user picking blindly between two identical rows.
 */

describe("parseGeocoderResults keeps the street number", () => {
  const results = parseGeocoderResults(photon);

  it("leads a nameless address with number and street", () => {
    const address = results.find((r) => r.primary.startsWith("1000 Rue De La"));
    expect(address).toBeDefined();
    expect(address?.primary).toBe("1000 Rue De La Gauchetière Ouest");
    expect(address?.kind).toBe("house");
  });

  it("distinguishes the same number on two branches of one street", () => {
    const primaries = results.map((r) => r.primary);
    expect(primaries).toContain("1000 Rue De La Gauchetière Ouest");
    expect(primaries).toContain("1000 Rue De La Gauchetière Est");
  });

  it("leads a named place with its name and keeps the street as context", () => {
    const place = results.find((r) => r.primary === "Boston Consulting Group");
    expect(place).toBeDefined();
    expect(place?.secondary).toContain("1000 Rue de La Gauchetière Ouest");
    expect(place?.secondary).toContain("Montréal");
  });

  it("never repeats a part between the two lines", () => {
    for (const result of results) {
      expect(result.secondary.split(", ")).not.toContain(result.primary);
    }
  });

  it("gives every result a usable position", () => {
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(Number.isFinite(result.position.lat)).toBe(true);
      expect(Number.isFinite(result.position.lon)).toBe(true);
    }
  });

  it("drops duplicate rows the user could not choose between", () => {
    const twice = { features: [...photon.features, ...photon.features] };
    expect(parseGeocoderResults(twice)).toHaveLength(results.length);
  });
});

describe("parseGeocoderResults survives anything", () => {
  it("returns nothing rather than throwing", () => {
    for (const payload of [
      null,
      undefined,
      42,
      "features",
      {},
      { features: null },
      { features: [null, 7, {}] },
      { features: [{ geometry: { coordinates: ["a", "b"] }, properties: {} }] },
      { features: [{ geometry: { coordinates: [1, 2] }, properties: {} }] },
    ]) {
      expect(parseGeocoderResults(payload)).toEqual([]);
    }
  });
});

describe("parseCoordinates", () => {
  it("reads the separators a person actually types", () => {
    const expected = { lat: 45.5088, lon: -73.5878 };
    expect(parseCoordinates("45.5088, -73.5878")).toEqual(expected);
    expect(parseCoordinates("45.5088,-73.5878")).toEqual(expected);
    expect(parseCoordinates("  45.5088 -73.5878 ")).toEqual(expected);
    expect(parseCoordinates("45.5088; -73.5878")).toEqual(expected);
    expect(parseCoordinates("+45.5088, -73.5878")).toEqual(expected);
  });

  it("rejects anything that is not a coordinate pair", () => {
    for (const input of [
      "",
      "Rue Sainte-Catherine",
      "1000 rue de la Gauchetière",
      "45.5088",
      "45.5088, -73.5878, 12",
      "45,5088, -73,5878",
      "91, 0",
      "0, 181",
      "nan, 0",
    ]) {
      expect(parseCoordinates(input)).toBeNull();
    }
  });

  it("round-trips through formatCoordinates", () => {
    const point = { lat: 45.50881234, lon: -73.58779876 };
    const parsed = parseCoordinates(formatCoordinates(point));
    expect(parsed).not.toBeNull();
    expect(parsed?.lat).toBeCloseTo(point.lat, 4);
    expect(parsed?.lon).toBeCloseTo(point.lon, 4);
  });

  it("does not print more precision than the estimate has", () => {
    expect(formatCoordinates({ lat: 45.50881234, lon: -73.58779876 })).toBe(
      "45.50881, -73.5878",
    );
  });
});
