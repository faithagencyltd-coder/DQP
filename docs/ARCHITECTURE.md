# DQP — Architecture complète

Ce document décrit l’architecture cible de DQP pour l’ensemble du cahier des charges
([`CAHIER_DES_CHARGES.md`](CAHIER_DES_CHARGES.md), §1 à §44) et indique pour chaque brique ce qui existe
déjà (✅), ce qui est en cours (🚧) et ce qui est prévu (phase N).

---

## 1. Principes directeurs

Ces règles s’imposent à toutes les briques, quelle que soit la phase.

| # | Principe | Origine | Conséquence technique |
|---|---|---|---|
| P1 | **Ne jamais inventer** | §36 | Toute valeur est un `TrackedNumber` ou un `DetectedValue`. Une valeur absente vaut `null` (🔴), jamais 0. |
| P2 | **Confiance explicite** | §7 | Chaque information porte un état : 🟢 confirmé (lu dans le fichier ou validé par l’utilisateur), 🟠 à vérifier (interprété ou déduit), 🔴 non déterminé. |
| P3 | **Traçabilité** | §10, §37 | Chaque valeur garde sa source (fichier, page ou feuille, cellule ou zone, texte, formule) et ses étapes de calcul. |
| P4 | **Calcul déterministe** | §28 | Les montants, quantités et dimensionnements viennent de fonctions pures et testées. L’IA ne calcule rien. |
| P5 | **L’humain décide** | §16, §21, §27 | Corrections, validations et arbitrages entre sources sont enregistrés (qui, quand, avant, après) et rejouables. |
| P6 | **Honnêteté sur les formats** | §24, §44 | Chaque format affiche son état réel. DQP ne produit jamais un faux fichier par simple renommage. |
| P7 | **Local d’abord** | §29 | Tout le cœur fonctionne hors ligne. Internet sert seulement à l’IA, aux mises à jour, à la synchronisation et aux services distants, et il est signalé. |
| P8 | **Un moteur central, des capacités branchées** | §44 | Chaque nouveau format ou module est un adaptateur qui produit le même modèle canonique. |

---

## 2. Vue d’ensemble

```
                         ┌─────────────────────────── SOURCES (§3, §26) ───────────────────────────┐
                         │ Excel/CSV ✅   PDF 🚧(P2)   DXF (P4)   IFC (P4)   DWG/Revit/Archicad (P4*) │
                         └───────────────────────────────────┬─────────────────────────────────────┘
                                                             │ octets + nom
┌────────────────────────────────────────────────────────────▼──────────────────────────────────────────┐
│ 1. IMPORT — registre d’adaptateurs : détection du format réel (signature), état de prise en charge   │
├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. EXTRACTION — par format : grille (Excel), texte positionné + vecteurs (PDF), entités (DXF/IFC)    │
├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. DÉTECTION — règles déterministes (+ suggestions IA en P8, toujours 🟠) → MODÈLE CANONIQUE :        │
│    BuildingElement (pièce, niveau, mur, ouverture, équipement, élément de structure…), Lot/Ligne DQE  │
├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. VÉRIFICATION — validation humaine (§16) · croisement des sources (§27) · incohérences (§18)       │
├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. MÉTRÉ — Measurement : formule visible + entrées sourcées (§9, §10)                               │
├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 6. QUANTIFICATION → OUVRAGES → LOTS → DQE (§11, §12) — règles de passage métré → ouvrage             │
├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 7. ESTIMATION — bibliothèque de prix (§13, §14) ✅                                                    │
├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 8. DOCUMENTS — DQE Excel/PDF ✅, rapport ✅, plans techniques (P5), notes de calcul (P6)              │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
   Modules transverses : Engineering (P6) · Converter (P7) · DQP AI (P8) · Sauvegarde/versions ✅ · Mises à jour/sync (P8)
```

`*` DWG, Revit et Archicad dépendent de l’étude juridique du §6 : on y passera par des licences ou par
l’export IFC.

---

## 3. Découpage logiciel

