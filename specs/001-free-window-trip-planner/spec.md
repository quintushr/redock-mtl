# Feature Specification: Free-Window Trip Planner

**Feature Branch**: `001-free-window-trip-planner`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "Planifier un trajet à vélo en libre-service en restant dans la fenêtre de gratuité de l'abonnement." Subscriptions include a free duration per ride (e.g. 45 minutes); past that, every minute is billed. Docking a bike at a station and taking it again resets that counter, at the cost of a one-minute operator cooldown. A ride too long to be free can therefore stay free if it is split into short enough segments separated by station stops. This free window applies only to mechanical bikes and only to subscription holders; e-bikes and single-ride passes are billed from the first minute.

**Language note**: This spec is written in English to stay consistent with the project constitution and the rest of the repository documentation. Product copy shown to end users is a separate concern and is not fixed here.

## Clarifications

### Session 2026-07-25

- Q: When a docking station has free docks but no mechanical bike to continue with, are mid-trip
  walking transfers between two stations allowed? → A: Superseded. The question does not arise:
  the rider docks and takes the same bike again after a one-minute operator cooldown, so an
  intermediate stop never depends on another bike being available. Mid-trip walking transfers are
  removed from the feature.
- Q: What does an intermediate stop actually require, and how long does it cost? → A: A free dock
  only, plus a one-minute cooldown before the same bike can be taken again. Mechanical bike
  availability is a constraint on the first pickup station alone.
- Q: Does the application present a single best itinerary, or also alternatives such as a
  fewer-stops variant? → A: A single best itinerary; the user trades stops against tightness by
  adjusting the safety margin (option A).
- Q: How is "outside the network's service area" determined, given FR-029 must stay distinct from
  a routing failure? → A: Outside the footprint enclosed by the network's active stations, plus a
  buffer (option B).
- Q: By what visual means is a near-limit segment distinguished from a comfortable one? → A: A
  proportional fill bar, plus colour, plus a short non-numeric text label exposed to assistive
  technology (option C).
- Q: What response time must a plan computation meet? → A: Under one second on a mid-range phone,
  with debounced controls and no progress indicator (option A).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reach a destination without paying overage (Priority: P1)

A subscriber wants to get somewhere that is farther than one free window allows. They enter a
destination, confirm where they are starting from, and receive a single itinerary broken into
bike segments, each short enough to stay inside the free window, separated by station stops where
they dock their bike and take it again after a short cooldown. The itinerary shows the walk to the
first station, each bike segment with its estimated duration, each docking stop with its cooldown,
and the final walk.

**Why this priority**: This is the entire point of the product. Without it there is nothing to
look at, tune, or explain. Delivered alone it is already a usable tool.

**Independent Test**: With a frozen snapshot of the network's station data, request a plan
between two points that cannot be reached inside one free window, and verify the returned
itinerary is complete end to end (walk, bike segments, stops, walk) and that no bike segment
exceeds the free limit minus the safety margin.

**Acceptance Scenarios**:

1. **Given** an origin and a destination whose direct ride would exceed the free window,
   **When** the user requests a plan, **Then** the itinerary is split into two or more bike
   segments, each with an estimated duration at or below the free limit minus the safety
   margin, and each stop is at a real station.
2. **Given** an origin and destination reachable inside one free window, **When** the user
   requests a plan, **Then** the itinerary contains exactly one bike segment and no
   intermediate stop is proposed.
3. **Given** a candidate stop station that has free docks but no mechanical bike available,
   **When** the plan is computed, **Then** that station remains usable as an intermediate stop,
   because the rider takes their own bike again after the cooldown.
4. **Given** a candidate stop station that currently has no free dock above the safety reserve,
   **When** the plan is computed, **Then** that station is not used as the end of a segment.
5. **Given** stations reported as out of service, not installed, not renting, or not returning,
   **When** the plan is computed, **Then** none of them appear in the itinerary.
6. **Given** several valid itineraries, **When** the plan is computed, **Then** the one
   presented minimizes total estimated duration including walking and docking stops, not the
   one with the fewest stops or the shortest distance.
7. **Given** a computed itinerary, **When** the user views it, **Then** the number of stops and
   the total estimated duration are both stated plainly.
