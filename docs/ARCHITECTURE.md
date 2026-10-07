# Architecture de DQP

## Choix techniques

| Besoin | Choix | Raison |
|---|---|---|
| Logiciel de bureau Windows installable | **Electron** + installateur **NSIS** (electron-builder) | Installation classique (`DQP-Setup.exe`), raccourcis, fonctionnement hors ligne |
| Interface | **React** + TypeScript, CSS sur mesure | Interface dense, de type logiciel professionnel |
| Lecture / écriture Excel | **ExcelJS** | Lit les valeurs, les formules et les valeurs calculées ; écrit des formules vivantes |
| PDF | HTML imprimé par Chromium (`printToPDF`) | Mise en page A4 fidèle, aucune dépendance supplémentaire |
| Stockage | Un dossier par projet, `project.json` | Lisible, sauvegardable, conforme au §33 ; pas de base à installer |
| Tests | Vitest (moteur), Playwright (interface et application de bureau) | — |

Une base SQLite pourra remplacer le fichier JSON si les volumes l’exigent. Le modèle de données
(`src/core/types.ts`) reprend déjà les entités du §35.

## Couches

```
┌──────────────────────────── electron/ (processus principal) ────────────────────────────┐
│ fenêtre, menus natifs, dialogues fichiers, stockage disque (écriture atomique, .bak,    │
│ versions), PDF, dossier projet ; écriture limitée aux sous-dossiers du projet           │
└──────────────── IPC via preload (contextIsolation, sandbox, aucun accès Node) ──────────┘
┌──────────────────────────── src/app/ (interface React) ─────────────────────────────────┐
│ store (projet, annuler/rétablir, sauvegarde auto), vues, exports                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────── src/core/ (moteur, pur TypeScript) ─────────────────────────┐
│ import → analyse → contrôles → calcul → exports ; aucune dépendance à l'interface      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

`src/app/browserApi.ts` implémente le même contrat (`src/shared/api.ts`) dans un navigateur. Cela
sert au développement et aux démonstrations.

## Modèle de données (§35)

| Cahier des charges | Implémentation |
|---|---|
| Project | `Project` (infos, paramètres, lots, fichiers, analyses, journal) |
| SourceFile | `SourceFile` (copie dans `Fichiers_sources`) |
| Lot / WorkItem / Quantity / Price / DQE | `Lot` → `DqeSection` → `DqeLine` (quantité et prix = `TrackedNumber`) |
| AnalysisResult | `AnalysisResult` (informations détectées, alertes du fichier, statistiques, total annoncé) |
| Validation | `DqeLine.edits` (avant / après / date) et statuts validés par l’utilisateur |
| Document | fichiers dans `Exports` / `Documents` + entrée de journal |
| ProjectVersion | `.dqp/versions/*.json` |
| Price | `PriceItem` (bibliothèque commune, `prices.json` du profil utilisateur) |
| BuildingElement / Measurement | phases 2 et 3 (`classify.ts` reconnaît déjà les éléments dans les désignations) |
| Conversion | phase 7 |

## `TrackedNumber` : confiance et traçabilité

```ts
{ value: number | null,          // null = non déterminé : jamais de valeur inventée
  status: 'confirmed' | 'to_verify' | 'undetermined',
  origin: 'import' | 'manual' | 'library' | 'calculated',
  source?: { fileName, sheet, cell, formula },
  expression?: '{L:idLigne}*2.2', // quantité liée à une autre ligne
  note?: 'Prix unitaire égal à 0 dans le fichier' }
```

## Calcul (déterministe)

```
quantité retenue = quantité × coefficient × (1 + perte % / 100)
montant          = quantité retenue × prix unitaire     (arrondi à l’unité si FCFA)
total lot        = Σ montants des lignes chiffrées
total HT         = Σ totaux des lots ;  TVA = HT × taux ;  TTC = HT + TVA
```

Une ligne sans quantité ou sans prix n’a pas de montant : elle est comptée comme « non chiffrée » et
signalée. Elle n’est jamais comptée à 0 sans avertissement.

## Sauvegarde (§40)

- Sauvegarde automatique 0,8 s après chaque modification.
- Écriture dans un fichier temporaire puis renommage : un fichier n’est jamais à moitié écrit.
- `project.json.bak` contient l’état précédent. Il est restauré automatiquement si `project.json` est illisible.
- Versions nommées dans `.dqp/versions`. Leur restauration peut elle-même être annulée.
- Journal de toutes les actions dans le projet.