```
dqp/
├── electron/                processus principal (Node) : fenêtre, menus, disque, PDF, services
│   ├── main.ts              ✅ fenêtre, menus natifs §31, IPC
│   ├── storage.ts           ✅ dossier projet §33, écriture atomique, .bak, versions
│   ├── updater.ts           (P8) mises à jour signées
│   └── workers/             (P4, P7) moteurs lourds en processus séparés (IFC, conversion)
├── src/core/                moteur pur TypeScript, sans interface, entièrement testé
│   ├── types.ts             ✅ modèle de données §35
│   ├── migrate.ts           🚧 migrations de schéma de projet
│   ├── import/              ✅ registre des formats, Excel/CSV, analyse DQE, type de projet
│   ├── pdf/                 🚧 P2 : extraction PDF (texte positionné, vecteurs), détection
│   ├── elements/            🚧 P2 : éléments du bâtiment, validation, croisement des sources
│   ├── metre/               (P3) règles de métré : murs, ouvertures, surfaces, volumes
│   ├── works/               (P3) catalogue d’ouvrages, règles métré → ouvrage → lot
│   ├── dqe.ts               ✅ calcul : quantité retenue, montants, totaux, TVA
│   ├── checks.ts            ✅ incohérences §18
│   ├── classify.ts          ✅ éléments reconnus dans les désignations du DQE
│   ├── prices.ts            ✅ bibliothèque de prix
│   ├── export/              ✅ Excel, DQE PDF, rapport ; (P5) DXF/SVG des plans techniques
│   ├── plans/               (P5) propositions de plans techniques
│   ├── engineering/         (P6) modules de dimensionnement
│   └── convert/             (P7) matrice et pilotes de conversion
├── src/app/                 interface React (coquille de bureau, modules, visionneuses)
└── services/ (P8)           passerelle IA, serveur de mises à jour, sauvegarde en ligne (hors application)
```

Règles de dépendance : `core` ne dépend ni de `app` ni d’`electron`. `app` parle au disque uniquement
via le contrat `src/shared/api.ts`.

---

## 4. Modèle de données (§35)

| Entité du cahier | Type | Contenu principal | État |
|---|---|---|---|
| Project | `Project` | infos, paramètres, fichiers, lots, éléments, analyses, résolutions, journal | ✅ (schéma 2 🚧) |
| SourceFile | `SourceFile` | nom, format, taille, copie dans `Fichiers_sources` | ✅ |
| AnalysisResult | `AnalysisResult` | informations détectées, alertes du fichier, statistiques, total annoncé | ✅ |
| BuildingElement | `BuildingElement` | type, nom, niveau, propriétés (`DetectedValue` : surface, dimensions…), source (page + zone) | 🚧 P2 |
| Validation | `ElementValidation` + `DqeLine.edits` | accepté / corrigé / rejeté, avant → après, date | ✅ lignes · 🚧 éléments |
| (croisement) | `Resolution` | choix de l’utilisateur entre plusieurs sources (§27) | 🚧 P2 |
| Measurement | `Measurement` | élément, règle de métré, entrées sourcées, étapes, résultat | P3 |
| Quantity | `TrackedNumber` (quantité d’une ligne) | valeur, état, origine, source, expression liée | ✅ |
| WorkItem | `DqeLine` + catalogue `WorkTemplate` (P3) | ouvrage, unité, prix, coefficient, perte | ✅ / P3 |
| Lot | `Lot` → `DqeSection` | lots, sous-lots (zones, niveaux, sous-parties) | ✅ |
| Price | `PriceItem` | code, désignation, unité, prix, fournisseur, catégorie, localisation, date | ✅ |
| DQE | arbre `Lot` / `DqeSection` / `DqeLine` + résultat de `computeProject` | | ✅ |
| Conversion | `ConversionRecord` | source, cible, moteur, classement direct / partiel / impossible, pertes | P7 |
| Document | fichiers `Exports`/`Documents` + journal ; `DocumentRecord` en P5 | | ✅ |
| ProjectVersion | `.dqp/versions/*.json` | instantané nommé | ✅ |

**Valeur détectée** (pour les éléments) :

```ts
DetectedValue = { value: number | string | null, unit?, status, source?: { fileName, page, bbox, text }, note? }
```

**Stockage.**
- Aujourd’hui : `project.json` dans le dossier du projet, avec un numéro de schéma. Les migrations
  sont faites dans `core/migrate.ts`.
- Phase 3 : passage à SQLite (`project.dqp`) quand la géométrie (milliers de segments et de mesures)
  rendra le JSON trop lourd. Le passage sera fait par une migration automatique, sans changer le
  modèle métier.

---

## 5. Les moteurs, un par un

### 5.1 Import (§3, §26) ✅
Registre `FORMATS` : extensions, signature binaire, état (`supported` / `planned` / `unsupported`),
explication. Plusieurs fichiers par projet ; un fichier non encore analysable peut être joint au projet.
Phase 2 : ajout de l’adaptateur PDF au registre.

