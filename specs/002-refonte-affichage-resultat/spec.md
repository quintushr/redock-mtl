# Feature Specification: Result-First Planner Panel

**Feature Branch**: `002-refonte-affichage-resultat`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Refonte de la présentation du résultat de planification. Le résultat du calcul est affiché sous les paramètres de configuration; l'utilisateur doit faire défiler pour voir la réponse à sa question, alors que les paramètres sont modifiés rarement et le résultat consulté à chaque usage. La hiérarchie est inversée. Attendu: itinéraire entièrement visible sans défilement jusqu'à deux arrêts; paramètres réduits au repos à une ligne de résumé placée après le résultat; modifier un paramètre ne fait perdre ni la position de lecture ni la vue de la carte. Chaque étape indique le temps de gratuité restant à l'arrivée, et non le temps consommé, avec un indicateur visuel proportionnel lisible sans lire le chiffre. Les arrêts d'ancrage sont des étapes au même titre que le départ et l'arrivée, dans une liste unique et continue. Un seul réglage visible par défaut: la marge de sécurité; les autres dans une zone repliée fermée par défaut. Nouvelle capacité: afficher le même trajet sans aucun arrêt et le montant qui serait payé. La logique de calcul existante n'est pas modifiée; les composants d'affichage actuels du résultat et des paramètres sont remplacés, pas adaptés, et le code devenu inutile est supprimé."

**Language note**: Written in English for consistency with `specs/001-free-window-trip-planner/spec.md` and the rest of the repository documentation. French product copy is a separate concern and is not fixed here.

**Requirement numbering**: Requirements in this spec are numbered from FR-101 so that code comments referencing FR-0xx from feature 001 remain unambiguous.

**Authoritative visual direction**: `docs/ui-guidelines.md` governs every visual decision in this repository and already describes the target arrangement. This spec states the user-level requirements; it does not restate the visual rules.

## Clarifications

### Session 2026-07-27

- Q: Where does the money amount shown by the no-stop comparison come from, given that no pricing data exists in the codebase and no environment variable may be required (principle II)? → A: A user-adjustable overage rate, held with the other planning assumptions, with a conservative documented default. No feed, no key.
- Q: Does this feature restructure the planner shell (full-frame map with a single overlay panel, as `docs/ui-guidelines.md` prescribes), or does it only reorder and replace content inside the existing two-column layout? → A: Full shell restructure, mobile and desktop. The navigation programme of `docs/ui-guidelines.md` (about page, language toggle, panel-header menu) stays out of scope.
- Q: Is remaining free time measured against the whole free window, or against the usable segment budget once the safety margin is set aside? → A: Against the usable segment budget. The margin is held back, never presented as time in hand.
- Q: Between which points is the no-stop ride constructed, given the planner's graph contains no over-budget edge? → A: Between the planned itinerary's own pickup and drop-off stations, as a single segment. The two walks are unchanged.
- Q: When an assumption changes while the no-stop comparison is displayed, does the comparison update or close? → A: It recomputes live alongside the plan and stays open.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the answer without hunting for it (Priority: P1)

A subscriber who has already set a start and a destination opens the planner to check their route. The answer they came for, meaning how long the trip takes, how many stops it needs, and what those stops are, is the first thing on screen. The map is behind it the whole time, never cropped into a tile and never scrolled away. The planning assumptions they set once, weeks ago, no longer stand between them and that answer; they sit below it as a single line they can open when they actually want to change something.

**Why this priority**: This is the reported defect. The current arrangement charges a scroll on every consultation to serve a setting changed once a year, and its two-column layout spends the top of the panel on a title and a description before the answer begins. Both have to go for the answer to fit on one screen.

**Independent Test**: Set a start and destination that produce a two-stop itinerary, load the planner at 700 px tall and at 360 px wide, and verify that the summary and every step of the itinerary are readable without scrolling, that the map is visible throughout, and that no planning control appears above the result.

**Acceptance Scenarios**:

