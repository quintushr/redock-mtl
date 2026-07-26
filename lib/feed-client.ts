import {
  GBFS_DISCOVERY_URL,
  GBFS_FALLBACK_ATTRIBUTION,
  MIN_REFRESH_INTERVAL_SECONDS,
  REQUIRED_GBFS_FEEDS,
} from "./endpoints";
import { parseStationSnapshot } from "./gbfs";
import type { FeedStatus, StationSnapshot } from "./types";

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

/** Exposed for tests; there is no other reason to reach in here. */
export function clearFeedCache(): void {
  cache = null;
  inFlight = null;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response.json();
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
      if (typeof name === "string" && typeof url === "string") {
        urls.set(name, url);
      }
    }
    if (REQUIRED_GBFS_FEEDS.every((name) => urls.has(name))) return urls;
  }
  return null;
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
      const discovery = await fetchJson(GBFS_DISCOVERY_URL, signal);
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
