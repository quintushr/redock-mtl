import { describe, expect, it } from "vitest";
import { pathKey } from "@/lib/route-geometry";
import type { LatLon, RoutingRequest } from "@/lib/types";

/**
 * The reuse identity (FR-329).
 *
 * Getting this wrong is expensive in both directions: too coarse and we draw one
 * station pair's path for another, too fine and we ask a courtesy service for
 * the same geometry twice.
 */

const A: LatLon = { lat: 45.5017, lon: -73.5673 };
const B: LatLon = { lat: 45.5088, lon: -73.554 };

const stationPair: RoutingRequest = {
  from: A,
  to: B,
  profile: "bike",
  stations: { fromId: "42", toId: "77" },
};

const pointPair: RoutingRequest = { from: A, to: B, profile: "foot" };

describe("pathKey", () => {
  it("is stable for the same request", () => {
    expect(pathKey(stationPair)).toBe(pathKey({ ...stationPair }));
  });

  it("distinguishes a station pair from a point pair", () => {
    // They have different lifetimes: one is persisted, the other is not. A
    // shared key form would let a walk leg evict a station pair, or worse, be
    // served from the persistent store after the rider moved.
    expect(pathKey(stationPair)).not.toBe(pathKey({ ...pointPair, profile: "bike" }));
  });

  it("orders the pair: A to B is not B to A", () => {
    // BRouter routes one-ways. Reusing the reverse path would draw a rider the
    // wrong way up a street.
    const reversed: RoutingRequest = {
      from: B,
      to: A,
      profile: "bike",
      stations: { fromId: "77", toId: "42" },
    };
    expect(pathKey(stationPair)).not.toBe(pathKey(reversed));
  });

  it("includes the profile", () => {
    const onFoot: RoutingRequest = { ...stationPair, profile: "foot" };
    expect(pathKey(stationPair)).not.toBe(pathKey(onFoot));
  });

  it("rounds point coordinates to five decimals", () => {
    // Five decimals is about a metre, which is what formatCoordinates already
    // treats as this application's floor. Finer would make the cache miss on
    // floating-point noise from the same map click.
    const jittered: RoutingRequest = {
      from: { lat: A.lat + 0.0000001, lon: A.lon - 0.0000004 },
      to: B,
      profile: "foot",
    };
    expect(pathKey(pointPair)).toBe(pathKey(jittered));
  });

  it("separates points that are genuinely different", () => {
    const elsewhere: RoutingRequest = {
      from: { lat: A.lat + 0.01, lon: A.lon },
      to: B,
      profile: "foot",
    };
    expect(pathKey(pointPair)).not.toBe(pathKey(elsewhere));
  });

  it("ignores coordinates for a station pair", () => {
    // A station's published position can shift by a few metres between feed
    // updates without the station having moved. The identity is the pair of ids.
    const nudged: RoutingRequest = {
      ...stationPair,
      from: { lat: A.lat + 0.0002, lon: A.lon },
    };
    expect(pathKey(stationPair)).toBe(pathKey(nudged));
  });
});
