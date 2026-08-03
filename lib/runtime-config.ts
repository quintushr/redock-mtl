import { type AnalyticsConfig, parseAnalyticsConfig } from "./analytics";
import { DEFAULT_SERVICE_ENDPOINTS } from "./endpoints";

/**
 * Where the external services live, decided at run time rather than at build
 * time.
 *
 * The problem this exists for. `next build` inlines every `NEXT_PUBLIC_*` value
 * into the bundle — verified in
 * node_modules/next/dist/docs/01-app/02-guides/environment-variables.md, which
 * states that "after being built, your app will no longer respond to changes to
 * these environment variables". So an image built against one geocoder can never
 * be pointed at another, and `docker run -e GEOCODER_URL=...` does exactly
 * nothing. Anybody self-hosting this would have to rebuild the image to change a
 * URL, which is not self-hosting, it is forking.
 *
 * The fix is one file fetched by the browser at start-up. It ships inside the
 * image, it is served with `Cache-Control: no-store` so an edit is visible on the
 * next reload, and it can be replaced by mounting a volume over it.
 *
 * This module is impure by necessity and joins feed-client.ts, routing.ts and
 * the two stores in that category. Everything that decides anything is pure and
 * separate: `parseRuntimeConfig` takes an unknown value and returns a config,
 * with no fetch, no window and no clock anywhere near it, which is why the tests
 * for the interesting half need neither a browser nor a network.
 *
 * The one rule that shapes the rest: **the application must start without this
 * file.** Cloudflare Pages serves no config.json at all — the defaults are the
 * production configuration — so "absent" is the normal path and not a
 * degradation. A missing, unreachable, unparseable or nonsense file all resolve
 * to the same thing as an empty one.
 */

export interface RuntimeConfig {
  /** GBFS discovery document. Everything about stations is resolved through it. */
  stationsFeedUrl: string;
  /** BRouter-compatible route endpoint. */
  routingBaseUrl: string;
  /** Photon-compatible geocoder. */
  geocoderUrl: string;
  /** MapLibre style document for the basemap. */
  mapStyleUrl: string;
  /**
   * Where audience measurement reports to, or null.
   *
   * Null on every deployment that has not filled both fields in, which includes
   * this project's own build and every fork of it until somebody decides
   * otherwise. Unlike the four URLs above there is no fallback: measurement is
   * either configured or it does not happen. See lib/analytics.ts.
   */
  analytics: AnalyticsConfig | null;
}

/**
 * What runs when there is no file, and per key when a key is wrong.
 *
 * The literals and the provider verification notes stay in lib/endpoints.ts,
 * where they were written and where they are dated. This module holds no URL of
 * its own: two copies of a URL is how the copies diverge.
 */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  stationsFeedUrl: DEFAULT_SERVICE_ENDPOINTS.stationsFeedUrl,
  routingBaseUrl: DEFAULT_SERVICE_ENDPOINTS.routingBaseUrl,
  geocoderUrl: DEFAULT_SERVICE_ENDPOINTS.geocoderUrl,
  mapStyleUrl: DEFAULT_SERVICE_ENDPOINTS.mapStyleUrl,
  /*
   * No default, and there will never be one. A fork that deployed this image
   * and inherited a website id would be reporting its readers to somebody
   * else's dashboard, which is the one configuration mistake this file can make
   * on a stranger's behalf.
   */
  analytics: null,
};

/** Where the file is looked for. Root-relative: the app is served from the root. */
export const CONFIG_PATH = "/config.json";

/**
 * The property the head script parks its in-flight request on.
 *
 * Not a config value: a promise of one. See CONFIG_SCRIPT below.
 */
const HANDOFF = "__REDOCK_CONFIG__";

interface ConfigWindow {
  [HANDOFF]?: Promise<unknown>;
}

/**
 * Starts the request before React exists.
 *
 * Rendering is deliberately *not* blocked on the configuration, and this script
 * is what makes that safe. The prerendered document already carries the panel,
 * the tagline and the empty state, and gating the tree on a fetch would replace
 * all of it with a blank screen for one round trip — a real regression for a
 * reader on a slow connection, in exchange for nothing, because nothing in the
 * first render reads a URL. What reads a URL is the first *request*, and every
 * one of those awaits `configReady()`.
 *
 * So this fires the fetch from `<head>`, before the bundle has parsed, and parks
 * the promise where `configReady()` can pick it up. By the time anything wants a
 * URL the answer is almost always already in hand, and if it is not, the caller
 * waits on the same single request rather than issuing a second one.
 *
 * Same idiom as THEME_SCRIPT in components/ThemeProvider.tsx, and for the same
 * reason: some things have to happen before React and there is exactly one place
 * they can.
 *
 * It cannot throw. A rejected fetch is caught into null inside the script, so a
 * missing file does not put an unhandled rejection in the console of every reader
 * on a deployment that has no config.json — which is every Cloudflare Pages
 * deployment of this project.
 */
