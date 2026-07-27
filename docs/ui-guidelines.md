# Direction visuelle

Ce document fait autorité sur toutes les décisions d'interface du projet. Toute
fonctionnalité doit s'y conformer. Les besoins utilisateur vivent dans les specs,
les choix visuels vivent ici.

---

## Principe directeur

L'interface est délibérément banale partout, sauf à un endroit.

La coque reprend un modèle que tout le monde sait déjà lire, sans rien inventer.
Toute la singularité du produit se concentre sur un seul élément : l'affichage du
temps de gratuité restant. C'est la seule chose que ce produit fait et que
personne d'autre ne fait. Rien d'autre n'a le droit de réclamer l'attention.

Une interface où tout est remarquable n'a rien de remarquable.

---

## Structure

La carte occupe le cadre entier du viewport. Elle n'est jamais rognée, encadrée,
ni traitée comme une tuile parmi d'autres.

Un panneau unique se superpose à la carte et contient l'intégralité de
l'interface : saisie, résumé, itinéraire, réglages. Aucun autre conteneur
flottant n'est autorisé.

| Contexte | Ancrage du panneau |
|---|---|
| Mobile (< 1024px) | Feuille glissante ancrée en bas, deux positions de repos : repliée sur le résumé, dépliée sur le fil complet. Hauteur maximale 65dvh. |
| Desktop (≥ 1024px) | Panneau ancré à gauche, largeur fixe 380px, marges 16px, coins arrondis sur les quatre angles. |

Le composant est strictement le même dans les deux cas. Seul son ancrage change.
Il n'existe pas deux mises en page à maintenir.

Utiliser `dvh` et jamais `vh` : la barre d'URL mobile fausse `vh`.

---

## Ordre imposé du panneau

1. Saisie du départ et de la destination
2. Résumé : durée totale, nombre d'arrêts, coût
3. Fil d'itinéraire complet
4. Ligne de réglages repliée

**Aucun réglage n'apparaît au-dessus du résultat.** Les paramètres sont une
entrée modifiée rarement ; l'itinéraire est la sortie consultée à chaque usage.
Placer l'entrée avant la sortie fait payer un défilement à chaque consultation
pour un réglage annuel.

Contrainte vérifiable : un trajet à deux arrêts est intégralement lisible sans
défilement sur un écran de 700px de haut.

---

## Élément signature : le temps restant

La fenêtre de gratuité se présente comme une réserve qui se vide, à la manière
d'une batterie de véhicule électrique.

Chaque étape indique le temps qui restera à l'utilisateur **au moment où il y
arrive**, jamais le temps consommé.

```
✗  18 / 45 min          demande un calcul mental
✓  Arrivée avec 27 min d'avance    directement actionnable
```

Une jauge horizontale accompagne le chiffre, remplie à hauteur de ce qui
**reste**. Une barre pleine rassure, une barre vide alarme : le sens de lecture
doit être immédiat sans lire la valeur.

Trois états, et c'est le seul endroit de l'interface autorisé à utiliser un code
couleur à trois niveaux :

| Avance restante | État |
|---|---|
| > 15 min | Confortable |
| 5 à 15 min | Neutre |
| < 5 min | Alarmant |

Le calcul du temps restant appartient à la logique métier et sort dans la
structure de l'itinéraire. Il n'est jamais calculé dans un composant.

---

## Fil d'itinéraire

L'itinéraire se lit de haut en bas comme une liste unique et continue. Les
arrêts d'ancrage sont des étapes à part entière, au même rang que le départ et
l'arrivée — pas des annotations sur la carte.

- Rail vertical de 1,5px, en couleur de bordure
- Pastille creuse à bordure accentuée : station d'ancrage
- Pastille creuse à bordure neutre : point de départ
- Pastille pleine : destination
- Les temps de marche sont en texte secondaire, sans jauge, puisqu'ils ne
  consomment pas la fenêtre gratuite

Sous le fil, une action permet d'afficher le même trajet **sans aucun arrêt**,
avec le montant qui serait facturé. C'est la démonstration la plus directe de la
valeur du produit.

---

## Réglages

Un seul réglage est visible par défaut : la marge de sécurité. C'est le seul que
l'utilisateur a une raison légitime d'ajuster régulièrement.

Vitesse, distance de marche maximale, durée d'ancrage et limite de gratuité vont
dans une zone repliée, fermée par défaut, ouverte explicitement.

Au repos, l'ensemble des réglages occupe une seule ligne de résumé cliquable,
placée après le fil d'itinéraire.

Ouvrir les réglages ne fait perdre ni la position de lecture, ni le centrage, ni
le zoom de la carte.

---

## États de l'écran

| État | Panneau | Carte |
|---|---|---|
| Vide | Deux champs de saisie, rien d'autre | Stations environnantes |
| Calculé | Résumé et fil complet | Tracé et stations d'arrêt en évidence |
| Réglage | Contrôles en surcouche du panneau | Recalcul en direct, cadrage inchangé |