1. **Given** a computed itinerary with two anchor stops, **When** the user views the planner on a viewport 700 px tall, **Then** the trip summary and every step of the itinerary are visible without scrolling.
2. **Given** any state of the planner, **When** the user looks above the result region, **Then** no planning parameter control is present there.
3. **Given** a computed itinerary, **When** the user looks below it, **Then** the planning assumptions are represented by a single closed summary line.
4. **Given** no start or destination has been set yet, **When** the user views the planner, **Then** the result region invites them to set the two endpoints, and the assumptions still sit below it as one closed line.
5. **Given** a request that cannot be planned, **When** the failure is shown, **Then** it occupies the result region with its cause and its concrete suggestions, and the assumptions summary still sits below it.
6. **Given** any state of the planner at any supported width, **When** the user looks at the screen, **Then** the map fills the frame behind a single panel, and no second floating container competes with that panel.
7. **Given** a viewport narrower than 1024 px, **When** the user drags the panel between its two rest positions, **Then** it settles either collapsed on the summary or expanded on the full itinerary, and never covers more than 65% of the viewport height.
8. **Given** the mobile browser shows and hides its URL bar, **When** that happens, **Then** the panel's height stays correct and nothing is clipped.
9. **Given** the user resizes from a wide viewport to a narrow one, **When** the panel re-anchors, **Then** the same content and the same controls are present, and only the anchoring differs.

---

### User Story 2 - See how much free time is left at each step (Priority: P1)

Reading the itinerary, the subscriber sees for each point of the journey how much of their free window will still be in hand when they get there. A horizontal gauge beside each figure is filled to the amount that remains, so a glance is enough: a full gauge means comfortable, an empty one means the segment is on the edge. The journey reads top to bottom as one continuous list in which the anchor stops are steps in their own right, at the same rank as the start and the destination.

**Why this priority**: This is the one thing the product does that nothing else does, and the current wording asks the user to do the subtraction themselves. Reporting time consumed instead of time remaining is explicitly forbidden by `docs/ui-guidelines.md`. It ships with US1 because the two together define the new result region.

**Independent Test**: With a frozen station snapshot and fixed parameters, produce an itinerary and verify that each free-window-consuming step reports remaining time at arrival, that no step reports consumed time or a consumed percentage, and that the gauge fill is proportional to the remaining time.

**Acceptance Scenarios**:

1. **Given** a bike segment that uses part of the free window, **When** the user reads its step, **Then** it states the free time that will remain on arrival, expressed as an estimate.
2. **Given** any step in the itinerary, **When** the user reads it, **Then** no consumed duration and no consumed percentage of the free window is shown anywhere.
3. **Given** two steps with different remaining time, **When** the user compares their gauges without reading the figures, **Then** the step with more remaining time has the visibly fuller gauge.
4. **Given** an itinerary with anchor stops, **When** the user reads the list, **Then** start, anchor stops and destination appear as steps of one continuous list, and no anchor stop is demoted to an annotation.
5. **Given** a walking leg or a docking wait, **When** the user reads it, **Then** it carries no remaining-time gauge, because it does not consume the free window.
6. **Given** a user who cannot distinguish the gauge colours, **When** they read any step, **Then** the remaining time is still available as a figure and as a non-colour cue.
7. **Given** a step whose remaining time is at or near zero, **When** the user reads it, **Then** the gauge is empty and the step is marked as the alarming state.
8. **Given** a free window of 45 minutes, a safety margin of 5, and a bike segment of 18, **When** the user reads that segment, **Then** it reports 22 minutes remaining, not 27.
9. **Given** a bike segment that follows an anchor stop, **When** the user reads the step where that segment begins, **Then** the remaining free time is full again, because docking reset the window.
10. **Given** the user raises the safety margin, **When** the itinerary recomputes, **Then** every remaining-time figure falls, because the margin is held back rather than counted as time in hand.

---

### User Story 3 - Change the safety margin without losing your place (Priority: P2)

The subscriber decides the plan is cutting it too fine and wants more slack. They open the assumptions line, find the safety margin as the only control offered, move it, and watch the itinerary update. Their reading position does not jump and the map does not recentre or rezoom. The other assumptions are still reachable, one level deeper, behind a group that is closed until they open it.

**Why this priority**: It makes the reordering usable rather than merely correct. Without it, the assumptions line is a place things went to hide. It depends on US1 having established the new order.

**Independent Test**: Open the assumptions, change the safety margin, and verify the itinerary recomputes while scroll position, map centre and map zoom are unchanged from before the interaction.

**Acceptance Scenarios**:

1. **Given** the assumptions are closed, **When** the user opens them, **Then** the safety margin is the only control shown, and every other assumption is inside a group that is closed.
2. **Given** the assumptions are open, **When** the user changes the safety margin, **Then** the itinerary updates and the reading position is unchanged.
3. **Given** a computed itinerary shown on the map, **When** the user changes any assumption, **Then** the map centre and zoom are unchanged.
4. **Given** the assumptions are open, **When** the user opens the group of remaining assumptions, **Then** every parameter that influences the result is present and adjustable.
5. **Given** an assumption is set to a value that cannot produce a plan, **When** the user releases the control, **Then** the reason is stated and a usable value is offered, without an unexplained empty result.
6. **Given** the assumptions are closed, **When** the user reads the summary line, **Then** it states enough to know whether the assumptions are the defaults or have been changed.

