import { describe, expect, it } from "vitest";
import {
  buildServiceArea,
  mechanicalVehicleTypeIds,
  parseAttribution,
  parseStationSnapshot,
} from "@/lib/gbfs";
import { isInsideBufferedHull } from "@/lib/geo";
import type { FeedAttribution } from "@/lib/types";

import information from "../fixtures/montreal-station-information.json";
import status from "../fixtures/montreal-station-status.json";
import vehicleTypes from "../fixtures/montreal-vehicle-types.json";
import systemInformation from "../fixtures/montreal-system-information.json";
import emptyInformation from "../fixtures/empty-station-information.json";
import emptyStatus from "../fixtures/empty-station-status.json";
import malformedStatus from "../fixtures/malformed-station-status.json";

const FALLBACK: FeedAttribution = {
  operatorName: "BIXI Montréal",
  licenseUrl: null,
  licenseName: null,
};

const parse = (
  info: unknown = information,
  stat: unknown = status,
  types: unknown = vehicleTypes,
  system: unknown = systemInformation,
) => parseStationSnapshot(info, stat, types, system, FALLBACK);

describe("mechanicalVehicleTypeIds", () => {
  it("selects human-powered bicycles from the real catalogue", () => {
    // Verified against the live feed: type 9 is bicycle + human.
    expect(mechanicalVehicleTypeIds(vehicleTypes)).toEqual(new Set(["9"]));
  });

  it("excludes cargo bicycles even though they are human-powered", () => {
    // Type 14 is cargo_bicycle + human. A cargo bike is a different product,
    // and substituting one would put a rider on a vehicle they did not plan for.
    expect(mechanicalVehicleTypeIds(vehicleTypes).has("14")).toBe(false);
  });

  it("returns an empty set rather than throwing on junk", () => {
    expect(mechanicalVehicleTypeIds(null)).toEqual(new Set());
    expect(mechanicalVehicleTypeIds({ data: "nope" })).toEqual(new Set());
    expect(mechanicalVehicleTypeIds({ data: { vehicle_types: [1, 2] } })).toEqual(
      new Set(),
    );
  });
});

describe("parseStationSnapshot on real fixtures", () => {
  it("parses the captured feeds", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stations.length).toBeGreaterThan(0);
  });

  it("takes observedAt from the feed, never the local clock", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The fixture was captured in the past; a local clock would make it look
    // fresh and defeat FR-014.
    expect(result.value.observedAt.getTime()).toBe(status.last_updated * 1000);
    expect(result.value.observedAt.getTime()).toBeLessThan(Date.now());
  });

  it("reads ttl from the feed", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ttl).toBe(status.ttl);
  });

  it("drops stations at null island", () => {
    // The live feed carries 12 stations at (0, 0); two are in this fixture.
    // One unfiltered would stretch the service-area hull across the Atlantic.
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rawHasNullIsland = information.data.stations.some(
      (s) => s.lat === 0 && s.lon === 0,
    );
    expect(rawHasNullIsland).toBe(true);
    expect(
      result.value.stations.some(
        (s) => s.position.lat === 0 && s.position.lon === 0,
      ),
    ).toBe(false);
  });

  it("reads integer operational flags as booleans", () => {
    // The feed sends 1 and 0. A strict === true would mark every station
    // non-operational and produce an empty map with no explanation.
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stations.some((s) => s.isInstalled)).toBe(true);
    expect(result.value.stations.some((s) => s.isRenting)).toBe(true);
  });

  it("counts mechanical bikes from vehicle types, not num_bikes_available", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // num_bikes_available includes e-bikes, so at least one station must report
    // more total bikes than mechanical ones for this distinction to matter.
    const rawTotals = new Map(
      status.data.stations.map((s) => [s.station_id, s.num_bikes_available]),
    );
    const divergent = result.value.stations.filter((s) => {
      const raw = rawTotals.get(s.id);
      return raw !== undefined && raw > s.mechanicalBikesAvailable;
    });
    expect(divergent.length).toBeGreaterThan(0);
  });

  it("never reports a negative count", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const station of result.value.stations) {
      expect(station.mechanicalBikesAvailable).toBeGreaterThanOrEqual(0);
      expect(station.ebikesAvailable).toBeGreaterThanOrEqual(0);
      expect(station.docksAvailable).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("parseStationSnapshot failure paths", () => {
  it("returns a typed failure, never throws, on a missing stations array", () => {
    expect(() => parse({ data: {} })).not.toThrow();
    const result = parse({ data: {} });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("malformed");
    expect(result.detail).toMatch(/station_information/);
  });

  it.each([
    ["null", null],
    ["a string", "not json"],
    ["a number", 42],
    ["an array", []],
    ["an empty object", {}],
  ])("survives %s as station_information", (_label, input) => {
    expect(() => parse(input)).not.toThrow();
    expect(parse(input).ok).toBe(false);
  });

  it.each([
    ["null", null],
    ["a string", "not json"],
    ["an empty object", {}],
  ])("survives %s as station_status", (_label, input) => {
    expect(() => parse(information, input)).not.toThrow();
    expect(parse(information, input).ok).toBe(false);
  });

  it("parses an empty network to zero stations rather than failing", () => {
    // Out of season is not the same as broken.
    const result = parse(emptyInformation, emptyStatus);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stations).toEqual([]);
  });

  it("drops a station row missing its required fields instead of half-populating it", () => {
    const result = parse(information, malformedStatus);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only station 1 appears in the malformed status feed, and it carries no
    // counts, so it must come through zeroed and non-operational rather than
    // with undefined fields.
    for (const station of result.value.stations) {
      expect(Number.isFinite(station.docksAvailable)).toBe(true);
      expect(station.isInstalled).toBe(false);
    }
  });

  it("ignores unknown fields so a provider adding one does not break parsing", () => {
    const augmented = {
      ...information,
      data: {
        stations: information.data.stations.map((s) => ({
          ...s,
          some_new_provider_field: { nested: true },
        })),
      },
    };
    expect(parse(augmented).ok).toBe(true);
  });

  it("drops stations present in only one feed", () => {
    const extra = {
      ...information,
      data: {
        stations: [
          ...information.data.stations,
          { station_id: "ghost", name: "Ghost", lat: 45.5, lon: -73.6 },
        ],
      },
    };
    const result = parse(extra);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stations.some((s) => s.id === "ghost")).toBe(false);
  });
});

