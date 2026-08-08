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
flottant **permanent** n'est autorisé. La seule exception est la pastille de
station, décrite plus bas, qui n'existe que le temps d'un appui.

| Contexte | Ancrage du panneau |
|---|---|
| Mobile (< 768px) | Feuille glissante ancrée en bas, deux positions de repos : repliée `min(72dvh, max(56dvh, 452px))`, dépliée 80dvh. |
| Desktop (≥ 768px) | Panneau ancré à gauche, largeur fixe 380px, marges 16px, coins arrondis sur les quatre angles. |

Le composant est strictement le même dans les deux cas. Seul son ancrage change.
Il n'existe pas deux mises en page à maintenir.

*Amendé le 2026-08-05.* Les deux positions étaient 45dvh et 65dvh, et la bascule
était annoncée à 1024px alors qu'elle a toujours été posée à 768px dans le code —
une feuille pleine largeur sur une tablette est ce qui produisait « le panneau
touche les bords de l'écran ». Les deux sont corrigées en même temps.

Tous les chiffres qui suivent sont mesurés dans un navigateur, pas calculés.

Ce qui empêchait de lire le fil n'était pas le plafond : la zone défilante
débordait de son propre emplacement. `height: 100%` s'y résolvait contre la
hauteur *spécifiée* du parent, restée `auto` parce que flex dimensionne sans
écrire la propriété, si bien qu'elle retombait sur la hauteur de son contenu.
Mesure sur 390×844 : 405px de zone défilante dans un emplacement de 241px,
terminée 43px sous le bas de l'écran, passant sous le pied collant, avec
`scrollHeight === clientHeight` — aucune barre, aucun défilement possible. Le
fil n'était pas à l'étroit, il était dessiné là où rien ne pouvait l'atteindre.
Corrigé en faisant de la zone défilante un élément flex plutôt qu'un pourcentage
de son parent.

Les deux positions étaient trop basses par ailleurs. Le panneau dépense 231px de
mobilier fixe sur un téléphone : poignée 44, en-tête 66 depuis que la phrase
permanente s'y trouve, pied 121 depuis que la rangée de crédits l'a rejoint.
Chacune de ces additions était défendable seule ; leur somme ne l'est pas
restée, et c'est la position qui cède, pas elles.

**La position repliée n'est pas une fraction.** Ce qu'elle doit dégager — le
bloc de saisie et le résumé entier, 210px mesurés — se trouve derrière un
mobilier dont le coût est fixe en pixels, pas proportionnel à l'écran. Un
pourcentage unique ne peut donc pas être juste deux fois : 56dvh dégage le
résumé sur un écran de 844px et en coupe 90px sur un écran de 640px. Le plancher
s'écrit donc en pixels, le plafond en dvh, et l'écran décide lequel mord.

| Écran | Position repliée | Ce qui mord |
|---|---|---|
| 844px | 473px | 56dvh |
| 640px | 452px | le plancher, soit 71dvh |
| 500px | 360px | le plafond de 72dvh |

452 et non 440, qui est le chiffre de l'addition : 440 laissait le résumé neuf
pixels trop court sur 640px. C'est ce que le navigateur a rapporté, pas ce que
la somme prévoyait. Le plafond de 72dvh est ce qui empêche le plancher d'avaler
la carte sur un écran très court, où dégager le résumé ne vaut pas de n'avoir
plus de carte du tout.

`framePadding()` dans MapView calcule la même expression à partir des mêmes
trois constantes : le tracé est cadré dans la bande que la feuille laisse au
repos, la position dépliée étant un geste que le lecteur fait puis défait. Ces
deux copies doivent rester d'accord — une dérive remet le tracé sous le panneau
sans que rien n'échoue pour le signaler.

80dvh en position dépliée, et pas davantage. Le plafond haut est fixé par
l'attribution cartographique, pas par le goût : elle est dessinée contre le haut
de la carte sous 768px, sous l'encoche, elle passe à la ligne — 88px mesurés sur
360px de large — et elle porte un z-20 contre le z-10 du panneau. Une feuille
plus haute ne la couvrirait donc pas, elle serait surimprimée par elle : un
cartouche de crédits flottant sur l'en-tête du panneau. À 80dvh le bord haut de
la feuille est à 128px sur un écran de 640px, au clair de 32px.

