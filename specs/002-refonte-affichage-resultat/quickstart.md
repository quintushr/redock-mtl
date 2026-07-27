# Quickstart & Verification: Result-First Planner Panel

**Feature**: `002-refonte-affichage-resultat` | **Date**: 2026-07-27

---

## 0. Prerequisite

This branch was cut from `main`, which does not contain the feature 001 implementation. Before any
code task, confirm the tree actually holds what this plan modifies:

```bash
ls components/ lib/ tests/ docs/ui-guidelines.md
grep -q '"vitest"' package.json && echo "test runner present"
```

If any of those is missing, stop. See research R8: the branch needs `001-free-window-trip-planner`
merged or rebased in first, and that is the user's call to make.

## 1. Run

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest run
npm run lint
npm run build        # must still produce a static export
```

---

## 2. Automated checks

These are unit tests. They must be green before the manual pass below is worth doing.

```bash
npm test
```

**Domain** (`tests/unit/remaining.test.ts`, `tests/unit/pricing.test.ts`): the eight invariants in
[contracts/ui-contracts.md](./contracts/ui-contracts.md) Part 1. The two that matter most and are
easiest to break later:

- Remaining resets to the full budget at every anchor stop; it does not accumulate along the trip.
- Overage is measured against `freeWindow`, not `segmentBudget`. A ride that overruns our safety
  margin but fits the operator's window costs nothing.

**Components** (`tests/unit/itinerary-trail.test.tsx`):

- Every bike step reports remaining time; no step reports consumed time or a percentage (SC-005).
- The three states produce three distinguishable accessible names.
- Walk legs say they do not use the free window; docking waits say they reset it.
- No clock time in the rendered output: `expect(container.textContent).not.toMatch(/\b\d{1,2}:\d{2}\b/)` (SC-010).
- No parameter control precedes the result in DOM order (SC-002).

**Regression guard**, run after the domain change and before touching any component:

```bash
npm test    # planner-*, geo-*, gbfs-*, params*, geocode must all still pass
```

If a planner test needs more than renaming two fields in a fixture literal, the change has reached
further than intended. Stop and review rather than editing the assertion.

**Dead reference sweep**, at the end:

```bash
grep -rn "budgetShare\|budgetStatus\|BudgetStatus\|budgetLabel\|SegmentBudget\|ItineraryList\|ParameterPanel" \
  app components lib tests docs
```

Must return nothing.

---

## 3. Manual checks that jsdom cannot make

jsdom does not lay out and does not run WebGL, so none of the following is provable by unit test.
Stating that plainly is better than a green suite that proves less than it appears to.

Use a two-stop itinerary. A long crosstown trip produces one reliably.

### Layout, SC-001 / SC-011 / SC-012

- [ ] At 1280×700, the summary and every step are visible with no scrolling.
- [ ] At 360×700, the same holds with the panel expanded.
- [ ] The map fills the frame in every state and is never cropped into a tile.
- [ ] Below 1024 px, the panel rests at 65dvh or less in both positions.
- [ ] Show and hide the mobile URL bar: nothing clips, nothing jumps (FR-144).
- [ ] Resize across 1024 px: the same content and controls survive; only the anchoring changes.

### Camera and reading position, SC-004

- [ ] Note the map centre and zoom. Change the safety margin. Both are identical afterwards.
- [ ] Note the scroll position in the panel. Open the assumptions. It has not moved.
- [ ] Open the nested group. Camera and scroll still unchanged.
- [ ] Drag the safety margin slider continuously. The map does not move once.

This is the check most likely to fail after an innocuous JSX edit, because relocating `MapView`
under a conditionally rendered node remounts it and resets the camera silently.

### The gauge, SC-006

- [ ] Two steps with clearly different remaining time are rankable from the bars alone, with the
      figures covered.
- [ ] A near-zero remaining step still shows a visible bar, not an empty track.
- [ ] Screen reader: each step announces its remaining duration and its state word.
- [ ] Greyscale the page. All three states remain distinguishable.

### The comparison, SC-007

- [ ] Reachable in one action from the trail.
- [ ] States duration, amount, and the time saved or lost against the plan.
- [ ] The amount says it is an estimate, before taxes, and at what rate.
- [ ] Change the safety margin while it is open: it stays open and both figures follow (FR-135).
- [ ] Dismiss it: the trail returns unchanged, camera untouched.
- [ ] On a trip that already needs no stop, the summary says the trip is free and the comparison
      offers nothing to reveal.

### Quality floor, SC-009

- [ ] Usable from 360 px wide upward.
- [ ] Fully keyboard navigable, focus visible on the assumptions line, the nested group and the
      comparison action.
- [ ] Contrasts meet WCAG AA.
- [ ] `prefers-reduced-motion`: opening the assumptions, revealing the comparison and moving the
      sheet do not animate.

### Edge cases from the spec

- [ ] More than two stops: the list scrolls, the summary stays at the top, the assumptions line
      does not overlap it.
- [ ] Walk-only trip: no gauge anywhere, comparison says there is no ride to compare.
- [ ] Safety margin raised until no plan exists: the failure fills the result region and names the
      margin.
- [ ] Stale feed: the notice appears without pushing the itinerary below the fold.
- [ ] Plan fails while the comparison is open: the comparison does not survive as an orphan.

---

## 4. The "Interdits" pass

`docs/ui-guidelines.md` is authoritative on interface questions and its "Interdits" section is the
acceptance checklist. Walk it literally:

- [ ] No permanent navigation bar on the planner.
- [ ] No setting placed above the result.
- [ ] The accent colour appears only on the itinerary trace, the stop stations, and the active
      state of a control.
- [ ] The three-state colour code appears only on the remaining-time gauge, nowhere else.
- [ ] No drop shadows, no gradients, no third typographic weight.
- [ ] No third-party component library.
- [ ] No display of time consumed rather than time remaining.

The last one is the whole point of the feature. Check it last and check it hardest.
