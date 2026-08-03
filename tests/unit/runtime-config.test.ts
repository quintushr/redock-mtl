import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIG_PATH,
  CONFIG_SCRIPT,
  DEFAULT_RUNTIME_CONFIG,
  configReady,
  parseRuntimeConfig,
  resetRuntimeConfig,
} from "@/lib/runtime-config";
import { DEFAULT_SERVICE_ENDPOINTS } from "@/lib/endpoints";

/**
 * Configuration read at start-up, so that a built image can be pointed somewhere
 * else without being rebuilt.
 *
 * Neither a browser nor a network appears anywhere in this file, which is the
 * point of the module's shape: `parseRuntimeConfig` is pure and takes an unknown
 * value, and `configReady` takes its source as an argument. What is left needing
 * a browser is the fetch itself, which is four lines and has no branches beyond
 * the ones exercised here through an injected source.
 *
 * The rule every one of these tests is really about: **the application starts
 * without config.json.** The public deployment has no such file — the compiled-in
 * defaults are its configuration — so absent is the normal path, and a malformed
 * file must be no worse than a missing one.
 */

afterEach(() => {
  resetRuntimeConfig();
  vi.restoreAllMocks();
});

/**
 * The nominal file: all four services moved somewhere else.
 *
 * `analytics: null` is both a legal input and what the parse answers when the
 * block is absent, so the same literal serves as payload and as expectation.
 * Measurement has its own file — tests/unit/analytics-config.test.ts — because
 * it is the one key with no fallback: it is either configured or it does not
 * happen.
 */
const complete = {
  stationsFeedUrl: "https://gbfs.example.org/gbfs.json",
  routingBaseUrl: "https://router.example.org/brouter",
  geocoderUrl: "https://geocoder.example.org/api/",
  mapStyleUrl: "https://tiles.example.org/styles/plain",
  analytics: null,
};

describe("the nominal file", () => {
  it("takes every value from it", () => {
    expect(parseRuntimeConfig(complete)).toEqual(complete);
  });

  it("is what the loader resolves to", async () => {
    const config = await configReady(() => Promise.resolve(complete));
    expect(config).toEqual(complete);
  });

  it("applies one key without disturbing the other three", async () => {
    // The case a self-hoster actually has: their own tile server, everything
    // else left alone. Whole-file rejection would silently move all four.
    const config = await configReady(() =>
      Promise.resolve({ mapStyleUrl: complete.mapStyleUrl }),
    );
    expect(config.mapStyleUrl).toBe(complete.mapStyleUrl);
    expect(config.stationsFeedUrl).toBe(DEFAULT_RUNTIME_CONFIG.stationsFeedUrl);
    expect(config.routingBaseUrl).toBe(DEFAULT_RUNTIME_CONFIG.routingBaseUrl);
    expect(config.geocoderUrl).toBe(DEFAULT_RUNTIME_CONFIG.geocoderUrl);
  });

  it("ignores keys it does not know rather than rejecting the file", async () => {
    // A comment field, or a setting from a later version. Neither is a reason to
    // discard the entries this build does understand.
    const config = await configReady(() =>
      Promise.resolve({ ...complete, _comment: "ours", futureSetting: 12 }),
    );
    expect(config).toEqual(complete);
  });
});

describe("the file is absent", () => {
  it("falls back to the compiled-in defaults", async () => {
    // What a 404 becomes by the time it reaches here.
    const config = await configReady(() => Promise.resolve(null));
    expect(config).toEqual(DEFAULT_RUNTIME_CONFIG);
  });

  it("defaults to the endpoints the application was built with", () => {
    // Not a second copy of the URLs: the same object lib/endpoints.ts publishes,
    // where the provider verification notes live and are dated.
    expect(DEFAULT_RUNTIME_CONFIG).toEqual({
      stationsFeedUrl: DEFAULT_SERVICE_ENDPOINTS.stationsFeedUrl,
      routingBaseUrl: DEFAULT_SERVICE_ENDPOINTS.routingBaseUrl,
      geocoderUrl: DEFAULT_SERVICE_ENDPOINTS.geocoderUrl,
      mapStyleUrl: DEFAULT_SERVICE_ENDPOINTS.mapStyleUrl,
      // No default and never one: a fork that inherited a website id would
      // report its readers to somebody else's dashboard.
      analytics: null,
    });
  });

  it("survives a source that throws, rather than taking the app down with it", async () => {
    // Offline, blocked by an extension, CORS, DNS. A configuration read is not
    // allowed to be the thing that stops the planner working.
    const config = await configReady(() =>
      Promise.reject(new Error("network down")),
    );
    expect(config).toEqual(DEFAULT_RUNTIME_CONFIG);
  });
});

