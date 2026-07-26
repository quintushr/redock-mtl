# Contract: External Services

**Feature**: 001-free-window-trip-planner

Three external services are consumed, all keyless. Each entry states what is called, what happens
when it fails, and what the constitution obliges us to display. Every base URL below lives in one
module, `lib/endpoints.ts`, so that changing a provider is a single-file edit.

## S1. GBFS station feeds

**Required**: yes. The planner cannot work without station data.

**Called**: the provider's GBFS 2.2 discovery document, then `station_information`,
`station_status`, `vehicle_types`, and `system_information`. Read-only GET, no credentials.

**Cross-origin**: the provider allows it. If that changes, the app degrades and reports the feed as
unavailable. It does not gain a proxy, because a proxy is a server and Principle I forbids one.
Static export also removes the shortcut: rewrites are unsupported, so there is no way to smuggle a
proxy in through framework configuration.

**Fetch timing**: feeds are fetched after mount, never during render. Static export prerenders
Client Components at build time, so a render-time fetch would bake a stale snapshot into the
shipped HTML.

**Refresh policy** (Principle V):
- Never poll faster than the feed's declared `ttl`.
- Responses cached client-side; a repeat view within `ttl` is served from cache, not refetched.
- One fetch per feed per refresh, not per component render.

**Display obligations**: operator attribution and feed license visible in the UI. Snapshot
timestamp shown alongside availability (FR-014).

**Failure modes**
| Condition | Behaviour |
|---|---|
| Network error | `FeedStatus.unavailable('network')`, explicit message, map and manual entry still work |
| Malformed JSON or failed validation | `unavailable('malformed')`, never a thrown error (FR-030) |
| Feed reports the system out of season | `unavailable('out-of-season')`, distinct message |
| Snapshot older than `ttl` | `stale`, plan still offered, staleness stated |

**To verify before implementation** (research R8): exact vehicle-type field shapes, the value
identifying a mechanical bike, whether `ttl` is per-feed or global, and the license text.

## S2. OpenFreeMap vector tiles

**Required**: no. The map is how the plan is displayed, not how it is computed.

**Called**: style document and vector tiles, keyless.

**Display obligations**: OpenStreetMap attribution rendered on the map, plus whatever OpenFreeMap's
own terms require. The exact strings must be read from the provider's documentation before launch,
not written from memory.

**Failure mode**: tiles fail to load, the map renders empty or partially, and the itinerary step
list remains fully usable. No planning code may import from the map layer, which makes this
degradation structural rather than a matter of error handling.

## S3. Photon geocoding

**Required**: no. FR-002's other two input methods (current location, map click) are the guaranteed
path, and manual coordinate entry always works.

**Called**: forward geocoding for address and place search, with a location bias toward the service
area.

**Courtesy obligations** (Principle V applies to any public endpoint offered for free):
- Debounce input; never one request per keystroke.
- Cancel superseded in-flight requests.
- Cap result count.
- Read and comply with the instance's usage policy before shipping.

**Failure mode**: search returns nothing or errors, the search field shows an explicit message, and
the user falls back to map-click or current location. The app never blocks on geocoding.

**To verify before implementation** (research R7): the public instance host and its usage policy.
Do not hard-code a host from memory.

## Optional route-shape service

**Required**: no, and it must stay that way.

If a routing service is used to draw a nicer polyline, it may only affect the drawn line. The
itinerary's durations, feasibility, and step list must be byte-identical whether or not it responds.
A test asserts that the planner's output does not depend on it, which keeps the enhancement genuinely
optional under Principle II.

## Cross-cutting rules

- No service above requires an account or an API key. This is a hard gate: adding one would violate
  Principle II regardless of how convenient it is.
- No secrets, no environment variables required for the app to run.
- No user data is sent to any of these services beyond what a query inherently contains. Origin and
  destination are never transmitted anywhere except as a geocoding query the user typed themselves.