### 5.2 Analyse Excel/CSV ✅
Repérage des en-têtes. Structure en zones, niveaux et sous-parties. Formules conservées. Contrôle des
totaux du fichier jusqu’aux lignes qu’ils comptent. Voir
[`ANALYSE_FICHIER_REFERENCE.md`](ANALYSE_FICHIER_REFERENCE.md).

### 5.3 Analyse PDF (§6) — phase 2 🚧
| Étape | Technique | État |
|---|---|---|
| Lecture | pdf.js (Apache 2.0), hors ligne | 🚧 |
| Texte positionné | items de texte avec coordonnées, regroupés en lignes | 🚧 |
| Nature de la page | vectorielle (texte et tracés) ou scannée (image seule) | 🚧 |
| Détection | niveaux, échelle, cartouche, pièces avec surfaces, surfaces totales, équipements annotés, repères de menuiserie, cotations | 🚧 |
| Aperçu du plan | rendu de la page et encadrement des éléments détectés | 🚧 |
| PDF scannés | OCR (Tesseract, Apache 2.0), modèles de langue embarqués | P2 suite |
| Géométrie | segments et polylignes de la page, avec échelle → murs (P3) | P3 |

Règle d’état :
- 🟢 Texte lu tel quel : nom de pièce et surface écrite (« 12,50 m² »), échelle, titre.
- 🟠 Interprétation : rattachement d’une surface à une pièce par proximité, comptage d’équipements
  d’après des étiquettes, type de pièce déduit.
- 🔴 Information absente : surface non écrite, PDF scanné non lu.

### 5.4 Éléments, validation et croisement (§8, §16, §27) — phase 2 🚧
- `BuildingElement` est commun à tous les formats. Un DXF ou un IFC produira les mêmes éléments
  qu’un PDF, avec des confiances plus élevées.
- Validation : accepter, corriger (avant → après) ou rejeter. Chaque action passe par le journal.
- Croisement : pour chaque grandeur comparable (nombre d’équipements, de pièces, intitulé, localisation),
  DQP rassemble les valeurs de chaque source. Si elles diffèrent, il signale par exemple
  « ⚠️ Différence : PDF 4 / DQE 3 ». L’utilisateur choisit (`Resolution`). Quand le choix porte sur une
  seule ligne de DQE, DQP propose de l’appliquer, et la modification est tracée.

### 5.5 Métré (§9, §10) — phase 3 🚧
Chaque règle de métré est une fonction pure qui prend des entrées sourcées et produit des étapes
lisibles :

```
murs : surface brute = Σ(longueur × hauteur) ; ouvertures = Σ(l × h) ; surface nette = brute − ouvertures
carrelage sol = Σ surfaces des pièces (hors pièces exclues) ; faïence = périmètre humide × hauteur
peinture = murs intérieurs nets + plafonds ; béton = section × longueur (poteaux, poutres, chaînages)
```

Les entrées viennent des éléments validés (P2/P4). Une entrée manquante rend la mesure 🔴 : la règle
ne l’estime jamais.

**Réalisé en 0.4 (`src/core/pdf/vectors.ts`, `src/core/metre/measure.ts`) :**
- Tracés vectoriels de chaque page PDF : segments avec leur épaisseur, en suivant les matrices de
  transformation (`cm`, `save` / `restore`). Ils servent à l’aimantation et à la proposition de murs.
- Échelle d’une planche :
  - 🟢 si elle est étalonnée sur une cote connue (deux points et une longueur réelle) ;
  - 🟠 si elle est lue sur la planche (« 1/100 » : le PDF a pu être redimensionné), ou si
    l’étalonnage contredit de plus de 10 % l’échelle écrite (`scaleConflict`) ;
  - 🔴 sinon, et toute mesure de la page reste non déterminée.
- Mesures (`Measurement`) :
  - longueur (ml), surface (m², formule du lacet) ;
  - mur = longueur × hauteur − Σ(l × h × n) des ouvertures (m²), avec une hauteur saisie et jamais
    devinée ;
  - comptage (u).
- Chaque mesure écrit ses étapes de calcul.
- Ouvertures déduites : saisies, ou reprises d’un repère de menuiserie dont les dimensions sont écrites
  sur le plan.