---

### User Story 4 - Judge whether the stops are worth it (Priority: P3)

Having seen an itinerary with two stops, the subscriber wonders whether the detour is worth the trouble. One action shows the same trip ridden straight through with no stop at all, together with the amount it would cost. They can now decide: pay and ride straight, or stop twice and pay nothing.

**Why this priority**: It turns an itinerary into an argument. It is the most direct demonstration of the product's value, but the product is useful without it, so it ships last.

**Independent Test**: With an itinerary that contains at least one anchor stop, trigger the comparison and verify that a no-stop version of the same trip is shown with its estimated duration and the amount that would be billed.

**Acceptance Scenarios**:

1. **Given** an itinerary containing at least one anchor stop, **When** the user triggers the comparison, **Then** the same trip is shown ridden without any stop, with its estimated duration and the amount that would be billed.
2. **Given** the comparison is shown, **When** the user compares its walking legs with the planned itinerary's, **Then** they are identical, and the anchor stops are the only difference between the two.
3. **Given** the comparison is shown, **When** the user dismisses it, **Then** the planned itinerary returns unchanged, and the map centre and zoom are unchanged throughout.
4. **Given** an itinerary that already needs no stop, **When** the user views the summary, **Then** it states that the trip is already free and the comparison offers nothing further to reveal.
5. **Given** the comparison is shown, **When** the user reads the amount, **Then** it is worded as an estimate, states the assumptions it rests on, and is accompanied by the time saved or lost against the planned trip.
6. **Given** an itinerary walked end to end with no bike segment, **When** the user triggers the comparison, **Then** it says plainly that there is no ride to compare, instead of showing an amount.
7. **Given** the user's plan bills overage at a different rate than the default, **When** they adjust the overage rate among the assumptions, **Then** the amount shown by the comparison follows it.
8. **Given** the comparison is open, **When** the user changes the safety margin, **Then** the comparison stays open and both figures follow the change, so the effect of the assumption on the price is visible while the control is being moved.

---

### Edge Cases

- An itinerary with more than two anchor stops does not fit without scrolling. The summary and the first steps must still occupy the top of the result region, and the list scrolls without the assumptions line overlapping it.
- A trip short enough to need no stop at all: the list is start, one ride, destination; the summary says the trip is already free.
- A trip walked end to end with no bike segment: no remaining-time gauge appears anywhere, and the no-stop comparison has nothing to compare.
- A bike segment that consumes the entire usable budget: remaining time is zero, not negative, and the gauge is empty rather than absent.
- The safety margin is raised until no plan exists: the failure occupies the result region and names the safety margin as the cause.
- The station feed is stale or unavailable: the result region still states the snapshot's age and the feed's condition, and this notice does not push the itinerary below the fold.
- A viewport at the 360 px minimum width: the step list, the gauge and the assumptions line all remain readable and operable.
- Reduced motion is requested: opening the assumptions, revealing the comparison, and moving the sheet between its rest positions do not animate.
- The collapsed sheet on a narrow viewport: enough of the summary is above the fold to answer "how long, how many stops, is it free" without expanding.
- A viewport shorter than the sheet's collapsed height, such as a phone held sideways: the panel stays operable and the map stays visible behind it.
- The map is being panned or a pin dragged while the sheet is expanded: the sheet does not intercept gestures meant for the map.
- The screen is operated by keyboard only: the assumptions line, the nested group and the comparison action are all reachable and their focus is visible.
- Assumptions are changed while the comparison is displayed: the comparison stays open and its duration and amount follow the change, never left showing a figure from superseded assumptions.
- An assumption is changed until the plan itself fails while the comparison is open: the failure occupies the result region, and the comparison does not survive as an orphan attached to a plan that no longer exists.

## Requirements *(mandatory)*

### Functional Requirements

#### Order and density of the panel

