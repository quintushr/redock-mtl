import { describe, expect, it } from "vitest";
import {
  canEndSegment,
  canStartSegment,
  isOperational,
  parseStationSnapshot,
} from "@/lib/gbfs";
import type { FeedAttribution, Station } from "@/lib/types";

import information from "../fixtures/montreal-station-information.json";
import status from "../fixtures/montreal-station-status.json";
import vehicleTypes from "../fixtures/montreal-vehicle-types.json";
import systemInformation from "../fixtures/montreal-system-information.json";

const FALLBACK: FeedAttribution = {
  operatorName: "BIXI Montréal",
  licenseUrl: null,
  licenseName: null,
};

const snapshot = (() => {
  const result = parseStationSnapshot(
    information,
    status,
    vehicleTypes,
    systemInformation,
    FALLBACK,
  );
  if (!result.ok) throw new Error("fixture must parse");
  return result.value;
})();

const station = (patch: Partial<Station>): Station => ({
  id: "test",
  name: "Test",
  position: { lat: 45.5, lon: -73.6 },
  capacity: 20,
  mechanicalBikesAvailable: 5,
  ebikesAvailable: 0,
  docksAvailable: 5,
  isInstalled: true,
  isRenting: true,
  isReturning: true,
  ...patch,
});

/**
 * Eligibility is a question about *service status*, never about contents.
 *
 * This file used to assert the opposite, and the reversal is deliberate. A plan
 * is made before a trip; a count read now is not a count that holds when the
 * rider arrives forty minutes later. Planning against live occupancy produces an
 * itinerary precise about a moment already gone: it routes around a station that
 * is empty now and full on arrival, and towards one that is full now and empty
 * on arrival. So occupancy left the calculation and stayed on the map, where the
 * ring and the callout report it and the rider decides.
 *
 * The tests below therefore pin an *absence*. That is on purpose: nothing fails
 * when a count filter creeps back in, the plans just quietly start routing
 * around stations again, so the guard has to be explicit.
 */

describe("no count reaches the eligibility rules", () => {
  it("admits a station with no bike at all as a first pickup", () => {
    const empty = station({ mechanicalBikesAvailable: 0, ebikesAvailable: 0 });
    expect(canStartSegment(empty)).toBe(true);
  });

  it("admits a station with no free dock as a stop", () => {
    const full = station({ docksAvailable: 0 });
    expect(canEndSegment(full)).toBe(true);
  });

  it("gives the same answer whatever a station holds", () => {
    // One assertion for the whole class, so a filter on any count fails here
    // rather than only on the one case somebody thought to write down.
    for (const mechanicalBikesAvailable of [0, 1, 2, 40]) {
      for (const docksAvailable of [0, 1, 2, 40]) {
        for (const ebikesAvailable of [0, 3]) {
          const s = station({
            mechanicalBikesAvailable,
            docksAvailable,
            ebikesAvailable,
          });
          expect(canStartSegment(s)).toBe(true);
          expect(canEndSegment(s)).toBe(true);
        }
      }
    }
  });

  it("treats every operational station in the real feed as usable both ways", () => {
    const operational = snapshot.stations.filter(isOperational);
    expect(operational.length).toBeGreaterThan(5);
    expect(operational.every(canStartSegment)).toBe(true);
    expect(operational.every(canEndSegment)).toBe(true);
  });
});

describe("isOperational", () => {
  it.each([
    ["not installed", { isInstalled: false }],
    ["not renting", { isRenting: false }],
    ["not returning", { isReturning: false }],
  ])("rejects a station that is %s (FR-013)", (_label, patch) => {
    expect(isOperational(station(patch))).toBe(false);
  });

  it("accepts a fully operational station", () => {
    expect(isOperational(station({}))).toBe(true);
  });

  it("is the one thing that still gates both roles", () => {
    // Service status is not occupancy. A station the operator has withdrawn is
    // nowhere anybody can be sent, whatever its counts say, and that filter
    // stays.
    const broken = station({
      isRenting: false,
      mechanicalBikesAvailable: 20,
      docksAvailable: 20,
    });
    expect(canStartSegment(broken)).toBe(false);
    expect(canEndSegment(broken)).toBe(false);
  });
});

describe("the real fixture supports a plan at all", () => {
  it("contains stations that can start and stations that can end a segment", () => {
    const starters = snapshot.stations.filter(canStartSegment);
    const enders = snapshot.stations.filter(canEndSegment);
    expect(starters.length).toBeGreaterThan(5);
    expect(enders.length).toBeGreaterThan(5);
  });

  it("contains non-operational stations that both roles reject", () => {
    const broken = snapshot.stations.filter((s) => !isOperational(s));
    expect(broken.length).toBeGreaterThan(0);
    for (const s of broken) {
      expect(canStartSegment(s)).toBe(false);
      expect(canEndSegment(s)).toBe(false);
    }
  });
});