- Proposition automatique de murs :
  - elle retient les traits nettement plus épais que les traits fins de la page (seuil
    = max(2 × premier quartile, 60 % du trait le plus épais)) et fusionne les traits colinéaires ;
  - elle est toujours 🟠 tant qu’elle n’est pas validée, avec l’avertissement qu’un mur dessiné en
    double trait peut être compté deux fois.

### 5.6 Du métré au DQE (§11, §12) — phase 3 🚧
- ✅ Une mesure peut devenir la quantité d’une ligne de DQE (`{M:id}`, unités compatibles seulement).
  Le lien est vivant : la ligne suit la mesure, son étalonnage et ses déductions. Si la mesure est
  supprimée, la ligne garde sa dernière valeur, marquée 🟠.
- À faire : un catalogue d’ouvrages (`WorkTemplate` : code, désignation, unité, lot, règle de métré
  associée, prix par défaut tiré de la bibliothèque) pour générer des lignes de DQE liées à leurs
  mesures.
- Les lignes créées à la main ou importées restent possibles.

### 5.7 Estimation, prix, contrôles ✅
Voir la section 7. Prévus en plus : un historique des prix par article et par date, des bibliothèques
par localisation, et des indices de révision.

### 5.8 Documents (§19, §38, §39) ✅
Modèles HTML imprimés en PDF A4 et classeurs Excel avec formules vivantes. Phase 5 : cartouche de
l’entreprise et logos.

### 5.9 Plans techniques (§20, §21) — phase 5
- Entrées : pièces, ouvertures et équipements validés, avec la géométrie (P3/P4).
- Sorties : propositions en calques SVG/DXF superposés au plan :
  - implantation électrique : points d’éclairage, prises et interrupteurs par pièce, selon des
    règles paramétrables ;
  - schéma de plomberie : appareils, arrivées, évacuations ;
  - données pour le plan de fondation : descentes de charges à vérifier ;
  - plan de masse.
- États : proposition → modifiée → validée → exportée.
- Mention obligatoire : document d’assistance, conformité non garantie.

### 5.10 DQP Engineering (§22) — phase 6
Chaque module de calcul (poteau, poutre, dalle, escalier, semelle) est une fonction pure avec :
- en entrée : données, référentiel choisi (BAEL 91 mod. 99, Eurocode 2…), hypothèses ;
- en sortie : étapes, formules, résultats, vérifications et avertissements.

La note de calcul PDF reprend tout cela. Les tests reproduisent des exemples publiés. Un professionnel
qualifié doit vérifier les résultats ; c’est rappelé sur chaque écran et dans chaque document.

### 5.11 DQP Converter (§23–25) — phase 7
Matrice `de → vers` : moteur utilisé, classement (direct, partiel ou impossible), pertes connues. Les
moteurs tournent en processus séparé, et chaque conversion produit un `ConversionRecord` avec son
rapport. Voir la section 6 pour la faisabilité.

### 5.12 DQP AI (§25, §28) — phase 8
```
Application ──(données minimisées, consentement)──▶ Passerelle DQP ──▶ API Claude
          ◀── suggestions JSON validées par schéma ──
```
- L’IA propose des classifications, des explications, des repérages d’incohérences et des
  rapprochements de désignations avec la bibliothèque.
- Toute suggestion est marquée 🟠 et doit être validée. Aucun calcul n’est confié à l’IA.
- La clé d’API reste sur la passerelle, jamais dans l’application.
- Hors ligne, les fonctions IA sont simplement indisponibles, et c’est indiqué.

---

## 6. Faisabilité par format (§44)

| Format | Lecture | Écriture | Technique | Licence / risque | Décision |
|---|---|---|---|---|---|
| XLSX / CSV | ✅ | ✅ | ExcelJS | MIT | Fait |
| PDF vectoriel | ✅ texte, P3 vecteurs | via Chromium | pdf.js | Apache 2.0 | Phase 2 |
| PDF scanné | OCR | — | Tesseract | Apache 2.0 | Phase 2 suite |
| DXF | oui | oui | format ouvert documenté, lecteur maison ou bibliothèque MIT | aucun | Phase 4 |
| IFC (2x3, 4) | oui | partielle | web-ifc (MPL 2.0) ou IfcOpenShell (LGPL, processus séparé) | compatibles | Phase 4. C’est aussi la voie pour Revit et Archicad, par leur export IFC natif. |
| DWG | sous licence | sous licence | ODA Drawings SDK (commercial) ; LibreDWG est sous GPL, donc incompatible avec une distribution fermée | coût de licence ODA | Décision commerciale avant P4 |
| Revit (RVT) | non (format fermé) | — | Revit API (Revit installé) ou Autodesk Platform Services (en ligne, payant) | conditions Autodesk | Export IFC depuis Revit |
| Archicad (PLN) | non (format fermé) | — | API Archicad (Archicad installé) | conditions Graphisoft | Export IFC depuis Archicad |
| SKP | SDK | SDK | SketchUp SDK | conditions Trimble | À étudier en P7 |

