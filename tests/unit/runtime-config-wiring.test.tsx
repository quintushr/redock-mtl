import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SearchField from "@/components/SearchField";
import { clearFeedCache, loadStationSnapshot } from "@/lib/feed-client";
import { clearRoutingCache, fetchPath } from "@/lib/routing";
import { configReady, resetRuntimeConfig } from "@/lib/runtime-config";
import { GEOCODER_DEBOUNCE_MS } from "@/lib/endpoints";
import type { LatLon } from "@/lib/types";

/**
 * Every outbound address really does come from the configuration.
 *
 * tests/unit/runtime-config.test.ts proves the module: what it parses, what it
 * falls back to, that it reads the file once. That is the half that could be
 * wrong quietly. This is the other half, and it is the one that was wrong before
 * this feature existed: each of these four call sites used to read a module
 * constant, and a call site that keeps doing that still *works* — it silently
 * contacts the address the image was built with while the operator's config.json
 * sits there being served and ignored. Nothing fails. Nobody finds out.
 *
 * So there is one test per service, asserting the host that was actually
 * contacted. `example.org` throughout, which is reserved by RFC 2606 and is also
 * what keeps tests/unit/routing-boundaries.test.ts satisfied that nothing here
 * reaches a real network.
 */

const CONFIGURED = {
  stationsFeedUrl: "https://gbfs.example.org/gbfs.json",
  routingBaseUrl: "https://router.example.org/brouter",
  geocoderUrl: "https://geocoder.example.org/api/",
  mapStyleUrl: "https://tiles.example.org/styles/plain",
};

afterEach(() => {
  cleanup();
  resetRuntimeConfig();
  clearFeedCache();
  clearRoutingCache();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/**
 * Seeds the configuration without a network.
 *
 * `configReady` takes its source as an argument for exactly this. Memoised on the
 * first call, so seeding it here is what every later caller — in lib/ or in a
 * component — then reads.
 */
async function seedConfig(): Promise<void> {
  await configReady(() => Promise.resolve(CONFIGURED));
}

/** Every URL `fetch` was handed, in order. */
function requestedUrls(spy: ReturnType<typeof vi.fn>): string[] {
  return spy.mock.calls.map(([input]) => String(input));
}

describe("the station feed", () => {
  it("is fetched from the configured discovery document", async () => {
    await seedConfig();

    // Answers everything with an empty object: the parse fails, the loader
    // reports "malformed", and the URL it asked for is what is under test.
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await loadStationSnapshot();

    expect(requestedUrls(fetchSpy)[0]).toBe(CONFIGURED.stationsFeedUrl);
  });

  it("falls back to the compiled-in feed when there is no config file", async () => {
    await configReady(() => Promise.resolve(null));

    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await loadStationSnapshot();

    // The public deployment's path: BIXI's own feed, from lib/endpoints.ts.
    expect(requestedUrls(fetchSpy)[0]).toContain("gbfs.velobixi.com");
  });
});

describe("the route source", () => {
  it("is asked at the configured base", async () => {
    await seedConfig();

    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 } as Response),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await fetchPath({
      from: { lat: 45.5, lon: -73.6 },
      to: { lat: 45.52, lon: -73.58 },
      profile: "bike",
      stations: { fromId: "A", toId: "B" },
    });

    const [url] = requestedUrls(fetchSpy);
    expect(url.startsWith(`${CONFIGURED.routingBaseUrl}?`)).toBe(true);
    // The query it carries is unchanged: this feature moved the host and nothing
    // else. `lonlats` is longitude first, which is the part worth pinning.
    expect(url).toContain("lonlats=-73.6%2C45.5%7C-73.58%2C45.52");
    expect(url).toContain("profile=trekking");
    expect(url).toContain("trackname=redock-mtl");
  });
});

