# Phase 0 Research: Value Proposition Clarity and Data Control

**Feature**: 005-value-proposition-clarity
**Date**: 2026-07-28

Every claim below was checked against the code in this repository at the commit this branch
started from. Line references are to that state. Nothing here is written from memory.

---

## R1. What signal defers the amounts

**Decision**: `TracedItinerary.settled` is the gate. No amount renders while it is false.

**Rationale**: The spec's FR-408b makes an obligation of something that has to be true of the
existing machinery: an itinerary must reach a state in which the amounts can be shown, on *every*
path including total failure of the routing source. Three things were verified to establish that
`settled` has this property.

1. `fetchPath` is total and always resolves. `lib/routing.ts:170` returns a cached path
   synchronously, an in-flight promise, or `Promise.resolve(null)` when the request ceiling is
   reached (`lib/routing.ts:187`). The one path that issues a network request, `requestPath`, wraps
   everything in `try/catch` and returns `null` for abort, offline, CORS, non-2xx, malformed JSON
   and implausible geometry (`lib/routing.ts:154`). There is no branch on which a caller waits
   forever.
2. `settled` is `isSettled(geometry, steps)`, which is true once no step is `pending`
   (`lib/types.ts:283`). Since every request resolves and each answer folds in through `applyPath`,
   every step leaves `pending` in bounded time.
3. The correction loop terminates. `nextAction` returns `exhausted` rather than `replan` once
   `state.rounds >= MAX_CORRECTION_ROUNDS` (`lib/route-refinement.ts:315`), and the loop in
   `useTracedItinerary` also breaks when a corrected plan fails to compute
   (`components/useTracedItinerary.ts:139`). Both exits leave a settled state.

`settled` is also correct while a correction is in flight, which is what FR-408a's second clause
needs: a correction produces a new itinerary with new outstanding requests, so `settled` returns to
false and the amounts defer again without any extra bookkeeping.

Availability: when `plan.ok` is true, `traced` is never null. The `state` memo returns null only
when `itinerary === null || stations === undefined` (`components/useTracedItinerary.ts:117`), and a
plan exists only when a snapshot does (`components/PlannerShell.tsx:238`). So `traced.settled` is
always readable wherever the amounts are wanted.

**Alternatives rejected**:

- *A timeout* — would show an amount computed from an itinerary still being revised, which is the
  exact failure the deferral exists to prevent, and would need tuning against a network we do not
  control.
- *A separate "priced" flag threaded through the refinement state* — duplicates a fact
  `settled` already carries, and creates a second thing that can disagree with the first.
- *Deferring the whole summary* — contradicts feature 004's own rule (FR-321, FR-325) that the plan
  is readable before any tracing completes, and would leave the panel empty on first paint.

---

## R2. Computing the cost of the trip as planned

**Decision**: One new pure function in `lib/pricing.ts`:

```
plannedCost(itinerary, params) -> number
```

the sum of `overageCost(step.duration, params)` over the itinerary's bike segments.

**Rationale**: FR-404 forbids asserting a plan is free on the strength of how it was built. The
existing comment at `components/TripSummary.tsx:14-19` makes exactly that assertion, and it is now
wrong. The reasoning it rests on is still half true and worth stating precisely:

- The planner filters every candidate edge with `if (ride > budget) continue`
  (`lib/planner.ts:271`), where `budget = freeWindow - safetyMargin`. So a segment *as first planned*
  is always under the free window and always costs zero.
- But `applyPath` replaces a segment's duration with one derived from measured geometry
  (`lib/route-geometry.ts:245`: `path.length / cyclingSpeed + segmentOverhead`), and correction can
  give up with a segment still over budget. That segment can exceed the free window, and then the
  operator bills for it.

So the cost is zero in the ordinary case and non-zero in the exhausted case, and the only way to
know which is to compute it. Summing per segment rather than over the total is what the tariff
actually does: the meter runs from unlock to dock, once per ride.

The arithmetic is symmetric with `noStopRide` by construction. `BikeSegment.duration` includes one
`segmentOverhead` (`lib/planner.ts:260`), and so does the no-stop ride's duration
(`lib/pricing.ts:71`). Both are measured against `freeWindow`, never against `segmentBudget` — the
safety margin is our caution and the operator does not bill for it (`lib/pricing.ts:28-32`). The two
figures are therefore comparable, which is the entire point of putting them side by side.

**Alternatives rejected**:

- *Charging `overageCost(itinerary.totalDuration)`* — treats a multi-segment trip as one ride. It is
  not; that is the product's whole thesis.
- *Reading cost off `remaining`* — `remaining` is banded against the segment budget, not the free
  window, so it would invent a fee for the safety margin.

---

## R3. Persisting the parameter set

**Decision**: A new module `lib/params-store.ts`, modelled directly on `lib/path-store.ts`, holding
one versioned key. `PlannerShell` hydrates from it after mount, writes on change, and clears it on
reset.

