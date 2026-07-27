import type { PlaceKind } from "./geocode";
import type { PlanningParameters, RemainingStatus } from "./types";

/**
 * Every string the interface shows, in two languages.
 *
 * One bundle per language, identical in shape: `Strings` is derived from the
 * French one, so the English one cannot compile while a key is missing or
 * misspelled. That is the whole reason the copy is not inline in the
 * components, and it is what docs/ui-guidelines.md's FR/EN toggle needs.
 *
 * French is the default. Montreal's is a French-speaking network, and a rider
 * who wants English asks for it.
 *
 * Wording follows the "Écriture" section of docs/ui-guidelines.md in both
 * languages: active voice, sentence case, no apology, and an error states what
 * happened and what to do next. Tutoiement in French, as in that document's own
 * examples, and the matching second person in English.
 */

export type Locale = "fr" | "en";

export const LOCALES: readonly Locale[] = ["fr", "en"];

export const DEFAULT_LOCALE: Locale = "fr";

/**
 * How a language names itself, never how another language names it. A reader
 * looking for English is looking for the word "English".
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  fr: "Français",
  en: "English",
};

/** The two-letter code shown in the toggle. */
export const LOCALE_CODES: Record<Locale, string> = {
  fr: "FR",
  en: "EN",
};

const fr = {
  language: {
    label: "Langue",
    switchTo: (name: string): string => `Afficher l'interface en ${name}`,
  },

  app: {
    name: "Redock",
    city: "Montréal",
    title: "Redock, planificateur de trajets à vélo partagé à Montréal",
    description:
      "Découpe un trajet à vélo partagé en segments assez courts pour rester dans la fenêtre gratuite, et indique où ancrer.",
  },

  /**
   * Units and durations. Held here rather than in lib/format.ts because they
   * are wording, and wording has a language.
   */
  units: {
    /** Drives Intl for amounts and decimals. */
    locale: "fr-CA",
    underAMinute: "moins d'une minute",
    approximateMinutes: (totalMinutes: number): string => {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours === 0) {
          return `${minutes} minutes`;
        }
        
        if (minutes === 0) {
          return `${hours} heures`;
        }

        return `${hours} h ${minutes} min`;
      },
    metres: (metres: number): string => `${metres} m`,
    kilometres: (value: string): string => `${value} km`,
  },

  fields: {
    origin: "Départ",
    destination: "Destination",
    placeholder: "Adresse, lieu, ou latitude, longitude",
    clear: "Effacer",
    myLocation: "Ma position",
    pickOnMap: "Choisir sur la carte",
    picking: "Touche la carte",
    swap: "Inverser le départ et la destination",
    swapUnavailable:
      "Inverser le départ et la destination, disponible dès qu'un des deux est renseigné",
    searching: "Recherche en cours",
    searchUnavailable:
      "La recherche d'adresse ne répond pas. Touche la carte pour placer le point, ou tape des coordonnées comme « 45.5088, -73.5878 ».",
    useThisPoint: "Utiliser ce point exact",
    coordinates: "Coordonnées",
  },

  /** Badge on a suggestion row. Keyed by what the geocoder says the place is. */
  placeKinds: {
    house: "Adresse",
    street: "Rue",
    locality: "Lieu",
    district: "Quartier",
    city: "Ville",
    county: "Région",
    state: "Région",
    country: "Pays",
    other: "Lieu",
  } as Record<PlaceKind, string>,

  map: {
    originPin: "Départ, fais glisser pour déplacer",
    destinationPin: "Destination, fais glisser pour déplacer",
    hintPicking: (which: "origin" | "destination"): string =>
      which === "origin"
        ? "Touche la carte pour placer ton départ, ou tape une adresse."
        : "Touche la carte pour placer ta destination, ou tape une adresse.",
    hintPlaced: "Fais glisser un point pour l'ajuster.",
    hintGeolocationDenied:
      "Ta position n'est pas disponible. Tape une adresse, ou touche la carte pour placer ton départ.",
  },

  panel: {
    label: "Planificateur de trajet",
    expand: "Afficher l'itinéraire complet",
    collapse: "Replier sur le résumé",
  },

  summary: {
    label: "Résumé du trajet",
    noStops: "Aucun arrêt. Ce trajet est gratuit.",
    stops: (count: number): string =>
      count === 1
        ? "1 arrêt pour rester dans la fenêtre gratuite. Ce trajet est gratuit."
        : `${count} arrêts pour rester dans la fenêtre gratuite. Ce trajet est gratuit.`,
    estimate: "Durées estimées, ce ne sont pas des heures d'arrivée.",
  },

  trail: {
    label: "Itinéraire",
    start: "Départ",
    destination: "Destination",
    anchor: (wait: string): string =>
      `Ancre le vélo ici et reprends-en un après ${wait}`,
    anchorResets: "remet la fenêtre gratuite à zéro",
    walkTo: (place: string): string => `Marche jusqu'à ${place}`,
    walkToDestination: "Marche jusqu'à ta destination",
    walkFree: "n'entame pas la fenêtre gratuite",
    rideTo: (place: string): string => `Roule jusqu'à ${place}`,
    unknownStation: (id: string): string => `station ${id}`,
    /** The trace on the map is a straight line, and says so. */
    traceIsIndicative:
      "Sur la carte, le tracé relie les stations en ligne droite. Il est indicatif, pas un itinéraire cyclable.",
  },

  gauge: {
    /**
     * Read by assistive technology, which sees neither the colour nor the bar.
     * If the state is not in the words, it does not exist for that user.
     */
    spoken: (minutes: number, state: string): string =>
      `environ ${minutes} min d'avance à l'arrivée, ${state}`,
    remaining: (minutes: number): string => `environ ${minutes} min`,
    onArrival: "d'avance à l'arrivée",
    states: {
      comfortable: "confortable",
      neutral: "correct",
      alarming: "risqué",
    } as Record<RemainingStatus, string>,
  },

  noStop: {
    reveal: "Et sans aucun arrêt ?",
    hide: "Masquer la comparaison sans arrêt",
    nothingToCompare: "Rien à comparer : ce trajet se fait entièrement à pied.",
    /**
     * Split around the figure it frames: durations and amounts are set in the
     * monospace family, which is impossible if the sentence is one string.
     */
    inOneGo: (delta: string): string =>
      `d'une traite, ${delta} qu'avec les arrêts.`,
    faster: (magnitude: string): string => `${magnitude} de moins`,
    slower: (magnitude: string): string => `${magnitude} de plus`,
    sameTime: "à peu près le même temps",
    stillFree: "Toujours gratuit : le trajet tient dans la fenêtre gratuite.",
    wouldPayBefore: "Tu paierais",
    wouldPayAfter: (overage: string): string =>
      `pour les ${overage} au-delà de la fenêtre.`,
    rateNote: (rate: string): string =>
      `Estimation avant taxes, au tarif de ${rate} la minute. Ce tarif se change dans les réglages.`,
  },

  settings: {
    label: "Réglages",
    summaryDefaults: (margin: string): string =>
      `${margin} de marge, valeurs par défaut`,
    summaryChanged: (margin: string, count: number): string =>
      count === 1
        ? `${margin} de marge, 1 valeur modifiée`
        : `${margin} de marge, ${count} valeurs modifiées`,
    showRest: "Afficher les autres réglages",
    hideRest: "Masquer les autres réglages",
    reset: "Tout réinitialiser",
    controls: {
      safetyMargin: {
        label: "Marge de sécurité",
        hint: "Retenue sur la fenêtre gratuite. Baisse-la pour moins d'arrêts et des segments plus tendus.",
      },
      freeWindow: {
        label: "Fenêtre gratuite",
        hint: "La durée gratuite incluse par trajet dans ton abonnement.",
      },
      cyclingSpeed: {
        label: "Vitesse à vélo",
        hint: "Ton allure sur un vélo en libre-service.",
      },
      maxWalkDistance: {
        label: "Marche maximale",
        hint: "La distance que tu acceptes de marcher jusqu'à une station ou depuis une station.",
      },
      walkingSpeed: {
        label: "Vitesse de marche",
        hint: "Utilisée pour la marche à chaque bout, qui n'entame jamais la fenêtre gratuite.",
      },
      dockCooldown: {
        label: "Délai après ancrage",
        hint: "L'attente imposée par l'opérateur avant de reprendre le même vélo.",
      },
      segmentOverhead: {
        label: "Déverrouillage et ancrage",
        hint: "Compté une fois par trajet à vélo, et il entame la fenêtre gratuite.",
      },
      bikeReserve: {
        label: "Vélos gardés en réserve",
        hint: "Ne jamais compter sur les derniers vélos, quelqu'un peut les prendre avant toi.",
      },
      dockReserve: {
        label: "Points d'ancrage gardés en réserve",
        hint: "Ne jamais compter sur les derniers points d'ancrage libres.",
      },
      detourFactor: {
        label: "Facteur de détour",
        hint: "De combien les rues rallongent par rapport à la ligne droite.",
      },
      overageRate: {
        label: "Tarif hors fenêtre",
        hint: "Ce que coûte une minute au-delà de la fenêtre gratuite, avant taxes. Sert uniquement à chiffrer un trajet sans arrêt.",
      },
    } as Record<keyof PlanningParameters, { label: string; hint: string }>,
  },

  feed: {
    loading: "Chargement des stations",
    stale: (minutes: number): string =>
      `Ces données datent de ${minutes} min et peuvent ne plus correspondre aux stations.`,
    freshness: (time: string): string =>
      `Stations relevées à ${time}. La disponibilité peut changer avant ton arrivée.`,
    unavailable: {
      network: {
        title: "Les données de stations sont injoignables",
        detail:
          "Le réseau n'a pas répondu. Vérifie ta connexion, puis réessaie.",
      },
      malformed: {
        title: "Les données de stations sont illisibles",
        detail:
          "L'opérateur a répondu, mais pas dans le format attendu. Le problème vient de sa source, pas de ta connexion. Réessaie dans quelques minutes.",
      },
      "out-of-season": {
        title: "Le réseau est hors saison",
        detail:
          "L'opérateur ne publie aucune station active en ce moment. Reviens à la réouverture du réseau, au printemps.",
      },
    } as Record<string, { title: string; detail: string }>,
    retry: "Réessayer",
    /** No point offering a retry against a season. */
    retryable: ["network", "malformed"] as readonly string[],
  },

  empty: {
    label: "Comment ça marche",
    title: "Reste dans la fenêtre gratuite",
    lead: (window: string): string =>
      `Ton abonnement offre ${window} par trajet. Ancrer le vélo à une station remet ce compteur à zéro.`,
    start: "Ton départ",
    anchor: "Un arrêt en chemin",
    anchorNote: "ancrer relance la fenêtre gratuite",
    destination: "Ta destination",
    call: "Indique un départ et une destination : le trajet est découpé en segments qui restent gratuits, et chaque arrêt est indiqué.",
  },

  plan: {
    failureTitle: "Aucun trajet possible",
    failures: {
      "origin-out-of-coverage":
        "Ton départ est hors de la zone desservie par le réseau. Déplace-le vers un secteur couvert par les stations affichées sur la carte.",
      "destination-out-of-coverage":
        "Ta destination est hors de la zone desservie par le réseau. Déplace-la vers un secteur couvert par les stations affichées sur la carte.",
      "no-station-near-origin":
        "Aucune station à distance de marche de ton départ. Augmente ta distance de marche, ou déplace ton départ.",
      "no-mechanical-bike-near-origin":
        "Des stations sont à proximité, mais aucune n'a de vélo mécanique, et la fenêtre gratuite ne s'applique pas aux vélos électriques. Augmente ta distance de marche pour en atteindre d'autres.",
      "no-station-near-destination":
        "Aucune station à distance de marche de ta destination. Augmente ta distance de marche, ou déplace ta destination.",
      "gap-too-large":
        "Les stations de ce trajet sont trop éloignées les unes des autres pour être reliées sans dépasser la fenêtre gratuite. Baisse ta marge de sécurité, ou accepte une allure plus rapide.",
      "invalid-parameters":
        "Ces réglages ne peuvent produire aucun trajet. Ajuste-les et réessaie.",
    } as Record<string, string>,
    suggestions: {
      "increase-walk-distance": "Marcher plus loin",
      "increase-speed": "Rouler plus vite",
      "reduce-safety-margin": "Garder moins de marge",
    } as Record<string, string>,
  },

  attribution: {
    label: "Attributions",
    map: "Carte",
    stations: "Stations",
  },

  /**
   * Why a parameter set was rejected.
   *
   * `validateParameters` returns its explanation as English prose with no code
   * to key on, and it belongs to the planning logic this work may not touch.
   * Rather than matching on that sentence, which would break the moment its
   * wording changed, `describeCorrection` reads the *corrected* set the domain
   * hands back and words the field it had to fix. The domain stays the
   * authority on what is wrong; only the wording lives here.
   */
  corrections: {
    fallback: "Ces réglages ne peuvent produire aucun trajet. Ajuste-les et réessaie.",
    byKey: {
      freeWindow: "La fenêtre gratuite doit être une durée réelle et positive.",
      safetyMargin:
        "La marge de sécurité doit être positive et plus courte que la fenêtre gratuite.",
      cyclingSpeed: "La vitesse à vélo doit être supérieure à zéro.",
      walkingSpeed: "La vitesse de marche doit être supérieure à zéro.",
      maxWalkDistance: "La marche maximale ne peut pas être négative.",
      detourFactor:
        "Le facteur de détour ne peut pas descendre sous 1 : une rue n'est jamais plus courte que la ligne droite.",
      dockCooldown: "Le délai après ancrage ne peut pas être négatif.",
      segmentOverhead:
        "Le temps de déverrouillage et d'ancrage doit être plus court que le budget d'un segment.",
      overageRate: "Le tarif hors fenêtre ne peut pas être négatif.",
      bikeReserve:
        "Les réserves de vélos et d'ancrages sont des entiers positifs.",
      dockReserve:
        "Les réserves de vélos et d'ancrages sont des entiers positifs.",
    } as Partial<Record<keyof PlanningParameters, string>>,
  },
};

