# Feature Specification: Real Route Geometry

**Feature Branch**: `004-real-route-geometry`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "Fonctionnalité: tracé réel sur infrastructure cyclable. L'itinéraire s'affiche actuellement comme une ligne droite entre les stations. L'utilisateur voit où il doit s'arrêter, mais pas par où passer. La ligne traverse des obstacles infranchissables et ne suit aucune rue, ce qui la rend inutilisable pour se déplacer et trompeuse sur la distance réelle. Attendu: pour chaque segment à vélo, le chemin réellement praticable à vélo entre les deux stations; pour chaque segment à pied, le chemin praticable à pied; les stations d'ancrage restent nettement identifiables; l'utilisateur distingue d'un coup d'œil un tracé réel d'une estimation et n'est jamais laissé à croire qu'une approximation est un itinéraire vérifié. Fiabilité des durées: la durée affichée reflète le tracé réel quand il existe; si la durée réelle dépasse la fenêtre gratuite alors que l'estimation le jugeait acceptable, l'utilisateur en est informé et se voit proposer un itinéraire corrigé; l'écart entre estimation et réalité alimente la précision des calculs ultérieurs. Dégradation: sans tracé réel l'application reste pleinement fonctionnelle, avec une représentation explicitement approximative et une mention de son statut; aucune fonctionnalité essentielle n'en dépend; l'attente du tracé ne bloque pas l'affichage du plan. Contraintes: la détermination des stations d'arrêt reste calculable sans accès réseau autre que les données de stations; consulter deux fois le même trajet ne redemande pas les mêmes tracés. Hors périmètre: instructions virage par virage, choix entre variantes de tracé, préférences de type de voie."

**Language note**: Written in English for consistency with `specs/001-free-window-trip-planner/spec.md`, `specs/002-refonte-affichage-resultat/spec.md` and `specs/003-maintainable-i18n/spec.md`. The product's own copy stays French-first; wording is governed by `docs/ui-guidelines.md` and by feature 003, not by this spec.

**Requirement numbering**: Requirements are numbered from FR-301 so that code comments referencing FR-0xx (feature 001), FR-1xx (feature 002) and FR-2xx (feature 003) remain unambiguous.

**Relationship to feature 001**: This feature does not change the *mechanism* by which anchor stations are chosen or a trip is segmented. The same graph search runs; what changes is the distance it is given for a station pair, which may now come from a measurement rather than from a straight line multiplied by a detour factor. It also replaces what the user is shown between two anchors, and it corrects a duration once the real path is known. FR-004 (every segment at or below the free limit minus the safety margin) stays the invariant; this feature makes it hold against real distances.

*Amended 2026-07-28 (US7)*: better distances change **which** stations the search returns. The original wording said this feature does not change how anchor stations are chosen, which was true of US1 through US5 and reads as forbidding US7. The distinction that holds throughout is between the search, which is untouched, and its inputs, which improve.

## Clarifications

### Session 2026-07-28

- Q: When a refined duration invalidates the plan, is the corrected itinerary substituted
  automatically or offered as an explicit choice? → A: Substituted automatically. The measured
  duration is injected into the planner's cost function and the plan is recomputed; the over-budget
  edge disappears from the graph, so the correction falls out of an ordinary replan rather than
  needing a separate repair path. The user is told the plan was corrected and why.
- Q: Does reuse of obtained paths persist across visits? → A: For station-to-station geometry, yes:
  it is invariant, so it is stored browser-locally under a key made of the two station ids and the
  profile, and is purgeable from the settings. Walk legs depend on an arbitrary point, so they are
  not persisted; they are reused within the session only, which is what FR-328 needs to hold for a
  trip consulted twice without accumulating unbounded storage keyed on coordinates.
- Q: Is the value that calibration adjusts moved automatically or proposed to the user? → A:
  Unresolved. FR-335 remains open; US6 is P3 and nothing above it depends on the answer.

### Session 2026-07-28 (second)