**Rationale**: Verified that nothing persists parameters today —
`components/PlannerShell.tsx:75-76` initialises `useState(DEFAULT_PARAMETERS)` on every load, and
the only browser storage in use is the language (`components/LocaleProvider.tsx:62`) and the path
cache (`lib/path-store.ts`). FR-413a therefore needs a new store, not a new caller of an old one.

`path-store.ts` already solves every hard part of this and its contract is stated at its head: it is
total, it returns null rather than throwing, it survives a private window, a full quota, and an
absent `localStorage`. The `storage()` helper at `lib/path-store.ts:56` — reading the property
*inside* the try, because the access itself can throw — is the non-obvious part and is reused
verbatim in shape. FR-413c is satisfied by construction if that pattern is followed.

Validation on read is `validateParameters` (`lib/params.ts:162`), which already exists and already
returns a corrected set rather than throwing. FR-413b needs it applied on hydration and needs the
corrected set used silently — the existing `describeCorrection` path is for a *reader's* mistake and
must not fire for a stored value they cannot see.

**Hydration**: the build has no reader, so the prerendered HTML must be the defaults. Reading
storage during render would produce a hydration mismatch. The parameters are read in an effect after
mount, exactly as `PanelFooter` defers its first `Date.now()` (`components/PanelFooter.tsx:121-135`)
and for the same stated reason. A one-frame flash from defaults to stored values is the accepted
cost; it is invisible in practice because no plan exists that early.

**Interaction with the debounce**: `PlannerShell` already debounces `parameters` into `settled` at
150ms (`components/PlannerShell.tsx:112-118`). Writes to storage hang off `settled`, not
`parameters`, so dragging a slider writes once rather than on every frame.

**Reset**: `SettingsOverlay` already has a reset that calls `onChange(DEFAULT_PARAMETERS)`
(`components/SettingsOverlay.tsx:353`). FR-412a requires it to also clear the stored key rather than
store the defaults, so that a future change to a documented default reaches the reader instead of
being masked by a stored copy of the old one.

**Alternatives rejected**:

- *Persisting only `freeWindow` and `overageRate`* — settled against during clarification. A reader
  whose tariff is remembered while their safety margin silently reverts gets amounts computed
  against assumptions they did not choose.
- *Storing each parameter under its own key* — eleven keys to sweep and eleven ways to hold a
  partially-restored set. One key, one JSON object, one validation.
- *Reusing the path store's prefix* — the purge control clears everything under `redock:path:`
  (`lib/path-store.ts:193`), and purging cached geometry must not reset a reader's tariff.

---

## R4. Making refresh actually refresh, without breaking principle V

**Decision**: A new export from `lib/feed-client.ts`:

```
requestRefresh() -> Promise<{ ok: true; status: FeedStatus } | { ok: false; waitSeconds: number }>
```

It is the only entry point the refresh control uses. It never bypasses the floor.

**Rationale**: The defect is one argument. `loadFeed` calls `loadStationSnapshot()` with no options
(`components/PlannerShell.tsx:130`), so the cache branch at `lib/feed-client.ts:94` returns the
snapshot the reader is already looking at whenever `sinceFetchSeconds < floor`, where
`floor = max(snapshot.ttl, MIN_REFRESH_INTERVAL_SECONDS)` — 60 seconds against BIXI's declared
`ttl: 10` (`lib/endpoints.ts:52`). The `force` option already exists and is never passed by any
caller.

The naive fix — passing `force: true` — is wrong, and this is the part worth being careful about.
`force` bypasses the floor check *entirely* (`lib/feed-client.ts:94`), so wiring it to a button
hands a reader a way to poll a courtesy endpoint as fast as they can tap. That is precisely the
behaviour principle V names as how public feeds get closed.

Putting the floor check in `PlannerShell` instead would work but leaves the footgun loaded: the next
caller of `loadStationSnapshot({force:true})` reintroduces the problem, and nothing in the type
system objects. `requestRefresh` puts the decision in the module that owns the cache, returns the
remaining wait as a value the UI can word, and leaves `force` for tests. Constitution compliance
stops depending on a caller remembering.

FR-421's second obligation — never faster than the feed's `ttl` — is already discharged, since the
floor is the *maximum* of the ttl and our own 60s.

**Alternatives rejected**:

- *Passing `force: true` from the shell* — see above.
- *Polling on a timer* — the constitution permits refresh on demand and nothing else; an interval
  would issue requests for a reader who is not looking.
- *Removing the 60s floor and relying on `ttl: 10`* — six requests a minute against a courtesy
  endpoint, which `lib/endpoints.ts:46-52` explicitly rejects.

---

## R5. Where the amounts go, and what holds their place

**Decision**: The amounts move into `TripSummary`. `NoStopComparison` is deleted, and its
disclosure, its state and its chevron go with it. The summary renders one of four cases:

| Case | Condition | Shown |
|---|---|---|
| Pending | `!traced.settled` | duration, stops, and a held space stating figures are being worked out |
| No stop needed | `stopCount === 0` | duration, and one sentence (FR-406a) |
| Nothing saved | `stopCount > 0` and `noStop.cost === 0` | duration, stops, and one sentence (FR-406) |
| The comparison | `stopCount > 0` and `noStop.cost > 0` | duration, stops, three amounts, assumptions |

