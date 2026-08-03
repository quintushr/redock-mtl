import {
  GBFS_FALLBACK_ATTRIBUTION,
  MIN_REFRESH_INTERVAL_SECONDS,
  REQUIRED_GBFS_FEEDS,
} from "./endpoints";
import { parseStationSnapshot } from "./gbfs";
import { configReady } from "./runtime-config";
import type {
  FeedStatus,
  RefreshOutcome,
  Seconds,
  StationSnapshot,
} from "./types";

/**
 * The one impure module under lib/.
 *
 * It fetches and caches. It contains no domain logic: every decision about what
 * the data means lives in gbfs.ts, which is pure and tested. If you find
 * yourself adding a rule here, it belongs there instead.
 */

interface CacheEntry {
  snapshot: StationSnapshot;
  /** Local clock, used only to rate-limit our own requests. */
  fetchedAtMs: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<FeedStatus> | null = null;
/** A rider-initiated refresh in progress. Distinct from `inFlight`: see below. */
let refreshing: Promise<RefreshOutcome> | null = null;

/** Exposed for tests; there is no other reason to reach in here. */
export function clearFeedCache(): void {
  cache = null;
  inFlight = null;
  refreshing = null;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.json();
}

/**
 * Whether an address out of a discovery document is one we are willing to ask
 * for.
 *
 * Absolute http(s), which is the same rule `readUrl` in lib/runtime-config.ts
 * holds a configured URL to, and it is here for the same reason. Discovery is
 * indirection: the operator's document decides what four later requests go to,
 * and `stationsFeedUrl` is a value a self-hoster may repoint at anything (see
 * that module). One hostile or mistaken document should not be able to name a
 * `javascript:` or a `data:` address and have this module hand it to `fetch`.
 *
 * The consequence of a rejection is a feed that fails to resolve, which
 * loadStationSnapshot already reports as a feed problem. That is the right
 * outcome: a discovery document that names a non-http address is broken, and
 * the app says so rather than following it.
 */
function isFetchable(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    // Relative, or not a URL. A GBFS discovery document publishes absolute URLs.
    return false;
  }
}

/**
 * Resolves the feed URLs from the discovery document rather than hard-coding
 * them, so a provider reorganising its paths does not break us.
 *
 * The discovery document is keyed by language. We take the first language block
 * that carries every feed we need; the fields we read are language-independent.
 */