- Q: Anchor stations are chosen from a straight-line estimate before the real route is known, which
  is why corrections exist at all. Can the route be obtained first and the stops chosen along it?
  → A: Yes, as an input to the existing search rather than as a replacement for it. Measured: one
  route through a dense corridor passes within 100 m of 21 stations, which yields real distances for
  210 station pairs from a single request, against the 4 or 5 pairs measured today. *The band
  eventually chosen was 150 m, not the 100 m quoted here, and the corridor measured here was never
  committed. Re-measured against the corridor and station fixtures that are in the repository,
  a 150 m band gives 23 stations and 253 pairs (research R13). The figures in this answer are what
  was known at the moment it was given and are kept as the record of it.* Those distances
  are fed to `planTrip` through the `measured` parameter that already exists, and the plan is
  recomputed, so the stops are chosen knowing the real corridor. The graph search is kept, because
  a pure route-first design cannot reach a station-dense parallel axis when the direct corridor is
  poor, and cannot recover when no valid segmentation exists along the line.
- Q: FR-325 requires stop selection to be computable from station data alone. Does the corridor
  approach violate it? → A: The constraint is lifted by the author. A first plan already requires
  the station feed, so requiring the network for a *better* plan adds no new class of dependency.
  FR-325 is amended below: what must survive a routing failure is that a usable plan still exists,
  not that it be the best one.
- Q: Does lifting FR-325 also lift FR-321, the promise that the plan appears immediately? → A: No.
  The estimated plan is kept as the first phase precisely because it costs nothing to keep: it is
  already built and tested, it holds the immediate display, and it is what remains when the routing
  service is unreachable. The corridor refines it; it does not replace it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the path you can actually ride (Priority: P1)

A subscriber has a plan with two anchor stops. Instead of three straight lines cutting across the river and the rail yard, the map shows, for each bike segment, the way a person on a bike would actually go: along streets and cycling infrastructure, around what cannot be crossed. The anchor stations remain the visually dominant points of the journey, so the rider still reads the plan as "ride here, dock, ride there" rather than as an undifferentiated ribbon.

**Why this priority**: This is the reported defect. A line that crosses an uncrossable barrier is not merely imprecise, it is unusable for the one thing a rider does with it, which is get from one dock to the next. Delivered alone, with durations untouched, it already turns the map from decoration into something a person can follow.

**Independent Test**: With a frozen station snapshot, plan a trip whose straight-line segment crosses a known barrier (a river span with no bridge at that point, or a rail corridor), and verify the displayed bike path follows a continuous rideable way between the two stations and does not cross the barrier away from a crossing.

**Acceptance Scenarios**:

1. **Given** a bike segment whose two stations sit on opposite banks of a river, **When** the traced path is available, **Then** the displayed path crosses the water only at a bridge and stays on ways a bike may use.
2. **Given** any bike segment with a traced path, **When** the user views the map, **Then** the path begins at the departure station and ends at the arrival station, with no visible gap between the path and either station marker.
3. **Given** an itinerary with two anchor stops, **When** the user views the map, **Then** the anchor stations remain distinctly identifiable as points along the journey and are not obscured by the path.
4. **Given** an itinerary of several segments, **When** their paths are displayed, **Then** consecutive segments meet at their shared station rather than merging into one indistinguishable line.

---

### User Story 2 - Never mistake an approximation for a verified route (Priority: P1)

The path source is unreachable, or answers for two segments out of three. The rider still gets a complete, usable plan. What they see for the untraced segments announces itself as an approximation, in the shape of the line and in words, and it is never dressed up as a route somebody checked. The rider can tell, at a glance and per segment, which parts of the journey have been verified and which have not.

**Why this priority**: Principle IV. An approximation presented as a route is worse than no route at all, because the rider acts on it. This story is what makes US1 safe to ship: without it, a partial success looks identical to a full one. It is independently testable and independently valuable, since it also improves today's straight-line display.

**Independent Test**: Force the path source to fail for one segment of a three-segment itinerary and succeed for the others, then verify the plan is complete and usable, that the untraced segment is visually and textually marked as approximate, that the traced ones are not, and that the distinction survives the removal of colour.

**Acceptance Scenarios**:

1. **Given** a segment with no traced path, **When** the user views the map, **Then** that segment is drawn in a form that reads as an approximation and is visibly different from a traced segment, colour removed.
2. **Given** a segment with no traced path, **When** the user reads the itinerary, **Then** the step states in words that this part is an approximation, and that statement is available to assistive technology.
3. **Given** an itinerary where some segments are traced and others are not, **When** the user views it, **Then** the status is stated per segment and no single global claim declares the whole itinerary verified.
4. **Given** the path source is entirely unreachable, **When** the user requests a plan, **Then** a complete itinerary is computed, displayed and usable, every segment is marked as an approximation, and no raw error and no blank screen appears.
5. **Given** any segment, traced or not, **When** its duration is displayed, **Then** it is worded as an estimate, and no to-the-minute arrival time appears anywhere.

