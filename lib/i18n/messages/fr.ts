import type { MessageTree, Widen } from "../types";

/**
 * Every string the interface shows, in French.
 *
 * This is the reference. Its set of keys is what every other language must
 * hold, and its wording is what an untranslated entry falls back to. French,
 * because Montreal's network is a French-speaking one and a rider who wants
 * English asks for it.
 *
 * Data only. No functions, no arithmetic, no conditions — the `MessageTree`
 * type admits nothing else (FR-207). A value that has to be computed is
 * computed by the code that calls this, and each outcome gets its own entry.
 *
 * To correct a sentence: find it by the part of the interface it belongs to,
 * change the text, leave the key alone. You do not need to open any other file.
 *
 * Wording follows the "Écriture" section of docs/ui-guidelines.md: active
 * voice, sentence case, no apology, and an error states what happened and what
 * to do next. Tutoiement, as in that document's own examples.
 */

export const messages = {
  language: {
    label: "Langue",
    // {name} is how the target language names itself: "Français", "English".
    switchTo: "Afficher l'interface en {name}",
  },

  app: {
    name: "Redock",
    city: "Montréal",
    title: "Redock, planificateur de trajets à vélo partagé à Montréal",
    description:
      "Découpe un trajet à vélo partagé en segments assez courts pour rester dans la fenêtre gratuite, et indique où ancrer.",
  },

  /**
   * Units and durations. Wording, so it lives here; the rounding and the
   * hours/minutes split live in lib/format.ts, which is where arithmetic
   * belongs.
   */
  units: {
    underAMinute: "moins d'une minute",
    // The three shapes a duration can take. lib/format.ts does the division
    // and picks; no language repeats it (FR-207a).
    //
    // Every one carries "environ". Principle IV requires explicit uncertainty,
    // not merely a rounded number: a bare "45 minutes" reads as a measurement,
    // and a rider who reads it as one is a rider standing at a dock in the rain.
    //
    // The unit is abbreviated because "min" and "h" are invariable symbols in
    // French. That is also why these need no plural map: there is no plural to
    // get wrong. The full words did have one, and got it wrong at 1.
    durationMinutes: "environ {minutes} min",
    durationHours: "environ {hours} h",
    durationHoursMinutes: "environ {hours} h {minutes} min",
    metres: "{metres} m",
    kilometres: "{value} km",
  },

  fields: {
    origin: "Départ",
    destination: "Destination",
    placeholder: "Adresse, lieu, ou latitude, longitude",
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
  },

  map: {
    originPin: "Départ, fais glisser pour déplacer",
    destinationPin: "Destination, fais glisser pour déplacer",
    // One entry per endpoint rather than one entry that chooses. The caller
    // knows which endpoint it is asking about.
    hintPickingOrigin: "Touche la carte pour placer ton départ, ou tape une adresse.",
    hintPickingDestination:
      "Touche la carte pour placer ta destination, ou tape une adresse.",
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
    // {count} is the number of docking stops. French puts zero in the `one`
    // category, which is why this is a plural map and not a comparison.
    stops: {
      one: "{count} arrêt pour rester dans la fenêtre gratuite. Ce trajet est gratuit.",
      other:
        "{count} arrêts pour rester dans la fenêtre gratuite. Ce trajet est gratuit.",
    },
    estimate: "Durées estimées, ce ne sont pas des heures d'arrivée.",
  },

  trail: {
    label: "Itinéraire",
    start: "Départ",
    destination: "Destination",
    // {wait} is the cooldown before the same bike can be taken again.
    anchor: "Ancre le vélo ici et reprends-en un après {wait}",
    anchorResets: "remet la fenêtre gratuite à zéro",
    // {place} is a station name, or the fallback below when it is unknown.
    walkTo: "Marche jusqu'à {place}",
    walkToDestination: "Marche jusqu'à ta destination",
    walkFree: "n'entame pas la fenêtre gratuite",
    rideTo: "Roule jusqu'à {place}",
    unknownStation: "station {id}",

    /**
     * Per-étape, jamais pour l'itinéraire entier (FR-307, FR-311).
     *
     * « en cours » et « approximatif » se dessinent pareil sur la carte, parce
     * que ni l'un ni l'autre n'est un chemin vérifié. Ici la distinction compte:
     * « pas encore » et « non » ne se valent pas pour qui lit son trajet.
     */
    pathTraced: "tracé réel",
    pathApproximate: "tracé approximatif",
    pathPending: "tracé en cours",

    /**
     * Note de bas de liste, choisie selon ce qui est réellement tracé.
     *
     * Une seule phrase pour tout l'itinéraire serait fausse dès qu'une portion
     * diffère des autres, ce que FR-311 interdit.
     */
    traceAllReal:
      "Sur la carte, le tracé suit les rues et les voies cyclables praticables.",
    traceMixed:
      "Sur la carte, les portions en pointillé sont approximatives: elles relient deux points en ligne droite et ne suivent aucune rue.",
    traceIsIndicative:
      "Sur la carte, le tracé relie les stations en ligne droite. Il est indicatif, pas un itinéraire cyclable.",

    /**
     * Le plan a été refait parce qu'une distance réelle a dépassé le budget
     * (FR-316). L'utilisateur est informé, pas consulté.
     */
    corrected:
      "Un segment dépassait la fenêtre gratuite une fois sa distance réelle connue. Cet itinéraire a été recalculé.",
    correctionExhausted:
      "Les distances réelles ne permettent pas de tenir la fenêtre gratuite sur ce trajet. Augmente ta vitesse ou baisse ta marge de sécurité.",
  },

  gauge: {
    /**
     * Read by assistive technology, which sees neither the colour nor the bar.
     * If the state is not in the words, it does not exist for that user.
     * {state} is one of gauge.states below.
     */
    spoken: "environ {minutes} min d'avance à l'arrivée, {state}",
    remaining: "environ {minutes} min",
    onArrival: "d'avance à l'arrivée",
    states: {
      comfortable: "confortable",
      neutral: "correct",
      alarming: "risqué",
    },
  },

  noStop: {
    reveal: "Et sans aucun arrêt ?",
    hide: "Masquer la comparaison sans arrêt",
    nothingToCompare: "Rien à comparer : ce trajet se fait entièrement à pied.",
    /**
     * Split around the figure it frames: durations and amounts are set in the
     * monospace family, which is impossible if the sentence is one string.
     * {delta} is noStop.faster, noStop.slower or noStop.sameTime.
     */
    inOneGo: "d'une traite, {delta} qu'avec les arrêts.",
    faster: "{magnitude} de moins",
    slower: "{magnitude} de plus",
    sameTime: "à peu près le même temps",
    stillFree: "Toujours gratuit : le trajet tient dans la fenêtre gratuite.",
    wouldPayBefore: "Tu paierais",
    wouldPayAfter: "pour les {overage} au-delà de la fenêtre.",
    rateNote:
      "Estimation avant taxes, au tarif de {rate} la minute. Ce tarif se change dans les réglages.",
  },

  settings: {
    label: "Réglages",
    summaryDefaults: "{margin} de marge, valeurs par défaut",
    // {count} is how many parameters differ from their default.
    summaryChanged: {
      one: "{margin} de marge, {count} valeur modifiée",
      other: "{margin} de marge, {count} valeurs modifiées",
    },
    showRest: "Afficher les autres réglages",
    hideRest: "Masquer les autres réglages",
    reset: "Tout réinitialiser",
    /**
     * Vider les tracés gardés en mémoire (FR-329a).
     *
     * La géométrie entre deux stations ne change pas, donc elle est conservée
     * d'une visite à l'autre. Ce qui est gardé sans expirer doit pouvoir être
     * effacé par qui le garde.
     */
    purgePaths: "Vider les tracés en cache",
    purgePathsCount: {
      zero: "Aucun tracé en cache",
      one: "{count} tracé en cache",
      other: "{count} tracés en cache",
    },
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
    },
  },

  feed: {
    loading: "Chargement des stations",
    stale:
      "Ces données datent de {minutes} min et peuvent ne plus correspondre aux stations.",
    freshness:
      "Stations relevées à {time}. La disponibilité peut changer avant ton arrivée.",
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
    },
    retry: "Réessayer",
  },

  empty: {
    label: "Comment ça marche",
    title: "Reste dans la fenêtre gratuite",
    // {window} is the free window as a worded duration.
    lead: "Ton abonnement offre {window} par trajet. Ancrer le vélo à une station remet ce compteur à zéro.",
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
    },
    suggestions: {
      "increase-walk-distance": "Marcher plus loin",
      "increase-speed": "Rouler plus vite",
      "reduce-safety-margin": "Garder moins de marge",
    },
  },

  attribution: {
    map: "Carte",
    stations: "Stations",
    /** Affiché seulement quand un tracé réel est à l'écran (FR-332). */
    routing: "Tracés",
    /**
     * Ce qui sort du navigateur quand on demande un tracé (FR-333).
     *
     * La constitution veut que rien des données de l'utilisateur ne quitte le
     * navigateur. Demander un chemin envoie deux coordonnées à un tiers: assez
     * peu pour être acceptable, assez pour être dit.
     */
    routingPrivacy:
      "Obtenir un tracé envoie les deux extrémités du segment au service de calcul d'itinéraire.",
  },

  /**
   * Why a parameter set was rejected.
   *
   * The domain stays the authority on what is wrong; only the wording lives
   * here. `describeCorrection` reads the corrected set the domain hands back
   * and words the field it had to fix, rather than matching on prose.
   */
  corrections: {
    fallback:
      "Ces réglages ne peuvent produire aucun trajet. Ajuste-les et réessaie.",
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
    },
  },
} satisfies MessageTree;

/**
 * The shape every language must hold.
 *
 * Derived from the French tree and widened: another language may write
 * different words, and may use whatever plural categories its grammar has, but
 * it may not omit a key or invent one. A missing entry is a compile error
 * rather than a blank label a rider finds.
 */
export type Messages = Widen<typeof messages>;
