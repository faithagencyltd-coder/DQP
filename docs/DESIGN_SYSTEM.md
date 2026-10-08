# DQP Design System et architecture de l’interface

Direction : **sombre, premium, technique**. Le fond bleu nuit et les surfaces étagées structurent
l’écran. Le bleu électrique sert à la marque et à l’action, le cyan à l’interaction. Trois couleurs
sont réservées à la confiance : vert, orange, rouge. Pas d’effet « gaming », pas de verre dépoli
généralisé, pas d’animation qui ralentit le travail.

## 1. Jetons (`src/app/ds/tokens.css`)

Les jetons sont des variables CSS. Tailwind les expose via `@theme`, et les anciennes feuilles de
style les lisent directement : une seule source de vérité.

| Famille | Jetons | Usage |
|---|---|---|
| Fonds | `--bg` `--bg-2` `--surface` `--surface-2` `--surface-3` `--surface-hover` | du plus profond (fenêtre) au plus clair (survol) |
| Traits | `--line-2` `--line` `--line-strong` | séparations, bordures, bordure au survol |
| Texte | `--text` `--text-2` `--muted` `--faint` | titre, corps, secondaire, désactivé |
| Marque | `--brand` `--brand-2` `--brand-soft` `--cyan` | action principale, survol, sélection, interaction |
| Confiance | `--ok` / `--ok-bg`, `--warn` / `--warn-bg`, `--bad` / `--bad-bg` | 🟢 Confirmé, 🟠 À vérifier, 🔴 Non déterminé |
| Formes | `--radius-sm` 5, `--radius` 7, `--radius-lg` 11 | contrôles, boutons, cartes |
| Ombres | `--shadow-1` `--shadow-2` `--shadow-3` | carte, menu, fenêtre |
| Mouvement | `--t-fast` 120 ms, `--t` 180 ms, `--t-slow` 280 ms, `--ease` | toutes les transitions |
| Mise en page | `--sidebar` 232, `--sidebar-collapsed` 60, `--topbar` 52 | coquille |

**Typographie.**
- Police principale : Inter Variable, embarquée (fonctionne hors ligne), avec chiffres tabulaires
  pour les montants.
- Police à chasse fixe : JetBrains Mono, pour les cellules, les formules et les sources.
- Corps à 13 px ; titres de page à 19–21 px.

**Couches CSS.** L’ordre est `theme` → `base` (remise à zéro minimale) → `components` (styles des
écrans) → `utilities` (Tailwind). Une classe utilitaire l’emporte donc toujours.

**Animations.**
- Classes disponibles : `anim-fade`, `anim-rise`, `anim-pop`, `anim-slide-left`, `stagger`,
  `skeleton`, `spin`, `pulse`.
- Toutes durent moins de 300 ms.
- Elles sont coupées si `prefers-reduced-motion: reduce` est demandé par le système.

## 2. Composants (`src/app/ds/`)

| Composant | Fichier | Comportements |
|---|---|---|
| `Button`, `IconButton` | primitives.tsx | variantes primary, secondary, ghost, danger, success ; tailles xs, sm, md ; états hover, active (enfoncement d’1 px), focus, disabled, loading (spinner) ; info-bulle obligatoire sur `IconButton` |
| `Tooltip` | primitives.tsx | portail (jamais coupé), délai 350 ms, clavier (focus) |
| `Dropdown`, `MenuList`, `useContextMenu`, `Floating` | primitives.tsx | navigation ↑ ↓ Entrée Échap, clic extérieur, recadrage dans la fenêtre, raccourcis affichés |
| `Drawer` | primitives.tsx | panneau coulissant à droite, Échap |
| `Tabs` | primitives.tsx | indicateur animé qui glisse sous l’onglet actif |
| `ProgressBar`, `Spinner`, `Skeleton` | primitives.tsx | progression réelle ; squelettes pendant le chargement des écrans |
| `Ring`, `useCountUp` | primitives.tsx | anneau segmenté (confiance) ou dégradé (avancement), valeur animée |
| `Stepper` | primitives.tsx | états Terminé, En cours, À vérifier, À faire, Non disponible, avec une info-bulle de détail |
| `Card`, `EmptyState`, `Pending` | primitives.tsx | `Pending` = « En attente du moteur — phase N » : jamais de faux résultat |
| `Split` | layout.tsx | panneaux redimensionnables, tailles mémorisées, double-clic pour réinitialiser |
| `Donut`, `BarList`, `LineChart` | charts.tsx | SVG maison, survol synchronisé avec la légende, curseur et valeur |
| `Modal`, `PromptDialog`, `ConfirmDialog`, `StatusBadge`, `StatusDot` | legacy.tsx | boîtes de dialogue et badges de confiance |