---

### User Story 3 - Durations that match the path shown (Priority: P2)

The straight-line estimate said the second segment took 31 minutes and fit inside the free window. The real path is longer, and the segment now takes 38 minutes. The rider is told this, sees the corrected figures on every step that depends on them, and is offered a plan that actually works instead of one that quietly does not.

**Why this priority**: A path drawn accurately beside a duration computed from a straight line is a new inconsistency, and the free-window promise is the product. This depends on US1 producing paths, but it is separately testable and it is what makes the feature more than cosmetic.

**Independent Test**: With a fixed itinerary and a stubbed path whose distance exceeds the estimate, verify the segment's displayed duration comes from the traced path, that the total and every remaining-time figure follow, and that a segment pushed past the usable budget triggers the corrected-itinerary path rather than being displayed as valid.

**Acceptance Scenarios**:

1. **Given** a segment with a traced path, **When** its duration is displayed, **Then** that duration is derived from the traced path and not from the straight-line estimate.
2. **Given** refined segment durations, **When** the itinerary is displayed, **Then** the total duration, the remaining free time at each step and every gauge are computed from the refined values.
3. **Given** a segment whose estimated duration fitted the usable budget but whose refined duration exceeds it, **When** the refinement arrives, **Then** the user is informed that the plan no longer holds and is offered a corrected itinerary.
4. **Given** the situation above, **When** the user has not yet acted on the offer, **Then** the invalidated plan is not presented as valid.
5. **Given** a corrected itinerary, **When** it is displayed, **Then** it is subject to the same tracing, refinement and budget checks as any other plan.
6. **Given** a segment whose refined duration is shorter than the estimate, **When** it is displayed, **Then** the shorter value is used and no correction is offered.

---

### User Story 4 - Walking legs follow real footpaths (Priority: P2)

The walk from the rider's starting point to the first station no longer cuts diagonally through a block. It follows the streets and paths a person on foot would actually take, with a duration to match.

**Why this priority**: Same defect, smaller stake: walks are shorter and do not consume the free window, so a wrong walk misleads about a few minutes rather than about the whole plan. Independently testable and independently shippable after US1.

**Independent Test**: Plan a trip whose first walk crosses a closed block or a park with no through path, and verify the displayed walk follows a walkable way and that its displayed duration comes from that way.

**Acceptance Scenarios**:

1. **Given** a walk leg with a traced path, **When** the user views the map, **Then** the walk follows ways a person on foot may use.
2. **Given** a walk leg with a traced path, **When** its duration is displayed, **Then** that duration comes from the traced path.
3. **Given** a walk leg with no traced path, **When** the user views it, **Then** it is marked as an approximation under the same rules as a bike segment.
4. **Given** any walk leg, traced or not, **When** the itinerary is displayed, **Then** it is still identified as not consuming the free window.

---

### User Story 5 - The plan appears immediately and sharpens afterwards (Priority: P2)

The rider requests a plan and reads the answer straight away: how long, how many stops, where. A moment later the straight lines resolve into real paths and the durations settle. Nothing jumps under their finger, the map does not re-frame itself, and they never wait on a spinner to learn whether their trip is possible.

**Why this priority**: The plan is computed locally in under a second today. Making it wait on a network round trip per segment would trade the product's responsiveness for its accuracy when both are available. Testable on its own by holding every path response and verifying the plan is complete before any of them arrive.

**Independent Test**: Delay all path responses by several seconds, request a plan, and verify the full itinerary is displayed and usable before the first response arrives, then that the refinements land without moving the map or the reading position.

**Acceptance Scenarios**:

1. **Given** a plan request, **When** the itinerary has been computed, **Then** it is displayed complete and usable before any traced path is available.
2. **Given** a displayed itinerary, **When** traced paths arrive one by one, **Then** each segment updates as its path arrives, without waiting for the others.
3. **Given** the user has panned or zoomed the map, **When** a traced path arrives, **Then** the map keeps its centre and zoom.
4. **Given** the user is reading the itinerary, **When** a traced path arrives, **Then** their reading position is preserved and no content jumps beneath the pointer.
5. **Given** the user changes a parameter or an endpoint while paths are in flight, **When** the new plan is computed, **Then** results for the abandoned plan do not overwrite the new one.

