import {
  PATH_CACHE_MAX_ENTRIES,
  PATH_CACHE_SCHEMA_VERSION,
} from "./endpoints";
import type { LatLon, PathKey, RouteProfile, TracedPath } from "./types";

/**
 * The persistent path store.
 *
 * Station-to-station geometry does not change, which is what makes persisting it
 * correct rather than merely convenient: a rider's habitual trip is fetched once,
 * ever, and a public service run as a courtesy is asked for it once, ever
 * (principle V).
 *
 * This is the application's first use of browser storage. Everything here is
 * total. localStorage throws in a private window, throws when the quota is full,
 * and does not exist at all in some embedded contexts; none of that may reach the
 * rider as an error. The contract is that this module hands back a path or hands
 * back nothing.
 *
 * Holds no rules. What to store and when to look is decided by callers; this
 * module only knows how to put bytes somewhere and get them back.
 */

/** Root prefix, version-independent, so a bump can find and drop its own past. */
const ROOT_PREFIX = "redock:path:";
const PREFIX = `${ROOT_PREFIX}v${PATH_CACHE_SCHEMA_VERSION}:`;

/** About a metre. Storing more digits than the app claims is wasted quota. */
const PRECISION = 5;

/**
 * The stored form. Deliberately terse and deliberately not `TracedPath`: this is
 * a wire format bounded by a browser quota rather than by a reader's patience.
 * Flat [lon, lat, lon, lat, ...] halves the JSON punctuation of nested pairs.
 */
interface StoredPath {
  /** Schema version. */
  v: number;
  /** Flat lon/lat pairs at PRECISION decimals. */
  c: number[];
  /** Length in metres. */
  m: number;
  /** Profile. */
  p: RouteProfile;
  /** Last used, epoch ms. Drives eviction. */
  t: number;
}

/**
 * The one place that touches the global.
 *
 * Returns null rather than throwing when storage is unavailable, which is the
 * normal case in a private window rather than an exceptional one.
 */
function storage(): Storage | null {
  try {
    // Accessing the property itself can throw, so the read is inside the try.
    const store = globalThis.localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

/** Our keys only. Never touches anything else the rider's browser holds. */
function ourKeys(store: Storage, prefix: string = ROOT_PREFIX): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key !== null && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys;
}

function decode(raw: string): StoredPath | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { v, c, m, p, t } = parsed as Record<string, unknown>;
  if (v !== PATH_CACHE_SCHEMA_VERSION) return null;
  if (!Array.isArray(c) || c.length < 4 || c.length % 2 !== 0) return null;
  if (!c.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  if (typeof m !== "number" || !Number.isFinite(m) || m <= 0) return null;
  if (p !== "bike" && p !== "foot") return null;
  if (typeof t !== "number" || !Number.isFinite(t)) return null;

  return { v, c: c as number[], m, p, t };
}

function toTracedPath(stored: StoredPath): TracedPath {
  const coordinates: LatLon[] = [];
  for (let i = 0; i < stored.c.length; i += 2) {
    coordinates.push({ lon: stored.c[i], lat: stored.c[i + 1] });
  }
  return { coordinates, length: stored.m, profile: stored.p };
}

function encode(path: TracedPath): StoredPath {
  const c: number[] = [];
  for (const point of path.coordinates) {
    c.push(Number(point.lon.toFixed(PRECISION)));
    c.push(Number(point.lat.toFixed(PRECISION)));
  }
  return {
    v: PATH_CACHE_SCHEMA_VERSION,
    c,
    m: path.length,
    p: path.profile,
    t: Date.now(),
  };
}

/**
 * A stored path, or null.
 *
 * Refreshes the entry's last-used stamp so eviction is least-recently-*used*
 * rather than least-recently-written. A rider's habitual trip should not be
 * evicted by a week of one-off journeys.
 */
export function readStoredPath(key: PathKey): TracedPath | null {
  const store = storage();
  if (store === null) return null;

  try {
    const raw = store.getItem(PREFIX + key);
    if (raw === null) return null;

    const stored = decode(raw);
    if (stored === null) {
      // A corrupt or stale-schema entry is dead weight in a bounded store.
      store.removeItem(PREFIX + key);
      return null;
    }

    store.setItem(PREFIX + key, JSON.stringify({ ...stored, t: Date.now() }));
    return toTracedPath(stored);
  } catch {
    return null;
  }
}

/**
 * Stores a path, evicting the least recently used entries to stay under the cap.
 *
 * A quota error is caught and treated as "the cache is full and cannot help",
 * never as a routing failure: the path in hand is still displayed, it just will
 * not survive a reload.
 */
export function writeStoredPath(key: PathKey, path: TracedPath): void {
  const store = storage();
  if (store === null) return;

  try {
    // A schema bump orphans the previous version's keys. Sweep them here rather
    // than on module load, so this module has no import-time side effect.
    for (const stale of ourKeys(store)) {
      if (!stale.startsWith(PREFIX)) store.removeItem(stale);
    }

    store.setItem(PREFIX + key, JSON.stringify(encode(path)));

    const keys = ourKeys(store, PREFIX);
    if (keys.length <= PATH_CACHE_MAX_ENTRIES) return;

    const byAge = keys
      .map((k) => {
        const raw = store.getItem(k);
        const stored = raw === null ? null : decode(raw);
        // An undecodable entry sorts oldest, so it is the first to go.
        return { key: k, t: stored?.t ?? 0 };
      })
      .sort((a, b) => a.t - b.t);

    const excess = keys.length - PATH_CACHE_MAX_ENTRIES;
    for (const entry of byAge.slice(0, excess)) store.removeItem(entry.key);
  } catch {
    // Quota exceeded, security error, or storage vanishing mid-write. The path
    // is still usable in memory; only its persistence is lost.
  }
}

/** Everything this module owns, and nothing else. */
export function purgeStoredPaths(): void {
  const store = storage();
  if (store === null) return;
  try {
    for (const key of ourKeys(store)) store.removeItem(key);
  } catch {
    // Nothing to do: the rider asked for an empty cache and either it is
    // already empty or the browser will not let us look.
  }
}

/** How many paths are held, for the label on the purge control. */
export function storedPathCount(): number {
  const store = storage();
  if (store === null) return 0;
  return ourKeys(store, PREFIX).length;
}