8. **Given** an itinerary with two or more bike segments, **When** the total duration is
   computed, **Then** it includes one cooldown per intermediate stop, and that cooldown is shown
   as a step that does not consume the free window.
9. **Given** the nearest station to the origin has free docks but no mechanical bike available,
   **When** the plan is computed, **Then** that station is not used as the first pickup, because
   the rider has no bike yet at that point.

---

### User Story 2 - See how much free window each segment burns (Priority: P2)

The user wants to understand where their itinerary is tight and where it has slack, so they can
judge the plan rather than take it on faith. Each bike segment shows what share of the free
window it consumes, in absolute terms and as a proportion, and a segment running close to the
limit is distinguishable from a comfortable one at a glance without reading any number.

**Why this priority**: The plan is only trustworthy if its margins are legible. This is also
what lets a user decide whether they would rather ride closer to the limit and stop less often.
It depends on US1 producing an itinerary, but it is separately testable and separately valuable.

**Independent Test**: Render a fixed itinerary containing one comfortable segment and one
near-limit segment, and verify the budget consumption is shown numerically and proportionally
for each, that the tight one is visually distinguishable without reading the figures, and that
walk legs are visibly excluded from the budget.

**Acceptance Scenarios**:

1. **Given** a bike segment, **When** the user views the itinerary detail, **Then** the segment
   states both how much of the free window it consumes and what proportion of the window that
   represents.
2. **Given** an itinerary with one segment near the limit and one well under it, **When** the
   user glances at the itinerary, **Then** the near-limit segment is distinguishable from the
   comfortable one without reading the numbers, and remains so when colour is removed.
3. **Given** an itinerary with walking at each end, **When** the user views it, **Then** walk
   durations are shown separately from bike segments and are identified as not consuming the
   free window.
4. **Given** an itinerary whose segments all sit far below the limit, **When** the user views
   the budget information, **Then** they have enough information to judge that fewer stops
   might be possible by riding closer to the limit.

---

### User Story 3 - Tune the assumptions and watch the plan react (Priority: P2)

The user does not ride at the speed the app assumed, or has a different free window on their
subscription, or is willing to walk farther than the default. They adjust the free limit, the
safety margin, their cycling speed, and their maximum walking distance, and the itinerary
recomputes. Changing a setting does not throw away the map position or zoom, and nothing
reloads.

**Why this priority**: Conservative defaults are required, which means the defaults will be
wrong for many riders. Without adjustment the plan is either useless or dishonest. Testable on
its own by changing one parameter and observing the recomputed result.

**Independent Test**: From a computed itinerary, change one parameter, and verify the itinerary
updates in place while the map keeps its center and zoom and no full page reload occurs.

**Acceptance Scenarios**:

1. **Given** a computed itinerary, **When** the user changes the free limit, the safety margin,
   the cycling speed, or the maximum walking distance, **Then** the itinerary is recomputed and
   the displayed result reflects the new value.
2. **Given** the map is panned and zoomed to a particular view, **When** the user changes any
   parameter, **Then** the map keeps that center and zoom.
3. **Given** the user increases the safety margin, **When** the plan is recomputed, **Then**
   segments become shorter or more numerous, never longer than the new limit minus margin.
4. **Given** a computed itinerary, **When** the user consults the map and then the step list,
   **Then** both remain available without navigating between separate screens and without
   losing the state of either.

---

### User Story 4 - See the network before typing anything (Priority: P3)

A user who opens the app with no destination in mind immediately sees the stations around them,
so the app is informative before it is asked anything.

**Why this priority**: Lowest direct value of the four, but it makes the app usable as a
station map and removes the empty-first-screen problem. Fully independent of planning.

**Independent Test**: Open the app without entering anything and verify nearby stations are
displayed.

**Acceptance Scenarios**:

1. **Given** a user opening the app for the first time with no input, **When** the station data
   is available, **Then** stations near the map view are displayed.
2. **Given** location permission has been denied, **When** the app opens, **Then** stations are
   still shown for a default view of the network and manual entry remains available.

---

### Edge Cases