---

### User Story 6 - Estimates that learn from reality (Priority: P3)

Over successive trips, the gap between what the straight-line model predicted and what the real paths turned out to be stops being repeated. The first, instantly displayed version of a plan gets closer to the refined one, so fewer plans need correcting at all.

**Why this priority**: A genuine improvement, but the product works without it and its value only accumulates with use. It depends on US3 producing measured gaps.

**Independent Test**: Feed a sequence of recorded estimate-versus-traced observations and verify the value used for later estimates moves toward the observed ratio, that it remains visible and adjustable, and that it can be restored to its documented default.

**Acceptance Scenarios**:

1. **Given** a set of completed traced paths, **When** the gap between the estimated and the traced geometry is known, **Then** that gap is recorded.
2. **Given** recorded gaps, **When** a later plan is estimated before any traced path is available, **Then** the estimate reflects them.
3. **Given** a value adjusted from observation, **When** the user opens the planning assumptions, **Then** that value is visible, is identified as adjusted from observation, and is adjustable.
4. **Given** a value adjusted from observation, **When** the user restores defaults, **Then** the documented default is restored.

---

---

### User Story 7 - Stops chosen along the route you will actually ride (Priority: P2)

The rider's stops are picked before anything is known about the real route, from a straight line
multiplied by a detour factor. Where reality diverges from that factor, and it diverges most exactly
where it matters, at rivers, rail cuts and motorway crossings, the stops are picked wrongly and the
plan has to be corrected afterwards. This story removes the guess: the corridor the rider will
actually ride is measured once, and the stops are chosen along it.

**Why this priority**: it makes US3's correction the exception rather than the routine. It also
costs the routing service almost nothing, which is why it is worth doing at all: a single request
through a dense corridor yields real distances for hundreds of station pairs, where today five
requests yield five.

**Independent Test**: with a frozen station snapshot and a recorded route for one corridor, verify
that the along-route distances derived from that single geometry are supplied for every station pair
near the line, that the recomputed plan uses them, and that the plan is unchanged when the geometry
is unavailable.

**Acceptance Scenarios**:

1. **Given** a displayed plan and a route obtained between its pickup and drop-off stations,
   **When** stations near that route are projected onto it, **Then** the along-route distance between
   each pair of them is available without any further request.
2. **Given** those distances, **When** the plan is recomputed, **Then** the anchor stops are chosen
   using them rather than using the straight-line estimate for those pairs.
3. **Given** a station that lies far from the route, **When** distances are derived, **Then** no
   along-route distance is claimed for it, and its edges keep the estimate.
4. **Given** a station that lies near the route but off it, **When** its along-route distance is
   derived, **Then** the cost of leaving the route and rejoining it is included.
5. **Given** the routing service is unreachable, **When** the plan is requested, **Then** the
   itinerary of US1 is produced, displayed and usable exactly as before, from the estimate alone.
6. **Given** a corridor with no valid segmentation, **When** the plan is recomputed, **Then** the
   graph search still considers stations away from the route and may return a plan that leaves the
   corridor.
7. **Given** a recomputed plan, **When** the rider reads it, **Then** its stops are presented as an
   ordinary plan, not as a correction, because nothing was invalidated: the first plan was an
   estimate and said so.

---

### Edge Cases

- **Path source unreachable, slow, or rate-limiting**: the plan is unaffected in its computation and its display; every affected segment is marked as an approximation. No raw error surfaces, and the application does not retry in a way that worsens the source's load.
- **The device is offline**: planning still works from cached station data under the existing rules, and every segment is an approximation.
- **The source answers with no path between two stations**: the segment is treated as untraced and marked as an approximation, distinctly from a request that failed where that distinction helps the user act.
- **A returned path is implausible**: its distance is a large multiple of the straight-line distance, or its endpoints sit far from the stations. It is rejected and the segment falls back to its approximation rather than displaying a path the rider would not take.
- **A path starts or ends on the far side of the street from the station**: the station marker stays the authoritative anchor, and the displayed path visibly meets it.
- **Every segment refines over budget at once**: the user is told once about the plan rather than once per segment, and is offered a single corrected itinerary.
- **The corrected itinerary refines over budget in turn**: correction converges or stops with an explicit statement; it does not loop.
- **The user changes a parameter while paths are in flight**: results belonging to the superseded plan are discarded, not applied to the new one.
- **The same trip is consulted twice**: no path is requested a second time.
- **A trip is planned again after stored paths have aged**: the application either reuses them or refreshes them, and in both cases the displayed status stays accurate.
- **A very long segment, or an itinerary with many segments**: the number of requests stays bounded, and a plan is never held back waiting for them.
- **A station used by a stored path has moved or disappeared from the feed**: the stored path is not reused for a segment it no longer describes.

