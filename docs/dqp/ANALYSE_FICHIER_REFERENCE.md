# Étude du fichier de référence (§15)

Fichier étudié : DQE en Excel d’une villa (fichier client fourni pour l’étude, **non versionné**).
Objectif : partir des données réellement présentes, puis décider comment DQP les exploite.

## 1. Ce que contient le fichier

- **Format** : Excel `.xlsx` (Office Open XML), 2 feuilles. `Feuil1` contient tout le DQE (lignes 3 à 885,
  165 cellules fusionnées). `Feuil2` est vide.
- **Page de garde** (cellules isolées) : pays, phase (« PHASE 2 : EXECUTION »), titre du document,
  date (« FEVRIER 2026 »), puis une page de titre par lot.
- **7 lots**, chacun sous la même forme :
  1. ligne de titre du lot + « DEVIS QUANTITATIF ET ESTIMATIF » ;
  2. ligne d’en-tête `N° | DESIGNATION | UNITE | QUANTITE | PRIX UNITAIRE | MONTANT PARTIEL` (colonnes A à F) ;
  3. titres de parties sur 3 niveaux :
     - zone : « BATIMENT PRINCIPAL », « AMENAGEMENTS EXTERIEURS » ;
     - niveau : « II - REZ-DE-CHAUSSEE » ;
     - sous-partie : « A - TUYAUTERIE », « F - ELEVATION ».

     Ces titres sont écrits indifféremment en colonne A ou B ;
  4. lignes d’ouvrage : N°, désignation, unité, quantité, PU, et le montant en formule `=D×E` ;
  5. lignes « TOTAL … » (formules `SUM` ou additions de totaux) ;
  6. phrase « ARRÊTÉ … À LA SOMME DE : » suivie du montant en lettres et en chiffres ;
  7. récapitulatif du lot.
- **Récapitulatif général** : un total par lot (formules qui pointent vers les récapitulatifs), puis le
  « TOTAL CONSTRUCTION ».
- **120 lignes d’ouvrage**. Unités : `ff`, `m2`/`m²`, `m3`, `ml`, `u`, `ens`.
- **Formules** :
  - les montants (`=D103*E103`) ;
  - les totaux ;
  - une quantité liée à une autre ligne : enduits `=(D130*2.2)`, soit la surface de murs × 2,2.
- **Absent du fichier** : les dimensions (longueur, hauteur, épaisseur), les pièces et les plans. Les
  quantités sont donc des résultats de métré déjà faits, pas des données géométriques.

## 2. Anomalies réelles trouvées (et détectées automatiquement par DQP)

| Constat | Où | Gravité |
|---|---|---|
| Le total du lot Gros œuvre (`E201 = E199+E193`) n’inclut pas l’installation de chantier (375 208 FCFA). Le total général est donc sous-évalué du même montant. | E201, E884 | Erreur |
| 5 totaux « TOTAL BATIMENT PRINCIPAL » cassés : `=#REF!+F382+#REF!` | F384, F520, F618, F741, F831 | Erreur |
| Montant en chiffres tronqué dans l’arrêté : « (14 413 66) » pour 14 413 664 | A204 | À vérifier |
| Quantité calculée à partir du prix de sa propre ligne : `=---E366` | D366 | À vérifier |
| Deux intitulés de projet différents : « VILLA BAS » et « RÉSIDENCE R+1 AVEC SOUS-SOL À ZOPAH » | A186, A637 | À vérifier |
| 20 lignes sans quantité ou sans prix (béton d’escalier, poutres, plancher, menuiseries extérieures…) | — | Non déterminé |
| Prix unitaires à 0 (barraque) et quantité à 0 (WC visiteur) | E103, D375 | À vérifier |
| Numérotation non unique (le N° 7 est utilisé 18 fois en plomberie) | colonne A | Information |
| Unités écrites de deux façons (`m2` et `m²`) | colonne C | Information |

Total des lignes recalculé par DQP : **39 446 065 FCFA**. Total affiché par le fichier :
**39 070 857 FCFA**. L’écart (375 208 FCFA) correspond exactement à l’installation de chantier non comptée.

## 3. Comment DQP exploite ces données

- **Repérage par en-têtes, pas par positions** : DQP cherche les lignes d’en-tête (Désignation + au
  moins deux colonnes parmi Unité, Quantité, PU, Montant). Un autre DQE dont les colonnes sont
  différentes est donc reconnu lui aussi.
- **Structure** : les titres sont classés en zone, niveau ou sous-partie. Ils deviennent des sections
  avec un chemin, par exemple « Bâtiment principal › Rez-de-chaussée › A - Tuyauterie ».
- **Valeurs** : chaque quantité et chaque prix garde sa cellule source et sa formule. Le niveau de confiance est attribué ainsi :
  - 🟢 valeur lue ;
  - 🟠 valeur nulle, négative ou issue d’une formule suspecte ;
  - 🔴 valeur absente ou issue d’une formule cassée.
- **Quantités liées** : une formule qui ne pointe que vers les quantités d’autres lignes devient un
  lien vivant. Si on modifie les murs, les enduits suivent.
- **Montants** : toujours recalculés par DQP (quantité × PU), puis comparés aux montants et aux totaux
  du fichier.
- **Totaux du fichier** : DQP suit leurs formules jusqu’aux lignes, pour savoir exactement quelles
  lignes chaque total compte. Il peut ainsi écrire « le total oublie la partie I - INSTALLATION »
  plutôt que « écart de 375 208 ».
- **Informations du projet** : le pays, la phase, la date, les intitulés et la localisation sont
  extraits avec leur cellule. Le type de projet est déduit des intitulés et reste « à vérifier ».

## 4. Ce que ce fichier ne permet pas (et que DQP n’affiche donc pas)

- Le métré géométrique : sans dimensions, pas de longueurs de murs ni de déduction d’ouvertures. Ce
  sera la phase 3, à partir des plans.
- Le nombre de pièces et de niveaux réels : seul « rez-de-chaussée » est mentionné, et l’intitulé
  « R+1 avec sous-sol » contredit « villa basse ». DQP signale la contradiction au lieu de trancher.
- Les diamètres de canalisations et les longueurs de câbles : ces postes sont chiffrés en « ens ».