- **No itinerary possible within the constraints**: the app states the specific reason (no
  reachable station within the walking distance, or a gap between stations too large to cross
  inside one segment) and proposes at least one concrete adjustment, such as increasing the
  cycling speed or the maximum walking distance.
- **Origin or destination outside the network's service area**: stated explicitly as an
  out-of-coverage condition, distinct from "no route found". A point inside the footprint but far
  from any station, such as the middle of a large park, is a routing failure rather than an
  out-of-coverage condition.
- **Network out of season, or the data feed unavailable**: an explicit message. Never a blank
  screen and never a raw error.
- **Geolocation refused or unavailable**: manual entry and map-click entry remain fully
  available; the app does not block on location.
- **Origin and destination close enough that walking beats riding**: walking is presented as the
  better option rather than forcing a bike itinerary.
- **No station with a mechanical bike near the origin, but e-bikes are present**: stated
  explicitly as "no mechanical bike available nearby" rather than returning a generic "no result",
  because the free window does not apply to e-bikes. This applies to the first pickup only;
  intermediate stops are unaffected by bike availability.
- **A stop station's availability changes between planning and riding**: availability is a
  snapshot, and is presented as such rather than as a guarantee.
- **Free limit set at or below the safety margin**: the parameter combination is rejected or
  corrected with an explanation rather than producing an itinerary of zero-length segments.

## Requirements *(mandatory)*

### Functional Requirements

**Trip input**

- **FR-001**: Users MUST be able to set a destination by searching for an address or a place name.
- **FR-002**: Users MUST be able to set the origin in three ways: current location, manual entry,
  or clicking a point on the map.
- **FR-003**: The application MUST remain fully usable when location permission is denied or
  unavailable.

**Segmentation and the free window**

- **FR-004**: The application MUST split a trip into consecutive bike segments such that every
  segment's estimated duration is at or below the free limit minus the configured safety margin.
- **FR-005**: The application MUST treat a docking stop as resetting the free-window counter for
  the following segment.
- **FR-006**: The application MUST exclude walking time at the origin and at the destination from
  the free-window budget, and MUST count it separately in the total duration.
- **FR-007**: The application MUST account for the operator-imposed cooldown between docking a
  bike and taking it again when computing total duration. The cooldown defaults to one minute.
- **FR-008**: The application MUST NOT propose any intermediate stop when the trip is achievable
  within a single free window.
- **FR-009**: The application MUST select the itinerary that minimizes total estimated duration,
  including walking legs and docking stops, among itineraries that satisfy all constraints.
- **FR-010**: The free window MUST be modelled as applying to mechanical bikes only. E-bikes MUST
  NOT be used to satisfy a free-window itinerary.

**Station eligibility**

- **FR-011**: The first pickup station MUST report at least one mechanical bike available above
  the configured safety reserve.
- **FR-011a**: An intermediate stop station MUST NOT be required to have a mechanical bike
  available. The rider docks their bike and takes the same bike again after the cooldown, so the
  station's bike count does not constrain the continuation of the trip.
- **FR-012**: A station MUST be usable as the end of a bike segment only if it reports free docks
  above the configured safety reserve.
- **FR-013**: The application MUST exclude stations reported as out of service, not installed,
  not renting, or not returning bikes.
- **FR-014**: Station availability MUST be presented as a snapshot at a stated moment, not as a
  guarantee.

**Presentation of the itinerary**

- **FR-015**: The application MUST display the itinerary on a map and as an ordered step list
  covering: walk to the first station, each bike segment with its estimated duration, each
  docking stop with its cooldown, and the final walk.
- **FR-016**: The application MUST state the number of stops and the total estimated duration.
- **FR-034**: The application MUST present exactly one itinerary per plan request: the one
  selected by FR-009. Alternative or competing itineraries MUST NOT be offered; the user trades
  stops against segment tightness by adjusting the safety margin (FR-021) and reading the
  per-segment budget display (FR-017).
- **FR-017**: For each bike segment, the application MUST show the share of the free window it
  consumes, both in absolute terms and as a proportion.
- **FR-018**: A segment running close to the free limit MUST be distinguishable from a
  comfortable one without reading numeric values.
