import {
  MAX_REQUESTS_PER_USER_REQUEST,
  PATH_REQUEST_TIMEOUT_MS,
  ROUTING_BASE_URL,
  ROUTING_PROFILES,
  ROUTING_TRACKNAME,
} from "./endpoints";
import { readStoredPath, writeStoredPath } from "./path-store";
import { isPlausiblePath, parseRoutePayload, pathKey } from "./route-geometry";
import type { PathKey, RoutingRequest, TracedPath } from "./types";

/**
 * The second impure module under lib/, alongside feed-client.ts.
 *
 * It fetches and it caches. It contains no domain logic: every rule about what a
 * payload means, whether it is believable, and what to do next lives in
 * route-geometry.ts and route-refinement.ts, both pure and both tested without a
 * browser. If you find yourself adding a rule here, it belongs there instead.
 *
 * Never throws. Every failure comes back as null, and the caller turns that into
 * an approximate step (FR-324).
 */

/**
 * Walk-leg paths, for this session only.
 *
 * Their endpoints are wherever the rider happened to tap, so a persistent store
 * keyed on coordinates would grow without bound for a hit rate near zero
 * (FR-329b). Session reuse is what FR-328 actually needs: a trip consulted twice
 * in one sitting issues no second request.
 */
let sessionPaths = new Map<PathKey, TracedPath>();

/** One request per key, however many callers ask (mirrors loadStationSnapshot). */
let inFlight = new Map<PathKey, Promise<TracedPath | null>>();

/**
 * Requests issued since the rider last changed what they are asking for.
 *
 * Not per plan. A correction produces a *new* plan, so a per-plan counter resets
 * and three rounds of five steps could issue twenty requests while satisfying
 * every other rule we impose (FR-330a).
 */
let requestsThisUserRequest = 0;

/** Exposed for tests and for the purge control; there is no other reason to reach in. */
export function clearRoutingCache(): void {
  sessionPaths = new Map();
  inFlight = new Map();
  requestsThisUserRequest = 0;
}

/**
 * Called when the rider changes an endpoint or a parameter, never when a
 * corrected plan is computed. Resetting on a corrected plan would reintroduce
 * exactly the hole MAX_REQUESTS_PER_USER_REQUEST exists to close.
 */
export function resetRequestBudget(): void {
  requestsThisUserRequest = 0;
}

/** How much of the budget is left, for the discipline check in tests. */
export function remainingRequestBudget(): number {
  return Math.max(0, MAX_REQUESTS_PER_USER_REQUEST - requestsThisUserRequest);
}

/**
 * The only place a request URL is built.
 *
 * `lonlats` is longitude first, which is the opposite of LatLon and the single
 * most likely way to get this feature wrong. Keeping the conversion here means
 * there is one line to check rather than several to audit.
 */
function requestUrl(request: RoutingRequest): string {
  const point = (p: { lat: number; lon: number }): string => `${p.lon},${p.lat}`;
  const query = new URLSearchParams({
    lonlats: `${point(request.from)}|${point(request.to)}`,
    profile: ROUTING_PROFILES[request.profile],
    alternativeidx: "0",
    format: "geojson",
    // The only channel by which the operator can identify us: a custom header
    // would be preflighted and the instance does not answer preflight.
    trackname: ROUTING_TRACKNAME,
  });
  return `${ROUTING_BASE_URL}?${query.toString()}`;
}

/**
 * Combines the caller's signal with our own timeout.
 *
 * Written by hand rather than with AbortSignal.any so this does not depend on
 * how recent the runtime is.
 */
function withTimeout(signal: AbortSignal | undefined): {
  signal: AbortSignal;
  done: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("route request timed out")),
    PATH_REQUEST_TIMEOUT_MS,
  );

  const onAbort = (): void => controller.abort(signal?.reason);
  if (signal !== undefined) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

/** A path already in hand, without issuing anything. */
export function cachedPath(request: RoutingRequest): TracedPath | null {
  const key = pathKey(request);
  const session = sessionPaths.get(key);
  if (session !== undefined) return session;
  // Only station pairs are persisted; a point-pair key is never in the store.
  if (request.stations === undefined) return null;
  return readStoredPath(key);
}

async function requestPath(
  request: RoutingRequest,
  key: PathKey,
  signal: AbortSignal | undefined,
): Promise<TracedPath | null> {
  const { signal: combined, done } = withTimeout(signal);

  try {
    requestsThisUserRequest += 1;
    const response = await fetch(requestUrl(request), { signal: combined });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    const parsed = parseRoutePayload(payload, request);
    if (!parsed.ok) return null;

    // A router that answers is not a router that answered about the right thing.
    if (!isPlausiblePath(parsed.value, request)) return null;

    sessionPaths.set(key, parsed.value);
    // Station geometry is invariant, so it is worth keeping across visits. A
    // walk leg's is not (FR-329a, FR-329b).
    if (request.stations !== undefined) writeStoredPath(key, parsed.value);

    return parsed.value;
  } catch {
    // Abort, offline, CORS, DNS, malformed JSON. All the same to the caller:
    // there is no path, the step stays approximate, and nothing is retried.
    // A retry storm against a courtesy service is how public endpoints close.
    return null;
  } finally {
    done();
    inFlight.delete(key);
  }
}

/**
 * A path for one step, from cache or from the source.
 *
 * Total: null means "no path", for any reason at all.
 */
export function fetchPath(
  request: RoutingRequest,
  signal?: AbortSignal,
): Promise<TracedPath | null> {
  const key = pathKey(request);

  const cached = cachedPath(request);
  if (cached !== null) return Promise.resolve(cached);

  // Collapse concurrent callers onto one request: one fetch per path, not one
  // per component that happens to want it.
  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;

  // The ceiling is a hard stop, not a throttle. Past it the rider keeps a fully
  // usable plan drawn from estimates, which is the degradation FR-324 already
  // requires and which costs the service nothing.
  if (requestsThisUserRequest >= MAX_REQUESTS_PER_USER_REQUEST) {
    return Promise.resolve(null);
  }

  const promise = requestPath(request, key, signal);
  inFlight.set(key, promise);

  /*
   * Drop this from the shared table the instant its caller abandons it.
   *
   * Without this, sharing in-flight promises actively harms: an aborted request
   * resolves to null, and a caller from a newer plan asking the same question in
   * the same tick is handed that dead promise, gets null, and marks the segment
   * approximate. The caller records the key as asked-about, so it is never
   * retried, and that leg stays a straight line for as long as the plan lives.
   *
   * It is not a rare race. A plan is superseded several times in the first
   * second of use: geolocation resolves, the feed lands, the parameter debounce
   * settles. Whichever legs happened to be in flight at that moment were the
   * ones that never traced, which reads as "only part of my trip works".
   *
   * `finally` in requestPath also deletes the entry, but only after the await
   * settles, which is a microtask too late for a caller in the same tick.
   */
  signal?.addEventListener(
    "abort",
    () => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    },
    { once: true },
  );

  return promise;
}