---

## 7. Interface (§30, §31, §32)

- **Coquille de bureau** ✅ : menus natifs (Fichier, Projet, Importer, Analyse, Métré, DQE, Documents,
  Converter, AI, Paramètres), barre d’outils, parcours 01 → 09, barre latérale des modules, barre
  d’état (sauvegarde, confiance, connexion).
- **Zone centrale**, avec plusieurs visionneuses :
  - tableau (DQE ✅, prix ✅) ;
  - rapport ✅ ;
  - aperçu du plan PDF ✅, avec outils de métré (étalonner, longueur, surface, mur, comptage) ✅ ;
  - plan 2D vectoriel IFC/DXF (P4) ;
  - maquette IFC (P4).
- Chaque élément affiché peut être ouvert pour voir sa source, son calcul et son historique.

## 8. Connexion, mises à jour, sécurité (§29, §34, §40)

| Sujet | Solution | État |
|---|---|---|
| Installation | NSIS `DQP-Setup.exe`, par utilisateur, dossier modifiable | ✅ |
| Signature du code | certificat de signature de code (supprime l’alerte SmartScreen) | à acheter |
| Mises à jour | electron-updater avec publication signée | P8 |
| Sauvegarde | automatique, atomique, .bak, versions, journal, annuler / rétablir | ✅ |
| Protection | fenêtre isolée (contextIsolation, sandbox), écriture limitée au dossier projet, liens externes ouverts hors de l’application | ✅ |
| Sauvegarde en ligne | dossier projet synchronisé, chiffré | P8 |
| Indicateur réseau | « En ligne / Hors ligne », fonctions dépendantes signalées | ✅ |

## 9. Qualité

- Tests du moteur sur des fichiers synthétiques reproduisant les cas réels (`tests/`).
- Tests sur de vrais fichiers clients en local, jamais versionnés (`samples/private/`).
- Parcours de bout en bout : interface (`scripts/smoke-ui.mjs`) et application de bureau
  (`scripts/smoke-electron.mjs`).
- Intégration continue : vérifications, puis installateur construit sur Windows (`.github/workflows/build.yml`).
- **Règle §15 :** chaque nouveau format est calibré sur des fichiers réels fournis par l’utilisateur
  avant d’être déclaré « pris en charge ».

## 10. Plan de réalisation

| Phase | Livrables | Critère d’acceptation | Données réelles nécessaires |
|---|---|---|---|
| 1 Core ✅ | projets, import Excel/CSV, DQE, estimation, prix, exports, sauvegarde, installateur | DQE SENOU importé et contrôlé ; exports ouverts dans Excel et un lecteur PDF | DQE SENOU ✅ |
| 2 Analyse de fichiers 🚧 | PDF : texte, pièces, surfaces, niveaux, cartouche, équipements ; aperçu ; validation ; croisement PDF/DQE ; puis OCR | pièces et surfaces d’un plan réel retrouvées avec leur source ; différences PDF/DQE signalées | **plans PDF d’architecte réels** (idéalement ceux de SENOU) |
| 3 Métré intelligent 🚧 | géométrie PDF à l’échelle, murs, ouvertures, surfaces, volumes, catalogue d’ouvrages, DQE généré | métré d’un plan réel comparé au DQE manuel, écarts expliqués | plans + DQE du même projet |
| 4 BIM/CAO | DXF, IFC, aperçu 2D/3D ; DWG si la licence est acquise | éléments IFC = éléments Revit/Archicad exportés | exports IFC/DXF réels |
| 5 Plans techniques | propositions électricité, plomberie, fondation, masse ; export DXF/PDF | proposition éditable et validée par un professionnel | — |
| 6 Engineering | modules béton armé avec notes de calcul | résultats conformes aux exemples de référence | référentiel choisi |
| 7 Converter | conversions fiables avec rapport de pertes | aucune conversion « fausse » | fichiers des formats cibles |
| 8 DQP AI | passerelle, assistant, mises à jour, synchronisation | suggestions toujours 🟠 et traçables | — |