- **FR-018a**: The budget status of a bike segment MUST be conveyed by three redundant encodings:
  a proportional fill whose length reflects the share of the free window consumed, a colour band,
  and a short non-numeric text label such as "comfortable" or "tight".
- **FR-018b**: Colour MUST NOT be the only means of conveying budget status. The text label MUST
  be available to assistive technology for every bike segment.
- **FR-019**: Walk legs MUST be presented separately from bike segments and MUST be identified as
  not consuming the free window.
- **FR-020**: All durations MUST be presented as estimates. The application MUST NOT display a
  to-the-minute arrival time.

**Parameters**

- **FR-021**: Users MUST be able to adjust the free limit, the safety margin, their cycling
  speed, and their maximum walking distance.
- **FR-022**: Changing any parameter MUST recompute and update the itinerary.
- **FR-022a**: Continuous controls MUST be debounced so that dragging one does not queue redundant
  computations, and the interface MUST remain responsive to input while a plan is being computed.
- **FR-023**: All parameters that influence the result MUST be visible to the user, and their
  defaults MUST be conservative rather than optimistic.
- **FR-024**: Parameter values that cannot produce a meaningful plan MUST be rejected or
  corrected with an explanation.

**Context continuity**

- **FR-025**: The map and the itinerary detail MUST be consultable without navigating between
  separate screens, and consulting one MUST NOT discard the state of the other.
- **FR-026**: Adjusting a parameter MUST preserve the map's center and zoom, and MUST update the
  result without a page reload.
- **FR-027**: Before any user input, the application MUST display the stations around the current
  map view.

**Failure and empty states**

- **FR-028**: When no itinerary satisfies the constraints, the application MUST state the specific
  reason and MUST propose at least one concrete adjustment.
- **FR-029**: An origin or destination outside the network's service area MUST be reported as an
  out-of-coverage condition, distinct from a routing failure.
- **FR-029a**: The service area MUST be derived from the footprint enclosed by the network's
  active stations, extended by a buffer whose default is the trip's maximum walking distance.
- **FR-029b**: A point inside the service area that has no eligible station within walking range
  MUST be reported as a routing failure under FR-028, not as an out-of-coverage condition.
- **FR-030**: An unavailable or out-of-season data feed MUST produce an explicit message, never a
  blank screen or a raw error.
- **FR-031**: When only e-bikes are available nearby, the application MUST say so explicitly
  rather than reporting a generic absence of results.
- **FR-032**: When walking the whole way is faster than any valid bike itinerary, the application
  MUST present walking as the better option.

### Key Entities

- **Network**: a bike-share system with a set of stations, a seasonal operating state, and a
  service area derived from the footprint of its active stations plus a buffer. One network at a
  time; Montreal is the first target.
- **Station**: a docking location with a position, a count of available mechanical bikes, a count
  of available e-bikes, a count of free docks, and operational flags (installed, renting,
  returning, in service). Carries the timestamp of the snapshot it came from.
- **Planning Parameters**: free limit, safety margin, cycling speed, maximum walking distance,
  bike and dock safety reserves, and the inter-segment cooldown (default one minute). User-visible,
  with conservative defaults.
- **Bike Segment**: a ride from one station to another, with an estimated duration, the share of
  the free window it consumes, and a comfort status relative to the limit.
- **Walk Leg**: a walk between a point and a station, or between two points, with an estimated
  duration, explicitly outside the free-window budget.
- **Docking Stop**: an intermediate station where the bike is docked and taken again after the
  operator cooldown, resetting the free-window counter. Requires free docks only, not an available
  bike.
- **Itinerary**: the ordered sequence of walk legs, bike segments, and docking stops from origin
  to destination, with a total estimated duration and a stop count.
- **Planning Failure**: a structured reason why no itinerary exists, paired with at least one
  suggested adjustment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any origin and destination inside the network's service area, the user receives
  either a complete itinerary or an explicit, specific reason why none exists. Blank screens and
  raw errors occur in zero cases.
- **SC-002**: In 100% of returned itineraries, every bike segment's estimated duration is at or
  below the free limit minus the safety margin.
- **SC-003**: In 100% of returned itineraries, every station used is eligible under the
  availability and operational rules at the time of the snapshot used.
