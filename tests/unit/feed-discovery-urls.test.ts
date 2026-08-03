import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFeedCache, loadStationSnapshot } from "@/lib/feed-client";

/**
 * What the discovery document is allowed to point at.
 *
 * GBFS discovery is indirection: one document decides the four addresses this
 * module then requests. `stationsFeedUrl` is also the one service URL a
 * self-hoster is most likely to change (lib/runtime-config.ts), so the document
 * on the other end is not always the operator's. A configured URL is held to
 * absolute http(s) by `readUrl` in that module, and this is the same rule
 * applied one hop further along, where the hop happens to be attacker-supplied
 * data rather than an operator's typing.
 *
 * The expected outcome of a rejection is deliberately "malformed" rather than a
 * partial success. A discovery document that cannot supply all four feeds is
 * broken, and the app already knows how to say that; the failure mode worth
 * ruling out is the one where it says nothing and issues the request anyway.
 *
 * `fetch` is stubbed throughout. Nothing here reaches a network, and the
 * assertions are about which URLs were asked for at all.
 */

/** A discovery document that names one feed with a scheme we must not follow. */
function discoveryWith(statusUrl: string) {
  return {
    last_updated: 1785312000,
    ttl: 10,
    version: "2.2",
    data: {
      en: {
        feeds: [
          {
            name: "system_information",
            url: "https://feed.example.com/gbfs/en/system_information.json",
          },
          {
            name: "station_information",
            url: "https://feed.example.com/gbfs/en/station_information.json",
          },
          { name: "station_status", url: statusUrl },
          {
            name: "vehicle_types",
            url: "https://feed.example.com/gbfs/en/vehicle_types.json",
          },
        ],
      },
    },
  };
}

/**
 * Records every address handed to `fetch`, and answers nothing useful.
 *
 * `/config.json` is left out of the record: lib/runtime-config.ts asks for it
 * once per module lifetime and it is not a feed. Everything else that arrives
 * here is an address this module decided to request.
 */
function stubDiscovery(document: unknown) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url !== "/config.json") asked.push(url);
      return { ok: true, json: async () => document } as Response;
    }),
  );
  return asked;
}

beforeEach(() => {
  clearFeedCache();
});

afterEach(() => {
  clearFeedCache();
  vi.restoreAllMocks();
});

describe("a feed URL with a scheme we do not follow", () => {
  for (const hostile of [
    "javascript:alert(1)",
    "data:application/json,{}",
    "file:///etc/passwd",
  ]) {
    it(`is never requested: ${hostile.split(":")[0]}:`, async () => {
      const asked = stubDiscovery(discoveryWith(hostile));

      const status = await loadStationSnapshot();

      // The document could not supply all four feeds, so it is malformed.
      expect(status.state).toBe("unavailable");
      // And the address itself never reached fetch. Only the discovery document
      // was requested.
      expect(asked).toHaveLength(1);
      expect(asked.some((url) => url.startsWith(hostile.split(":")[0] + ":")))
        .toBe(false);
    });
  }
});

describe("a relative feed URL", () => {
  it("is refused rather than resolved against this origin", async () => {
    const asked = stubDiscovery(discoveryWith("/gbfs/en/station_status.json"));

    const status = await loadStationSnapshot();

    expect(status.state).toBe("unavailable");
    expect(asked).toHaveLength(1);
  });
});