## Requirements *(mandatory)*

### Functional Requirements

**Traced paths**

- **FR-301**: For every bike segment of a displayed itinerary, the application MUST display the path actually rideable by bike between that segment's two stations, following streets and cycling infrastructure, whenever such a path can be obtained.
- **FR-302**: For every walk leg, the application MUST display the path actually walkable between its two endpoints, whenever such a path can be obtained.
- **FR-303**: A path MUST be obtained for the travel mode of its own step. A bike segment MUST NOT be drawn from a walking path, nor a walk leg from a cycling path.
- **FR-304**: Anchor stations, the origin and the destination MUST remain distinctly identifiable along the displayed journey, and MUST NOT be obscured by the traced path.
- **FR-305**: A displayed path MUST visibly meet its station markers at both ends, with no gap, even when the underlying path's own endpoints sit on the roadway rather than on the station.
- **FR-306**: Consecutive segments MUST remain visually separable at the station they share, so that an itinerary of several segments does not read as one continuous ride.

**Truthful status**

- **FR-307**: Every bike segment and every walk leg MUST carry a status distinguishing a traced path from an approximation.
- **FR-308**: That status MUST be perceivable on the map without reading any text, MUST remain perceivable when colour is removed, and MUST also be stated in words in the itinerary.
- **FR-309**: The words stating the status MUST be available to assistive technology.
- **FR-310**: An approximation MUST NOT be drawn in the form used for a traced path. Its visual weight MUST be lower than that of a traced path, never equal or greater.
- **FR-311**: When some parts of an itinerary are traced and others are not, the status MUST be stated per part. The application MUST NOT make a single claim covering the whole itinerary that would be false for any part of it.
- **FR-312**: Durations MUST continue to be presented as estimates whether they come from a traced path or from an approximation, and the application MUST NOT display a to-the-minute arrival time (FR-020).

**Durations and correction**

- **FR-313**: When a traced path is available for a step, the duration displayed for that step MUST be derived from that path rather than from the straight-line estimate.
- **FR-314**: The itinerary's total duration, the remaining free time reported at each step, and every proportional gauge MUST be recomputed from refined values as they arrive.
- **FR-315**: When a refined duration pushes a bike segment past the usable segment budget that its estimate had judged acceptable, the application MUST inform the user that the plan no longer holds.
- **FR-316**: In that case the application MUST replan with the measured duration in hand and MUST display the corrected itinerary in place of the invalidated one, stating that the plan was corrected and why. The substitution is automatic; the user is informed, not asked.
- **FR-317**: An invalidated plan MUST NOT be presented as valid at any point between the discovery of the violation and its resolution.
- **FR-318**: A corrected itinerary MUST be subject to the same tracing, refinement and budget checks as any other plan.
- **FR-319**: Correction MUST terminate. The application MUST bound the number of successive corrections and, on reaching that bound, MUST state plainly that it cannot produce a plan that holds under real distances, with at least one concrete adjustment the user can make (FR-028).
- **FR-320**: A refined duration shorter than its estimate MUST be used as-is and MUST NOT trigger a correction.

**Non-blocking behaviour and degradation**

- **FR-321**: The itinerary MUST be computed, displayed and usable before any traced path is available. Obtaining a path MUST NOT be a precondition of first display.
- **FR-322**: Traced paths MUST be applied progressively as they arrive, each step updating independently of the others.
- **FR-323**: Applying a traced path MUST preserve the map's centre and zoom, and MUST preserve the user's reading position in the itinerary.
- **FR-324**: When obtaining a path fails, times out, or returns nothing, the application MUST remain fully functional, MUST keep the approximation for that step, MUST state its status, and MUST NOT surface a raw error or a blank screen.
- **FR-325**: A usable itinerary MUST remain computable from station data alone, with no network access beyond the station feeds. Anchor selection MAY be *improved* by network-derived geometry, but the application MUST still produce, display and explain a complete plan when no such geometry can be obtained. What survives a routing failure is a usable plan, not the best possible one.
  *Amended 2026-07-28: the original wording required anchor selection itself to be network-free, which forbade the corridor refinement of US7. A first plan already requires the station feed, so depending on the network for a better plan adds no new class of dependency. The guarantee that matters, and that is kept, is that a routing failure degrades the plan rather than removing it.*
