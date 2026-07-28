# Feature Specification: Value Proposition Clarity and Data Control

**Feature Branch**: `005-value-proposition-clarity`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "Fonctionnalité: lisibilité de la proposition de valeur et contrôle des données. PROBLÈME — Un utilisateur qui découvre l'application ne comprend pas ce qu'elle fait ni pourquoi elle propose des arrêts. L'économie réalisée, qui est la raison d'être du produit, n'est pas mise en avant. Par ailleurs les données de disponibilité sont datées sans que l'utilisateur puisse les actualiser. L'ÉCONOMIE COMME ARGUMENT PRINCIPAL — Dès qu'un itinéraire est calculé, l'utilisateur voit côte à côte ce que lui coûte le trajet avec les arrêts proposés et ce qu'il lui coûterait sans aucun arrêt, ainsi que l'écart entre les deux. Cette comparaison figure dans le résumé du trajet, au même niveau que la durée totale. Elle n'est reléguée dans aucune sous-section, aucun repli, aucun écran secondaire. Lorsque les arrêts ne font économiser rien, l'utilisateur le voit aussi clairement, et comprend qu'il peut rouler d'une traite. Le montant sans arrêt correspond au dépassement réellement facturé selon la tarification applicable à la situation de l'utilisateur, pas à une valeur générique. COMPRÉHENSION DU CONCEPT — Avant toute saisie, l'utilisateur comprend en une phrase ce que fait l'application et pourquoi s'arrêter fait économiser. Cette explication occupe l'espace disponible tant qu'aucun trajet n'est calculé, et disparaît une fois le résultat affiché sans laisser de vide. Un utilisateur qui revient peut retrouver cette explication à la demande. CONTRÔLE DES DONNÉES — L'utilisateur peut actualiser les données de disponibilité (Bixi) à la demande, et voit à quel point elles sont datées. Mentionner Bixi aussi."

**Language note**: Written in English for consistency with `specs/001-free-window-trip-planner/spec.md` through `specs/004-real-route-geometry/spec.md`. The product's own copy stays French-first; wording is governed by `docs/ui-guidelines.md` and by feature 003, not by this spec.

**Requirement numbering**: Requirements are numbered from FR-401 so that code comments referencing FR-0xx (feature 001), FR-1xx (feature 002), FR-2xx (feature 003) and FR-3xx (feature 004) remain unambiguous.

**Operator**: The only network currently served is BIXI Montréal, whose public GBFS feed supplies station availability and whose published tariff supplies the default overage rate. Every requirement below is written so that a second operator can be added without rewording it: "the operator" means whichever network the current snapshot came from, and BIXI is named only where a concrete example helps.

**Relationship to features 001 and 002**: The saving comparison already exists as a computation (`lib/pricing.ts`, `NoStopRide`) and as a collapsed disclosure below the itinerary trail. The explanation of the mechanism already exists as the empty-state block. The refresh control and the freshness reading already exist as the panel footer's second row. This feature does not invent any of the three. It changes where each one sits, how loudly it speaks, and — for the refresh — whether pressing it actually fetches anything.

**Scope widened during clarification**: making the amounts belong to the reader rather than to the documented defaults turned out to require that planning parameters survive a reload, which they currently do not — `PlannerShell` starts from `DEFAULT_PARAMETERS` on every load. FR-413a to FR-413c therefore add browser-local persistence for the whole parameter set defined by feature 001. This is an addition to the original brief, accepted because FR-405 is otherwise true only until the reader closes the tab.

## Clarifications

### Session 2026-07-28

- Q: Does "the tariff applicable to the user's situation" require modelling distinct operator tariff
  profiles (subscriber vs occasional, mechanical vs electric, unlock fees), or is the existing pair
  of adjustable values — free window and per-minute overage rate — the whole model?
  → A: The existing pair is the whole model. No tariff catalogue, no profiles, no bike-type matrix.
  Two facts settle it. First, the planner only ever builds plans on mechanical BIXIs — `canStartRide`
  in `lib/gbfs.ts` requires mechanical bikes above the reserve — so the electric tariff can never
  apply to a plan this application produces, and presetting it would offer a rider a choice that
  changes nothing. Second, the two values already span every situation that changes the arithmetic
  for a mechanical ride. What is missing is not more tariff structure but disclosure: the amounts
  must state the free window, the rate, the bike type they assume, and what they exclude (FR-407,
  FR-411), so a rider can check them against the operator's published price and correct them if
  their plan differs. Unlock fees and taxes stay out of scope (FR-412).