La contrainte vérifiable plus bas — un trajet à deux arrêts intégralement
lisible sans défilement, panneau déplié, sur 700px de haut — est désormais tenue
sur 390×844 : le trajet mesuré y tient entièrement, le fil compris. Elle ne
l'est pas sur 360×640, où il reste 184px à dérouler. Le levier qui n'a pas été
tiré est le pied de panneau, dont les 121px sont plus de la moitié du mobilier
restant.

*Amendé le 2026-08-06.* La poignée fait désormais deux choses : un appui déplace
entre les deux positions de repos, un glissement pose la feuille où le doigt la
laisse, entre 260px et 80dvh. Les flèches haut et bas font la même chose au
clavier, par pas de 48px — environ une rangée du fil, qui est l'unité que le
lecteur demande réellement. Un changement de taille de fenêtre ou une rotation
rend la feuille à ses positions de repos : une hauteur en pixels ne veut plus
rien dire contre un écran qui n'existe plus.

Les deux positions de repos ne sont pas remplacées, elles restent ce qu'un appui
parcourt et ce à quoi la feuille s'ouvre. Ce que le glissement ajoute, c'est le
cas où aucune des deux ne convient — un fil dont la longueur est le trajet du
lecteur et non une donnée de conception, donc la plupart des cas.

Le rembourrage de cadrage de la carte est posé **une fois** sur la
transformation, par `setPadding`, jamais passé à un appel de caméra individuel.
C'est un piège que la bibliothèque tend : un appel qui porte `padding`
l'installe durablement, et le suivant ajoute le sien par-dessus. Deux de ces
rembourrages sur un écran de 844px font 962px, `cameraForBounds` renvoie
`undefined` parce que la boîte à cadrer est négative, et `fitBounds` ne fait
rien du tout, sans erreur. C'est ce qui laissait la caméra sur le départ quand
on saisissait une destination.

Ouvrir les réglages porte la feuille à 80dvh, en hauteur ferme et non en
plafond, et la poignée se retire pendant ce temps. La surcouche est absolue,
donc elle ne compte pas dans la hauteur intrinsèque du panneau : sans hauteur
ferme, neuf curseurs héritaient de la fenêtre que l'itinéraire *en dessous*
laissait, c'est-à-dire de l'état vide sur un planificateur où aucun trajet n'a
encore été saisi. La position choisie par le lecteur n'est pas écrasée, elle est
revenue à la fermeture.

Utiliser `dvh` et jamais `vh` : la barre d'URL mobile fausse `vh`.

---

## Ordre imposé du panneau

Ce que contient la zone défilante, dans cet ordre :

1. Saisie du départ et de la destination
2. Résumé : durée totale, nombre d'arrêts, coût
3. Fil d'itinéraire complet

Le défilement s'arrête là. Les réglages et la fraîcheur des données sont les deux
rangées du pied collant, décrit plus bas, et ne font partie ni de cet ordre ni de
ce défilement.

**Aucun réglage n'apparaît au-dessus du résultat.** Les paramètres sont une
entrée modifiée rarement ; l'itinéraire est la sortie consultée à chaque usage.
Placer l'entrée avant la sortie fait payer un défilement à chaque consultation
pour un réglage annuel.

Le résumé porte la durée totale, le nombre d'arrêts, **et la comparaison de
coût** : ce que le trajet coûte avec les arrêts proposés, ce qu'il coûterait sans
aucun arrêt, et l'écart. C'est l'argument du produit, et il ne se replie pas.
Aucune de ces trois figures, ni les hypothèses qui les accompagnent, ne peut être
placée derrière un dépli, un onglet, un écran secondaire, ou sous le fil
d'itinéraire.

Contrainte vérifiable : un trajet à deux arrêts est intégralement lisible sans
défilement sur un écran de 700px de haut, **panneau déplié**.

