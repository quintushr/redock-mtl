# Phase 1 Data Model: Value Proposition Clarity and Data Control

**Feature**: 005-value-proposition-clarity
**Date**: 2026-07-28

Types live in `lib/types.ts` alongside the existing ones. Everything here is pure data: no
behaviour, no React, no knowledge of how a value was fetched or will be rendered (principle III).

---

## 1. `TripCostComparison`

The three figures the summary carries. Derived, never stored, no identity.

```ts
/**
 * What the trip costs with the proposed stops, what it would cost ridden
 * straight through, and the gap between them (FR-401).
 *
 * Both amounts are measured against the free window, never against the segment
 * budget: the safety margin is our own caution and the operator does not bill
 * for it. That is what makes the two figures comparable, which is the entire
 * reason they sit side by side.
 */
export interface TripCostComparison {
  /** Overage the planned itinerary implies. Zero unless correction gave up. */
  planned: number;
  /** Overage the same trip ridden with no stop implies. */
  withoutStops: number;
  /** `withoutStops - planned`. Never negative. */
  saved: number;
}
```

**Derivation**: `planned` is `plannedCost(itinerary, params)`; `withoutStops` is `noStop.cost` from
the existing `NoStopRide`. `saved` is their difference.

**Invariants**:

- `planned >= 0`, `withoutStops >= 0`, `saved >= 0`.
- `saved === 0` exactly when the stops save nothing, which is the FR-406 branch.
- `withoutStops < planned` is impossible for a plan the planner built: the direct ride is at least
  as long as any one of its segments. The type does not encode this; the tests assert it.

**Not constructed when** `noStop === null` (no bike segment, or the anchor stations left the
snapshot). The summary then takes the FR-409 branch and states what it can.

---

## 2. `SummaryCase`

Which of the four mutually exclusive things the summary is saying. A value rather than a chain of
conditionals in a component, so the decision is a pure function with its own tests.

```ts
export type SummaryCase =
  /** The itinerary is still being revised; no amount may be shown (FR-408a). */
  | { kind: "pending" }
  /** No stop at all: one sentence, no figures (FR-406a). */
  | { kind: "no-stop-needed"; cost: number }
  /** Stops, but they save nothing: one sentence (FR-406). */
  | { kind: "nothing-saved"; cost: number }
  /** The argument, in three figures plus the time it costs (FR-401, FR-410). */
  | {
      kind: "comparison";
      costs: TripCostComparison;
      /** How long the direct ride takes. Worded as an approximation. */
      directDuration: Seconds;
      /** Negative means the direct ride is faster than the plan. */
      deltaAgainstPlan: Seconds;
    };
```

The two time fields are carried here rather than left for the component to pull off `NoStopRide`,
and that is the point: FR-410 requires the time comparison to stay *alongside* the amounts, and a
figure the component fetches from a different source than the amounts beside it is one that can
disagree with them. Both come from the same `NoStopRide` this function already holds.

**Decided by** a pure function in `lib/pricing.ts`:

```ts
summaryCase(
  itinerary: Itinerary,
  noStop: NoStopRide | null,
  settled: boolean,
  params: PlanningParameters,
): SummaryCase
```

**Decision order**, which is also the test order:

| # | Condition | Result |
|---|---|---|
| 1 | `!settled` | `pending` |
| 2 | `itinerary.stopCount === 0` | `no-stop-needed` |
| 3 | `noStop === null` | `no-stop-needed` (FR-409: say what we can) |
| 4 | `noStop.cost === 0` | `nothing-saved` |
| 5 | otherwise | `comparison` |

Order matters and is load-bearing. Case 1 precedes all others because FR-408a is unconditional. Case
3 precedes case 4 because a null ride has no `cost` to read.

---

## 3. `RefreshOutcome`

What asking for fresh availability produced.

```ts
/**
 * A refusal is a value, not an error (FR-421). The floor is the project's own
 * courtesy limit and a reader who hits it is told how long remains, not shown a
 * failure.
 */
export type RefreshOutcome =
  | { ok: true; status: FeedStatus }
  | { ok: false; waitSeconds: Seconds };
```

**Invariant**: `waitSeconds > 0` whenever `ok` is false. A zero wait means the fetch was permitted,
so `ok` would be true.

---

## 4. Stored parameter set

Not a new domain type. `PlanningParameters` is what is stored; the store owns only its wire form.

**Storage key**: `redock:params:v1`. A distinct root from `redock:path:`, deliberately: the settings
overlay's purge control clears everything under the path prefix (`lib/path-store.ts:193`), and
purging cached geometry must not reset a reader's tariff.

**Wire form**: the `PlanningParameters` object as JSON, plus a schema version.

```ts
interface StoredParameters {
  /** Schema version. A bump invalidates rather than migrates. */
  v: number;
  /** The parameter set as last chosen. */
  p: PlanningParameters;
}
```

**Read contract** (`readStoredParameters(): PlanningParameters | null`):

| Situation | Result |
|---|---|
| Storage absent, or accessing it throws | `null` |
| Key absent | `null` |
| JSON unparseable | `null`, key removed |
| `v` does not match | `null`, key removed |
| Any field missing or not a number | `null`, key removed |
| Parses but fails `validateParameters` | the corrected set, silently (FR-413b) |
| Valid | the set |

`null` means "use the documented defaults". No branch throws and no branch surfaces anything to the
reader (FR-413c).

**Write contract** (`writeStoredParameters(params): void`): total. A quota error, a security error,
or storage vanishing mid-write is swallowed — the parameters still work for the session, only their
persistence is lost. Mirrors `writeStoredPath` (`lib/path-store.ts:186`).

**Clear contract** (`clearStoredParameters(): void`): removes the key. Called by reset, so a later
change to a documented default reaches the reader rather than being masked (FR-412a).

---

## 5. Changes to existing types

None. `PlanningParameters`, `NoStopRide`, `Itinerary` and `FeedStatus` are unchanged.

This is worth stating because the clarification session widened the feature twice and neither
widening reaches the domain types. Parameter persistence stores an existing type; the deferral reads
an existing field (`TracedItinerary.settled`); the refresh returns a new wrapper around an existing
`FeedStatus`. The three new types above are all additive.

---

## 6. State transitions

The only lifecycle in this feature is the summary's, and it is driven entirely by inputs it does not
own.

```
        plan computed
             │
             ▼
        ┌─────────┐   every path answered,
        │ pending │   correction settled or exhausted
        └────┬────┘
             │
             ▼
   ┌──────────────────┐
   │ one of the three │
   │  resolved cases  │
   └────────┬─────────┘
            │  reader changes a parameter, an endpoint,
            │  or a refresh returns new availability
            ▼
        back to pending
```

`pending` is reachable from any resolved state and every resolved state is reachable from `pending`.
There is no terminal state and no state the summary can be stuck in: R1 establishes that `settled`
is reached on every path, including one where no geometry is ever obtained.

The summary holds none of this. It is a function of `(itinerary, noStop, settled, params)`, all of
which arrive as props.