- **FR-326**: A path failing a stated plausibility check, such as a length far in excess of the straight-line distance or endpoints far from the step's own endpoints, MUST be rejected, and the step MUST fall back to its approximation.
- **FR-326a**: A plausibility bound MUST NOT be expressed as a ratio alone. A ratio is meaningless at short range, where a correct route around one obstacle is several times the straight-line distance, and rejecting it is invisible because an approximation is what an unfetched step already looks like. Every bound carries an absolute term.
- **FR-326b**: The endpoint tolerance MUST distinguish a station, whose position is placed on a street by its operator, from an arbitrary point, which may be anywhere and whose nearest walkable way may legitimately be some distance off.
- **FR-327a**: Superseding a plan MUST NOT prevent the new plan from obtaining a path. A request abandoned with its plan MUST NOT be reported as "no path" to a later request for the same geometry.
- **FR-327**: Results belonging to a superseded plan MUST NOT be applied to a later one.

**Reuse and respect for the source**

- **FR-328**: A path once obtained MUST be reused. Consulting the same trip a second time MUST NOT request the same paths again.
- **FR-329**: Reuse MUST be keyed on what determines the path, meaning its two endpoints and its travel mode, so that an unchanged segment inside a changed itinerary is not requested again.
- **FR-329a**: Station-to-station geometry is invariant and MUST be stored browser-locally so that reuse survives a reload, keyed on the two station identifiers and the mode. The store MUST be bounded and MUST be purgeable by the user from the settings.
- **FR-329b**: A walk leg's endpoints are arbitrary points, so its path MUST NOT be persisted. Reuse within the session is sufficient for FR-328 and avoids a store keyed on unbounded coordinates.
- **FR-329c**: A stored path MUST NOT be reused for a station pair whose stations have moved or left the feed.
- **FR-330**: The number of path requests issued per plan MUST be bounded, and the request rate MUST stay within the usage policy published by the source.
- **FR-330a**: The number of path requests issued across a whole user request MUST also be bounded, correction rounds included. A per-plan bound alone is insufficient, because each correction produces a new plan and so resets a per-plan count.
- **FR-331**: The path source MUST NOT require an account, an API key, or any other credential, and MUST NOT expose the maintainer to any cost or metered quota.
- **FR-332**: The source's attribution and licence MUST be displayed wherever traced paths are shown, alongside the existing map and feed attribution.
- **FR-333**: The application MUST disclose that obtaining a path sends the endpoints of a step to a third party, so that a user can understand what the feature does before relying on it.

**Route corridor (US7)**

- **FR-338**: The application MUST be able to obtain one route between a displayed plan's pickup and drop-off stations, and to use it as the corridor the rider is expected to ride.
- **FR-339**: Stations lying within a stated distance of that corridor MUST be projected onto it, and the distance along the corridor between any two of them MUST be derivable without any further request.
- **FR-340**: A derived along-route distance MUST include the cost of leaving the corridor to reach a station and of rejoining it, counted in both directions.
- **FR-341**: No along-route distance MAY be claimed for a station further from the corridor than the stated distance. Its edges keep the straight-line estimate.
- **FR-342**: Derived distances MUST be supplied to the planner through the same measured-distance mechanism as directly traced segments, and the plan MUST be recomputed with them.
- **FR-343**: The recomputed plan MUST be produced by the same search as the first one, so that a station-dense axis away from the corridor remains reachable and a corridor with no valid segmentation does not become a planning failure.
- **FR-344**: A plan recomputed from corridor distances MUST NOT be presented as a correction under FR-316. Nothing was invalidated: the first plan was an estimate and was labelled as one.
- **FR-345**: Obtaining the corridor MUST NOT delay the first display of a plan (FR-321), and its failure MUST leave the estimated plan intact and usable (FR-325).
- **FR-346**: A corridor-derived distance MUST NOT be more optimistic than the straight-line model it replaces. Measurement shows an along-route distance is not an upper bound on the real ride between two of its points, underestimating it in two of six sampled pairs and once by a fifth, because a corridor is traversable in the direction it was computed and a rider between two of its points may have to leave it. The corridor may therefore only reveal that a pair is worse than assumed, which is the case it exists to catch.