En position repliée, c'est le résumé entier qui doit être visible sans
défilement, hypothèses comprises. Le fil d'itinéraire est ce qui passe sous la
ligne de flottaison. La hiérarchie est délibérée : la position repliée existe
pour répondre « combien de temps, combien d'arrêts, combien ça coûte », et c'est
le résumé qui répond.

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

*Amendé le 2026-07-29.* Un nom de station peut occuper **deux lignes**, puis
ellipse au-delà. Il était tronqué sur une seule ligne, ce qui à 380px — 360px au
plus étroit que couvre le plancher de qualité — réduisait les plus longs noms du
réseau à un préfixe suivi de points de suspension. Un préfixe n'est pas une
station qu'on retrouve dans la rue. La correction n'est pas une infobulle, c'est
l'absence de troncature : une infobulle n'existe que pour qui a un pointeur.

La durée reste alignée en haut à droite et ne bouge pas quand le nom passe sur
deux lignes : la rangée est alignée sur son haut, et la durée reçoit la même
hauteur de ligne que le nom pour que leurs premières lignes se centrent
ensemble. Un attribut `title` porte le nom complet **en complément** de ces deux
lignes, jamais à leur place, pour le cas résiduel où l'ellipse coupe malgré tout
— le plus long nom du réseau fait 73 caractères et n'y tient pas à 360px.

Ceci ne rouvre pas « Densité verbale » : une rangée porte toujours au maximum une
icône, un nom et une durée. C'est le nom qui a le droit de faire deux lignes, pas
la rangée d'accueillir une quatrième chose.

Sous le fil, une action permet d'afficher le même trajet **sans aucun arrêt**,
avec le montant qui serait facturé. C'est la démonstration la plus directe de la
valeur du produit.

---

## Réglages

Les réglages s'ouvrent depuis la rangée 1 du pied de panneau, en surcouche du
panneau. Ils couvrent le fil d'itinéraire, ne le poussent pas et ne l'effacent
pas : il reste monté dessous, à sa position de lecture, et revient intact.

**Tous les paramètres sont visibles d'un coup.** Aucun n'est derrière un repli.
La marge de sécurité vient en tête, parce que c'est celle qu'on ajuste
réellement, mais rien ne coûte un clic de plus que les autres.

Une seule action remet toutes les valeurs par défaut.

Ouvrir les réglages ne fait perdre ni la position de lecture, ni le centrage, ni
le zoom de la carte.

Sous 768px, les ouvrir porte la feuille à son plafond déplié, et le titre et sa
croix de fermeture sont collants en haut de la surcouche. La liste est plus
haute que le panneau par mandat — aucun paramètre derrière un repli — donc le
lecteur est toujours quelque part au milieu, et une fermeture qui défile avec le
titre le renvoyait chercher la rangée du pied. Sur pointeur grossier, chaque
curseur reçoit une boîte de 44px : sur un `input[type=range]` la cible est la
piste, pas le pouce, et la hauteur suffit donc à donner une cible pleine largeur
sans renoncer au rendu natif ni à `accent-color`.

*Amendé le 2026-07-28.* Ce document demandait auparavant un seul réglage visible,
les autres dans une zone repliée fermée par défaut, et l'ensemble tenant sur une
ligne de résumé placée après le fil d'itinéraire. Cette règle décrivait
correctement une ligne posée dans le défilement, où onze curseurs auraient
enterré la réponse : le repli était ce qui gardait la ligne à une ligne. Depuis
que les réglages sont une surcouche pleine hauteur avec son propre défilement, il
n'y a plus d'itinéraire à enterrer, et le repli n'ajoutait qu'un clic entre le
lecteur et la valeur qu'il vient chercher. La contrainte qui demeure est celle du
principe IV, et elle est mieux servie qu'avant : tout paramètre qui influence un
résultat est visible et ajustable.

---

## États de l'écran

| État | Panneau | Carte |
|---|---|---|
| Vide | Deux champs de saisie, puis l'explication du mécanisme dans la zone de résultat | Stations environnantes |
| Calculé | Résumé et fil complet | Tracé et stations d'arrêt en évidence |
| Réglage | Contrôles en surcouche du panneau | Recalcul en direct, cadrage inchangé |