- **FR-101**: The result region MUST appear before any planning parameter control in the reading order of the panel.
- **FR-102**: The panel MUST present its content in this order: endpoint entry, trip summary, itinerary list, assumptions line.
- **FR-103**: At rest, the planning assumptions MUST occupy exactly one summary line, placed after the itinerary list.
- **FR-104**: A trip with up to two anchor stops MUST be entirely readable, summary and every step included, without scrolling on a viewport 700 px tall.
- **FR-105**: The trip summary MUST state the estimated total duration, the number of anchor stops, and the cost of the planned trip.
- **FR-106**: When no plan has been requested yet, the result region MUST invite the user to set the two endpoints rather than report an absence.
- **FR-107**: When a plan is impossible, the result region MUST state the cause and offer the concrete adjustments that would make a plan possible, keeping the assumptions line below it.

#### Remaining free time

- **FR-108**: Each step that consumes the free window MUST state the free time that will remain on arrival at that step, measured against the usable segment budget, that is the free window once the safety margin is set aside.
- **FR-108a**: The safety margin MUST NOT be presented as time in hand. It is held back, and no figure or gauge in the itinerary may include it.
- **FR-108b**: Remaining free time MUST be full at the start of every bike segment that follows an anchor stop, because docking resets the window.
- **FR-109**: The interface MUST NOT display free-window time consumed, nor a percentage of the free window consumed, anywhere.
- **FR-110**: Each such step MUST carry a horizontal gauge filled in proportion to the free time remaining, so that more remaining time reads as a fuller gauge.
- **FR-111**: The remaining time MUST be classified into exactly three states, using the absolute-duration thresholds defined in `docs/ui-guidelines.md` applied to the remaining segment budget, and this three-state code MUST NOT appear anywhere else in the interface.
- **FR-112**: The remaining time MUST NOT be carried by colour alone: the figure MUST always be present, and a non-colour cue MUST convey the state to assistive technology.
- **FR-113**: Remaining time MUST be worded as an estimate and MUST NOT be presented as a clock time or an arrival time.
- **FR-114**: Steps that do not consume the free window, namely walking legs and docking waits, MUST NOT carry a remaining-time gauge, and MUST say plainly that they do not use the free window.
- **FR-115**: Remaining time MUST be produced by the domain layer as part of the itinerary and MUST NOT be computed inside a display component.

#### The itinerary as one continuous list

- **FR-116**: The itinerary MUST read as a single continuous top-to-bottom list.
- **FR-117**: Anchor stops MUST appear as steps of that list at the same rank as the start and the destination, and MUST NOT be reduced to annotations on the map or on another step.
- **FR-118**: Each step MUST be distinguishable as start, anchor stop, or destination without relying on its position alone.
- **FR-119**: Each anchor stop MUST name the station it takes place at.

#### Assumptions

- **FR-120**: When the assumptions are opened, the safety margin MUST be the only control presented at the first level.
- **FR-121**: Every other parameter that influences the result MUST be inside a group that is closed by default and can be opened explicitly, and MUST remain adjustable there.
- **FR-122**: Changing any assumption MUST NOT change the user's reading position in the panel.
- **FR-123**: Changing any assumption MUST NOT change the map's centre or zoom.
- **FR-124**: Opening or closing the assumptions MUST NOT change the map's centre or zoom.
- **FR-125**: The closed assumptions line MUST indicate whether the assumptions are at their defaults or have been changed.
- **FR-126**: An assumption set to a value that cannot produce a plan MUST be explained, with a usable value offered, rather than producing an unexplained empty result.
- **FR-127**: Users MUST be able to restore every assumption to its default in one action.

#### No-stop comparison

- **FR-128**: Users MUST be able to display, from the itinerary, the same trip ridden with no anchor stop at all.
- **FR-128a**: The no-stop ride MUST run between the planned itinerary's own pickup and drop-off stations, as a single bike segment, so that the two walking legs are identical to the planned ones and the stops are the only thing that differs.
- **FR-128b**: The no-stop ride MUST be costed on the same terms as any bike segment, including the per-segment overhead, and MUST NOT be exempted from the free window's arithmetic merely because it exceeds it.
- **FR-129**: The no-stop view MUST state the estimated duration of that ride and the amount that would be billed for it.
- **FR-129a**: The no-stop view MUST state the time saved or lost against the planned itinerary, so the amount is read against what it buys.
- **FR-130**: The billed amount MUST be presented as an estimate and MUST state the assumptions it rests on.
- **FR-131**: The billed amount MUST be derived from an overage rate held as a planning parameter, with a conservative default whose provenance is documented. It MUST NOT require a feed, an account, or a key.
- **FR-132**: When the planned itinerary contains no bike segment at all, so that there is no pickup or drop-off station to ride between, the no-stop view MUST say so plainly instead of showing an amount.
- **FR-133**: The overage rate MUST be visible and adjustable alongside the other assumptions, and MUST be restored to its default by the single action of FR-127.
- **FR-134**: Dismissing the no-stop view MUST return the planned itinerary unchanged, with the map's centre and zoom unchanged throughout.
- **FR-135**: When an assumption changes while the no-stop view is displayed, the view MUST stay open and recompute alongside the plan. It MUST NOT close itself, and MUST NOT show an amount computed from superseded assumptions.