- Q: An on-demand refresh must not become a way to poll a courtesy feed faster than the project's
  own floor (`MIN_REFRESH_INTERVAL_SECONDS`, currently 60s) allows. What happens when the user asks
  for a refresh sooner than that?
  → A: The request is honoured as far as the floor permits and refused visibly beyond it. Pressing
  refresh always fetches when the floor has elapsed, which is the defect being fixed. Inside the
  floor the control states how long remains rather than silently re-rendering the same snapshot, so
  the user learns that the data is as new as it is allowed to be. The floor is the project's own
  courtesy limit, not the feed's `ttl`, and it stays.
- Q: Feature 004 revises an itinerary after it is first displayed, so amounts tied to the plan would
  move under the reader, possibly more than once. Do the amounts update live, or wait?
  → A: They wait. The summary shows the duration and the stop count immediately, and the three
  amounts appear once the itinerary has stopped moving. A currency figure that changes on its own
  reads as an error rather than as an estimate, which is the opposite of what this feature exists
  for: the saving is the argument, and an argument that revises itself twice while it is being read
  is not persuasive. Durations keep their existing behaviour and are not held back — they are
  already worded as approximations and a reader is already used to seeing them settle. Waiting is
  safe because "stopped moving" is not the same as "every path was obtained": an itinerary whose
  tracing failed entirely still settles, with geometry marked approximate, so the amounts always
  arrive (FR-408a, FR-408b).
- Q: A plan with no anchor stop *is* the direct ride, so the two amounts are the same number and the
  difference is zero by construction. Show the three figures anyway, or say something else?
  → A: Say something else. One sentence replaces the three figures: no stop is needed, the trip fits
  inside the free window, and what it costs. Two identical amounts beside a zero invite the reader
  to hunt for the mistake, and they answer a question nobody asked; the sentence answers the one
  they did ask, which is whether they need to stop at all. This is deliberately the same shape as
  FR-406, so the two neighbouring cases — no stops at all, and stops that save nothing — read alike
  rather than being distinguished by a layout the reader has to decode (FR-406a).
- Q: FR-405 requires the amounts to reflect the free window and rate "in force for the reader", but
  planning parameters do not survive a reload — the planner starts from the documented defaults
  every time. Should the tariff values persist, and if so, only those?
  → A: All planning parameters persist browser-locally, not only the two tariff values. Persisting
  the tariff alone would leave a reader whose free window and rate were remembered while their
  safety margin, cycling speed and walking tolerance silently reverted — and those move the plan the
  tariff is applied to, so the remembered amounts would be computed against assumptions the reader
  did not choose. Either the whole parameter set is the reader's or none of it is. This widens the
  feature beyond the tariff, and it is accepted deliberately: it is the smallest change that makes
  FR-405 true on the second visit as well as the first (FR-413a to FR-413c).
- Q: The summary grows by three amounts and an assumptions line, but the collapsed panel is capped
  and `docs/ui-guidelines.md` requires a two-stop trip to be fully readable without scrolling on a
  700px screen. What gives way?
  → A: The summary grows, and the itinerary trail is what falls below the fold at the collapsed rest
  position. The 700px constraint is about the itinerary being readable, and it is restated as
  applying to the expanded panel. Feature 002 already sized the collapsed position around the
  summary — its stated purpose is to answer "how long, how many stops, is it free" without expanding
  anything — so letting the summary claim that space is the existing decision carried through rather
  than a new one. The alternatives were rejected for the same reason: compressing three amounts onto
  one abbreviated line, or hiding the assumptions until the panel is expanded, would both put the
  argument back behind an interaction, which is the defect this feature exists to fix (FR-402a).
