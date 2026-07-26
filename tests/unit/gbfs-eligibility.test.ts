import { describe, expect, it } from "vitest";
import {
  canEndSegment,
  canStartSegment,
  hasOnlyEbikes,
  isOperational,
  parseStationSnapshot,
} from "@/lib/gbfs";
import { DEFAULT_PARAMETERS } from "@/lib/params";
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

const params = DEFAULT_PARAMETERS;

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

describe("the asymmetry the whole design rests on", () => {
  /**
   * Docking a bike and taking the same bike again after the cooldown resets the
   * free-window counter. So an intermediate stop needs a free dock and nothing
   * else. Bike availability constrains the first pickup alone (FR-011, FR-011a).
   *
   * Getting this backwards would reintroduce the mid-trip walking transfers the
   * spec deliberately removed, and would reject most of the network at rush hour.
   */
  const docksButNoBikes = station({
    mechanicalBikesAvailable: 0,
    docksAvailable: 8,
  });

  it("cannot be the first pickup: the rider has no bike yet", () => {
    expect(canStartSegment(docksButNoBikes, params)).toBe(false);
  });

  it("can end a segment, and therefore serve as an intermediate stop", () => {
    expect(canEndSegment(docksButNoBikes, params)).toBe(true);
  });

  it("holds for the reverse case too: bikes but no free dock", () => {
    const bikesButNoDocks = station({
      mechanicalBikesAvailable: 6,
      docksAvailable: 0,
    });
    expect(canStartSegment(bikesButNoDocks, params)).toBe(true);
    expect(canEndSegment(bikesButNoDocks, params)).toBe(false);
  });

  it("is present in the real captured feed, not just in synthetic cases", () => {
    const real = snapshot.stations.filter(
      (s) => canEndSegment(s, params) && !canStartSegment(s, params),
    );
    expect(real.length).toBeGreaterThan(0);
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

  it("gates both roles, so a broken station is unusable either way", () => {
    const broken = station({ isRenting: false });
    expect(canStartSegment(broken, params)).toBe(false);
    expect(canEndSegment(broken, params)).toBe(false);
  });
});

describe("safety reserves", () => {
  it("refuses the last mechanical bike", () => {
    // Availability is a snapshot, not a reservation. Someone else may take that
    // bike while the rider walks to the station.
    const lastBike = station({ mechanicalBikesAvailable: params.bikeReserve });
    expect(canStartSegment(lastBike, params)).toBe(false);

    const oneSpare = station({
      mechanicalBikesAvailable: params.bikeReserve + 1,
    });
    expect(canStartSegment(oneSpare, params)).toBe(true);
  });

  it("refuses the last free dock", () => {
    // Arriving to find the last dock taken strands the rider mid-trip with the
    // meter running.
    const lastDock = station({ docksAvailable: params.dockReserve });
    expect(canEndSegment(lastDock, params)).toBe(false);

    const oneSpare = station({ docksAvailable: params.dockReserve + 1 });
    expect(canEndSegment(oneSpare, params)).toBe(true);
  });

  it("admits more stations when the reserve is lowered", () => {
    const marginal = station({
      mechanicalBikesAvailable: 1,
      docksAvailable: 1,
    });
    expect(canStartSegment(marginal, params)).toBe(false);
    expect(
      canStartSegment(marginal, { ...params, bikeReserve: 0 }),
    ).toBe(true);
    expect(canEndSegment(marginal, { ...params, dockReserve: 0 })).toBe(true);
  });
});

describe("e-bikes never satisfy the free window (FR-010)", () => {
  it("does not let e-bikes make a station a valid first pickup", () => {
    const ebikesOnly = station({
      mechanicalBikesAvailable: 0,
      ebikesAvailable: 9,
    });
    expect(canStartSegment(ebikesOnly, params)).toBe(false);
  });

  it("identifies the e-bike-only case so FR-031 can say so explicitly", () => {
    const ebikesOnly = station({
      mechanicalBikesAvailable: 0,
      ebikesAvailable: 4,
    });
    expect(hasOnlyEbikes(ebikesOnly, params)).toBe(true);
  });

  it("does not flag a station that simply has nothing", () => {
    const empty = station({ mechanicalBikesAvailable: 0, ebikesAvailable: 0 });
    expect(hasOnlyEbikes(empty, params)).toBe(false);
  });

  it("does not flag a station that has both", () => {
    const both = station({ mechanicalBikesAvailable: 5, ebikesAvailable: 5 });
    expect(hasOnlyEbikes(both, params)).toBe(false);
  });

  it("finds real e-bike-only stations in the captured feed", () => {
    const real = snapshot.stations.filter((s) => hasOnlyEbikes(s, params));
    expect(real.length).toBeGreaterThan(0);
  });
});

describe("the real fixture supports a plan at all", () => {
  it("contains stations that can start and stations that can end a segment", () => {
    const starters = snapshot.stations.filter((s) => canStartSegment(s, params));
    const enders = snapshot.stations.filter((s) => canEndSegment(s, params));
    expect(starters.length).toBeGreaterThan(5);
    expect(enders.length).toBeGreaterThan(5);
  });

  it("contains non-operational stations that both roles reject", () => {
    const broken = snapshot.stations.filter((s) => !isOperational(s));
    expect(broken.length).toBeGreaterThan(0);
    for (const s of broken) {
      expect(canStartSegment(s, params)).toBe(false);
      expect(canEndSegment(s, params)).toBe(false);
    }
  });
});
