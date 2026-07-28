import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFeedCache,
  loadStationSnapshot,
  requestRefresh,
} from "@/lib/feed-client";
import { MIN_REFRESH_INTERVAL_SECONDS } from "@/lib/endpoints";

import discovery from "../fixtures/gbfs-discovery.json";
import information from "../fixtures/montreal-station-information.json";
import status from "../fixtures/montreal-station-status.json";
import vehicleTypes from "../fixtures/montreal-vehicle-types.json";
import systemInformation from "../fixtures/montreal-system-information.json";

/**
 * Asking for fresh availability, and being told no.
 *
 * The defect being fixed was one missing argument: the refresh control called
 * loadStationSnapshot with no options, so inside the floor it returned the
 * snapshot the rider was already looking at and the button did nothing.
 *
 * The naive fix is worse than the defect. `force: true` bypasses the floor
 * *entirely*, so wiring it to a button hands a rider a way to poll a courtesy
 * endpoint as fast as they can tap — the behaviour principle V names as how
 * public feeds get closed. requestRefresh owns the floor itself, which is why
 * the first test here counts requests rather than checking a return value.
 *
 * Frozen fixtures throughout; `fetch` is stubbed and nothing reaches a network.
 */

/** Every feed the client resolves, answered from committed JSON. */
function stubFeed() {
  const calls = { count: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.count += 1;
      const body = url.includes("gbfs.json")
        ? discovery
        : url.includes("station_information")
          ? information
          : url.includes("station_status")
            ? status
            : url.includes("vehicle_types")
              ? vehicleTypes
              : systemInformation;
      return { ok: true, json: async () => body } as Response;
    }),
  );
  return calls;
}

beforeEach(() => {
  clearFeedCache();
  vi.useRealTimers();
});

afterEach(() => {
  clearFeedCache();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("inside the refresh floor", () => {
  it("refuses, and says how long remains", async () => {
    stubFeed();
    await loadStationSnapshot();

    const outcome = await requestRefresh();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("expected a refusal");
    expect(outcome.waitSeconds).toBeGreaterThan(0);
    expect(outcome.waitSeconds).toBeLessThanOrEqual(MIN_REFRESH_INTERVAL_SECONDS);
  });

  it("sends nothing at all", async () => {
    const calls = stubFeed();
    await loadStationSnapshot();
    const afterLoad = calls.count;

    // However many times the rider presses it.
    await requestRefresh();
    await requestRefresh();
    await requestRefresh();

    expect(calls.count).toBe(afterLoad);
  });
});

describe("past the refresh floor", () => {
  it("actually fetches, rather than returning what is already in hand", async () => {
    const calls = stubFeed();
    await loadStationSnapshot();
    const afterLoad = calls.count;

    // The floor is measured against our own fetch clock, so moving the clock
    // forward is what "waiting" means here.
    const realNow = Date.now;
    vi.spyOn(Date, "now").mockImplementation(
      () => realNow() + (MIN_REFRESH_INTERVAL_SECONDS + 1) * 1000,
    );

    const outcome = await requestRefresh();

    expect(outcome.ok).toBe(true);
    expect(calls.count).toBeGreaterThan(afterLoad);
  });

  it("never exceeds one round of requests per floor interval", async () => {
    const calls = stubFeed();
    await loadStationSnapshot();
    const perRound = calls.count;

    const realNow = Date.now;
    vi.spyOn(Date, "now").mockImplementation(
      () => realNow() + (MIN_REFRESH_INTERVAL_SECONDS + 1) * 1000,
    );

    // One permitted refresh, then three refusals against the new fetch time.
    await requestRefresh();
    await requestRefresh();
    await requestRefresh();
    await requestRefresh();

    // SC-008: two rounds of requests for two permitted moments, not five.
    expect(calls.count).toBe(perRound * 2);
  });
});

describe("when the rider presses twice at once", () => {
  it("issues one round of requests, not two", async () => {
    const calls = stubFeed();
    await loadStationSnapshot();
    const perRound = calls.count;

    const realNow = Date.now;
    vi.spyOn(Date, "now").mockImplementation(
      () => realNow() + (MIN_REFRESH_INTERVAL_SECONDS + 1) * 1000,
    );

    // Both in the same tick, before either has resolved. `force` skips the
    // in-flight dedupe that loadStationSnapshot does for ordinary callers, so
    // without a guard of its own this would double the round (FR-423).
    const [first, second] = await Promise.all([
      requestRefresh(),
      requestRefresh(),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(calls.count).toBe(perRound * 2);
  });
});

describe("when the request fails", () => {
  it("keeps the snapshot the rider already had", async () => {
    stubFeed();
    await loadStationSnapshot();

    const realNow = Date.now;
    vi.spyOn(Date, "now").mockImplementation(
      () => realNow() + (MIN_REFRESH_INTERVAL_SECONDS + 1) * 1000,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const outcome = await requestRefresh();

    // A failure is not a refusal: the rider asked at a permitted moment and we
    // tried. What comes back is the previous snapshot, correctly labelled as
    // old, because a stale plan beats an empty screen (FR-424).
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("expected an attempt");
    expect(outcome.status.state).toBe("stale");
  });
});

describe("with nothing in hand yet", () => {
  it("fetches rather than refusing a rider who has no data at all", async () => {
    const calls = stubFeed();

    const outcome = await requestRefresh();

    expect(outcome.ok).toBe(true);
    expect(calls.count).toBeGreaterThan(0);
  });
});
