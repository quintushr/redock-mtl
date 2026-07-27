# Phase 0 Research: Result-First Planner Panel

**Feature**: `002-refonte-affichage-resultat` | **Date**: 2026-07-27

Everything below was verified against the code on branch `001-free-window-trip-planner`, against
`docs/ui-guidelines.md`, or against a primary external source cited inline. Nothing here is written
from memory.

---

## R1. Does `lib/budget.ts` fall inside "forbidden to modify"?

**Decision**: No. `lib/budget.ts` and `tests/unit/budget.test.ts` are deleted, and the
`budgetShare` / `budgetStatus` fields are removed from `BikeSegment`.

**Rationale**: The planning instruction forbids touching "la logique de planification et ses
tests". `lib/budget.ts` is not planning logic. Its own header states its purpose: "The bar length,
the colour band, and the text label in the UI all derive from these two functions". It exists to
feed the display, and it computes *consumed* share, which FR-109 now forbids displaying anywhere.

The feasibility filter that actually decides where stops go does not go through this module. In
`lib/planner.ts`, `addBikeEdges` compares `ride > budget` where `budget` comes from
`segmentBudget(params)` in `lib/params.ts`. `budgetShare` and `budgetStatus` are called only in
`buildItinerary`, to populate two fields that exist purely for `SegmentBudget.tsx` to render.
Deleting them changes no route, no cost and no eligibility decision.

Leaving them in place would contradict the brief's own instruction to delete the code that this
refonte makes useless, and would leave a consumed-share figure in the domain structure that no
requirement permits showing.

**Alternatives considered**:

- *Keep the fields, ignore them in the UI.* Rejected: it preserves exactly the "code d'affichage
  existant qui survit en parallèle du nouveau" the brief forbids, one layer deeper where it is
  harder to notice. A structure that carries a number nothing may render is a trap for the next
  reader.
- *Repurpose `budget.ts` to compute remaining time.* Rejected: the module's thresholds are relative
  shares (0.6, 0.85) and the new ones are absolute durations. Nothing survives but the filename.
  Rewriting a file wholesale under its old name hides the change from review.

**Boundary that does hold**: `lib/planner.ts`'s pruning, graph construction, Dijkstra, heap and
failure handling are untouched. Only `buildItinerary`, which assembles the result structure after
the search has finished, changes. `lib/gbfs.ts`, `lib/geo.ts`, `lib/feed-client.ts`,
`lib/geocode.ts` and `lib/endpoints.ts` are untouched, along with every one of their tests.

---

## R2. Where remaining free time is computed, and what shape it takes

**Decision**: A new pure module `lib/remaining.ts`, called from `buildItinerary` in
`lib/planner.ts`. Each `BikeSegment` gains `remaining: Seconds` and `remainingStatus: RemainingStatus`.
No component recomputes either.

**Rationale**: The instruction is explicit that this is computed in the planning module and exposed
in the itinerary structure, with a unit test. Constitution principle III says the same thing from
the other direction: logic expressible as a pure function must not live in a component.
`docs/ui-guidelines.md` says it a third time: "Le calcul du temps restant appartient à la logique
métier et sort dans la structure de l'itinéraire. Il n'est jamais calculé dans un composant."

Putting the thresholds in their own module rather than inline in `planner.ts` keeps the single
source of truth that `budget.ts` used to provide for the old bands, so the gauge fill, the state
and the accessible label cannot disagree.

**Arithmetic**, settled by the spec's clarification session:

```
budget      = freeWindow - safetyMargin          (lib/params.ts, segmentBudget, unchanged)
remaining   = max(0, budget - segment.duration)
```

`segment.duration` already includes `segmentOverhead`, because `buildItinerary` computes
`rideDuration = edge.cost - cooldown` and the overhead was folded into `edge.cost` by
`addBikeEdges`. So the overhead is charged against the free window, which is what FR-128b requires
of the no-stop ride too.

Docking resets the window, so `remaining` is computed per segment against the full budget and never
accumulates across a stop. This is the same property that makes plain Dijkstra correct here, and
`lib/planner.ts` already documents it.

**Thresholds** (`docs/ui-guidelines.md`, authoritative):

| Remaining | State |
|---|---|
| > 15 min | comfortable |
| 5 to 15 min | neutral |
| < 5 min | alarming |