describe("parseAttribution", () => {
  it("falls back when the provider publishes empty strings", () => {
    // This provider really does publish operator: "" and license_url: "".
    expect(systemInformation.data.operator).toBe("");
    expect(systemInformation.data.license_url).toBe("");

    const attribution = parseAttribution(systemInformation, FALLBACK);
    expect(attribution.operatorName).not.toBe("");
    expect(attribution.licenseUrl).toBeNull();
  });

  it("prefers feed values when they are actually present", () => {
    const populated = {
      data: { operator: "Someone Else", license_url: "https://example.org/lic" },
    };
    const attribution = parseAttribution(populated, FALLBACK);
    expect(attribution.operatorName).toBe("Someone Else");
    expect(attribution.licenseUrl).toBe("https://example.org/lic");
  });

  it("falls back on junk rather than throwing", () => {
    expect(parseAttribution(null, FALLBACK)).toEqual(FALLBACK);
    expect(parseAttribution("nope", FALLBACK)).toEqual(FALLBACK);
  });
});

describe("buildServiceArea", () => {
  it("builds a hull from the real fixture", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const area = buildServiceArea(result.value.stations, 800);
    expect(area.hulls.length).toBeGreaterThanOrEqual(1);
    expect(area.hulls[0].length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the hull inside Montreal, proving null island was excluded", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const area = buildServiceArea(result.value.stations, 800);
    for (const point of area.hulls.flat()) {
      expect(point.lat).toBeGreaterThan(45);
      expect(point.lat).toBeLessThan(46);
      expect(point.lon).toBeGreaterThan(-74.5);
      expect(point.lon).toBeLessThan(-73);
    }
  });

  it("separates two distant city networks into different hulls", () => {
    // The real Bixi_MTL feed carries Montreal and Sherbrooke, 130 km apart. A
    // single hull would span 160 km and declare the countryside between them
    // covered, so a user in a field would be told they are in coverage and then
    // handed a routing failure, which is exactly what FR-029b forbids.
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sherbrooke = result.value.stations.slice(0, 3).map((s) => ({
      ...s,
      id: `sherbrooke-${s.id}`,
      position: { lat: 45.4, lon: -71.9 },
    }));
    const area = buildServiceArea(
      [...result.value.stations, ...sherbrooke],
      800,
    );

    expect(area.hulls.length).toBe(2);
    // The gap between the two cities is not covered by either hull.
    expect(isInsideBufferedHull({ lat: 45.4, lon: -72.7 }, area)).toBe(false);
    // Both cities themselves are.
    expect(isInsideBufferedHull({ lat: 45.4, lon: -71.9 }, area)).toBe(true);
    expect(
      isInsideBufferedHull(result.value.stations[0].position, area),
    ).toBe(true);
  });

  it("covers nothing when no station is operational", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const shutDown = result.value.stations.map((s) => ({
      ...s,
      isInstalled: false,
    }));
    expect(buildServiceArea(shutDown, 800).hulls).toEqual([]);
  });
});
