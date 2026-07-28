# Contract: Core Modules

**Feature**: 005-value-proposition-clarity

The signatures this feature adds or changes under `lib/`, and the obligations each carries. Follows
the convention of `specs/004-real-route-geometry/contracts/core-modules.md`.

---

## `lib/pricing.ts` (extended)

Pure. No clock, no network, no global state. Never throws.

### `plannedCost(itinerary, params) -> number`

```ts
export function plannedCost(
  itinerary: Itinerary,
  params: PlanningParameters,
): number;
```

The overage the plan itself implies: `overageCost(step.duration, params)` summed over the
itinerary's bike segments.

**Obligations**:

- Per segment, never over `itinerary.totalDuration`. The meter runs once per ride, from unlock to
  dock, and a multi-segment trip is not one ride.
- Measured against `params.freeWindow`, never against `segmentBudget`. The safety margin is our
  caution; the operator does not bill for it. This is what makes the result comparable with
  `noStopRide().cost`.
- Returns `0` for a walk-only itinerary, and for any plan whose segments all fit — which is every
  plan as first built, since `lib/planner.ts:271` filters edges over budget.
- Returns a positive amount when measured geometry pushed a segment past the free window and
  correction gave up (FR-404).
- Never negative. `overageCost` already floors the overage at zero.

**Tests**: all segments fitting → `0`; one segment past the free window → exactly that segment's
overage; changing `safetyMargin` alone → unchanged; `overageRate: 0` → `0`.

### `summaryCase(itinerary, noStop, settled, params) -> SummaryCase`

```ts
export function summaryCase(
  itinerary: Itinerary,
  noStop: NoStopRide | null,
  settled: boolean,
  params: PlanningParameters,
): SummaryCase;
```

Which of four things the summary says. See `data-model.md` §2 for the decision table.

**Obligations**:

- Total. Every input combination yields exactly one case; there is no error case and no `null`.
- `!settled` wins over everything (FR-408a is unconditional).
- `noStop === null` is tested before `noStop.cost`, so a missing ride is never dereferenced.
- Deterministic: called twice with the same arguments it returns the same case, which is what makes
  it testable without a renderer.

**Tests**: one per row of the decision table, plus `settled === false` with each of the other three
inputs, to prove precedence.

---

## `lib/params-store.ts` (new)

Impure — it touches `globalThis.localStorage`. The **third** such module under `lib/`, alongside
`feed-client.ts` and `routing.ts`, and it holds no rules: what to store and when to look is the
caller's decision.

Every function is total. `localStorage` throws in a private window, throws when the quota is full,
and is absent in some embedded contexts; none of that may reach the reader (FR-413c). The
`storage()` helper from `lib/path-store.ts:56` — reading the property *inside* the `try`, because
the access itself can throw — is reused in shape.

### `readStoredParameters() -> PlanningParameters | null`

`null` means "use the documented defaults". See `data-model.md` §4 for the full table.

**Obligations**:

- Never throws, on any input or in any storage state.
- A corrupt or wrong-version entry is removed on read, so a bounded store does not carry dead weight.
- A set that parses but fails `validateParameters` returns the **corrected** set, silently. The
  reader is shown nothing: `describeCorrection` exists for a mistake they made, and they did not
  make this one.

### `writeStoredParameters(params) -> void`

**Obligations**: never throws. A quota or security error is swallowed; the parameters still work for
the session and only their persistence is lost.

### `clearStoredParameters() -> void`

**Obligations**: removes only this feature's key. Never touches `redock:path:` or the language key.

---

## `lib/feed-client.ts` (extended)

### `requestRefresh() -> Promise<RefreshOutcome>`

```ts
export function requestRefresh(): Promise<RefreshOutcome>;
```

The **only** entry point the refresh control may use.

**Obligations**:

- Never fetches inside the floor, where `floor = max(snapshot.ttl, MIN_REFRESH_INTERVAL_SECONDS)` —
  the same expression `loadStationSnapshot` already uses at `lib/feed-client.ts:96`. Returns
  `{ ok: false, waitSeconds }` with the remainder (FR-421).
- Fetches when the floor has elapsed, bypassing the cache. This is the defect being fixed:
  `loadFeed` currently calls `loadStationSnapshot()` with no options
  (`components/PlannerShell.tsx:130`), so the cache branch returns the snapshot the reader is
  already looking at.
- Never throws. A network failure comes back as `{ ok: true, status }` where the status carries the
  previous snapshot, per the existing catch at `lib/feed-client.ts:138` (FR-424).
- Collapses onto an in-flight request rather than issuing a second (FR-423).

**Why this and not `force: true`**: `force` bypasses the floor entirely
(`lib/feed-client.ts:94`), so wiring it to a button lets a reader poll a courtesy endpoint as fast
as they can tap — the behaviour principle V names as how public feeds get closed. Putting the check
in the component would work today and break the first time someone else calls the module.
`force` stays, for tests.

**Tests**: inside the floor → `ok: false` with a positive wait and **no** `fetch` call; past the
floor → `ok: true` and one call; concurrent calls → one call; a failing fetch with a cached snapshot
→ `ok: true` carrying the stale snapshot. `clearFeedCache()` (`lib/feed-client.ts:28`) provides
isolation between them.

---

## `lib/format.ts` (unchanged)

Stated to be explicit: no new formatter is needed. `formatMoney` (`lib/format.ts:150`) already
renders CAD through `Intl` with the locale's own sign position, and `approximateDuration` already
words the time comparison. The three amounts are three calls to the existing function.

---

## Module boundaries this feature must not cross

- `lib/params-store.ts` MUST NOT import `lib/planner.ts` or any component. It stores bytes.
- `lib/pricing.ts` stays pure and MUST NOT import either store, `feed-client.ts`, or `routing.ts`.
- No component may import `lib/i18n/registry.ts`; `eslint.config.mjs` enforces this and the new
  strings change nothing about it.
- The four-case decision belongs in `lib/pricing.ts`, not in `TripSummary`. Principle III: logic
  expressible as a pure function must not live in a component.