function resolveFeedUrls(discovery: unknown): Map<string, string> | null {
  if (typeof discovery !== "object" || discovery === null) return null;
  const data = (discovery as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;

  for (const block of Object.values(data as Record<string, unknown>)) {
    if (typeof block !== "object" || block === null) continue;
    const feeds = (block as { feeds?: unknown }).feeds;
    if (!Array.isArray(feeds)) continue;

    const urls = new Map<string, string>();
    for (const feed of feeds) {
      if (typeof feed !== "object" || feed === null) continue;
      const { name, url } = feed as { name?: unknown; url?: unknown };
      if (typeof name === "string" && typeof url === "string" && isFetchable(url)) {
        urls.set(name, url);
      }
    }
    if (REQUIRED_GBFS_FEEDS.every((name) => urls.has(name))) return urls;
  }
  return null;
}

/**
 * How long before we are willing to ask the operator again.
 *
 * The maximum of the feed's own ttl and our own floor, which is the same
 * expression the cache branch of loadStationSnapshot uses. Ours is the binding
 * one in practice: the provider declares `ttl: 10`, permitting six requests a
 * minute, and taking a courtesy endpoint up on that is how public feeds get
 * closed (principle V).
 *
 * Exported read-only, so the interface can avoid showing a spinner for a
 * request that will be refused a microtask later. It grants nothing: bypassing
 * the floor still requires `force`, which no component may pass. The division is
 * deliberate — the component uses this to look right, requestRefresh uses it to
 * be right, and only the second one is load-bearing.
 */
export function secondsUntilRefreshPermitted(): Seconds {
  if (cache === null) return 0;
  const since = (Date.now() - cache.fetchedAtMs) / 1000;
  const floor = Math.max(cache.snapshot.ttl, MIN_REFRESH_INTERVAL_SECONDS);
  return Math.max(0, floor - since);
}

/**
 * A rider asking for newer availability, on purpose.
 *
 * The one entry point the refresh control may use, and deliberately not a thin
 * wrapper over `loadStationSnapshot({ force: true })`.
 *
 * `force` bypasses the floor *entirely*, which is right for a test and wrong
 * for a button: wired to one, it lets a rider poll the operator as fast as they
 * can tap. Putting the floor check in the component would work today and break
 * the first time someone else reaches for the module, with nothing in the type
 * system objecting. Owning the check here means constitution compliance stops
 * depending on a caller remembering.
 *
 * A refusal is a value rather than an error (FR-421). The rider has done nothing
 * wrong — the limit is ours, not the operator's — so they are told how long
 * remains and no request is sent. Distinguishing that from a *failed* attempt is
 * the point of the return type: a failure comes back as `ok: true` carrying the
 * previous snapshot, because trying and getting nothing is not the same as not
 * being allowed to try.
 *
 * Never throws.
 */
export function requestRefresh(): Promise<RefreshOutcome> {
  const waitSeconds = secondsUntilRefreshPermitted();
  if (waitSeconds > 0) return Promise.resolve({ ok: false, waitSeconds });

  /*
   * Collapse concurrent presses onto one round of requests (FR-423).
   *
   * loadStationSnapshot dedupes in-flight callers, but only when `force` is
   * absent — forcing deliberately skips that, which is correct for its own
   * purpose and would let a double tap issue two rounds here. The footer does
   * disable its button while loading, but a constitution guarantee that rests on
   * a component's disabled attribute is not a guarantee.
   */
  if (refreshing !== null) return refreshing;

  refreshing = loadStationSnapshot({ force: true })
    .then((status): RefreshOutcome => ({ ok: true, status }))
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

function statusFor(entry: CacheEntry): FeedStatus {
  const ageSeconds = (Date.now() - entry.snapshot.observedAt.getTime()) / 1000;
  // The feed's own ttl decides what counts as stale. A stale snapshot is still
  // shown, clearly labelled: a stale plan beats an empty screen (FR-030).
  if (entry.snapshot.ttl > 0 && ageSeconds > entry.snapshot.ttl) {
    return { state: "stale", snapshot: entry.snapshot, age: ageSeconds };
  }
  return { state: "ready", snapshot: entry.snapshot };
}

/**
 * Loads the station snapshot, serving from cache when the data is fresh enough.
 *
 * Refresh policy (constitution principle V): never faster than the feed's ttl,
 * and never faster than our own floor either. The provider declares a ttl of ten
 * seconds, which permits six requests a minute; taking it up on that against a
 * courtesy endpoint is how public feeds get closed.
 *
 * Never throws. Every failure comes back as a FeedStatus (FR-030).
 */
export async function loadStationSnapshot(
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<FeedStatus> {
  const { force = false, signal } = options;

  if (cache !== null && !force) {
    const sinceFetchSeconds = (Date.now() - cache.fetchedAtMs) / 1000;
    const floor = Math.max(cache.snapshot.ttl, MIN_REFRESH_INTERVAL_SECONDS);
    if (sinceFetchSeconds < floor) return statusFor(cache);
  }

  // Collapse concurrent callers onto one request: one fetch per refresh, not one
  // per component that happens to mount.
  if (inFlight !== null && !force) return inFlight;

  inFlight = (async (): Promise<FeedStatus> => {
    try {
      // The configured feed, not the compiled-in one. Awaited here rather than
      // read from a constant so a self-hosted image pointed at another network's
      // GBFS actually reaches it; on the public deployment there is no
      // config.json and this resolves to the same URL it always was.
      const { stationsFeedUrl } = await configReady();
      const discovery = await fetchJson(stationsFeedUrl, signal);
      const urls = resolveFeedUrls(discovery);
      if (urls === null) {
        return { state: "unavailable", reason: "malformed" };
      }

      const [information, status, vehicleTypes, systemInfo] = await Promise.all(
        REQUIRED_GBFS_FEEDS.map((name) => fetchJson(urls.get(name)!, signal)),
      );

      const parsed = parseStationSnapshot(
        information,
        status,
        vehicleTypes,
        systemInfo,
        {
          operatorName: GBFS_FALLBACK_ATTRIBUTION.operatorName,
          licenseUrl: GBFS_FALLBACK_ATTRIBUTION.licenseUrl,
          licenseName: GBFS_FALLBACK_ATTRIBUTION.licenseName,
        },
      );

      if (!parsed.ok) return { state: "unavailable", reason: "malformed" };

      // A network with no stations at all is out of season, not broken. The
      // distinction matters: one is temporary and expected, the other is a bug.
      if (parsed.value.stations.length === 0) {
        return { state: "unavailable", reason: "out-of-season" };
      }

      cache = { snapshot: parsed.value, fetchedAtMs: Date.now() };
      return statusFor(cache);
    } catch {
      // Includes abort, offline, CORS, and non-2xx. If a stale snapshot is in
      // hand, it is more useful than an error.
      if (cache !== null) {
        const ageSeconds =
          (Date.now() - cache.snapshot.observedAt.getTime()) / 1000;
        return { state: "stale", snapshot: cache.snapshot, age: ageSeconds };
      }
      return { state: "unavailable", reason: "network" };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