La carte ne se réorganise jamais entre deux états. Cette stabilité est ce qui
donne la sensation de solidité.

---

## Navigation

Sur l'accueil et la page à propos : barre horizontale classique.

Sur le planificateur : **aucune barre de navigation**. Les accès fusionnent avec
l'en-tête du panneau, via le nom de l'application et un menu discret. Une barre
permanente coûterait 56px de hauteur de carte sur mobile pour aucun gain.

Entrées, identiques dans les deux traitements :

| Entrée | Destination |
|---|---|
| Nom de l'application | Retour à l'accueil |
| À propos | Page dédiée avec URL propre, jamais une modale |
| Suggérer une idée | Issues du dépôt, nouvel onglet, gabarit pré-rempli |
| FR / EN | Bascule immédiate, persistée |

La page à propos porte les attributions de données et de cartographie, la
mention d'absence d'affiliation avec l'opérateur, et le lien vers le code source.

---

## Couleurs

```css
:root {
  --brand:      #E0402B;  /* accent unique */
  --brand-soft: #FDECE9;  /* fond de badge, survol */
  --brand-deep: #8F2517;  /* texte sur fond --brand-soft */

  --ink:    #17171A;      /* texte principal, jamais #000 */
  --paper:  #FAFAF8;      /* fond de page */
  --panel:  #FFFFFF;      /* surface du panneau */
  --line:   #E4E4E0;      /* bordures */
  --muted:  #6E6E6B;      /* texte secondaire */

  --ok:     #3E8E5A;      /* jauge confortable */
  --warn:   #C4771A;      /* jauge alarmante */
}
```

L'accent est réservé à trois usages et rien d'autre : le tracé de l'itinéraire,
les stations d'arrêt, l'état actif d'un contrôle.

`--ok` et `--warn` n'existent que dans la jauge de temps restant. Ils
n'apparaissent nulle part ailleurs.

Aucune ombre portée, aucun dégradé. Bordures de 1px, très discrètes. Rayons de
12px sur les conteneurs, 8px sur les contrôles.

---

## Typographie

Deux rôles, deux familles.

**Corps et interface** — une grotesque neutre, graisses 400 et 500 uniquement.
Jamais trois graisses.

**Durées et chiffres** — une famille monospace à chasse fixe. Ce n'est pas un
choix décoratif : les durées sont des données, elles s'alignent en colonnes dans
le fil, et la chasse fixe empêche les chiffres de danser quand la valeur change
pendant un recalcul. C'est aussi le vocabulaire visuel des horaires de transport.

Échelle :

| Usage | Taille |
|---|---|
| Durée totale du trajet | 30px, graisse 500 |
| Titres de section | 16px |
| Corps, noms de stations | 13–14px |
| Libellés secondaires, temps restant | 12px |

Casse phrase partout. Aucune majuscule décorative.

---

## Marqueurs de stations sur la carte

La carte affiche des centaines de points. Les colorer selon la disponibilité
détruirait la lisibilité et entrerait en conflit avec l'accent.

| Cas | Traitement |
|---|---|
| Station quelconque | Petit point neutre, opacité réduite |
| Disponibilité | Anneau partiellement rempli autour du point, sans teinte |
| Station de l'itinéraire | Accent, diamètre supérieur, seule couleur de la carte |
| Station inutilisable | Point creux, sans remplissage |

Aucune épingle. Aucun code à trois couleurs. Aucune grappe colorée.

---

## Écriture

Les mots sont du matériau de conception, pas de la décoration.

- Nommer les choses par ce que l'utilisateur reconnaît, jamais par la mécanique
  interne. « Arrêt » et non « nœud intermédiaire ».
- Voix active. Un contrôle annonce ce qu'il fait : « Recalculer », pas
  « Valider ».
- Un libellé garde le même nom sur tout le parcours.
- Les erreurs n'ont pas d'humeur et ne s'excusent pas. Elles disent ce qui s'est
  passé et quoi faire ensuite. « Aucune station avec vélo mécanique à moins de
  800 m. Augmente ta distance de marche. »
- Un écran vide est une invitation à agir, pas un constat de vide.
- Les durées sont toujours annoncées comme des estimations. Jamais d'heure
  d'arrivée à la minute près.

---

## Plancher de qualité

Non négociable, jamais annoncé dans l'interface.

- Utilisable de 360px de large à grand écran
- Navigable entièrement au clavier, focus visible
- Contrastes conformes WCAG AA
- `prefers-reduced-motion` respecté
- La jauge de temps restant ne repose pas uniquement sur la couleur : le chiffre
  est toujours présent

---

## Interdits

- Une barre de navigation permanente sur le planificateur
- Un réglage placé au-dessus du résultat
- Une couleur d'accent utilisée hors des trois usages autorisés
- Un code couleur à trois états ailleurs que sur la jauge de temps restant
- Des ombres portées, des dégradés, une troisième graisse typographique
- Une bibliothèque de composants tierce
- Un affichage du temps consommé plutôt que du temps restant