**Gauge fill**: `remaining / budget`, clamped to `[0, 1]`. Full gauge means the whole usable budget
is in hand. A rider with a 45 minute window and a 5 minute margin sees a full gauge worth 40
minutes, not 45.

**Alternatives considered**:

- *Compute remaining in the component from `duration` and the parameters.* Rejected by three
  separate instructions, listed above.
- *Store the gauge fraction in the itinerary as well.* Rejected: it is `remaining / budget` and the
  component already needs the budget to word the figure. Storing a second derived number invites
  the two to drift.

---

## R3. Default overage rate

**Decision**: `overageRate: 0.19` CAD per minute, before taxes, added to `PlanningParameters` in
`lib/params.ts`. The no-stop view states "hors taxes" alongside the amount.

**Rationale**: Verified 2026-07-27 against the operator's own pricing page,
<https://bixi.com/fr/tarifs/>: a subscriber on a regular (mechanical) BIXI has 45 minutes included
per trip, and beyond that the rate is "19¢ / min." The same page states "Les prix affichés
n'incluent pas les taxes". The operator's support pages give the same figure and add that overage
is billed monthly on the 20th.

This is the figure a rider can check against BIXI's own page, which is what makes the amount
credible. It is also consistent with `freeWindow: 45 * MINUTES`, whose default came from the same
allowance.

**Taxes**: The default is stored pre-tax and labelled pre-tax rather than being silently grossed up
by the Quebec rate. Principle IV asks for conservative defaults, and a pre-tax figure does
understate the final bill by roughly 15%. Labelling was chosen over grossing up because a number
the rider cannot reconcile with the operator's published price reads as wrong, and FR-130 already
requires the amount to state the assumptions it rests on. A user who wants a tax-inclusive figure
raises the rate, which FR-133 makes possible.

**Alternatives considered**:

- *Gross the default up to 0.2185 tax-in.* Rejected on reconcilability, as above. Recorded here so
  the choice is visible rather than accidental.
- *Read GBFS `system_pricing_plans`.* Rejected during clarification: it is not among the four feeds
  `REQUIRED_GBFS_FEEDS` declares, its availability on this provider is unverified, and it would add
  a fetch, a parser and a degraded state to a presentation feature.
- *A separate tax parameter.* Rejected as a parameter that earns its complexity only in a
  multi-jurisdiction product this is not yet.

**Maintenance note**: this is a published price and it will move. `lib/params.ts` already documents
each default with its source and the date it was read; this one follows that convention so a future
reader knows what to re-check.

---

## R4. The mobile bottom sheet, with no component library

**Decision**: One `PlannerPanel` component. Anchoring is CSS only: a bottom-anchored container
below 1024 px and a left-anchored one at and above, driven by a Tailwind breakpoint. The two rest
positions are React state (`collapsed` / `expanded`) applied as a height, with a header button
plus a drag handle to toggle. No third-party sheet, no gesture library.

**Rationale**: `docs/ui-guidelines.md` forbids a third-party component library outright, and
requires that the component be "strictement le même dans les deux cas. Seul son ancrage change. Il
n'existe pas deux mises en page à maintenir." Two rest positions is a two-value state machine, not
a physics problem; a draggable sheet with momentum would be inventing a requirement nobody asked
for.

`dvh` throughout and never `vh`, as the guidelines require, which is also what makes FR-144 hold
when the mobile URL bar shows and hides.

**Alternatives considered**:

- *Native `<dialog>`.* Rejected: a modal dialog makes the map behind it inert, and FR-139 and the
  three-state table in the guidelines require the map to stay live and interactive underneath.
- *CSS scroll-snap for the two rest positions.* Rejected: it puts the panel inside a scroller,
  which competes with the itinerary's own scrolling and makes FR-122's "reading position is
  unchanged" much harder to hold.
- *Two components, one per breakpoint.* Rejected explicitly by the guidelines.

---

## R5. Keeping the map centre, zoom and reading position stable

**Decision**: `MapView` keeps a single stable position in the React tree, mounted once, as a
sibling of the panel rather than a child of anything that re-renders structurally. The panel's
scroll container is likewise a stable node. Opening the assumptions expands a region inside that
container; it does not swap the container out.