describe("the file is malformed", () => {
  for (const [name, payload] of [
    ["a bare string", "https://example.org"],
    ["a number", 42],
    ["an array", [complete]],
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
  ] as const) {
    it(`falls back on ${name}`, () => {
      expect(parseRuntimeConfig(payload)).toEqual(DEFAULT_RUNTIME_CONFIG);
    });
  }

  it("rejects a value of the wrong type, key by key", () => {
    const config = parseRuntimeConfig({
      stationsFeedUrl: 12,
      routingBaseUrl: null,
      geocoderUrl: { url: "https://example.org" },
      mapStyleUrl: complete.mapStyleUrl,
    });
    // Three bad entries fall back and the one good entry still applies.
    expect(config.stationsFeedUrl).toBe(DEFAULT_RUNTIME_CONFIG.stationsFeedUrl);
    expect(config.routingBaseUrl).toBe(DEFAULT_RUNTIME_CONFIG.routingBaseUrl);
    expect(config.geocoderUrl).toBe(DEFAULT_RUNTIME_CONFIG.geocoderUrl);
    expect(config.mapStyleUrl).toBe(complete.mapStyleUrl);
  });

  it("rejects an empty or blank string", () => {
    const config = parseRuntimeConfig({ geocoderUrl: "   " });
    expect(config.geocoderUrl).toBe(DEFAULT_RUNTIME_CONFIG.geocoderUrl);
  });

  it("rejects a relative URL", () => {
    // All four are third-party services; none can legitimately be same-origin,
    // and a relative value here is a typo rather than an intention.
    const config = parseRuntimeConfig({ geocoderUrl: "/api/geocode" });
    expect(config.geocoderUrl).toBe(DEFAULT_RUNTIME_CONFIG.geocoderUrl);
  });

  for (const scheme of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
  ]) {
    it(`refuses the scheme in ${scheme.slice(0, 12)}…`, () => {
      /*
       * A security boundary, not tidiness. config.json is the one input to this
       * application that a human edits by hand and that is not reviewed by
       * anybody, and these four values are handed to `fetch` and to MapLibre's
       * style loader. http and https, or the default.
       */
      const config = parseRuntimeConfig({ mapStyleUrl: scheme });
      expect(config.mapStyleUrl).toBe(DEFAULT_RUNTIME_CONFIG.mapStyleUrl);
    });
  }
});

describe("the file is read once", () => {
  it("does not ask a second time once it has an answer", async () => {
    const source = vi.fn(() => Promise.resolve(complete));
    await configReady(source);
    await configReady(source);
    await configReady(source);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it("collapses callers that all ask before the answer arrives", async () => {
    // The realistic shape: the feed, a route and a geocoder query all want a URL
    // in the same tick. One file, one request.
    let release: ((payload: unknown) => void) | undefined;
    const source = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          release = resolve;
        }),
    );

    const all = Promise.all([
      configReady(source),
      configReady(source),
      configReady(source),
    ]);
    release?.(complete);

    expect(await all).toEqual([complete, complete, complete]);
    expect(source).toHaveBeenCalledTimes(1);
  });
});

describe("the head script", () => {
  it("asks for the file the module looks for", () => {
    expect(CONFIG_PATH).toBe("/config.json");
    expect(CONFIG_SCRIPT).toContain(JSON.stringify(CONFIG_PATH));
  });

  it("bypasses the HTTP cache", () => {
    // Otherwise an operator edits config.json, reloads, and sees the old values
    // — which is the whole failure this feature exists to prevent, arriving by a
    // different route. nginx sends no-store as well; both halves are cheap.
    expect(CONFIG_SCRIPT).toContain('cache:"no-store"');
  });

  it("cannot throw or reject", () => {
    // It runs on every page load of a deployment that has no config.json, which
    // is every Cloudflare Pages deployment of this project. An unhandled
    // rejection in the console of every reader is not an acceptable resting state.
    expect(CONFIG_SCRIPT).toContain(".catch(");
    expect(CONFIG_SCRIPT).toMatch(/r\.ok\?r\.json\(\):null/);
  });

  it("is one statement of plain ES5, since it runs before any bundle", () => {
    // No arrow functions, no const, no optional chaining: this is inlined into the
    // document and is the one script here that no build step touches.
    expect(CONFIG_SCRIPT).not.toMatch(/=>|\bconst\b|\blet\b|\?\./);
  });
});