/**
 * The shape both bundles share. Derived from the French one, so a missing or
 * misspelled key in any other language is a compile error rather than a blank
 * label discovered by a user.
 */
export type Strings = typeof fr;

const en: Strings = {
  language: {
    label: "Language",
    switchTo: (name: string): string => `Show the interface in ${name}`,
  },

  app: {
    name: "Redock",
    city: "Montréal",
    title: "Redock, a share-bike trip planner for Montreal",
    description:
      "Splits a share-bike ride into segments short enough to stay inside the free window, and says where to dock.",
  },

  units: {
    locale: "en-CA",
    underAMinute: "under a minute",
    approximateMinutes: (totalMinutes: number): string => {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours === 0) {
          return `${minutes} minutes`;
        }
        
        if (minutes === 0) {
          return `${hours} hours`;
        }

        return `${hours} h ${minutes} min`;
    },
    metres: (metres: number): string => `${metres} m`,
    kilometres: (value: string): string => `${value} km`,
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
  } as Record<PlaceKind, string>,

  map: {
    originPin: "Start, drag to move",
    destinationPin: "Destination, drag to move",
    hintPicking: (which: "origin" | "destination"): string =>
      which === "origin"
        ? "Tap the map to place your start, or type an address."
        : "Tap the map to place your destination, or type an address.",
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
    stops: (count: number): string =>
      count === 1
        ? "1 stop to stay inside the free window. This trip is free."
        : `${count} stops to stay inside the free window. This trip is free.`,
    estimate: "Durations are estimates, not arrival times.",
  },

  trail: {
    label: "Itinerary",
    start: "Start",
    destination: "Destination",
    anchor: (wait: string): string =>
      `Dock the bike here and take another after ${wait}`,
    anchorResets: "resets the free window",
    walkTo: (place: string): string => `Walk to ${place}`,
    walkToDestination: "Walk to your destination",
    walkFree: "does not use the free window",
    rideTo: (place: string): string => `Ride to ${place}`,
    unknownStation: (id: string): string => `station ${id}`,
    traceIsIndicative:
      "On the map, the trace joins the stations in a straight line. It is indicative, not a cycling route.",
  },

  gauge: {
    spoken: (minutes: number, state: string): string =>
      `about ${minutes} min of free window left on arrival, ${state}`,
    remaining: (minutes: number): string => `about ${minutes} min`,
    onArrival: "left on arrival",
    states: {
      comfortable: "comfortable",
      neutral: "some slack",
      alarming: "risky",
    } as Record<RemainingStatus, string>,
  },

  noStop: {
    reveal: "And without any stop?",
    hide: "Hide the no-stop comparison",
    nothingToCompare: "Nothing to compare: this trip is walked end to end.",
    inOneGo: (delta: string): string => `in one go, ${delta} than with the stops.`,
    faster: (magnitude: string): string => `${magnitude} less`,
    slower: (magnitude: string): string => `${magnitude} more`,
    sameTime: "about the same time",
    stillFree: "Still free: the ride stays inside the free window.",
    wouldPayBefore: "You would pay",
    wouldPayAfter: (overage: string): string =>
      `for the ${overage} past the window.`,
    rateNote: (rate: string): string =>
      `Estimated before taxes, at ${rate} per minute. That rate is in the settings.`,
  },

  settings: {
    label: "Settings",
    summaryDefaults: (margin: string): string =>
      `${margin} of margin, default values`,
    summaryChanged: (margin: string, count: number): string =>
      count === 1
        ? `${margin} of margin, 1 value changed`
        : `${margin} of margin, ${count} values changed`,
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
    } as Record<keyof PlanningParameters, { label: string; hint: string }>,
  },

  feed: {
    loading: "Loading stations",
    stale: (minutes: number): string =>
      `This data is ${minutes} min old and may no longer match the stations.`,
    freshness: (time: string): string =>
      `Stations as of ${time}. Availability can change before you arrive.`,
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
    } as Record<string, { title: string; detail: string }>,
    retry: "Retry",
    retryable: ["network", "malformed"] as readonly string[],
  },

  empty: {
    label: "How this works",
    title: "Stay inside the free window",
    lead: (window: string): string =>
      `Your subscription includes ${window} per ride. Docking the bike at a station resets that counter.`,
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
    } as Record<string, string>,
    suggestions: {
      "increase-walk-distance": "Walk further",
      "increase-speed": "Ride faster",
      "reduce-safety-margin": "Keep less margin",
    } as Record<string, string>,
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
    } as Partial<Record<keyof PlanningParameters, string>>,
  },
};

export const STRINGS: Record<Locale, Strings> = { fr, en };

/** The default bundle, for callers with no reason to hold a locale. */
export const t: Strings = fr;

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}

export function describeCorrection(
  parameters: PlanningParameters,
  corrected: PlanningParameters,
  strings: Strings,
): string {
  const keys = Object.keys(corrected) as (keyof PlanningParameters)[];
  for (const key of keys) {
    if (parameters[key] === corrected[key]) continue;
    const message = strings.corrections.byKey[key];
    if (message !== undefined) return message;
  }
  return strings.corrections.fallback;
}
