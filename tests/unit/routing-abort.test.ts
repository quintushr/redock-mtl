import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPath, clearRoutingCache } from "@/lib/routing";

/**
 * Superseding a plan must not poison the segments that were in flight.
 *
 * The defect this guards against was invisible in every unit test and obvious
 * within seconds in a browser: a rider saw the real route on part of their trip
 * and a straight line on the rest, permanently.
 *
 * Sharing an in-flight promise between callers is right, and it is what keeps a
 * courtesy service from being asked the same question twice. But an *aborted*
 * request resolves to null, and handing that to a caller from a newer plan tells
 * it there is no route. The caller then records the segment as asked-about and
 * never retries it. A plan is superseded several times in the first second of
 * use, as geolocation resolves, the feed lands and the debounce settles, so this
 * fired constantly.
 */

afterEach(() => { clearRoutingCache(); localStorage.clear(); vi.restoreAllMocks(); });

const req = {
  from: { lat: 45.50, lon: -73.60 },
  to: { lat: 45.52, lon: -73.58 },
  profile: "bike" as const,
  stations: { fromId: "A", toId: "B" },
};

describe("abort race", () => {
  it("does not hand a newer plan an already-aborted in-flight request", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) =>
      new Promise((resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")));
        setTimeout(() => resolve({
          ok: true,
          json: async () => ({
            type: "FeatureCollection",
            features: [{ type: "Feature",
              properties: { "track-length": "2500" },
              geometry: { type: "LineString", coordinates: [[-73.60, 45.50], [-73.58, 45.52]] } }],
          }),
        } as Response), 20);
      })));

    // Plan 1 asks, then is superseded and aborted.
    const c1 = new AbortController();
    const first = fetchPath(req, c1.signal);
    c1.abort();

    // Plan 2 asks for the same segment, in the same tick.
    const c2 = new AbortController();
    const second = fetchPath(req, c2.signal);

    expect(await first).toBeNull();
    const result = await second;
    console.log("second call got:", result === null ? "NULL" : `path len=${result.length}`);
    expect(result).not.toBeNull();
  });
});