#### Panel shell

- **FR-139**: The map MUST occupy the full frame of the viewport. It MUST NOT be cropped, framed, or presented as one tile among others.
- **FR-140**: A single panel MUST overlay the map and MUST hold the entire interface: endpoint entry, summary, itinerary and assumptions. No other floating container is permitted.
- **FR-141**: Below 1024 px wide, the panel MUST be anchored to the bottom of the viewport with two rest positions, one collapsed on the summary and one expanded on the full itinerary, and MUST NOT exceed 65% of the viewport height.
- **FR-142**: At 1024 px wide and above, the panel MUST be anchored to the left at a fixed width.
- **FR-143**: The panel MUST present the same content and the same controls at every width; only its anchoring changes.
- **FR-144**: The panel's height MUST stay correct while the mobile browser's URL bar shows and hides, with nothing clipped.
- **FR-145**: Moving between the empty, computed and adjusting states MUST NOT reorganise the map.
- **FR-146**: The panel MUST NOT spend vertical space on prose that the result itself already conveys.

#### Scope of the change

- **FR-136**: The existing routing and planning calculation, meaning where stops are placed, which stations are eligible, and what each leg costs, MUST NOT be changed by this feature.
- **FR-137**: The current result display and parameter display components MUST be replaced rather than adapted, and the code they leave behind MUST be deleted.
- **FR-138**: This feature MUST NOT introduce a to-the-minute arrival time anywhere.
- **FR-147**: The navigation programme of `docs/ui-guidelines.md`, meaning the about page, the language toggle and the panel-header menu, is out of scope for this feature.

### Key Entities

- **Journey step**: One entry of the continuous itinerary list. Carries its role (start, walking leg, ride, anchor stop, destination), the station it happens at when it has one, an estimated duration, and, for steps that consume the free window, the free time remaining on arrival and its three-state classification.
- **Remaining free time**: The usable segment budget still in hand at a given point of the journey, that is the free window less the safety margin less what the ride so far has consumed. Derived in the domain layer from the existing itinerary and the current assumptions. Resets to full at every anchor stop. Never negative; zero is a valid and meaningful value.
- **Trip summary**: The one-glance answer: estimated total duration, number of anchor stops, and the cost of the planned trip.
- **Assumptions summary**: The closed, one-line representation of the planning parameters, stating whether they are at their defaults.
- **Overage rate**: What one minute beyond the free window costs. A planning parameter like any other: visible, adjustable, conservative by default, and documented as to where its default came from.
- **No-stop comparison**: The planned itinerary's own pickup and drop-off stations ridden as one segment, with the planned walks unchanged either side. Carries an estimated duration, an estimated billed amount, and the time saved or lost against the plan. Absent when the plan contains no bike segment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a viewport 700 px tall, a two-stop itinerary is fully readable, summary and all steps, with zero scrolling.
- **SC-002**: Zero planning parameter controls appear above the result region in any state of the planner.
- **SC-003**: At rest, the planning assumptions occupy one line.
- **SC-004**: Changing an assumption leaves the reading position, the map centre and the map zoom identical to their values before the change, in 100% of cases.
- **SC-005**: 100% of free-window-consuming steps report remaining time at arrival, and 0% of steps report consumed time or a consumed percentage.
- **SC-006**: Users can rank two steps by remaining free time from the gauges alone, without reading any figure.
- **SC-007**: The no-stop comparison is reachable from the itinerary in a single action and reports both a duration and an amount, with no account, key or extra feed involved.
- **SC-008**: Reaching the answer to "how long, how many stops, is it free" takes zero scrolling and zero interaction once both endpoints are set.
- **SC-009**: The panel remains readable and fully operable from 360 px wide upward, entirely by keyboard, with visible focus and contrasts meeting WCAG AA.
- **SC-010**: No to-the-minute arrival time appears anywhere in the feature.
- **SC-011**: The map is visible in every state of the planner, at every supported width, without scrolling.
- **SC-012**: On a narrow viewport, the panel at rest never covers more than 65% of the screen height, and the map behind it never has to be scrolled to.

