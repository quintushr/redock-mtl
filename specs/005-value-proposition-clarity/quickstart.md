# Quickstart: Value Proposition Clarity and Data Control

**Feature**: 005-value-proposition-clarity

How to run, see and verify this feature. No account, no key, no environment variable — `git clone`,
install, dev (principle II).

---

## Run it

```bash
npm install
npm run dev
```

The planner is the root route. Everything below is reachable from a browser with no setup.

```bash
npm test          # vitest run
npm run lint      # eslint
npm run build     # must still produce a static export
```

---

## See each story

### US1 — the saving is the headline

1. Enter a start and a destination far enough apart that the planner returns at least one stop.
   Anywhere across central Montréal will do.
2. Watch the summary. The duration and the stop count appear immediately; the amounts appear a
   moment later, once the route tracing settles.
3. All three figures — with stops, without stops, the difference — are in the summary itself, at the
   same level as the duration. Nothing was clicked, nothing was expanded, and the itinerary trail was
   not scrolled past.

**The zero-stop case**: pick two points a few hundred metres apart. The summary says no stop is
needed rather than showing two identical amounts and a zero.

**The exhausted case** (FR-404, hard to trigger by hand): a plan whose measured geometry pushes a
segment past the free window and whose correction gives up. Covered by
`tests/unit/pricing-planned-cost.test.ts` rather than by clicking.

### US2 — a first-time reader understands the idea

1. Load with no endpoints. One sentence sits under the product name in the panel header; the fuller
   explanation fills the result region below.
2. Plan a trip. The fuller explanation gives way to the result with no gap; the header sentence does
   not move.
3. Clear an endpoint. The fuller explanation comes back.
4. Switch language. The sentence wraps rather than truncating, at every panel width.

### US3 — the rider renews the availability data

1. Note the age in the footer's second row.
2. Press refresh **immediately**. Nothing is fetched; the row states how long remains.
3. Wait past 60 seconds and press again. A request goes out and the age drops.

Watch the network panel while doing this: however many times the button is pressed, requests never
exceed one per 60 seconds (SC-008).

### Parameter persistence

1. Open the settings and change the free window or the overage rate.
2. Reload the page. The values are still there and the amounts still reflect them.
3. Press reset. The stored values are cleared, not overwritten with the defaults.

**Storage denied**: open a private window, or block storage for the origin. The planner works
normally, parameters behave as a session-only value, and no error is shown (FR-413c, SC-012).

---

## Verify the constitution gates by hand

**Zero cost (I)**: `npm run build` produces a static export. No server route, no serverless
function, no database is introduced by this feature.

**No keys (II)**: nothing above required an account, a token or an environment variable. The tariff
default is a committed constant read from the operator's published page by a maintainer, never
fetched at runtime.

**Pure core (III)**: `plannedCost` and `summaryCase` are functions of their arguments. Called twice
with the same inputs they return the same result, which is why their tests need no renderer, no
clock and no network.

**Honest estimates (IV)**: every amount on screen states the free window, the rate, that a
mechanical bike is assumed, and that taxes are excluded. No amount appears while the itinerary is
still being revised, and no amount changes on its own once shown.

**Data sources (V)**: the refresh floor is the thing to check. `requestRefresh` owns it, so no
component can bypass it. `lib/feed-client.ts`'s `force` option still exists for tests and is called
by no component — verify with:

```bash
grep -rn "force: true" components/    # must return nothing
```

---

## The three checks most likely to catch a regression

1. **Does an amount ever appear before the itinerary settles?** The whole deferral rests on
   `TracedItinerary.settled`. If `TripSummary` is ever handed a hard-coded `true`, FR-408a is
   silently gone and nothing else fails.

2. **Does the refresh floor still hold?** The grep above. A future caller reaching for
   `loadStationSnapshot({force:true})` from a component reintroduces exactly the polling problem
   `requestRefresh` was written to close.

3. **Do both message bundles carry every new key?** `npm test` fails on a missing translation via
   `tests/unit/i18n-coverage.test.ts`. `npm run i18n:report` gives the readable version.

---

## Files worth reading first

- [`contracts/core-modules.md`](./contracts/core-modules.md) — the signatures and their obligations.
- [`contracts/ui-surface.md`](./contracts/ui-surface.md) — what changes on screen, and the three
  amendments `docs/ui-guidelines.md` needs in the same change.
- [`research.md`](./research.md) §R1 — why `settled` is a safe gate, including why a plan whose
  tracing fails entirely still shows its amounts.
- [`research.md`](./research.md) §R4 — why `force: true` is the wrong fix for the refresh button.
