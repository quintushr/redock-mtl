import type { Messages } from "./fr";

/**
 * Every string the interface shows, in English.
 *
 * Typed against the French tree, so a missing or misspelled key is a compile
 * error rather than a blank label discovered by a rider. Change the text
 * freely; the keys are not yours to change.
 *
 * Wording follows the "Écriture" section of docs/ui-guidelines.md, in the
 * second person to match the French tutoiement.
 */

export const messages: Messages = {
  language: {
    label: "Language",
    switchTo: "Show the interface in {name}",
  },

  app: {
    name: "Redock",
    city: "Montréal",
    title: "Redock, a share-bike trip planner for Montreal",
    description:
      "Splits a share-bike ride into segments short enough to stay inside the free window, and says where to dock.",
  },

  units: {
    underAMinute: "under a minute",
    // "about" carries the same uncertainty "environ" does in French, and the
    // unit symbols are invariable here too.
    durationMinutes: "about {minutes} min",
    durationHours: "about {hours} h",
    durationHoursMinutes: "about {hours} h {minutes} min",
    metres: "{metres} m",
    kilometres: "{value} km",
  },

  fields: {
    origin: "Start",
    destination: "Destination",
    placeholder: "Address, place, or latitude, longitude",
    clear: "Clear",
    myLocation: "My location",
    pickOnMap: "Pick on the map",
    picking: "Tap the map",
    swap: "Swap the start and the destination",
    swapUnavailable:
      "Swap the start and the destination, available once one of them is set",
    searching: "Searching",
    searchUnavailable:
      "Address search is not responding. Tap the map to place the point, or type coordinates such as “45.5088, -73.5878”.",
    useThisPoint: "Use this exact point",
    coordinates: "Coordinates",
  },

  placeKinds: {
    house: "Address",
    street: "Street",
    locality: "Place",
    district: "District",
    city: "City",
    county: "Region",
    state: "Region",
    country: "Country",
    other: "Place",
  },

  map: {
    originPin: "Start, drag to move",
    destinationPin: "Destination, drag to move",
    hintPickingOrigin: "Tap the map to place your start, or type an address.",
    hintPickingDestination:
      "Tap the map to place your destination, or type an address.",
    hintPlaced: "Drag a point to adjust it.",
    hintGeolocationDenied:
      "Your location is unavailable. Type an address, or tap the map to place your start.",
  },

  panel: {
    label: "Trip planner",
    expand: "Show the full itinerary",
    collapse: "Collapse to the summary",
  },

  summary: {
    label: "Trip summary",
    noStops: "No stops. This trip is free.",
    // English puts zero in `other`, so "0 stops" is correct here where
    // "0 arrêt" is correct in French. Neither language states the other's rule.
    stops: {
      one: "{count} stop to stay inside the free window. This trip is free.",
      other: "{count} stops to stay inside the free window. This trip is free.",
    },
    estimate: "Durations are estimates, not arrival times.",
  },

  trail: {
    label: "Itinerary",
    start: "Start",
    destination: "Destination",
    anchor: "Dock the bike here and take another after {wait}",
    anchorResets: "resets the free window",
    walkTo: "Walk to {place}",
    walkToDestination: "Walk to your destination",
    walkFree: "does not use the free window",
    rideTo: "Ride to {place}",
    unknownStation: "station {id}",
    traceIsIndicative:
      "On the map, the trace joins the stations in a straight line. It is indicative, not a cycling route.",
  },

  gauge: {
    spoken: "about {minutes} min of free window left on arrival, {state}",
    remaining: "about {minutes} min",
    onArrival: "left on arrival",
    states: {
      comfortable: "comfortable",
      neutral: "some slack",
      alarming: "risky",
    },
  },

  noStop: {
    reveal: "And without any stop?",
    hide: "Hide the no-stop comparison",
    nothingToCompare: "Nothing to compare: this trip is walked end to end.",
    inOneGo: "in one go, {delta} than with the stops.",
    faster: "{magnitude} less",
    slower: "{magnitude} more",
    sameTime: "about the same time",
    stillFree: "Still free: the ride stays inside the free window.",
    wouldPayBefore: "You would pay",
    wouldPayAfter: "for the {overage} past the window.",
    rateNote:
      "Estimated before taxes, at {rate} per minute. That rate is in the settings.",
  },

  settings: {
    label: "Settings",
    summaryDefaults: "{margin} of margin, default values",
    summaryChanged: {
      one: "{margin} of margin, {count} value changed",
      other: "{margin} of margin, {count} values changed",
    },
    showRest: "Show the other settings",
    hideRest: "Hide the other settings",
    reset: "Reset everything",
    controls: {
      safetyMargin: {
        label: "Safety margin",
        hint: "Held back from the free window. Lower it for fewer stops and tighter segments.",
      },
      freeWindow: {
        label: "Free window",
        hint: "The free duration your subscription includes per ride.",
      },
      cyclingSpeed: {
        label: "Cycling speed",
        hint: "Your pace on a share bike.",
      },
      maxWalkDistance: {
        label: "Maximum walk",
        hint: "How far you will walk to a station, or from one.",
      },
      walkingSpeed: {
        label: "Walking speed",
        hint: "Used for the walk at each end, which never uses the free window.",
      },
      dockCooldown: {
        label: "Wait after docking",
        hint: "The operator's wait before you can take the same bike again.",
      },
      segmentOverhead: {
        label: "Unlocking and docking",
        hint: "Counted once per ride, and it does use the free window.",
      },
      bikeReserve: {
        label: "Bikes held in reserve",
        hint: "Never count on the last bikes, someone may take them before you.",
      },
      dockReserve: {
        label: "Docks held in reserve",
        hint: "Never count on the last free docks.",
      },
      detourFactor: {
        label: "Detour factor",
        hint: "How much longer streets are than a straight line.",
      },
      overageRate: {
        label: "Rate past the window",
        hint: "What a minute past the free window costs, before taxes. Only used to price a ride without stops.",
      },
    },
  },

  feed: {
    loading: "Loading stations",
    stale:
      "This data is {minutes} min old and may no longer match the stations.",
    freshness:
      "Stations as of {time}. Availability can change before you arrive.",
    unavailable: {
      network: {
        title: "The station data is unreachable",
        detail: "The network did not answer. Check your connection, then retry.",
      },
      malformed: {
        title: "The station data cannot be read",
        detail:
          "The operator answered, but not in the expected format. The problem is at their source, not with your connection. Retry in a few minutes.",
      },
      "out-of-season": {
        title: "The network is out of season",
        detail:
          "The operator is publishing no active station right now. Come back when the network reopens, in the spring.",
      },
    },
    retry: "Retry",
  },

  empty: {
    label: "How this works",
    title: "Stay inside the free window",
    lead: "Your subscription includes {window} per ride. Docking the bike at a station resets that counter.",
    start: "Your start",
    anchor: "A stop along the way",
    anchorNote: "docking restarts the free window",
    destination: "Your destination",
    call: "Set a start and a destination: the ride is split into segments that stay free, and every stop is named.",
  },

  plan: {
    failureTitle: "No trip is possible",
    failures: {
      "origin-out-of-coverage":
        "Your start is outside the area this network serves. Move it into a sector covered by the stations shown on the map.",
      "destination-out-of-coverage":
        "Your destination is outside the area this network serves. Move it into a sector covered by the stations shown on the map.",
      "no-station-near-origin":
        "No station within walking distance of your start. Raise your walking distance, or move your start.",
      "no-mechanical-bike-near-origin":
        "Stations are nearby, but none has a mechanical bike, and the free window does not apply to electric bikes. Raise your walking distance to reach others.",
      "no-station-near-destination":
        "No station within walking distance of your destination. Raise your walking distance, or move your destination.",
      "gap-too-large":
        "The stations along this trip are too far apart to be linked without exceeding the free window. Lower your safety margin, or accept a faster pace.",
      "invalid-parameters":
        "These settings cannot produce a trip. Adjust them and try again.",
    },
    suggestions: {
      "increase-walk-distance": "Walk further",
      "increase-speed": "Ride faster",
      "reduce-safety-margin": "Keep less margin",
    },
  },

  attribution: {
    label: "Attributions",
    map: "Map",
    stations: "Stations",
  },

  corrections: {
    fallback: "These settings cannot produce a trip. Adjust them and try again.",
    byKey: {
      freeWindow: "The free window must be a real, positive duration.",
      safetyMargin:
        "The safety margin must be positive and shorter than the free window.",
      cyclingSpeed: "Cycling speed must be greater than zero.",
      walkingSpeed: "Walking speed must be greater than zero.",
      maxWalkDistance: "The maximum walk cannot be negative.",
      detourFactor:
        "The detour factor cannot go below 1: a street is never shorter than a straight line.",
      dockCooldown: "The wait after docking cannot be negative.",
      segmentOverhead:
        "Unlocking and docking must take less than a segment's budget.",
      overageRate: "The rate past the window cannot be negative.",
      bikeReserve: "Bike and dock reserves are whole positive numbers.",
      dockReserve: "Bike and dock reserves are whole positive numbers.",
    },
  },
};

/**
 * Entries deliberately identical to the reference.
 *
 * Without this declaration each one fails the checks as suspected-untranslated
 * (FR-215). The declaration is the way out, which is what makes failing on the
 * rest safe.
 *
 * Product and place names are the same in English because they are names.
 * "Destination" and "Stations" happen to be spelled identically in both
 * languages; that is a coincidence of vocabulary, not an untranslated string.
 */
export const intentionallyIdentical = [
  "app.name",
  "app.city",
  "fields.destination",
  "trail.destination",
  "attribution.label",
  "attribution.stations",
  "units.metres",
  "units.kilometres",
  "trail.unknownStation",
] as const;