L'état vide portait autrefois « deux champs de saisie, rien d'autre ». C'était un
constat de vide là où la règle d'écriture demande une invitation, et le mécanisme
du produit n'est pas évident : personne n'arrive en sachant qu'ancrer un vélo
remet la fenêtre gratuite à zéro, et sans ce fait le résultat lui-même est
illisible. L'explication occupe donc la zone que le résultat remplira, et lui
cède la place sans laisser de blanc dès qu'un trajet est calculé.

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
| FR / EN | Bascule immédiate, persistée. Les textes vivent dans `lib/i18n/messages/`, un fichier par langue |

La page à propos porte les attributions de données et de cartographie, la
mention d'absence d'affiliation avec l'opérateur, et le lien vers le code source.

Sous le nom de l'application, l'en-tête porte **une phrase et une seule** : ce
que fait le produit et pourquoi s'arrêter fait économiser. Elle est permanente,
avant la saisie comme une fois le trajet affiché, et c'est cette permanence qui
dispense d'une entrée « à propos » pour la rappeler. Elle nomme l'opérateur.

Elle passe à la ligne plutôt que de se tronquer, dans toutes les langues et à la
largeur la plus étroite du panneau : un sous-titre terminé par des points de
suspension n'énonce rien. Elle coûte de la hauteur de panneau sur tous les
écrans, y compris en position repliée où le résumé vient d'en réclamer
davantage ; ce compromis est accepté une fois, pour une ligne de contenu, et
rien d'autre n'a le droit de la rejoindre.

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

### Noms de stations

*Ajouté le 2026-07-29.* Un marqueur sans nom pose une question à laquelle il ne
répond pas. L'anneau dit combien, il ne dit jamais laquelle, et « laquelle » est
la seule chose qu'un lecteur peut comparer à un panneau dans la rue.

Trois mécanismes, et il en faut trois parce qu'aucun ne couvre les cas des
autres.

| Mécanisme | Ce qu'il donne | Quand |
|---|---|---|
| Étiquette permanente | Le nom, en texte secondaire de 11px, halo à la couleur du panneau | À partir du zoom 15 |
| Étiquette d'itinéraire | Le nom, en texte principal | À tout zoom, priorité de collision sur les autres |
| Pastille | Le nom, les vélos mécaniques, les ancrages libres, deux actions | Sur appui ou clic |

La collision est activée et c'est le mécanisme, pas une limite : plusieurs
centaines de noms à 11px se recouvrent, la bibliothèque cartographique écarte
ceux qui ne tiennent pas, et le lecteur en obtient davantage en zoomant. Les
stations de l'itinéraire passent devant les autres par clé de tri, jamais par une
seconde couche sans collision : un nom écarté vaut mieux que deux noms imprimés
l'un sur l'autre.

Le survol sur pointeur fin donne le nom et rien de plus. Tout le reste demande un
appui, parce que la majorité des lecteurs n'a pas de pointeur et que le plancher
de qualité interdit qu'une information n'existe qu'au survol.

### Pastille de station

*Ajouté le 2026-07-29.* La règle « aucun autre conteneur flottant » vise le
mobilier **permanent** : la bannière d'armement et la légende de disponibilité
s'étaient installées au-dessus de la carte et y restaient. La pastille est d'une
autre nature et l'exception s'arrête à elle : elle est appelée par un appui sur
une station précise, ancrée à cette station, et refermée par l'appui suivant
ailleurs ou par Échap.

Elle porte le nom, les vélos mécaniques, les ancrages libres, et les deux seules
actions qui évitent de la refermer pour recommencer ailleurs : « Partir d'ici » et
« Aller ici ». Traitement du panneau : bordure de 1px, surface opaque, aucune
ombre, aucune pointe. Rien d'autre ne peut la rejoindre, et aucun second
conteneur flottant ne peut s'autoriser de ce précédent.

L'appui sur un marqueur ne place jamais d'extrémité de trajet : lire une station
et y poser son départ sont deux gestes, et les confondre pose un point sous le
doigt de qui venait lire.

