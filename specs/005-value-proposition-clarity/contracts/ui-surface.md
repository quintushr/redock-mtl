# Contract: UI Surface

**Feature**: 005-value-proposition-clarity

What the reader sees, stated as obligations a test can check. `docs/ui-guidelines.md` governs the
visual direction; this file records only what this feature adds, moves or deletes, and the three
points where the guidelines themselves must be amended.

---

## `components/TripSummary.tsx` (rewritten)

**Props gain**: `noStop: NoStopRide | null`, `settled: boolean`, `params: PlanningParameters`.

**Renders** exactly one of the four cases from `summaryCase` (`data-model.md` §2). The component
chooses nothing; it words what the function returned.

| Case | Obligation |
|---|---|
| `pending` | Duration and stop count shown. **No amount.** A held space of the same height as the resolved block, stating the figures are being worked out (FR-408a). |
| `no-stop-needed` | Duration, and one sentence: no stop needed, the trip fits the free window, what it costs. No pair of identical amounts, no zero difference (FR-406a). |
| `nothing-saved` | Duration, stop count, and one sentence: the stops save nothing, the trip can be ridden in one go (FR-406). Reads as the same kind of statement as the case above. |
| `comparison` | Duration, stop count, the three amounts, the assumptions beside them (FR-401, FR-402, FR-407), **and** the time comparison: how long the direct ride takes and whether that is faster or slower than the plan, worded as an approximation (FR-410). |

**Prominence** (FR-402): the amounts sit in the same region as the total duration and at the same
level. Nothing about them is behind a disclosure, a fold, a tab, an overlay, or a scroll past the
trail (FR-403).

**Assumptions line** (FR-407, FR-411, FR-412): states the free window, the per-minute rate, that a
mechanical bike is assumed, and that the figure excludes taxes. It may **not** be deferred to the
expanded panel (FR-403).

**Layout stability** (SC-007): the transition from `pending` to any resolved case displaces nothing
above or below it.

**Removed**: the unconditional claim that a planned trip is free. The comment at
`components/TripSummary.tsx:14-19` states this as a fact about the plan; correction can leave a
segment over the free window, so it is no longer true and the amount is computed (FR-404).

---

## `components/NoStopComparison.tsx` (deleted)

Its figures move into the summary. Its disclosure, its `useState`, its chevron and its
`reveal`/`hide` wording go away: FR-403 forbids the fold, so a component named for one has nothing
left to do.

`tests/unit/no-stop-comparison.test.tsx` is deleted with it; its assertions about the figures move
to the summary's tests.

---

## `components/PanelHeader.tsx` (extended)

**Gains** one line beneath the existing wordmark row: the sentence from FR-414, present in every
state, before any input and after a plan is displayed alike.

**Obligations**:

- Wraps rather than truncates, in every supported language, at the panel's narrowest width
  (FR-419a). An ellipsis states nothing.
- Names BIXI, which discharges FR-419 wherever the reader is in the flow.
- One line of content. Nothing else may join it — this is permanent panel height on every screen,
  including the collapsed rest position where FR-402a has just claimed more room for the summary.
- No control, no menu entry, no overlay is added for recalling the explanation (FR-417).

---

## `components/EmptyState.tsx` (adjusted)

Keeps its job: the fuller explanation, filling the result region until a trip is computed (FR-415),
returning when the reader clears an endpoint. It reads the free window from the parameters in force
and must continue to (FR-418) — `components/EmptyState.tsx:72` already does.

**Obligations**:

- Occupies the region the result will later fill; not a short note above unused space (FR-415).
- Gives way to the result with no gap and no displacement of the surrounding controls (FR-416).
- The header sentence does not move, change or disappear at that moment (FR-416).

---

## `components/PanelFooter.tsx` (extended)

Row 2 keeps its shape. The refresh button now calls `requestRefresh`.

**Obligations**:

- A refused refresh states how long remains before another is permitted, in the row itself. No
  alert, no toast, no third row — `docs/ui-guidelines.md` closes the footer to one (FR-421).
- The in-flight state already exists (the spinner and `disabled` at
  `components/PanelFooter.tsx:191-201`) and satisfies FR-423.
- The age reading already re-words itself on a 30s tick against the snapshot's own timestamp
  (`components/PanelFooter.tsx:157`), which satisfies FR-422 unchanged.

---

## `components/PlannerShell.tsx` (extended)

- Hydrates parameters from the store in an effect after mount, never during render — the build has
  no reader and a render-time read is a hydration mismatch. Same shape as the deferred first
  `Date.now()` at `components/PanelFooter.tsx:121-135`.
- Writes parameters on `settled`, not on `parameters`, so a dragged slider writes once rather than
  on every frame (the existing 150ms debounce at `components/PlannerShell.tsx:112-118`).
- Passes `traced?.settled ?? false` to the summary as the deferral gate.
- Replaces `loadFeed`'s refresh path with `requestRefresh`. The **initial** load keeps
  `loadStationSnapshot()`.

---

## `components/SettingsOverlay.tsx` (extended)

Reset (`components/SettingsOverlay.tsx:353`) additionally clears the stored parameter key rather
than storing the defaults (FR-412a), so a future change to a documented default reaches the reader
instead of being masked by a stored copy of the old one.

---

## Wording

Every new string lands in `lib/i18n/messages/fr.ts` and `lib/i18n/messages/en.ts`.
`tests/unit/i18n-coverage.test.ts` fails the build on a key present in the reference and missing
from a translation. Voice is tutoiement, matching `empty.lead` and `noStop.wouldPayBefore`.

**Rewritten because they became wrong, not merely incomplete**:

- `summary.noStops` — must now also state that the trip fits the free window and what it costs.
- `summary.stops` — both plural forms assert "Ce trajet est gratuit", which FR-404 forbids.
- the `noStop` group — split rather than deleted. `reveal`, `hide` and `nothingToCompare` describe a
  fold that no longer exists and go. `inOneGo`, `faster`, `slower` and `sameTime` are the **time
  comparison** FR-410 requires to survive, and move into the summary's own keys. Deleting the whole
  group would drop a requirement while looking like tidying up.

Arithmetic stays in `lib/format.ts`. No rounding, no currency assembly, no hours/minutes split may
enter a message bundle (FR-207a).

---

## Amendments required to `docs/ui-guidelines.md`

Three, in the same change. A spec that contradicts a governing document and leaves it standing is
one nobody can review.

1. **"États de l'écran"** — "Vide : deux champs de saisie, rien d'autre" is superseded for the
   result region by FR-415.
2. **"Ordre imposé du panneau"** — the verifiable constraint "un trajet à deux arrêts est
   intégralement lisible sans défilement sur un écran de 700px de haut" is restated as applying to
   the expanded panel (FR-402a). At the collapsed rest position the summary is what must be fully
   visible, and the trail is what falls below the fold.
3. **Panel header** — described as carrying the name, the city and the language; FR-414 adds a
   permanent subtitle line.

The same document's "Résumé : durée totale, nombre d'arrêts, coût" already anticipates FR-402: the
cost was specified there and never landed. This feature moves toward the guidelines on that point,
not away.
