import type { PlaceKind } from "./geocode";
import type { PlanningParameters, RemainingStatus } from "./types";

/**
 * Every string the interface shows, in one place.
 *
 * French is the product language. The strings live here rather than inline in
 * the components for two reasons: a label has to keep the same wording
 * everywhere it appears, which is impossible to guarantee when the same phrase
 * is typed in three files, and the FR/EN toggle docs/ui-guidelines.md calls for
 * needs a second object beside this one rather than a rewrite of every
 * component.
 *
 * Wording follows the "Écriture" section of docs/ui-guidelines.md: active
 * voice, sentence case, no apology, and an error states what happened and what
 * to do next. Tutoiement throughout, as in that document's own examples.
 */

export const t = {
  app: {
    name: "Redock",
    title: "Redock, planificateur de trajets à vélo partagé à Montréal",
    description:
      "Découpe un trajet à vélo partagé en segments assez courts pour rester dans la fenêtre gratuite, et indique où ancrer.",
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
  } satisfies Record<PlaceKind, string>,

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
      alarming: "juste",
    } satisfies Record<RemainingStatus, string>,
  },

  noStop: {
    reveal: "Et sans aucun arrêt ?",
    hide: "Masquer la comparaison sans arrêt",
    nothingToCompare:
      "Rien à comparer : ce trajet se fait entièrement à pied.",
    /**
     * Split around the figure it frames: durations and amounts are set in the
     * monospace family, which is impossible if the sentence is one string.
     */
    inOneGo: (delta: string): string => `d'une traite, ${delta} qu'avec les arrêts.`,
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
    } satisfies Record<keyof PlanningParameters, { label: string; hint: string }>,
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
          "Le réseau n'a pas répondu. Vérifie ta connexion et réessaie ; la carte et la saisie manuelle fonctionnent toujours.",
      },
      malformed: {
        title: "Les données de stations sont illisibles",
        detail:
          "Le fournisseur a répondu, mais pas dans le format attendu. Le problème vient de sa source, pas de ta connexion.",
      },
      "out-of-season": {
        title: "Le réseau est hors saison",
        detail:
          "L'opérateur ne publie aucune station active en ce moment, aucun trajet ne peut être planifié.",
      },
    } as Record<string, { title: string; detail: string }>,
  },

  plan: {
    empty: "Indique un départ et une destination pour voir un trajet.",
    failureTitle: "Aucun trajet possible",
    failures: {
      "origin-out-of-coverage":
        "Ton départ est hors de la zone desservie par le réseau.",
      "destination-out-of-coverage":
        "Ta destination est hors de la zone desservie par le réseau.",
      "no-station-near-origin":
        "Aucune station à distance de marche de ton départ.",
      "no-mechanical-bike-near-origin":
        "Il y a des stations à proximité, mais aucune n'a de vélo mécanique. La fenêtre gratuite ne s'applique pas aux vélos électriques.",
      "no-station-near-destination":
        "Aucune station à distance de marche de ta destination.",
      "gap-too-large":
        "Les stations de ce trajet sont trop éloignées les unes des autres pour être reliées sans dépasser la fenêtre gratuite.",
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
    map: "Fond de carte",
    stations: "Stations",
  },
} as const;

/**
 * Why a parameter set was rejected, in French.
 *
 * `validateParameters` returns its explanation as English prose with no code to
 * key on, and it belongs to the planning logic this work is not allowed to
 * touch. Rather than matching on that sentence, which would break the moment
 * its wording changed, this reads the *corrected* set the domain hands back and
 * words the field it had to fix. The domain stays the authority on what is
 * wrong; only the wording lives here.
 */
const CORRECTION_BY_KEY: Partial<Record<keyof PlanningParameters, string>> = {
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
  bikeReserve: "Les réserves de vélos et d'ancrages sont des entiers positifs.",
  dockReserve: "Les réserves de vélos et d'ancrages sont des entiers positifs.",
};

export function describeCorrection(
  parameters: PlanningParameters,
  corrected: PlanningParameters,
): string {
  const keys = Object.keys(corrected) as (keyof PlanningParameters)[];
  for (const key of keys) {
    if (parameters[key] === corrected[key]) continue;
    const message = CORRECTION_BY_KEY[key];
    if (message !== undefined) return message;
  }
  return "Ces réglages ne peuvent produire aucun trajet. Ajuste-les et réessaie.";
}