### Mise en évidence croisée

*Ajouté le 2026-07-29.* Survoler ou focaliser une étape du fil cerne la station
correspondante sur la carte, et pointer une station sur la carte marque son étape
dans le fil.

Sur la carte, la mise en évidence est un **diamètre** : un anneau creux plus
large que tout autre marqueur. Pas une teinte — l'accent est réservé à trois
usages et « l'étape que tu pointes » n'en est pas un, et il n'existe pas de
quatrième couleur à prendre. Dans le fil, c'est le voile d'état, celui que tout
contrôle de cette interface utilise pour accuser réception d'un pointeur.

Une étape du fil est un bouton. C'est le seul chemin qu'un clavier a vers les
stations dessinées sur la carte, et l'activer recentre la carte sur la station
**sans toucher au zoom** : le lecteur a demandé où elle est, pas qu'on l'en
rapproche.

---

## Pied de panneau

Zone collante en bas du panneau, séparée du fil d'itinéraire par un filet et
un fond légèrement distinct. Elle ne défile jamais avec le contenu: sur un
itinéraire long, les réglages et l'actualisation restent atteignables sans
dérouler.

Exactement trois rangées, dans cet ordre, et rien d'autre ne peut s'y ajouter.

Rangée 1 — Réglages, hauteur 46px.
Icône, libellé "Réglages", résumé des valeurs actives aligné à droite, chevron.
La rangée entière est cliquable, pas seulement le libellé. C'est un bouton,
jamais une liste de sélection. Elle ouvre et referme la surcouche décrite plus
haut, et reste visible pendant que celle-ci est ouverte : la rangée qui a ouvert
les réglages est le chemin du retour.

Rangée 2 — Fraîcheur des données, hauteur 40px.
Ancienneté exprimée en relatif et mise à jour d'elle-même, bouton
d'actualisation aligné à droite. Zone tactile de 44px minimum malgré la
hauteur de rangée.

Rangée 3 — Crédits, hauteur 32px. *Ajoutée le 2026-08-03.*
Deux liens et rien d'autre : l'auteur à gauche, le dépôt de code à droite. Texte
xs atténué, pas d'icône — le jeu d'icônes est d'un seul trait dans une boîte de
20×20 et la marque GitHub est un glyphe plein.

Elle vient en dernier et elle est la plus basse des trois, parce qu'elle se lit
une fois quand les deux autres servent à chaque trajet : la règle d'origine —
réglages et actualisation atteignables sans dérouler — reste exactement aussi
vraie qu'avant. Une ligne de crédits est précisément ce qui grossit d'une entrée
à la fois jusqu'à devenir un pied de page ; elle est fermée à deux liens pour la
même raison que ce pied est fermé à trois rangées.

*Amendé le 2026-08-06.* La rangée 3 n'existe qu'à partir de 768px. Sous cette
largeur, elle est la dernière chose de la surcouche des réglages.

C'est la phrase ci-dessus prise au mot. Elle « se lit une fois quand les deux
autres servent à chaque trajet », et sur un téléphone elle coûtait 33px de
**chaque** écran, en permanence, dans un pied de 121px pour une zone de contenu
de 241px. Le pied tombe à 88px et la zone de contenu passe de 241 à 274px au
repos — mesuré. Rien n'est supprimé : les deux liens sont là où l'on va chercher
ce qu'est cette application et qui l'a écrite, et le composant est le même aux
deux emplacements, donc il n'y a pas deux dessins à maintenir.

L'attribution cartographique n'appartient pas au pied de panneau. Elle reste
sur la carte, où l'obligation légale l'exige.

Elle se place contre le bord que le panneau n'occupe pas, et cela dépend de
l'ancrage : en haut à gauche tant que le panneau est une feuille en bas, en bas à
droite dès qu'il devient une carte à gauche. Elle est intégralement lisible, sur
un fond opaque, et passe à la ligne plutôt que de se tronquer. Une attribution
avec des points de suspension n'est pas une attribution.

