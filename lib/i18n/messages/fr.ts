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
    /**
     * Ce que fait le produit, en une phrase, sous son nom (FR-414).
     *
     * Permanente : avant la saisie et une fois le trajet calculé. C'est ce qui
     * dispense d'un contrôle « à propos » — une phrase qui ne part jamais n'a
     * pas besoin qu'on la rappelle, et une surcouche ouverte pour énoncer une
     * phrase est un mécanisme plus lourd que ce qu'il sert (FR-417).
     *
     * Nomme l'opérateur, ce qui acquitte FR-419 partout dans le parcours. Tient
     * sur une ligne de contenu et passe à la ligne plutôt que de se tronquer :
     * un sous-titre terminé par des points de suspension n'énonce rien
     * (FR-419a).
     */
    tagline: "Optimise tes trajets BIXI pour ne payer aucun supplément.",
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

  /**
   * Le résumé, où le produit fait désormais son argument.
   *
   * Ces entrées ne disent plus qu'un trajet planifié est gratuit. Elles le
   * disaient, en raisonnant sur la façon dont le plan est construit ; depuis que
   * les distances mesurées remplacent les estimations, un segment peut dépasser
   * la fenêtre et le montant est calculé plutôt qu'affirmé (FR-404).
   */
  summary: {
    label: "Résumé du trajet",
    // {count} is the number of docking stops. French puts zero in the `one`
    // category, which is why this is a plural map and not a comparison.
    stops: {
      one: "{count} arrêt pour rester dans la fenêtre gratuite.",
      other: "{count} arrêts pour rester dans la fenêtre gratuite.",
    },
    estimate: "Durées estimées, ce ne sont pas des heures d'arrivée.",

    /**
     * Tant que l'itinéraire bouge encore, aucun montant (FR-408a).
     *
     * Un prix qui se corrige tout seul pendant qu'on le lit se lit comme une
     * erreur, pas comme une estimation. Les durées, elles, continuent de
     * s'ajuster : elles sont annoncées comme approximatives depuis toujours.
     */
    pricingPending: "Coût en cours de calcul.",

    /** Les trois figures. Étiquettes courtes : le montant à côté fait le travail. */
    withStops: "Avec les arrêts",
    withoutStops: "Sans arrêt",
    saved: "Tu économises",

    /** Des arrêts, mais qui ne font rien gagner (FR-406). */
    savesNothing:
      "Ces arrêts ne te font rien économiser : tu peux rouler d'une traite.",

    /**
     * Aucun arrêt du tout (FR-406a).
     *
     * Volontairement de la même forme que savesNothing : ce sont deux issues
     * voisines, et les distinguer par une mise en page obligerait le lecteur à
     * décoder au lieu de lire.
     */
    noStopNeeded:
      "Aucun arrêt nécessaire : ce trajet tient dans la fenêtre gratuite.",
    /** Le cas rare : un seul trajet, poussé au-delà de la fenêtre par la mesure. */
    noStopOverBefore: "Aucun arrêt possible ici. Tu paierais",
    noStopOverAfter: "au-delà de la fenêtre gratuite.",

    /**
     * Ce sur quoi les montants reposent (FR-407, FR-411, FR-412).
     *
     * À côté du montant et jamais repliée : un chiffre que le lecteur ne peut
     * pas rapprocher du tarif publié par l'opérateur se lit comme une erreur.
     * {window} est la fenêtre gratuite, {rate} le tarif à la minute.
     */
    assumptions:
      "Vélo mécanique, {window} inclus, puis {rate} la minute. Avant taxes, hors frais de déverrouillage.",

    /**
     * La comparaison en temps, à côté de celle en argent (FR-410).
     *
     * Séparée autour du chiffre qu'elle encadre : les durées sont en chasse
     * fixe, ce qui est impossible si la phrase est une seule chaîne.
     * {delta} vaut faster, slower ou sameTime.
     */
    inOneGo: "d'une traite, {delta} qu'avec les arrêts.",
    faster: "{magnitude} de moins",
    slower: "{magnitude} de plus",
    sameTime: "à peu près le même temps",
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

  settings: {
    label: "Réglages",
    /** La surcouche se referme, l'itinéraire est toujours dessous. */
    close: "Fermer les réglages",
    summaryDefaults: "{margin} de marge, valeurs par défaut",
    // {count} is how many parameters differ from their default.
    summaryChanged: {
      one: "{margin} de marge, {count} valeur modifiée",
      other: "{margin} de marge, {count} valeurs modifiées",
    },
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
    /**
     * L'ancienneté du relevé, en relatif, dans la rangée 2 du pied de panneau.
     *
     * En relatif parce que « relevées à 14:32 » oblige à regarder l'heure et à
     * soustraire, et que la question posée est « est-ce que c'est vieux »
     * (docs/ui-guidelines.md, « Pied de panneau »). L'heure exacte reste
     * disponible au survol, ce que FR-014 demande.
     */
    freshness: "Stations relevées {age}",
    /*
     * Sans « environ », contrairement aux durées de trajet.
     *
     * Un relevé est arrivé à un instant connu, il a exactement cet âge. Une
     * estimation se signale comme telle ; une mesure qui se signale comme une
     * estimation affaiblit la précaution là où elle sert vraiment.
     */
    ageJustNow: "à l'instant",
    ageMinutes: "il y a {minutes} min",
    ageHours: "il y a {hours} h",
    ageHoursMinutes: "il y a {hours} h {minutes}",
    /** Ce que le survol montre quand le relatif ne suffit pas (FR-014). */
    observedAt: "Relevé à {time}. La disponibilité peut changer avant ton arrivée.",
    refresh: "Actualiser les stations",
    /**
     * L'actualisation refusée, faute d'avoir attendu assez (FR-421).
     *
     * Le plancher est le nôtre, pas celui de l'opérateur : le flux autorise une
     * requête toutes les dix secondes et nous nous en tenons à une par minute,
     * parce que marteler un service offert gracieusement est la façon dont les
     * flux publics finissent par fermer.
     *
     * Le lecteur n'a donc rien fait de mal, et la phrase ne le lui reproche pas.
     * Elle dit que la donnée est aussi récente qu'elle a le droit de l'être, et
     * combien de temps il reste. {seconds} est un nombre de secondes.
     */
    refreshTooSoon:
      "Données déjà à jour. Nouvelle vérification possible dans {seconds} s.",
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