**Rationale**: This is the whole of FR-122, FR-123, FR-124 and FR-145, and it is an identity
problem, not a styling one. React remounts a component when its position or key in the tree
changes; a remounted `MapView` builds a new MapLibre instance at the default camera, which resets
centre and zoom. The current `PlannerShell` already relies on this: `MapView` is mounted once and
the camera is moved only through the explicit `focus` prop, which carries an incrementing `id` so
that repeated focus on the same points still fires. That mechanism is kept exactly as it is.

The restructure moves `MapView` from a flex sibling in a two-column row to a full-frame layer under
an overlay panel. That is a change of CSS and of the wrapper element, and the risk is precisely
that the JSX edit accidentally relocates `MapView` under a conditionally rendered node. Called out
here so the implementation and its review both watch for it.

**Verification**: jsdom cannot prove a camera did not move, and MapLibre needs WebGL, which jsdom
does not provide. This is checked by hand against `quickstart.md`, not by unit test. Stated rather
than papered over.

---

## R6. What can and cannot be verified by test

**Decision**: Split the success criteria explicitly.

| Verifiable by unit test (vitest + jsdom) | Verified by hand against `quickstart.md` |
|---|---|
| SC-005: every ride step reports remaining, no step reports consumed time or a percentage | SC-001: two-stop trip readable at 700 px with no scroll |
| SC-007: comparison reachable in one action, reports duration and amount | SC-004: map centre and zoom unchanged across a parameter change |
| SC-010: no clock time in rendered output | SC-006: two gauges rankable without reading figures |
| SC-002: no parameter control precedes the result in DOM order | SC-009: contrast, focus visibility, 360 px width |
| R2's arithmetic, including the reset at each stop | SC-011, SC-012: map visible, sheet at most 65% height |

**Rationale**: jsdom does not lay out. It has no viewport height, no scrollbars, no computed
geometry, and it does not run MapLibre. Claiming a green test proves SC-001 would be false. The
existing suite already draws this line: `tests/unit/segment-budget.test.tsx` asserts accessible
names and text content, never sizes.

`tests/unit/segment-budget.test.tsx` is deleted along with the components it renders, and replaced
by tests over the new components. Its useful assertions carry over in new form: the accessible name
must distinguish the three states, walking legs must say they do not use the free window, and no
clock time may appear.

---

## R7. Next.js and React surface used

**Decision**: No new Next.js API. `"use client"`, `next/dynamic` with `ssr: false` for `MapView`,
and static export, all already in use on branch `001` and all still current in the installed
version.

**Verified**: `next` 16.2.12 and `react` 19.2.4, read from `node_modules/*/package.json`.
`ssr: false` is documented in `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` with
no deprecation notice attached. The reason `MapView` must stay dynamically imported is unchanged
and is already recorded in `PlannerShell.tsx`: MapLibre touches `window` and WebGL, neither of
which exists when static export prerenders the page at build time.

**No dependency is added or removed.** `vitest` 4.1.10, `@testing-library/react` 16.3.2 and
`jsdom` 29.1.1 are already `devDependencies` on branch `001`, so the unit test the brief requires
costs nothing new.

---

## R8. Branch base

**Decision**: `002-refonte-affichage-resultat` must contain the feature 001 implementation before
any code task runs. This is a prerequisite, not a task.

**Rationale**: The branch was cut from `main`. `main` holds only `app/layout.tsx`,
`app/globals.css`, `app/page.tsx` and `app/favicon.ico`. There is no `components/`, no `lib/`, no
`tests/`, no `docs/ui-guidelines.md`, and `package.json` on `main` carries neither `maplibre-gl`
nor `vitest`. Every file this plan modifies or deletes lives on `001-free-window-trip-planner`,
unmerged.

The plan itself is unaffected: it describes the same work either way. Only execution is blocked.

**Resolution is the user's call**, since it shapes history: rebase `002` onto `001`, merge `001`
into `002`, or merge `001` into `main` first and rebase. The spec records this in its Assumptions.

---

## Sources

- [BIXI Montréal, tarifs](https://bixi.com/fr/tarifs/) - overage rate and included duration, read 2026-07-27
- [BIXI Montréal, FAQ tarifs](https://bixi.com/fr/faq-tarifs/)
- [BIXI Montréal, comment suis-je facturé mes frais d'utilisation](https://support.bixi.com/hc/fr/articles/7857481661331-Comment-suis-je-factur%C3%A9-mes-frais-d-utilisation)
