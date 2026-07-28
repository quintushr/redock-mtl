import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseRoutePayload } from "@/lib/route-geometry";
import type { LatLon } from "@/lib/types";

/**
 * The parser, against what the service actually sends.
 *
 * The two success fixtures were captured from the live endpoint on 2026-07-28
 * with their `messages` array intact, so this exercises the real payload rather
 * than a tidied version of it. The rejection cases are hand-written, one per row
 * of the table in specs/004-real-route-geometry/contracts/route-source.md.
 *
 * No network here or anywhere else in the suite.
 */

const read = (name: string): unknown =>
  JSON.parse(readFileSync(`tests/fixtures/${name}.json`, "utf8"));

const TREKKING = read("brouter-trekking");
const HIKING = read("brouter-hiking");
const MALFORMED = read("brouter-malformed") as Record<string, unknown>;

// The pair the fixtures were captured for.
const FROM: LatLon = { lat: 45.5017, lon: -73.5673 };
const TO: LatLon = { lat: 45.5088, lon: -73.554 };

const bikeRequest = { from: FROM, to: TO, profile: "bike" as const };
const footRequest = { from: FROM, to: TO, profile: "foot" as const };

describe("parseRoutePayload, real payloads", () => {
  it("reads the bike fixture", () => {
    const result = parseRoutePayload(TREKKING, bikeRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(1909);
    expect(result.value.profile).toBe("bike");
    expect(result.value.coordinates.length).toBeGreaterThan(50);
  });

  it("reads the foot fixture", () => {
    const result = parseRoutePayload(HIKING, footRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(1697);
    expect(result.value.profile).toBe("foot");
  });

  it("coerces track-length, which arrives as a string", () => {
    // BRouter sends "track-length": "1909", not 1909. A parser that trusted the
    // JSON type would hand a string to arithmetic and produce NaN durations.
    const raw = (TREKKING as { features: { properties: Record<string, unknown> }[] })
      .features[0].properties["track-length"];
    expect(typeof raw).toBe("string");

    const result = parseRoutePayload(TREKKING, bikeRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value.length).toBe("number");
  });

  it("drops the third coordinate component", () => {
    // Coordinates arrive as [lon, lat, elevation]. LatLon is a named pair
    // specifically so the two cannot be swapped, so elevation is dropped rather
    // than carried around in a tuple.
    const result = parseRoutePayload(TREKKING, bikeRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const point of result.value.coordinates) {
      expect(Object.keys(point).sort()).toEqual(["lat", "lon"]);
      expect(Number.isFinite(point.lat)).toBe(true);
      expect(Number.isFinite(point.lon)).toBe(true);
    }
  });

  it("reads longitude first and latitude second", () => {
    // The single most likely way to get this wrong. Montreal is at roughly
    // 45.5 N, -73.6 E; a swap would put the path in the Indian Ocean.
    const result = parseRoutePayload(TREKKING, bikeRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const point of result.value.coordinates) {
      expect(point.lat).toBeGreaterThan(45);
      expect(point.lat).toBeLessThan(46);
      expect(point.lon).toBeLessThan(-73);
      expect(point.lon).toBeGreaterThan(-74);
    }
  });

  it("discards the source's own duration", () => {
    // total-time is present in the payload and must not reach the domain:
    // BRouter's speed model is not a parameter the rider can adjust.
    const result = parseRoutePayload(TREKKING, bikeRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual([
      "coordinates",
      "length",
      "profile",
    ]);
  });
});

describe("parseRoutePayload, rejection", () => {
  const cases = [
    "noFeatures",
    "emptyFeatures",
    "featuresNotArray",
    "notALineString",
    "singleCoordinate",
    "missingTrackLength",
    "nonNumericTrackLength",
    "zeroTrackLength",
    "coordinateOutOfRange",
    "coordinateNotFinite",
    "coordinateTooShort",
    "nullPayload",
    "stringPayload",
  ] as const;

  for (const name of cases) {
    it(`rejects ${name} without throwing`, () => {
      const result = parseRoutePayload(MALFORMED[name], bikeRequest);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("malformed");
      expect(result.detail.length).toBeGreaterThan(0);
    });
  }

  it("is total: no input throws", () => {
    // A parser that throws surfaces as a raw error in the UI, which FR-030
    // forbids. Everything comes back as a value.
    const hostile: unknown[] = [
      undefined,
      null,
      0,
      "",
      [],
      {},
      { features: [{}] },
      { features: [{ geometry: null, properties: null }] },
      NaN,
    ];
    for (const input of hostile) {
      expect(() => parseRoutePayload(input, bikeRequest)).not.toThrow();
    }
  });
});