export const CONFIG_SCRIPT = `window.${HANDOFF}=fetch(${JSON.stringify(
  CONFIG_PATH,
)},{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});`;

/**
 * One string from a payload, or null.
 *
 * Absolute http(s) only, and that is a security boundary rather than tidiness: a
 * config file is the one input to this application that an operator edits by
 * hand, and `javascript:` in a URL that reaches `fetch` or MapLibre's style
 * loader is not something to find out about later. A relative URL is rejected
 * too — every one of these four is a third-party service and none of them can
 * legitimately be same-origin.
 */
function readUrl(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value !== "string" || value.trim() === "") return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return value;
  } catch {
    // Not an absolute URL at all.
    return null;
  }
}

/**
 * A payload turned into a configuration. Pure, total, and never throws.
 *
 * Per key, not per file. A self-hoster who wants their own tile server and
 * nothing else should be able to write one line, and a typo in one entry must not
 * silently move the other three — which is what whole-file rejection would do,
 * and it would do it invisibly, because the app would keep working.
 *
 * Unknown keys are ignored rather than rejected, so a config file carrying a
 * comment field or a setting from a later version still applies the parts this
 * build understands.
 */
export function parseRuntimeConfig(payload: unknown): RuntimeConfig {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ...DEFAULT_RUNTIME_CONFIG };
  }

  const record = payload as Record<string, unknown>;

  return {
    stationsFeedUrl:
      readUrl(record, "stationsFeedUrl") ??
      DEFAULT_RUNTIME_CONFIG.stationsFeedUrl,
    routingBaseUrl:
      readUrl(record, "routingBaseUrl") ?? DEFAULT_RUNTIME_CONFIG.routingBaseUrl,
    geocoderUrl:
      readUrl(record, "geocoderUrl") ?? DEFAULT_RUNTIME_CONFIG.geocoderUrl,
    mapStyleUrl:
      readUrl(record, "mapStyleUrl") ?? DEFAULT_RUNTIME_CONFIG.mapStyleUrl,
    /*
     * Parsed by the module that owns it. This file owns the shape of the
     * document; what a valid analytics block is, and why it is all-or-nothing,
     * belongs next to the code that acts on it.
     */
    analytics: parseAnalyticsConfig(record.analytics),
  };
}

/** How the payload is obtained. Injected in tests; the default reaches the network. */
export type ConfigSource = () => Promise<unknown>;

/**
 * The head script's request if there was one, otherwise our own.
 *
 * Falling back to a fetch here is not redundancy for its own sake: the tests
 * render components without the document's head script, and a future surface
 * might too. What must never happen is *two* requests for one file, which is why
 * the handoff is checked first.
 */
const defaultSource: ConfigSource = async () => {
  const handed =
    typeof window === "undefined"
      ? undefined
      : (window as unknown as ConfigWindow)[HANDOFF];

  if (handed !== undefined) {
    try {
      return await handed;
    } catch {
      return null;
    }
  }

  if (typeof fetch === "undefined") return null;

  try {
    const response = await fetch(CONFIG_PATH, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    // Absent, unreachable, blocked, or not JSON. All the same answer: defaults.
    return null;
  }
};

let resolved: RuntimeConfig | null = null;
let pending: Promise<RuntimeConfig> | null = null;

/**
 * The configuration, once.
 *
 * Every caller that is about to reach a service awaits this. Memoised on the
 * resolved value *and* on the in-flight promise, so a page that loads the feed,
 * a route and a geocoder query in the same tick reads the file once between them.
 *
 * There is no synchronous accessor on purpose. One would be convenient and would
 * quietly hand out defaults to any caller that forgot to await — a failure that
 * looks like nothing at all until someone wonders why their self-hosted geocoder
 * is never contacted.
 */
export function configReady(source: ConfigSource = defaultSource): Promise<RuntimeConfig> {
  if (resolved !== null) return Promise.resolve(resolved);
  if (pending !== null) return pending;

  pending = source()
    .then(parseRuntimeConfig)
    // `source` is total by contract, but a caller-supplied one may not be, and a
    // configuration read must not be the thing that breaks the application.
    .catch(() => ({ ...DEFAULT_RUNTIME_CONFIG }))
    .then((config) => {
      resolved = config;
      pending = null;
      return config;
    });

  return pending;
}

/** Test isolation, and nothing else reaches in. */
export function resetRuntimeConfig(): void {
  resolved = null;
  pending = null;
  if (typeof window !== "undefined") {
    delete (window as unknown as ConfigWindow)[HANDOFF];
  }
}