- **SC-004**: A trip achievable within one free window never returns an itinerary with an
  intermediate stop.
- **SC-005**: In usability testing, at least 9 of 10 participants correctly identify the tightest
  segment of a displayed itinerary within 5 seconds without reading any numeric duration.
- **SC-006**: Adjusting a parameter updates the itinerary while preserving map center and zoom, in
  100% of adjustments, with no page reload.
- **SC-007**: A user landing on the application with no prior input sees nearby stations within 3
  seconds on a mid-range phone over a typical mobile connection.
- **SC-008**: A first-time user completes their first plan, from landing to viewing a full
  itinerary, in under 60 seconds.
- **SC-009**: In 100% of no-result cases, the message names the specific cause and offers at least
  one concrete adjustment the user can act on.
- **SC-010**: No screen in the feature displays a to-the-minute arrival time.
- **SC-011**: In 100% of bike segments, the budget status is available as text to assistive
  technology, and remains distinguishable when colour is removed from the display.
- **SC-012**: A plan is computed and displayed within 1 second of a new plan request or a
  parameter change, on a mid-range phone, for a network of the first target's size.

## Constitution Alignment *(mandatory)*

- **Cost & keys**: Planning, station eligibility, and segmentation need no server, database, or
  paid service. Address and place search is the one part of this feature that conventionally
  relies on an external service; it MUST be satisfied without any account or API key, and if a
  keyless option cannot meet quality expectations, the fallback is manual entry and map-click
  entry, which are already required by FR-002 and remain fully functional on their own. No
  account and no key is required for the feature to work.
- **Estimate honesty**: The feature shows per-segment bike durations, walk durations, docking
  waits, and a total. All are presented as estimates, and FR-020 forbids to-the-minute arrival
  times. The free limit, safety margin, cycling speed, and maximum walking distance become
  user-visible and adjustable (FR-021, FR-023), with conservative defaults; the bike and dock
  safety reserves and the inter-segment wait are likewise visible parameters.
- **Data sources**: The feature depends on the network's public station information and station
  status feeds. Operator attribution and the feed license are displayed in the interface, feed
  responses are cached and refreshed no faster than the feed's own freshness declaration allows,
  and station availability is shown with the timestamp of the snapshot it came from (FR-014).
  When a feed is stale, out of season, or unavailable, the user sees an explicit message and the
  rest of the application keeps working (FR-030).

## Assumptions

- One bike-share network at a time, Montreal first. Multi-network selection is not part of this
  feature.
- The user is a subscription holder riding a mechanical bike. Single-ride passes and e-bike
  pricing are out of scope, so the app does not need to compute a price, only to keep segments
  inside the free window.
- Docking a bike and taking the same bike again after a one-minute operator cooldown resets the
  free-window counter. This is the mechanism the whole feature rests on. The cooldown is a
  configurable parameter defaulting to one minute, not read from any feed.
- Because the rider re-takes their own bike, an intermediate stop needs free docks only. Bike
  availability constrains the first pickup station alone, which removes any need for mid-trip
  walking transfers between stations.
- Bike and dock safety reserves default to a small non-zero number so that a plan does not depend
  on the last remaining bike or the last free dock.
- Bike segment durations are estimated from distance and the user's configured cycling speed,
  with a correction for real street routing rather than straight-line distance. The estimate is
  presented as an estimate; turn-by-turn street accuracy is not promised.
- Walking speed is a fixed conservative value; the user controls maximum walking distance rather
  than walking speed.
- Station availability is read at plan time from the network's published snapshot. The app does
  not predict future availability.
- The map is the primary surface, with the itinerary detail alongside it rather than on a separate
  screen.

## Out of Scope

- Real-time navigation, GPS tracking during the ride, and notifications.
- User accounts, trip history, and favorites.
- Bike or dock reservation.
- E-bike support in the free-window calculation.
- Price computation for rides that exceed the free window, or for non-subscribers.
- Multi-network or multi-city selection.
- Alternative itineraries, route comparison, and side-by-side plan evaluation.
- Mid-trip walking transfers between stations, which the bike-cooldown mechanism makes unnecessary.
