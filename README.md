# DQP

**Plateforme d’analyse de projets BTP : métré, DQE, estimation, documents techniques.**
Logiciel de bureau pour Windows 10/11.

> IMPORTER → COMPRENDRE → VÉRIFIER → MESURER → QUANTIFIER → CHIFFRER → DOCUMENTER → EXPORTER

DQP reçoit un projet déjà conçu, l’analyse, en extrait les informations utiles, prépare le DQE et
l’estimation. Ce n’est ni un logiciel de conception, ni un générateur de plans.

Cahier des charges complet : [`docs/CAHIER_DES_CHARGES.md`](docs/CAHIER_DES_CHARGES.md).

---

## État : Phase 1 (DQP Core) terminée · Phases 2 (analyse de fichiers) et 3 (métré) en cours

Architecture complète du cahier des charges, toutes phases : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Design system et architecture de l’interface : [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

### Phase 3 — Métré sur plans (v0.4)

| Fonction | État |
|---|---|
| Lecture des tracés vectoriels du PDF (segments, épaisseurs, transformations) | ✅ |
| Échelle par planche : étalonnage sur une cote connue (🟢), échelle lue sur la planche (🟠), contradiction signalée | ✅ |
| Outils sur le Plan 2D : longueur, surface, mur (longueur × hauteur − ouvertures), comptage ; aimantation, Maj, annuler | ✅ |
| Ouvertures déduites saisies ou reprises des repères de menuiserie dont les dimensions sont écrites | ✅ |
| Proposition automatique de murs (traits épais), toujours à vérifier | ✅ |
| Mesure → quantité d’une ligne du DQE (lien vivant, tracé, unités compatibles) ; liste des mesures dans le Métré | ✅ |
| Import multiple : file avec format, taille, état, progression, résultat, erreurs, doublons ; tout importer | ✅ |
| Catalogue d’ouvrages et DQE généré depuis le métré | à faire |
| Calibrage sur des plans d’architecte réels | **en attente de plans PDF réels** |

### Interface professionnelle (v0.3)

Thème sombre « technique premium », design system à base de jetons (React, TypeScript, Vite, Tailwind CSS v4).
Barre latérale repliable avec info-bulles, barre supérieure (projet actif, recherche globale **Ctrl+K**, connexion,
notifications tirées des vraies alertes, aide F1, profil local), espace de travail du projet (indicateurs réels,
8 étapes avec leur état, confiance globale cliquable, onglets), vue d’ensemble en panneaux redimensionnables avec
plan 2D (zoom, déplacement, plein écran, calques, sélection → propriétés, source, quantité, confiance),
tableau de bord avec graphiques interactifs (coûts par lot, confiance, évolution du montant tirée du journal,
quantités principales), pages Détection et Quantitatif, Métré avec formule dépliable, DQE avec colonnes Code /
Source / Confiance et vue à plat triable, bibliothèque de prix avec historique et import/export Excel,
progression d’analyse réelle étape par étape (Excel analysé dans un Web Worker). Les modules sans moteur
(3D, plans techniques, engineering, converter, IA) affichent « En attente du moteur » : aucun résultat simulé.

### Phase 2 — Analyse des plans PDF (v0.2)

| Fonction | État |
|---|---|
| Lecture des PDF vectoriels hors ligne (pdf.js) avec contrôle du format réel | ✅ |
| Type de planche (plan, coupe, façade, masse, toiture, fondations, électricité, plomberie, structure), niveau, échelle | ✅ |
| Cartouche : intitulé, maître d’ouvrage, architecte, lieu, date | ✅ |
| Pièces et surfaces (🟢 sur la même ligne, 🟠 rattachées par proximité, 🔴 non écrites) ; surfaces totales ; contrôle somme des pièces / surface habitable | ✅ |
| Repères de menuiseries (P1, F2, PF1…) avec dimensions écrites ; équipements annotés ; cotes comptées | ✅ |
| Aperçu du plan avec les éléments encadrés selon leur état ; valider / corriger / rejeter chaque élément (tracé) | ✅ |
| Import multiple et croisement des fichiers (§27) : différences plan / DQE, arbitrage, application au DQE | ✅ |
| Pages scannées signalées 🔴 (rien n’en est déduit) | ✅ |
| OCR des PDF scannés | à faire |
| Calibrage sur des plans d’architecte réels (§15) | **en attente de plans PDF réels** |

### Phase 1 — DQP Core

| Fonction | État |
|---|---|
| Interface de bureau (menus Fichier / Projet / Importer / Analyse / Métré / DQE / Documents / Converter / AI / Paramètres, barre latérale, parcours 01 → 09, barre d’état) | ✅ |
| Projets : un dossier par projet (`Fichiers_sources`, `Analyse`, `Metre`, `Quantites`, `DQE`, `Estimation`, `Plans`, `Documents`, `Exports`) | ✅ |
| Import Excel (.xlsx) et CSV avec vérification du format réel du fichier | ✅ |
| Analyse du DQE importé : lots, zones, niveaux, sous-parties, lignes, formules, informations de projet, type de projet | ✅ |
| Système de confiance 🟢 confirmé / 🟠 à vérifier / 🔴 non déterminé sur chaque quantité et chaque prix | ✅ |
| Contrôle croisé fichier / DQP : totaux qui oublient des lignes, formules `#REF!`, montants en lettres faux, intitulés contradictoires | ✅ |
| Éléments reconnus dans les désignations (portes, WC, prises, luminaires, béton…) | ✅ |
| Éditeur de DQE : modification de la désignation, de l’unité, de la quantité, du prix, du coefficient, de la perte et de l’observation, avec traçabilité de chaque modification manuelle | ✅ |
| Lots : créer, supprimer, renommer, déplacer, fusionner, subdiviser | ✅ |
| Quantités liées (ex. enduits = murs × 2,2) recalculées automatiquement | ✅ |
| Estimation : HT, TVA (paramétrable), TTC, montant en lettres, répartition par lot et par zone | ✅ |
| Bibliothèque de prix (code, désignation, unité, prix, fournisseur, catégorie, localisation, date), import/export CSV, application au DQE | ✅ |
| Export DQE Excel (formules vivantes, récapitulatif, traçabilité, contrôles) et DQE PDF | ✅ |
| Rapport d’analyse PDF | ✅ |
| Sauvegarde automatique, copie de secours, versions, journal des modifications, annuler / rétablir | ✅ |
| Installateur `DQP-Setup-x.y.z.exe` | ✅ (non signé) |

Les modules des phases suivantes (Plans techniques, Engineering, Converter, DQP AI) sont visibles dans
l’application avec leur phase prévue. Ils ne simulent aucune fonction.

### Principes appliqués dans le code

- **Règle absolue (§36)** : une valeur absente reste `null` (🔴 non déterminé). DQP n’invente jamais un
  chiffre.
- **Traçabilité (§37)** : chaque quantité et chaque prix garde sa source (fichier, feuille, cellule,
  formule) et l’historique de ses modifications manuelles.
- **IA ≠ moteur de calcul (§28)** : tous les montants sont calculés par le moteur déterministe
  `src/core/dqe.ts`.
- **Ne rien promettre (§44)** : chaque format affiche son état réel (analysé, prévu en phase N, non lu).

---

## Installer DQP (utilisateur)

1. Télécharger `DQP-Setup-0.4.0.exe` dans la page *Releases* du dépôt (installateur construit par GitHub Actions).
2. Lancer l’installateur. L’installateur n’est pas encore signé : Windows SmartScreen peut afficher
   « éditeur inconnu ». Dans ce cas, cliquer sur *Informations complémentaires*, puis sur *Exécuter quand même*.
3. Les projets sont enregistrés par défaut dans `Documents\DQP Projets` (modifiable dans Paramètres).

## Développer

Prérequis : Node.js 22.

```bash
npm install
npm run dev          # interface dans le navigateur (mode démonstration, stockage navigateur)
npm start            # application de bureau Electron
npm test             # tests du moteur (import, calcul, contrôles, exports)
npm run typecheck
npm run dist:win     # installateur Windows (sur Windows, ou Linux avec wine)
```

Contrôles de bout en bout (Chromium installé) :

```bash
npm run build
node scripts/smoke-ui.mjs <DQE.xlsx> <dossier_captures>            # parcours complet de l'interface
xvfb-run node scripts/smoke-electron.mjs <DQE.xlsx> <dossier_travail>  # application de bureau, disque, exports
DQE_FILE=<DQE.xlsx> npx vitest run tests/real-file.test.ts           # un vrai fichier client
```

Ne jamais versionner les fichiers des clients (le dossier `samples/private/` est ignoré par git).
Les tests utilisent un classeur synthétique (`tests/fixture.ts`) qui reproduit la structure et les
anomalies du DQE de référence.

## Architecture

```
src/core/            moteur, sans interface, testé
  types.ts           modèle de données (§35)
  import/            détection du format, lecture Excel/CSV, analyse du DQE, type de projet
  pdf/               lecture des PDF : textes, pièces, cartouche, tracés vectoriels
  metre/             métré sur plans : échelle, longueur, surface, mur, comptage
  formula.ts         évaluateur de formules de tableur
  dqe.ts             calcul : quantité retenue, montants, totaux, TVA
  checks.ts          détection des incohérences (§18)
  classify.ts        éléments reconnus dans les désignations (§4)
  project.ts         modifications du projet (lignes, lots, sections), journal
  prices.ts          bibliothèque de prix
  export/            Excel, documents PDF (HTML imprimé par Electron)
src/app/             interface React
electron/            processus principal : fenêtre, menus, stockage disque, PDF
```

Détails : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Étude du fichier de référence :
[`docs/ANALYSE_FICHIER_REFERENCE.md`](docs/ANALYSE_FICHIER_REFERENCE.md).

## Feuille de route

| Phase | Contenu |
|---|---|
| 1 — DQP Core | ✅ cette version |
| 2 — Analyse de fichiers | 🚧 PDF : textes, pièces, surfaces, niveaux, cartouche, validation, croisement ✅ ; OCR et calibrage sur plans réels à faire |
| 3 — Métré intelligent | 🚧 mesures à l’échelle sur les plans PDF, murs, ouvertures, lien au DQE ✅ ; volumes et catalogue d’ouvrages à faire |
| 4 — Formats BIM/CAO | IFC, DXF ; DWG, Revit, Archicad après étude technique et juridique |
| 5 — Plans techniques | propositions à valider : électricité, plomberie, fondation, masse |
| 6 — Engineering | dimensionnement assisté avec hypothèses, formules, référentiel, avertissements |
| 7 — Converter | conversions fiables uniquement, classées directe / partielle / impossible |
| 8 — DQP AI | assistant d’analyse ; les calculs restent déterministes |