*Amendé le 2026-08-05.* Sous 768px, elle est repliée derrière un bouton ⓘ de
44px placé à ce même coin, et le premier appui l'affiche en entier avec une
croix pour la refermer. À partir de 768px rien ne se replie : le coin bas-droite
que la carte laisse libre ne coûte rien, la boîte y reste ouverte en permanence
et le bouton n'est pas rendu du tout.

C'est un écart par rapport à la règle ci-dessus, et il est légitime plutôt que
commode. Les lignes directrices d'attribution de la fondation OSM prévoient
exactement cette forme :

> If the attribution has been collapsed, the user must still be able to find the
> licence information if they look for it, for example from an '(i)' button in
> the corner of the map or an 'About' option in a menu.
>
> — <https://osmfoundation.org/wiki/Licence/Attribution_Guidelines>

Ce que la règle protège, c'est que le lecteur qui cherche puisse trouver ; elle
n'a jamais exigé qu'on fasse lire celui qui ne cherche pas. Sur téléphone cette
boîte fait quatre lignes de 12px — 88px mesurés sur 360px de large — posées sur
la carte, et l'une de ces lignes est la note de confidentialité du calcul
d'itinéraire, qui n'est pas un crédit. C'est un quart de la carte visible
au-dessus de la feuille dépensé en texte que personne ne lit deux fois.

Trois choses en font un repli et non un enfouissement : le libellé du bouton
nomme ce qu'il contient — « Crédits et licences », jamais « Infos » —, le bouton
est un meuble permanent de la carte et non quelque chose qui apparaît sur un
geste, et chaque lien à l'intérieur est le même lien qu'avant.

Le contrôle d'attribution natif de la bibliothèque cartographique reste
désactivé : il dessine dans un coin fixe que la feuille recouvre, ce qui est
précisément comment les crédits obligatoires ont fini par disparaître une
première fois.

Sur mobile, ajouter env(safe-area-inset-bottom) au rembourrage inférieur.

---

## Densité verbale

Une information ne s'écrit que si aucune icône, aucune position et aucune
couleur ne peut la porter. Le texte est le dernier recours, pas le premier.

- Une règle qui vaut pour tout le fil s'explique une fois, dans une légende
  discrète, jamais répétée à chaque ligne.
- Un état se signale par une couleur et une icône, pas par un adjectif en fin
  de phrase.
- Une ligne du fil comporte au maximum: une icône, un nom, une durée.
- Aucune phrase complète dans le fil d'itinéraire.
- Les avertissements généraux sur la nature estimative des durées apparaissent
  une seule fois, près du total.

## Comparaison de coût

Bloc obligatoire, placé immédiatement après les champs de saisie, avant le
total de durée. C'est l'argument principal du produit et il ne doit jamais
prendre la forme d'une phrase.

Deux cellules côte à côte de largeur égale.
- Cellule gagnante: fond teinté translucide, bordure de la même teinte, icône
  de validation, montant en grand et en couleur.
- Cellule perdante: sans fond, bordure neutre, montant barré et atténué.
- Lorsque les arrêts ne font rien économiser, les deux cellules deviennent
  neutres et un libellé unique l'indique.

Les teintes sont produites par superposition translucide de la couleur d'état,
jamais par une couleur opaque codée en dur.

## Saisie du départ et de la destination

Un conteneur unique, jamais deux blocs séparés avec leurs propres libellés.
- Rail vertical à gauche: pastille creuse pour le départ, épingle accentuée
  pour la destination.
- Deux rangées de 38px séparées par un filet.
- Effacement par une croix discrète à l'intérieur de la rangée, visible
  seulement quand la rangée est remplie. Jamais un bouton texte "Effacer".
- Inversion par un bouton d'icône unique sur le bord droit, à cheval sur les
  deux rangées.
- Le choix sur la carte est une icône, pas un bouton texte.
- Les adresses longues sont tronquées par ellipse, jamais renvoyées à la ligne.
- Hauteur totale du bloc: 78px maximum.

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
- Un conteneur flottant permanent au-dessus de la carte, autre que le panneau
- Une information qui n'existe qu'au survol
- Un nom de station tronqué sur une seule ligne dans le fil d'itinéraire