**Rationale**: FR-403 forbids the fold, so the component whose entire purpose is the fold has
nothing left to do. Deleting it rather than emptying it also removes the `useState` at
`components/NoStopComparison.tsx:46` and the comment above it explaining why the disclosure must
survive a parameter change — a subtlety that ceases to exist once nothing collapses.

The four cases are mutually exclusive and cover every plan, which is what makes them testable
one by one. `noStop === null` (no bike segment, or anchor stations missing from the snapshot) folds
into the "no stop needed" branch's wording per FR-409: the summary says what it can.

**Reserved space**: FR-408a requires the space to be held so the amounts' arrival displaces nothing.
The pending state therefore renders the same block height as the resolved one. This is what SC-007
measures.

**Alternatives rejected**:

- *Keeping `NoStopComparison` and rendering it expanded* — leaves a component named for a fold that
  no longer folds, below the trail where FR-403 forbids it.
- *A fifth "error" case* — there is none. Every branch of `noStopRide` returns either a ride or
  null, and null has a home.

---

## R6. The header subtitle

**Decision**: `PanelHeader` gains a second line under the wordmark, wrapping rather than truncating.
No new control, no overlay, no menu entry.

**Rationale**: FR-417 became a prohibition during clarification, so the only work is one line of
text. The placement is forced: `docs/ui-guidelines.md` closes the footer to a third row and forbids
a navigation bar on the planner, and the header is the surface that document nominates for the
planner's merged entries — which `components/PanelHeader.tsx:9-12` already records, along with the
reason (a permanent bar would cost 56px of map height on a phone).

FR-419a forbids truncation in any language. The header's current row is a flex with the wordmark and
the language toggle (`components/PanelHeader.tsx:32`); the subtitle goes below that row, full width,
so it has the whole panel width to wrap into and competes with nothing. Two lines at the narrowest
supported width is acceptable; an ellipsis is not.

**Cost**: this is permanent panel height on every screen, including the collapsed rest position
where FR-402a has just claimed more room for the summary. The spec's edge case names this trade and
holds the sentence to one line of content. Nothing else may join it.

---

## R7. Wording and the message registry

**Decision**: All new strings land in `lib/i18n/messages/fr.ts` and `lib/i18n/messages/en.ts`. No
string is written in a component, and no component learns a language name.

**Rationale**: `eslint.config.mjs` enforces that only `components/LocaleProvider.tsx` may import the
registry (`lib/i18n/registry.ts:9-18`), and `tests/unit/i18n-coverage.test.ts` fails the build on a
key present in the reference and missing from a translation. Both gates apply here unchanged.

**Voice**: the product uses tutoiement — "Ton abonnement offre {window} par trajet"
(`fr.ts`, `empty.lead`), "Tu paierais" (`fr.ts`, `noStop.wouldPayBefore`). New wording matches. The
tagline's required sense is "optimise your BIXI trips so that you pay no overage" (FR-414); the
exact French is a writing task governed by `docs/ui-guidelines.md`, not by this plan.

**Keys that become wrong rather than merely incomplete**, and must be rewritten rather than kept:

- `summary.noStops` — "Aucun arrêt. Ce trajet est gratuit." FR-406a needs it to also state that the
  trip fits the free window and what it costs.
- `summary.stops` — both plural forms end "Ce trajet est gratuit.", which FR-404 forbids asserting
  unconditionally.
- The whole `noStop` group — `reveal`, `hide` and the disclosure vocabulary describe a fold that
  FR-403 removes. The figures' wording survives in new keys; the fold's does not.

Arithmetic stays out of the bundles. `lib/format.ts` already owns the rounding, the hours/minutes
split and `formatMoney` through `Intl` (`lib/format.ts:150`), for a stated reason (FR-207a): a
computation written once per language drifts.

---

## R8. Test surface

**Decision**: New unit tests over the pure additions; existing component tests extended.

- `plannedCost` — pure, tested directly: a plan whose segments all fit (zero), a plan with one
  segment past the free window (the exact overage), the safety margin having no effect on the
  figure, a zero rate producing zero.
- `lib/params-store.ts` — round trip, absent key, corrupt JSON, wrong schema version, a set that
  fails `validateParameters`, and `localStorage` throwing on access. `tests/unit/path-store.test.ts`
  is the model for the last one.
- `requestRefresh` — inside the floor returns `waitSeconds` and sends nothing; past the floor
  fetches; a failure keeps the previous snapshot. `clearFeedCache` (`lib/feed-client.ts:28`) already
  exists for test isolation.
- `TripSummary` — one test per case in R5's table, plus the pending-to-resolved transition.
- `tests/unit/no-stop-comparison.test.tsx` is deleted with the component; its assertions about the
  figures move to the summary's tests.

Principle III holds throughout: the four-case decision is a function of `(itinerary, noStop,
settled)` and is tested without a renderer wherever it can be.

---

## Open questions carried into implementation

None. The one risk the checklist flagged — whether settling is reachable on every failure path —
is resolved in R1 and required no change to feature 004.