**Calibration**

- **FR-334**: The application MUST record the gap between a step's estimated geometry and its traced geometry.
- **FR-335**: Recorded gaps MUST improve the estimate used for later plans, so that the immediately displayed version of a plan grows closer to its refined version over time. [NEEDS CLARIFICATION: is the influencing value adjusted automatically from observations, or is an adjustment proposed to the user who applies it?]
- **FR-336**: Any value adjusted from observation MUST remain visible and adjustable by the user (principle IV), MUST be identified as adjusted from observation rather than left indistinguishable from a chosen default, and MUST be restorable to its documented default.
- **FR-337**: Calibration MUST NOT make an estimate more optimistic than its documented default without the observations to support it, and MUST NOT be able to drive an influencing value to an implausible extreme.

### Key Entities

- **Traced Path**: an ordered sequence of positions between two endpoints for one travel mode, carrying the length and the duration reported for it, and the identity of the source it came from.
- **Path Status**: the state of one bike segment or walk leg with respect to tracing: traced, approximate, and where useful the reason it is approximate. Attached per step, never to the itinerary as a whole.
- **Path Key**: the identity under which a path is reused, made of its two endpoints and its travel mode. Two steps with the same key share a path.
- **Path Store**: the client-side store of paths already obtained, with whatever lifetime the reuse rule requires.
- **Refined Step**: a bike segment or walk leg whose displayed geometry and duration come from a Traced Path rather than from the straight-line estimate.
- **Budget Violation**: a bike segment whose refined duration exceeds the usable segment budget its estimate had satisfied, paired with the corrected itinerary offered in response.
- **Detour Observation**: one recorded comparison between a step's estimated geometry and its traced geometry, used to improve later estimates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the path source reachable, 100% of displayed bike segments follow a continuous way a person on a bike may use, and none crosses an uncrossable barrier away from a crossing.
- **SC-002**: A complete, usable itinerary is displayed in 100% of plan requests before any traced path is available, and within the response time already required of a plan.
- **SC-003**: In usability testing, at least 9 of 10 participants correctly identify which parts of a shown itinerary are verified paths and which are approximations, within 5 seconds, without reading any number and with colour removed.
- **SC-004**: With the path source entirely unreachable, 100% of plan requests still produce a complete itinerary, with zero blank screens and zero raw errors.
- **SC-005**: Consulting the same trip a second time within a session issues zero new path requests. After a reload, it issues zero requests for station-to-station geometry, and at most one per walk leg.
- **SC-006**: In 100% of cases where a refined duration exceeds the usable segment budget, the user is informed and offered a corrected itinerary, and in zero cases is the invalidated plan presented as valid.
- **SC-007**: In 100% of steps displayed as traced, the duration shown derives from the traced path; in 100% of steps displayed as approximate, it derives from the estimate.
- **SC-008**: Path retrieval issues at most one request per distinct step per plan, never more than the stated ceiling across a whole user request including correction rounds, and stays within the source's published rate policy in 100% of runs.
- **SC-009**: For a typical itinerary of up to two stops on a typical mobile connection, every traced path is applied within 5 seconds of the plan being displayed.
- **SC-010**: Map centre, map zoom and the user's reading position are preserved across 100% of path arrivals, with no page reload.
- **SC-011**: Source attribution is visible in 100% of sessions in which a traced path is displayed.
- **SC-012**: Once calibration has accumulated observations, the share of plans whose refined durations push a segment over budget is lower than before calibration, measured on a fixed set of trips.
- **SC-013**: No screen in the feature displays a to-the-minute arrival time.
- **SC-014**: One corridor request yields real distances for at least fifty station pairs in a dense network, against the four or five pairs a plan measures directly.
- **SC-015**: On a fixed set of trips, the share of plans whose refined durations push a segment over budget is lower with corridor distances than without.
- **SC-016**: With the routing service unreachable, plans are produced, displayed and usable in 100% of requests, unchanged from the estimate-only behaviour.

## Constitution Alignment *(mandatory)*