- Q: FR-417 requires a reader with a computed plan to be able to recall the explanation, without
  saying from where. The footer is closed to new rows and the planner has no navigation bar, so
  where does it live?
  → A: Nowhere, because nothing needs recalling. The one-sentence version becomes a permanent
  subtitle under the product name in the panel header, present before any input and still present
  once a plan is on screen. A sentence that never leaves cannot need a control to bring it back, and
  a control that opens an overlay to state one sentence is a mechanism heavier than the thing it
  serves. The fuller explanation keeps its job of filling the result region until a trip is computed
  (FR-415) and returns whenever the reader clears their endpoints, so both readings of "retrouver
  cette explication" are satisfied without a menu entry (FR-414, FR-417).
  The sentence must convey optimising BIXI trips so as to pay no overage — that sense, not that
  string. Exact wording is French-first and flows through the feature 003 message registry, and no
  requirement here fixes it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The saving is the headline (Priority: P1)

A rider enters a start and a destination. The summary answers the duration and the stop count at
once, and as soon as the itinerary has stopped being revised it tells them what this trip costs them
with the proposed stops, what the same trip would cost ridden straight through with no stop, and the
difference between the two. They read all three without expanding anything, without scrolling past
the itinerary, and without opening a second screen.

**Why this priority**: The saving is the product's reason to exist and the only thing that
distinguishes it from any other bike-share map. Today it is a computed value hidden behind a
collapsed disclosure placed *below* the full itinerary trail, which means the argument is made only
to a reader who has already scrolled past the answer and then chosen to open a fold. Every other
story in this feature is worth less than this one.

**Independent Test**: Plan any trip that the planner answers with at least one stop, let the
itinerary settle, and read the summary region alone. If the with-stops amount, the no-stop amount,
and the difference are all legible there without any interaction, the story is delivered.

**Acceptance Scenarios**:

1. **Given** a plan with at least one anchor stop whose direct ride would exceed the free window,
   **When** the itinerary has settled, **Then** the summary shows the cost with stops, the cost
   without stops, and the saving between them, all at the same level of prominence as the total
   duration.
2. **Given** the same plan, **When** the reader has performed no interaction beyond entering the two
   endpoints, **Then** none of the three amounts is behind a disclosure, a fold, a tab, an overlay,
   or a scroll past the itinerary trail.
3. **Given** a plan that has stops but whose direct ride would already fit inside the free window,
   **When** the result appears, **Then** the summary states plainly that the stops save nothing and
   that the trip can be ridden in one go, rather than showing a saving of zero and leaving the
   reader to interpret it.
3a. **Given** a plan the planner answered with no stop at all, **When** the result appears, **Then**
   the summary states in one sentence that no stop is needed, that the trip fits inside the free
   window, and what it costs — and shows no pair of identical amounts and no zero difference.
4. **Given** a rider who has changed the free window or the overage rate to match their own
   situation, **When** the plan recomputes, **Then** all three amounts follow the changed values,
   and the assumptions behind them — free window, rate, bike type assumed, taxes excluded — remain
   readable next to them.
