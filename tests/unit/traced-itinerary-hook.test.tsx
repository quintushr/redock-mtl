import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useTracedItinerary } from "@/components/useTracedItinerary";
import { clearRoutingCache } from "@/lib/routing";
import { DEFAULT_PARAMETERS, segmentBudget } from "@/lib/params";
import type { Itinerary, PlanResult, Station, StationSnapshot } from "@/lib/types";

/**
 * The adapter hook, driven end to end with a stubbed transport.
 *
 * This is the layer the pure tests cannot reach: dispatch, de-duplication,
 * abort, and the fold back into state. It was also the layer with no coverage
 * when a rider first tried the feature and found that only part of a trip
 * traced, so it earns a permanent place here.
 *
 * The stub answers the way BRouter does, including a plausible length for the
 * distance actually asked about. That detail is the point: a stub returning a
 * fixed length made every short leg look implausible, which is how the real
 * defect in isPlausiblePath was found.
 */

const params = DEFAULT_PARAMETERS;
const budget = segmentBudget(params);

const st = (id: string, lat: number, lon: number): Station => ({
  id, name: id, position: { lat, lon }, capacity: 20,
  mechanicalBikesAvailable: 5, ebikesAvailable: 0, docksAvailable: 5,
  isInstalled: true, isRenting: true, isReturning: true,
});
const stations = [st("A", 45.50, -73.60), st("B", 45.52, -73.58), st("C", 45.54, -73.55)];
const snapshot = { stations, observedAt: new Date(), ttl: 10,
  attribution: { operatorName: "x", licenseUrl: null, licenseName: null } } as StationSnapshot;

const ride = (f: string, t: string) => ({
  kind: "bike" as const, fromStationId: f, toStationId: t,
  duration: budget * 0.4, distance: 1500,
  remaining: budget * 0.6, remainingStatus: "comfortable" as const,
});

const oneStop: Itinerary = {
  steps: [
    { kind: "walk", from: { lat: 45.499, lon: -73.601 }, to: stations[0].position, toStationId: "A", duration: 200, distance: 250 },
    ride("A", "B"),
    { kind: "dock", stationId: "B", cooldown: 60 },
    ride("B", "C"),
    { kind: "walk", from: stations[2].position, to: { lat: 45.541, lon: -73.552 }, toStationId: null, duration: 150, distance: 180 },
  ],
  totalDuration: 1000, stopCount: 1, freeWindowConsumed: budget * 0.8,
  snapshotObservedAt: new Date(),
};
const plan: PlanResult = { ok: true, itinerary: oneStop };

/** A BRouter-shaped answer whose ends match whatever was asked for. */
function payloadFor(url: string) {
  const q = new URL(url).searchParams.get("lonlats")!;
  const [a, b] = q.split("|").map((p) => p.split(",").map(Number));
  // A realistic answer: 1.3x the crow-flies distance, as a real street route is.
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  const straight = 2 * R * Math.asin(Math.sqrt(h));
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { "track-length": String(Math.round(straight * 1.3)), "total-time": "300" },
      geometry: { type: "LineString", coordinates: [[a[0], a[1], 10], [b[0], b[1], 12]] },
    }],
  };
}

afterEach(() => { cleanup(); clearRoutingCache(); localStorage.clear(); vi.restoreAllMocks(); });

describe("the hook, one-stop trip", () => {
  it("traces every leg, short ones included", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => payloadFor(url) } as Response;
    }));

    const { result } = renderHook(() =>
      useTracedItinerary(plan, snapshot, params, {
        origin: { lat: 45.499, lon: -73.601 },
        destination: { lat: 45.541, lon: -73.552 },
      }),
    );

    await waitFor(() => expect(result.current?.settled).toBe(true), { timeout: 3000 });
    console.log("REQUESTS:", calls.length);
    console.log("STATUSES:", result.current?.geometry.map((g) => g.status).join(", "));
    expect(result.current?.geometry.map((g) => g.status)).toEqual([
      "traced", "traced", "pending", "traced", "traced",
    ]);
  });

  it("re-traces everything when the plan is superseded mid-flight", async () => {
    /*
     * The shape of the reported bug. A plan is superseded while its requests are
     * in flight, which happens several times in the first second of real use as
     * geolocation resolves, the feed lands and the parameter debounce settles.
     * Every leg of the surviving plan must still trace; the ones that were in
     * flight at the moment of the change must not be left as straight lines.
     */
    let release = (): void => {};
    const held = new Promise<void>((r) => { release = r; });
    let first = true;

    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (first) {
        first = false;
        // Hold the very first request open until the plan has been replaced.
        await held;
      }
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return { ok: true, json: async () => payloadFor(url) } as Response;
    }));

    // Same itinerary content, different object identity: a recomputed plan.
    const superseded: PlanResult = { ok: true, itinerary: { ...oneStop } };

    const { result, rerender } = renderHook(
      ({ p }: { p: PlanResult }) =>
        useTracedItinerary(p, snapshot, params, {
          origin: { lat: 45.499, lon: -73.601 },
          destination: { lat: 45.541, lon: -73.552 },
        }),
      { initialProps: { p: plan } },
    );

    rerender({ p: superseded });
    release();

    await waitFor(() => expect(result.current?.settled).toBe(true), { timeout: 3000 });
    expect(result.current?.geometry.map((g) => g.status)).toEqual([
      "traced", "traced", "pending", "traced", "traced",
    ]);
  });
});