- **Cost & keys**: The feature needs no server, no database and no paid service, and all remaining computation stays in the browser. It does introduce a dependency on an external path source, which is the one point of tension. FR-331 makes a credential-free, cost-free source a hard requirement: any source needing an account, an API key, or carrying a metered quota is disqualified however good its paths. FR-330 bounds request volume and rate so a free public source is not abused into withdrawal. If no qualifying source can be found or reached, FR-321, FR-324 and FR-325 keep the application exactly as functional as it is today, with every segment shown as the approximation it already is. Anchor selection and segmentation may be *improved* by network-derived geometry (US7, FR-338 through FR-343), but they never *depend* on it: with the routing service unreachable, a complete and usable plan is still produced from the station feeds alone (FR-325, FR-345, SC-016). *Amended 2026-07-28: this paragraph previously claimed anchor selection never touches the network, which was true before US7 and is not the guarantee that was ever needed. What the constitution requires here is that no essential capability be lost when a free public source is unreachable, and that is what FR-325 as amended states.*
- **Estimate honesty**: The feature shows refined per-segment bike durations, refined walk durations, a refined total, and refined remaining-free-time figures. All stay worded as estimates (FR-312), and FR-020's ban on to-the-minute arrival times is unchanged. A traced path is a better estimate, not a promise: FR-315 through FR-319 exist so that a duration proven wrong produces a corrected plan rather than a silent one. The detour factor and any other value calibration touches stay visible, adjustable and restorable (FR-336), and FR-337 forbids calibration from making an estimate more optimistic than its documented default without the observations to justify it. The status information is itself an honesty mechanism: FR-310 forbids drawing an approximation with the confidence of a verified route.
- **Data sources**: The feature adds one external source alongside the existing GBFS feeds and map tiles. Its attribution and licence are displayed wherever its paths are shown (FR-332), its usage policy and rate limits are honoured (FR-330), and its results are stored and reused rather than requested again (FR-328, FR-329), which is the discipline principle V already imposes on the feeds. Only a public, documented endpoint may be used. An unavailable or malformed response degrades cleanly and visibly (FR-324). Step endpoints leave the browser when a path is requested, which the constitution's browser-local persistence rule makes worth stating rather than assuming, so FR-333 requires the application to say so.

## Assumptions

- The planning logic of feature 001 is not modified beyond consuming refined distances and durations. Its search is unchanged: anchor stations are still chosen, and segments still built, by the same shortest-path run over the same station graph. What US7 changes is the distance that run is given for a pair it can measure (FR-342, FR-343). *Amended 2026-07-28: the original wording said stations are chosen "from station data and the straight-line estimate", which described US1 through US5 and contradicted US7.*
- The straight-line estimate with its detour factor remains the model behind the first, immediately displayed version of every plan, remains the fallback whenever a traced path is unavailable, and remains the floor below which no measured distance may push a pair (FR-346).
- One path per step is enough. The source is asked for a way, not for the best of several, and what it returns for the requested mode is accepted subject to the plausibility check of FR-326.
- A path's own reported duration is a starting point, but the user's configured cycling and walking speeds remain the parameters governing displayed durations, since principle IV requires every influencing parameter to be user-adjustable and a source's internal speed model is not something the user can see or change.
- Station positions remain the authoritative anchors of the journey. A path is drawn between them, not in place of them.
- Traced paths are geometry, not user data. What leaves the browser is a pair of coordinates per step; this application stores nothing on the source's side.
- The source may offer turn-by-turn text, alternatives, or way-type preferences. This feature does not use them.
- The plausibility thresholds of FR-326 are documented with their reasoning, in the manner of the existing planning defaults, rather than left as unexplained constants.

## Out of Scope

- Turn-by-turn navigation instructions, and any live guidance during the ride.
- Offering the user a choice between several path variants for the same step.
- Preferences for the type of way used, such as favouring protected lanes or avoiding hills.
- Elevation, surface quality, and any path attribute beyond geometry and length.
- Changing the algorithm by which anchor stations are selected or a trip is segmented. The shortest-path search of feature 001 stays as specified; US7 feeds it better distances (FR-342, FR-343) rather than replacing it, so the stations it returns may differ while the way it returns them does not. A route-first selection that bypasses the search was considered and rejected, because it cannot reach a station-dense parallel axis when the direct corridor is poor.
- Offline storage of a routable street network in the browser.
- Traffic conditions, time-of-day effects, and seasonal path closures.