5. **Given** a plan that route correction gave up on with a segment still over the free window
   (feature 004's exhausted case), **When** the result appears, **Then** the with-stops amount is
   the overage that plan actually implies and is not stated as free.
6. **Given** a plan that contains no bike segment at all, **When** the result appears, **Then** the
   summary says what it can and does not display a fabricated comparison.
7. **Given** a plan whose route geometry is still being obtained or corrected, **When** the summary
   is read, **Then** the duration and the stop count are already shown, no amount is shown, the
   space the amounts will occupy is held, and the summary says the figures are being worked out.
8. **Given** that same plan, **When** the itinerary settles — including when every path request
   failed and the geometry stays approximate — **Then** the three amounts appear in the held space
   without displacing anything around them, and do not change again unless the reader changes
   something.

---

### User Story 2 - A first-time reader understands the idea (Priority: P2)

Someone opens the application for the first time. One sentence under the product name tells them
what it does and why stopping saves money, and it stays there for as long as they use the
application. Below it, while no trip is computed, a fuller explanation fills the space the result
will later occupy. Once a trip is planned, that fuller version gives way to the result cleanly,
while the sentence in the header remains.

**Why this priority**: An unexplained mechanism makes the result unreadable — nobody arrives knowing
that docking a bike restarts the free window, and without that fact a plan with two stops looks like
a worse route rather than a cheaper one. It ranks below US1 because a reader who sees the saving has
already been given the shortest possible version of the argument.

**Independent Test**: Load the planner with no endpoints set and read the panel. If a sentence under
the product name states what the application does and why stopping saves money, and the block below
occupies the space rather than sitting as a short note above emptiness, the story is delivered.

**Acceptance Scenarios**:

1. **Given** a first load with no start and no destination entered, **When** the panel is read,
   **Then** a single sentence beneath the product name states what the application does and why
   stopping saves money, and it names BIXI.
2. **Given** that same state, **When** the panel is measured, **Then** the fuller explanation
   occupies the region the result will later fill, leaving no empty band between it and the
   surrounding chrome.
3. **Given** the fuller explanation is on screen, **When** a plan is computed, **Then** it is
   replaced by the result with no gap, no jump of the surrounding controls, and no residual empty
   space where it was — while the header sentence stays exactly where it was.
4. **Given** a computed plan on screen, **When** the reader looks for the explanation, **Then** the
   header sentence is already in front of them, and no control had to be opened to reach it.
5. **Given** a computed plan on screen, **When** the reader clears an endpoint, **Then** the fuller
   explanation returns to the result region, with the map camera and the remaining endpoint
   unchanged.
6. **Given** the free window has been changed from its default, **When** the fuller explanation is
   read, **Then** the duration it quotes is the reader's current free window and not a hard-coded
   one.
7. **Given** any supported language at the panel's narrowest width, **When** the header is rendered,
   **Then** the sentence is fully legible and is not truncated.

---

### User Story 3 - The rider renews the availability data (Priority: P3)

A rider has had the planner open for a while. They can see how old the BIXI availability snapshot
is, and pressing the refresh control actually fetches a new one. When they press it sooner than the
application is willing to poll the operator, they are told so rather than left to wonder.

**Why this priority**: The reading and the control both already exist and are already in reach; what
is broken is that the control does not force a fetch, so within the refresh floor it re-renders the
snapshot the rider was already looking at. The defect is real but narrower than either story above,
and a rider is never misled by it — the age shown beside the control stays truthful.

**Independent Test**: Load the planner, wait past the refresh floor, press refresh, and confirm the
stated age drops. Press it again immediately and confirm the interface says why nothing changed.

**Acceptance Scenarios**:

1. **Given** a snapshot older than the refresh floor, **When** the rider presses refresh, **Then** a
   new snapshot is fetched from the operator and the stated age drops to reflect it.
2. **Given** a snapshot fetched within the refresh floor, **When** the rider presses refresh,
   **Then** the interface states that the data is as new as it is allowed to be and how long remains
   before another fetch is permitted, and no request is sent.
3. **Given** a refresh is in flight, **When** the rider presses refresh again, **Then** no second
   request is sent and the control shows that work is in progress.
4. **Given** a refresh that fails, **When** the failure is handled, **Then** the previous snapshot
   and the plan built on it remain on screen, labelled with their true age, and the failure is
   stated.
5. **Given** a refresh that succeeds and returns different availability, **When** the new snapshot
   lands, **Then** the plan and all three amounts in the summary recompute against it.

---

### Edge Cases

- The direct ride costs nothing because it fits the free window: the saving is zero and must be
  worded as "no stop needed", never as a "$0.00 saving" the reader has to interpret.
- The rider sets the overage rate to zero (a plan that bills nothing for overage): the comparison
  reports a free direct ride, which is true for them, and must not read as an error.
- The plan has stops but the direct ride is *slower* than the plan (rare, and possible once measured
  geometry is in play): the saving is still positive and the time comparison must not be presented
  as a penalty.
- The plan's anchor stations have left the snapshot between planning and rendering: the no-stop
  amount cannot be constructed, and the summary must degrade to what it can state rather than
  showing a blank or a zero.
- A walk-only plan with no bike segment: there is nothing to compare, and nothing is fabricated.
- The panel is at its collapsed rest position on a handset: the three amounts and their assumptions
  belong to the region visible at that position, since that is the region the summary exists to
  fill, and the itinerary trail is what falls below the fold instead.
- The feed is unavailable at first load: there is no plan and no snapshot, so the fuller explanation
  and the feed failure both want the result region. The failure wins; the header sentence still
  states what the application is for, which is the more valuable of the two in that moment.
- The header sentence costs panel height on every screen, permanently, including the collapsed rest
  position where FR-402a has just claimed more room for the summary. Both cannot expand without
  bound; the sentence is one line and stays one line.
- A language whose sentence is longer than French's: FR-419a still holds, so the constraint falls on
  the translation rather than on the layout, and feature 003's coverage checks are where that
  surfaces.
- The device clock is wrong or moves: the stated age is derived from the snapshot's own timestamp,
  so a skewed clock produces a visibly odd age rather than a silently fresh-looking stale snapshot.
- Route tracing is slow or hangs: the amounts are deferred, so a plan whose geometry never resolves
  would hold them forever. Settling must be reached on the failure path as well as the success one
  (FR-408b); a request that cannot complete counts as a path that was not obtained.
- The reader changes a parameter while the amounts are deferred: the plan restarts, so the amounts
  stay deferred rather than appearing against the superseded plan and being corrected a moment
  later.
- The reader changes a parameter after the amounts have appeared: they are recomputed and may be
  deferred again while the new plan settles. Flicker between the two states is what FR-408a's
  reserved space exists to absorb.
- Browser storage is unavailable or full — a private window, a quota exhausted by the stored route
  geometry: parameters behave as they do today, for the session only, and the reader is not shown an
  error about a feature they never asked for.
- A stored parameter set was written by an earlier version and no longer validates, or a default
  moved between releases: validation returns the reader to the documented defaults for the offending
  values rather than refusing to start.
- Two tabs are open and each changes parameters: the last write wins, which is acceptable because
  the value is one reader's own preference and nothing is lost that cannot be re-entered.
- The reader resets to defaults: the stored set is cleared, so a future change to a documented
  default reaches them instead of being masked by a stored copy of the old one.

## Requirements *(mandatory)*

### Functional Requirements

#### The saving, in the summary

- **FR-401**: The trip summary MUST display, for every plan the planner returns successfully that
  contains at least one anchor stop, three figures: the cost of the trip as planned, the cost of the
  same trip ridden with no stop, and the difference between them.
- **FR-402**: Those three figures MUST be presented at the same level of prominence as the total
  duration, in the same region, and MUST be readable with no interaction beyond entering the two
  endpoints.
- **FR-402a**: At the panel's collapsed rest position, the whole summary — the three figures and the
  assumptions behind them included — MUST be visible without scrolling and without expanding the
  panel. The itinerary trail is what may fall below the fold there. The existing requirement that a
  two-stop trip be fully readable without scrolling applies to the expanded panel.
- **FR-403**: None of the three figures MAY be placed behind a disclosure, a fold, a tab, a
  secondary screen, or below the itinerary trail. Neither may the assumptions of FR-407 be deferred
  to the expanded panel.
- **FR-404**: The cost of the trip as planned MUST be computed from the itinerary actually being
  displayed, including any segment left over the free window by an exhausted route correction, and
  MUST NOT be asserted as free on the strength of how the plan was built.
- **FR-405**: The no-stop amount MUST be the overage the operator would actually bill for that ride
  under the free window and rate in force for the reader, and MUST NOT be a generic or illustrative
  figure.
- **FR-406**: When the plan has stops but they save nothing, the summary MUST say so in words and
  MUST tell the reader they can ride the trip in one go, rather than displaying a zero the reader
  must interpret.
- **FR-406a**: When the plan has no stop at all, the summary MUST replace the three figures with one
  sentence stating that no stop is needed, that the trip fits inside the free window, and what it
  costs. It MUST NOT display two identical amounts and a difference of zero. This sentence and
  FR-406's MUST read as the same kind of statement, so that the two neighbouring outcomes are not
  distinguished by a layout the reader has to interpret.
- **FR-407**: The summary MUST state the assumptions the amounts rest on — at minimum the free
  window, the per-minute rate, and whether taxes are included — near the amounts themselves.
- **FR-408**: All three figures MUST recompute whenever the plan or the parameters behind them
  change, and MUST never display an amount derived from superseded parameters.
- **FR-408a**: No amount MAY be displayed while the itinerary is still being revised — while route
  geometry is outstanding, or while a correction round is in progress. Until then the summary MUST
  show the duration and the stop count, MUST reserve the space the amounts will occupy, and MUST
  state that the figures are still being worked out.
- **FR-408b**: The amounts MUST appear as soon as the itinerary stops being revised, whether it
  settled on measured geometry, on approximate geometry after every path request failed, or on a
  correction that gave up. An itinerary that never obtains a single real path MUST still reach a
  state in which the amounts are shown.
- **FR-408c**: Once shown, an amount MUST NOT change unless the reader changes a parameter, an
  endpoint, or the availability snapshot. A figure that revises itself while being read is the
  failure this deferral exists to prevent.
- **FR-409**: When no comparison can be constructed — no bike segment in the plan, or the anchor
  stations absent from the current snapshot — the summary MUST state what it can and MUST NOT
  display a fabricated or zero amount in place of the missing one.
- **FR-410**: The time comparison between the planned trip and the direct ride MUST remain available
  alongside the amounts, worded as an approximation.

#### The tariff behind the amounts

- **FR-411**: The free window and the per-minute overage rate MUST remain adjustable by the reader,
  and the interface MUST state, beside the amounts, that they assume a mechanical bike — which is
  the only kind of bike the planner builds a plan on — so a rider whose situation differs knows
  which two values to correct.
- **FR-412**: The application MUST NOT model unlock fees, taxes, passes, bike-type tariff variants,
  or any tariff element beyond the free window and the per-minute rate. Where the displayed amount
  is therefore incomplete, the interface MUST say so rather than round the gap away.
- **FR-412a**: A reader MUST be able to return every parameter to its documented default in one
  action, and doing so MUST clear what was stored rather than store the defaults as if chosen. A set
  of values that persists forever with no way back is worse than no persistence at all.
- **FR-413**: Tariff values MUST come from a local, editable default and MUST NOT require a network
  call, an account, or an operator API to be shown.
- **FR-413a**: Every planning parameter the reader can change — the two tariff values and the rest
  of the set alike — MUST persist browser-locally and MUST be restored on the next visit, so that
  the amounts shown to a returning reader rest on the assumptions they chose rather than on the
  documented defaults.
- **FR-413b**: Stored parameters MUST be validated before use. A stored set that is absent,
  unreadable, or invalid MUST fall back to the documented defaults without an error being shown to
  the reader, and MUST NOT prevent the application from starting.
- **FR-413c**: Persistence MUST be browser-local. No parameter, and nothing derived from one, may
  leave the browser. Storage being unavailable — a private window, a full quota, a browser that
  refuses it — MUST leave the application fully functional for the session, with parameters behaving
  as they do today.

#### Understanding the concept

- **FR-414**: The planner MUST carry a single sentence stating what the application does and why
  stopping saves money, as a subtitle beneath the product name in the panel header. It MUST be
  present before any endpoint is entered and MUST remain present once a plan is displayed. Its sense
  is: optimise your BIXI trips so that you pay no overage.
- **FR-415**: A fuller explanation of the same idea MUST occupy the region the result will later
  fill, for as long as no trip is computed, and MUST NOT sit as a short note above unused space.
  This is a second expression of FR-414's sentence, not a competing one.
- **FR-416**: When a result becomes available, the fuller explanation MUST give way to it without
  leaving empty space and without displacing the surrounding controls. FR-414's sentence MUST NOT
  move, change, or disappear at that moment.
- **FR-417**: No control, menu entry, or overlay MAY be added for the purpose of recalling the
  explanation. FR-414's sentence never leaves the header, so a reader who returns has it in front of
  them, and clearing an endpoint restores the fuller explanation of FR-415 in the result region.
- **FR-418**: Any duration or amount quoted in either expression of the explanation MUST be read
  from the parameters in force, so it cannot contradict the summary.
- **FR-419**: The explanation MUST name the operator whose stations it plans against — BIXI for the
  Montréal network — so a reader knows what data the application is using. FR-414's sentence carries
  that name, so it is discharged wherever the reader is in the flow.
- **FR-419a**: FR-414's sentence MUST fit the header without truncation, in every supported
  language, at the panel's narrowest width. A subtitle that ends in an ellipsis states nothing.

#### Renewing the data

- **FR-420**: The rider MUST be able to request a new availability snapshot on demand, and that
  request MUST fetch from the operator rather than return the cached snapshot, whenever the
  application's refresh floor permits a fetch.
- **FR-421**: The application MUST NOT poll the operator faster than its own refresh floor, and MUST
  NOT poll faster than the feed's declared `ttl`. When a request arrives too soon, the application
  MUST state that the data is as new as it is allowed to be, and how long remains before another
  fetch is permitted.
- **FR-422**: The age of the availability data MUST remain visible without interaction, expressed in
  relative terms, and MUST re-word itself as it grows rather than freeze at the value it had when
  it was first painted.
- **FR-423**: A refresh already in flight MUST NOT be duplicated by a further request, and the
  control MUST show that work is in progress.
- **FR-424**: A failed refresh MUST leave the previous snapshot and the plan built on it on screen,
  correctly labelled with their true age, and MUST state the failure.
- **FR-425**: A successful refresh that changes availability MUST cause the plan and every amount
  derived from it to recompute against the new snapshot.

### Key Entities

- **Trip cost comparison**: the three figures the summary carries — cost as planned, cost ridden
  straight through, and the difference. Derived from an itinerary, a station snapshot and the
  tariff in force; carries no identity of its own and is never stored.
- **Tariff in force**: the free window and the per-minute overage rate the reader's amounts are
  computed from, together with a statement of what they assume (a mechanical bike) and what they
  exclude (unlock fees, taxes). Local, editable, and never fetched. Two members of the wider
  parameter set below rather than a separate record.
- **Stored parameter set**: the reader's planning parameters as last chosen, held browser-locally
  and restored on the next visit. Validated on read; falls back to the documented defaults when
  absent or invalid. Never leaves the browser and is never sent anywhere.
- **Concept explanation**: two expressions of one idea. The short one is a permanent header subtitle
  present in every state. The long one is the block that fills the result region until a trip is
  computed and returns when the endpoints are cleared; it reads the tariff in force. Neither holds
  any state of its own — the long one's presence is a function of whether a plan exists.
- **Availability snapshot**: the operator's station data as of a moment, already defined by feature
  001. This feature adds only the ability to demand a new one and the statement of when the next one
  is permitted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader shown a settled plan can state the saving the stops produce, from the summary
  region alone, with no interaction beyond entering the two endpoints.
- **SC-002**: Zero of the three cost figures, and zero of the assumptions stated beside them,
  require a click, a scroll, or a second screen to become visible at the panel's collapsed rest
  position on a 700px-tall screen, or on the wide-viewport panel.
- **SC-003**: A first-time reader can state, after reading the pre-input screen and before entering
  anything, both what the application does and why stopping saves money.
- **SC-003a**: A reader with a computed plan on screen can state what the application is for without
  opening any control, clearing anything, or leaving the planner.
- **SC-004**: 100% of successfully planned trips display a cost figure that a reader can reconcile
  against the operator's published price using only the assumptions the interface states.
- **SC-005**: Trips where the stops save nothing, and trips the planner answered with no stop at
  all, are worded as a sentence rather than as a zero saving or a pair of identical amounts, in
  100% of such cases.
- **SC-006**: After the refresh floor has elapsed, pressing refresh results in a newer stated age in
  100% of successful attempts; pressing it before the floor states the remaining wait in 100% of
  cases and sends no request.
- **SC-007**: The transition from explanation to result introduces no empty band and no shift of the
  endpoint fields, and neither does the appearance of the deferred amounts.
- **SC-008**: Requests sent to the operator's feed never exceed one per refresh floor interval,
  measured over a session in which refresh is pressed repeatedly.
- **SC-009**: Every successfully planned trip reaches a state in which the three amounts are
  displayed, including trips for which no route geometry could be obtained at all; no plan leaves
  the amounts pending indefinitely.
- **SC-010**: A displayed amount changes only in response to a reader action or a new availability
  snapshot, never on its own, in 100% of observed sessions.
- **SC-011**: A reader who adjusts any planning parameter, closes the application and reopens it
  sees the same parameters and the same amounts, with no re-entry.
- **SC-012**: The application starts and plans normally with browser storage disabled, unreadable,
  or holding an invalid parameter set, and shows the reader no error in any of those cases.

## Constitution Alignment *(mandatory)*

- **Cost & keys**: No. Nothing here needs a server, a database, a paid service, or a key. The cost
  comparison is arithmetic over data already in the browser; the tariff values are local constants
  the reader can edit (FR-413); the refresh calls the same public, keyless GBFS endpoints feature
  001 already calls. No new external dependency is introduced. Parameter persistence (FR-413a) is
  browser-local storage, which the Technology & Deployment Constraints already permit and which
  feature 003 and feature 004 already use; nothing is stored anywhere else, and the application
  keeps working when storage is refused (FR-413c).
- **Estimate honesty**: This feature displays durations (total trip duration, direct-ride duration,
  the difference between them, the age of the snapshot, the wait before another fetch) and amounts
  (cost as planned, cost without stops, the saving). Durations stay approximations in the existing
  wording, and the time comparison is explicitly worded as an approximation (FR-410). Amounts are
  the more delicate case: a currency figure reads as exact in a way a duration does not, so FR-407
  requires the assumptions to sit beside the amount and FR-412 requires the interface to say what
  the amount excludes rather than round the gap away. The two parameters that move these figures —
  free window and overage rate — are user-visible and adjustable (FR-411), and the amounts follow
  them (FR-408). The amounts are also deferred until the itinerary stops being revised (FR-408a to
  FR-408c), which is this principle applied in the other direction: durations may visibly settle
  because they are labelled approximations, but a price that corrects itself twice while being read
  would undermine the credibility the comparison exists to build. Deferral is bounded — a plan whose
  tracing fails entirely still settles, so no plan withholds its amounts forever (FR-408b).
- **Data sources**: BIXI Montréal's public GBFS feed, already consumed by feature 001; no new feed.
  Attribution stays where feature 001 put it, on the map. The refresh this feature makes real is
  bounded by the project's own floor and by the feed's declared `ttl` (FR-421), which is stricter
  than the feed permits; a request arriving inside the floor is refused visibly rather than sent. A
  stale or failed feed keeps the previous snapshot and the plan on screen, labelled (FR-424). The
  BIXI tariff is *read* from the operator's published pricing page by a maintainer and committed as
  a local default; it is never fetched at runtime, so no tariff endpoint is called and no operator
  API beyond GBFS is touched.

## Assumptions

- The reader is on the BIXI Montréal network. A second operator would bring its own tariff default
  and its own free window; nothing in these requirements is worded to prevent that.
- Every plan is ridden on a mechanical BIXI, because that is the only kind of bike the planner will
  build a plan on (feature 001, FR-011). The mechanical tariff is therefore the only one that can
  apply, and it is what the defaults encode.
- Amounts are shown in Canadian dollars, pre-tax, matching the operator's own published price. This
  understates the final bill by roughly the Quebec tax rate, and FR-407 and FR-412 require the
  interface to say so. A rider who wants a tax-inclusive figure raises the rate.
- The existing computation in `lib/pricing.ts` is correct and is reused. This feature moves the
  comparison and extends what it covers; it does not redefine how the direct ride is constructed.
- "At the same level as the total duration" is a statement about prominence and region, not about a
  specific layout. `docs/ui-guidelines.md` already lists cost as the third element of the summary
  ("Résumé : durée totale, nombre d'arrêts, coût"), so this feature makes the summary match the
  guidelines rather than departing from them.
- The pre-input screen described in `docs/ui-guidelines.md` as "deux champs de saisie, rien d'autre"
  is superseded for the result region only: the endpoint fields keep their place and their order,
  and the explanation occupies the region below them that would otherwise be blank.
- The same document's verifiable constraint — a two-stop trip fully readable without scrolling on a
  700px screen — is restated as applying to the expanded panel, per FR-402a.
- `docs/ui-guidelines.md` is therefore amended in the same change, on both points above. A spec that
  contradicts a governing document and leaves it standing is a spec nobody can review.
- The panel header gains a second line. `docs/ui-guidelines.md` describes that header as carrying
  the product name, the city and the language, and lists "À propos" and "Suggérer une idée" as
  future entries; a permanent one-line subtitle is an addition to it and is amended there with the
  other two changes above.
- Nothing is added to the panel footer, which that document closes to a third row.
- The refresh floor stays at its current value (60 seconds); this feature does not renegotiate it.
- Wording is French-first and flows through the feature 003 message registry; no requirement here
  fixes an English or French string.