## 3. Architecture de l’interface (`src/app/`)

```
ds/          design system (jetons, composants, graphiques, panneaux)
layouts/     coquille : Sidebar (repliable, info-bulles), Topbar, nav.ts (définition unique des modules)
features/    briques transverses : search (Ctrl+K), import (étapes d’analyse), plan (visionneuse 2D,
             inspecteur d’élément, outils de métré), workspace (en-tête projet, confiance), help
pages/       un écran par module, chargé à la demande (React.lazy + Suspense + squelette)
services/    accès disque/bureau (api), exports, pdf.js, analyses (worker)
stores/      état de l’application (projet, annuler/rétablir, sauvegarde automatique, notifications)
hooks/       useLocalState, useHotkey, useMediaQuery, useVirtual
```

**Espace de travail d’un projet.** L’en-tête du projet contient :
- l’identité, la localisation, les fichiers, la surface et la dernière analyse ;
- la confiance globale (un clic ouvre le détail) ;
- les 8 étapes du parcours, avec leur état réel (`core/progress.ts`).

Viennent ensuite les onglets : Vue d’ensemble, Modèle 3D, Plan 2D, Analyse, Détection, Métré,
Quantitatif, DQE, Estimation, Documents.

**Plan 2D et métré.**
- La visionneuse (`features/plan/PlanCanvas.tsx`) dessine les éléments détectés et un calque SVG de
  mesures, dans le repère de la page (points PDF).
- Les outils (`features/plan/MeasureTools.tsx`) sont : Sélection, Étalonner, Longueur, Surface, Mur,
  Comptage, et la proposition de murs.
- Saisie des points :
  - aimantation sur les extrémités des tracés (pastille verte) ;
  - Maj pour un trait horizontal ou vertical ;
  - double-clic ou Entrée pour terminer, Retour arrière pour retirer un point, Échap pour annuler.
- La pastille d’échelle de la barre d’outils prend la couleur de sa confiance.
- Le panneau « Mesures » montre la formule de chaque mesure. On y modifie la hauteur et les
  ouvertures, et on lie la mesure à une ligne du DQE.
- Le Métré liste toutes les mesures des plans.

**Import multiple.**
- La file d’import accepte plusieurs fichiers par glisser-déposer ou par le sélecteur. Pour chaque
  fichier, elle montre le format, la taille, l’état, la progression réelle (étapes dépliables), le
  résultat, les erreurs, et signale un fichier déjà importé (même nom, même taille).
- Les fichiers sont analysés l’un après l’autre. L’aperçu de chacun s’ouvre dès qu’il est prêt ;
  « Plus tard » le laisse dans la file.
- Un bouton importe d’un coup tous les fichiers prêts.
- Les formats sans moteur sont signalés tout de suite et peuvent être joints au projet sans analyse.

**Couches CSS.**
- L’ordre des couches est `theme`, `base`, `components` (anciennes feuilles), `utilities`.
- Aucune règle de style d’élément ne doit rester hors couche : elle l’emporterait sur les classes
  utilitaires.

**Performance.**
- Découpage du code : chaque écran, ExcelJS et pdf.js sont chargés à la demande.
- L’analyse Excel/CSV tourne dans un Web Worker, avec repli automatique si le worker est indisponible.
- Le PDF est analysé par pdf.js dans son propre worker, et DQP rend la main entre chaque page.
- Le rendu des plans se fait hors écran, sans clignotement ; un nouveau rendu annule le précédent.
- Les grandes listes sont virtualisées (Métré).
- Les lots du DQE utilisent `content-visibility: auto`.
- Les calculs sont mémorisés (`useMemo`).

**Règles.**
1. Aucune donnée affichée n’est inventée. Un module sans moteur montre `Pending`.
2. Toute valeur porte son état de confiance.
3. Toute action longue montre une étape réelle : « Étape 3/5 — Détection : 15 élément(s) ».
4. Toute action modifiante est annulable (Ctrl+Z) et inscrite au journal.
5. L’écran doit rester exploitable de 1366×768 à 3840×2160. La barre latérale se replie
   automatiquement sous 1440 px de large ; l’utilisateur peut changer ce réglage.
