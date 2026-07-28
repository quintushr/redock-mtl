import { DEFAULT_PARAMETERS, validateParameters } from "./params";
import type { PlanningParameters } from "./types";

/**
 * The reader's planning parameters, kept across visits.
 *
 * The third impure module under lib/, alongside feed-client.ts and routing.ts,
 * and modelled on path-store.ts, which solved every hard part of browser storage
 * for this project already.
 *
 * Why it exists: the amounts the summary shows are computed from the free window
 * and the overage rate, and those are the reader's own — a subscriber on a
 * different plan corrects them and the figures follow. Without persistence that
 * is true only until they close the tab, after which the interface quietly goes
 * back to showing them the documented defaults as if they were theirs.
 *
 * Only the tariff pair would have been the smaller change and the wrong one. A
 * reader whose rate was remembered while their safety margin silently reverted
 * would get amounts computed against a plan they did not choose. Either the
 * whole set is theirs or none of it is.
 *
 * Everything here is total. localStorage throws in a private window, throws when
 * the quota is full, and does not exist at all in some embedded contexts; none
 * of that may surface to a rider who never asked for persistence. The contract
 * is that this module hands back a parameter set or hands back nothing.
 *
 * Holds no rules. What is valid is params.ts's business, and this module asks it
 * rather than deciding.
 */

/**
 * Deliberately a different root from `redock:path:`.
 *
 * The settings overlay's purge control clears that whole prefix, and a rider
 * emptying their cached route geometry must not thereby lose their tariff.
 */
export const PARAMS_STORAGE_KEY = "redock:params:v1";

/** Bumped when the shape changes. A bump invalidates rather than migrates. */
const SCHEMA_VERSION = 1;

/**
 * The one place that touches the global.
 *
 * Returns null rather than throwing when storage is unavailable, which in a
 * private window is the normal case rather than an exceptional one. The property
 * read is inside the try because accessing it is itself what throws.
 */
function storage(): Storage | null {
  try {
    const store = globalThis.localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

/** Every key of a parameter set, derived so a new parameter cannot be forgotten. */
const KEYS = Object.keys(DEFAULT_PARAMETERS) as (keyof PlanningParameters)[];

/**
 * A stored payload turned back into parameters, or null.
 *
 * Every field is checked. A partially restored set is worse than none: it would
 * mix the reader's choices with defaults they never saw, and the amounts would
 * rest on assumptions nobody held.
 */
function decode(raw: string): PlanningParameters | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const { v, p } = parsed as Record<string, unknown>;
  if (v !== SCHEMA_VERSION) return null;
  if (typeof p !== "object" || p === null || Array.isArray(p)) return null;

  const candidate = p as Record<string, unknown>;
  const restored = {} as PlanningParameters;

  for (const key of KEYS) {
    const value = candidate[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    restored[key] = value;
  }

  return restored;
}

/**
 * The reader's parameters, or null when there are none to be had.
 *
 * Null means "use the documented defaults", and it covers every unhappy path:
 * no storage, no key, unreadable bytes, a schema this version does not know, a
 * field that is missing or is not a number.
 *
 * A set that parses but does not validate is corrected rather than discarded,
 * and corrected *silently*. The rider cannot see this value and did not just
 * type it, so the correction notice — which exists to explain a mistake they
 * made — would be reporting a mistake to the wrong person (FR-413b).
 */
export function readStoredParameters(): PlanningParameters | null {
  const store = storage();
  if (store === null) return null;

  try {
    const raw = store.getItem(PARAMS_STORAGE_KEY);
    if (raw === null) return null;

    const decoded = decode(raw);
    if (decoded === null) {
      // Dead weight in a store the rider did not consent to filling.
      store.removeItem(PARAMS_STORAGE_KEY);
      return null;
    }

    const validation = validateParameters(decoded);
    return validation.ok ? decoded : validation.corrected;
  } catch {
    return null;
  }
}

/**
 * Remembers a parameter set.
 *
 * A quota error is caught and treated as "this cannot be kept", never as a
 * failure of anything the rider was doing: the parameters still work for this
 * session, and only their persistence is lost.
 */
export function writeStoredParameters(params: PlanningParameters): void {
  const store = storage();
  if (store === null) return;

  try {
    store.setItem(
      PARAMS_STORAGE_KEY,
      JSON.stringify({ v: SCHEMA_VERSION, p: params }),
    );
  } catch {
    // Quota exceeded, security error, or storage vanishing mid-write.
  }
}

/**
 * Forgets the reader's parameters.
 *
 * Removes the key rather than storing the defaults, and the difference matters
 * later rather than now: a stored copy of today's defaults would mask any future
 * change to them, on the machine of every reader who ever pressed reset
 * (FR-412a).
 */
export function clearStoredParameters(): void {
  const store = storage();
  if (store === null) return;
  try {
    store.removeItem(PARAMS_STORAGE_KEY);
  } catch {
    // The rider asked to forget, and either it is already forgotten or the
    // browser will not let us look.
  }
}