describe("the geocoder", () => {
  const MONTREAL: LatLon = { lat: 45.5088, lon: -73.5878 };

  it("is queried at the configured host", async () => {
    await seedConfig();

    const fetchSpy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ features: [] }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const props = {
      label: "Départ",
      clearLabel: "Effacer le départ",
      placeholder: "Adresse",
      value: "",
      point: null,
      bias: MONTREAL,
      armed: false,
      onValueChange: vi.fn(),
      onPick: vi.fn(),
      onClear: vi.fn(),
      onArm: vi.fn(),
    };

    const view = render(<SearchField {...props} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "rue Saint-Denis" },
    });
    view.rerender(<SearchField {...props} value="rue Saint-Denis" />);

    // Past the debounce, then past the configuration promise the effect chains on.
    await new Promise((resolve) =>
      setTimeout(resolve, GEOCODER_DEBOUNCE_MS + 50),
    );

    const [url] = requestedUrls(fetchSpy);
    expect(url.startsWith(CONFIGURED.geocoderUrl)).toBe(true);
    // And it still carries the bias and the cap, which are ours rather than the
    // deployment's.
    expect(url).toContain("q=rue+Saint-Denis");
    expect(url).toContain("lat=45.5088");
  });
});

describe("nobody bypasses the configuration", () => {
  /**
   * The failure this guards against is silence.
   *
   * A call site that goes back to reading a constant keeps working: it contacts
   * the address the image was built with, the operator's config.json is served and
   * ignored, and no test above fails because the constant and the default are the
   * same string. So the guard has to be on the source, and it is the same
   * technique tests/unit/routing-boundaries.test.ts uses for its own boundaries.
   *
   * lib/endpoints.ts is where the four literals live and is excluded. So is
   * lib/runtime-config.ts, which is the one legitimate reader of them.
   */
  const SOURCES = [
    "lib/feed-client.ts",
    "lib/routing.ts",
    "components/MapView.tsx",
    "components/SearchField.tsx",
    "components/MapAttribution.tsx",
  ];

  for (const file of SOURCES) {
    it(`${file} does not name a service URL constant`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      // The names these used to be exported under. Any of them reappearing in an
      // import is the bypass.
      expect(source).not.toMatch(/\bGBFS_DISCOVERY_URL\b/);
      expect(source).not.toMatch(/\bROUTING_BASE_URL\b/);
      expect(source).not.toMatch(/\bGEOCODER_URL\b/);
      expect(source).not.toMatch(/\bMAP_STYLE_URL\b/);
      // And the literals themselves, in case somebody pastes one in rather than
      // importing it.
      expect(source).not.toMatch(/gbfs\.velobixi\.com/);
      expect(source).not.toMatch(/photon\.komoot\.io/);
      expect(source).not.toMatch(/brouter\.de/);
      expect(source).not.toMatch(/tiles\.openfreemap\.org/);
    });
  }

  it("keeps DEFAULT_SERVICE_ENDPOINTS to a single reader", () => {
    // Two readers is how one of them ends up being the stale one.
    const readers = ["lib/runtime-config.ts"];
    for (const file of [...SOURCES, "app/layout.tsx", "app/page.tsx"]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/\bDEFAULT_SERVICE_ENDPOINTS\b/);
    }
    for (const file of readers) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).toMatch(/\bDEFAULT_SERVICE_ENDPOINTS\b/);
    }
  });
});

describe("the basemap", () => {
  it("is the one value MapView reads from the configuration", async () => {
    // MapView needs WebGL to instantiate and cannot be rendered in jsdom, so the
    // assertion is on the contract rather than on a constructed map: the style URL
    // is in the configuration, MapView takes it from there, and the component no
    // longer imports it from lib/endpoints.ts. That last part is checked by
    // reading the source, which is how tests/unit/routing-boundaries.test.ts
    // checks its own boundaries.
    const config = await configReady(() => Promise.resolve(CONFIGURED));
    expect(config.mapStyleUrl).toBe(CONFIGURED.mapStyleUrl);
  });
});