## Constitution Alignment *(mandatory)*

- **Cost & keys**: No server, database, paid service, account or API key is introduced, and no new external endpoint either. The whole feature is presentation over data the application already holds, plus one new local parameter. The overage rate behind FR-131 is a planning parameter with a documented default, not a fetched tariff, so the no-stop comparison has no unavailability state to degrade into and nothing to ask the user to sign up for.
- **Estimate honesty**: The feature shows estimated total duration, estimated per-step duration, estimated remaining free time at each step, and an estimated billed amount for the no-stop ride. All are worded as estimates; none is a clock time or an arrival time (FR-113, FR-130, FR-138). Every parameter that influences a result stays visible and adjustable (FR-121): the safety margin is promoted to the first level, the rest move one level deeper behind an explicit disclosure. That is grouping, not hiding: nothing becomes unreachable, and FR-127 restores the defaults in one action. The overage rate is a parameter on the same terms (FR-133), and its default is conservative and documented like every other.
- **Data sources**: The same GBFS station feeds as feature 001. No new endpoint is added: the overage rate is local, so no tariff feed is consumed and no new ttl, caching or attribution obligation arises. Operator attribution and license display are unchanged. Snapshot age and feed condition remain visible in the result region, and a stale or unavailable feed must not push the itinerary below the fold.

## Assumptions

- The routing engine is untouched. Remaining free time is arithmetic over the itinerary the existing planner already returns and the current parameters; it is a derived value added to the itinerary structure, not a change to how stops are placed or legs are costed (FR-115, FR-136).
- "A common screen" is taken to mean the 700 px viewport height that `docs/ui-guidelines.md` names as its verifiable constraint.
- The three-state thresholds for remaining time are those in `docs/ui-guidelines.md`: comfortable above 15 minutes, neutral from 5 to 15, alarming below 5. These are absolute durations of remaining segment budget, and they replace the previous consumed-share bands of 60% and 85%.
- The gauge is full when the remaining segment budget is untouched, not when the free window is untouched. A rider with a 45 minute window and a 5 minute margin sees a full gauge worth 40 minutes.
- The worked example in `docs/ui-guidelines.md` showing 27 minutes remaining out of 45 illustrates the wording, not the arithmetic. Presenting the safety margin as available time would spend it in advance and make the estimate optimistic, which principle IV forbids.
- "The current result display and parameter display components" are `components/ItineraryList.tsx`, `components/SegmentBudget.tsx` and `components/ParameterPanel.tsx`. They are deleted. `components/PlannerShell.tsx` and the map's framing are restructured rather than deleted, since they hold endpoint entry, geolocation and map-picking behaviour that this feature does not change.
- The panel's current heading and description paragraph are removed rather than shrunk. They spend the top of the screen explaining a result that is now visible immediately, which FR-146 forbids and FR-104 cannot afford.
- Endpoint entry stays above the result. It is an input, but it is the input the result cannot exist without, and `docs/ui-guidelines.md` places it first. The prohibition in FR-101 is on planning parameters, not on choosing where you are going.
- The existing map-arming behaviour survives the restructure. On a narrow viewport the map is now behind the panel rather than above it, so arming no longer needs to scroll the map into view; nothing else about picking, dragging or clearing an endpoint changes.
- The no-stop comparison is a view of the same origin and destination, not a second plan competing for the map. It is shown and dismissed within the panel.
- The no-stop ride is constructed, not searched. It reuses the planned itinerary's endpoints and station pair and applies the same per-segment cost model, so it introduces no second route search and does not touch the planner (FR-136). Holding the walks and the stations fixed is what makes the comparison mean anything: the anchor stops are the only variable.
- Because the ride is constructed rather than searched, it is always producible whenever the plan contains at least one bike segment. There is no "no direct route exists" case; the only absence is a walk-only plan (FR-132).
- The overage rate's default value is not fixed by this spec. Planning must source it from the operator's published tariff and record where and when that was read, in the manner the existing defaults in `lib/params.ts` document themselves. A default nobody can justify is a guess wearing a number.
- Product copy language is out of scope. This spec fixes what is said, not in which language.
- The feature branch `002-refonte-affichage-resultat` was cut from `main`, which does not contain the feature 001 implementation. The work described here presumes that implementation is present; the branch must be rebased onto `001-free-window-trip-planner` (or that branch merged into `main` first) before implementation can begin.
