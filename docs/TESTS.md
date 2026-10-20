# PLANORA BTP — documentation de test

Tests automatisés (moteur, base, navigateur, démonstration, logiciel installé), plus une recette manuelle.

## 1. Moteur de calcul, PDF et Excel — `npm test`

- `tests/engine.test.ts` : arrondis FCFA (1,005 → 1,01), lecture des nombres saisis en français, montants
  en lettres, conversions d’unités (seulement si le facteur est connu), métrés (5 m × 4 m = 20 m² avant
  déduction, volume, périmètre, mur net avec seuil de déduction, dimension manquante jamais devinée,
  pertes, formule libre sûre), DQE / BPU / devis (montant de ligne arrondi, sous-totaux, remise, TVA,
  lignes incomplètes non comptées), déboursé sec (trois méthodes), CSV, doublons.
- `tests/documents.test.ts` : le PDF et l’Excel d’un devis contiennent **exactement** les montants du moteur.
- `tests/import.test.ts` : import d’un DQE Excel (lots, sous-parties, valeurs absentes signalées).
- `tests/library-import.test.ts` : bibliothèque des travaux construite depuis un DQE Excel (classeur
  synthétique, aucun fichier client) — corps d’état reconnus, désignations / unités / prix repris tels
  quels, même ouvrage au même prix regroupé avec ses deux cellules d’origine, prix différents gardés et
  signalés, occurrence sans prix rattachée avec une note, prix à 0 signalé, formule `#REF!` relevée,
  codes par corps d’état (GO-001…) poursuivis après ceux de la bibliothèque, ouvrages déjà présents
  désélectionnés, ligne insérée « à vérifier » avec sa source exacte.
- `tests/metre-library.test.ts` : formules paramétrables de la bibliothèque (variables inconnues ou
  parenthèse manquante refusées), formule standard selon l’unité, ligne de métré depuis un ouvrage
  (dimensions non devinées, 2 × (4 + 3) × 2,8 = 39,20), origine des quantités (calculée, saisie,
  reconnue sur plan, estimée), regroupement (origines, ouvrage commun), points à revoir avant validation.
- `tests/library-dqe.test.ts` : DQE type depuis la bibliothèque — corps d’état dans l’ordre du DQE d’origine
  (rejetés et archivés exclus), un lot par corps d’état, sections reprises, quantités jamais reprises (total 0,
  lignes incomplètes signalées), prix « à vérifier » tracé, prix d’une autre devise non repris, options.
- `tests/plan.test.ts` : plans — calibration (le dessin change d’échelle, pas les épaisseurs ni les
  meubles), relecture robuste, détection d’une pièce entre les faces des murs (rectangle et pièce en L,
  zone ouverte refusée), aménagement proposé (dans la pièce, porte dégagée), rendu fidèle (noms,
  surfaces, cotes 500 / 1020, « ≈ » si l’échelle n’est pas vérifiée), image d’entrée IA sans aucun texte
  et surcouche alignée, lignes de métré (37,83 m² ; mur 8 × 2,8 − 0,9 × 2,1 = 20,51 m²), DXF.
- `tests/finance.test.ts` et `tests/purchasing.test.ts` : acompte, situation, solde, avoir, échéances,
  rentabilité du chantier ; total de commande, valeur reçue, rapprochement avec la facture du fournisseur,
  alertes de réapprovisionnement.
- `tests/planning.test.ts` : durées, retards, grille du calendrier, dépendances non respectées, avancement
  par tâches (66,7 %), par quantités (70 %, tâche sans quantité exclue), pondéré (40 %), avancement prévu.
- `tests/dashboard.test.ts` et `tests/reports.test.ts` : flux mensuels, indicateurs (avoirs déduits, brouillons
  exclus, factures échues, marge prévisionnelle seulement sur les chantiers complets), budget / réel par lot,
  rapports par période, quantitatif par lot (dimension manquante laissée vide).
- `tests/rendu-ia.test.ts` : fonction serveur du rendu IA — session et propriétaire vérifiés, absence de
  clé = échec explicite et unités restituées, succès (image déposée, demande close), échec du
  fournisseur sans fuite de secret, consigne (géométrie conservée, aucun texte), format des requêtes
  OpenAI et Gemini, choix du fournisseur par les secrets.

## 2. Sécurité et règles de la base — `sh supabase/tests/run.sh`

Applique les migrations sur un PostgreSQL vierge, avec un environnement qui imite Supabase
(`supabase/tests/shim_supabase.sql`), puis exécute `supabase/tests/rls_test.sql` : 194 contrôles, parmi lesquels :
isolation entre entreprises (lecture, écriture, fichiers, journal), permissions par rôle et matrice
modifiable, invitations, limites d’offre, abonnement échu en lecture seule, versions verrouillées, métré
approuvé figé, historique des prix, demandes d’abonnement, administration sans accès au contenu,
double authentification, plans (isolation, module selon l’offre, fichiers d’un plan soumis aux droits
« Plans », plan approuvé figé), rendus IA (quota mensuel, réservation puis consommation ou restitution,
seul le serveur clôt un rendu, 3 rendus simultanés au plus, demandes abandonnées restituées, journal),
finances (totaux recalculés par le serveur, numérotation FAC / AVO à l’émission, facture émise figée,
paiement limité au reste dû), achats et stocks (commande validée figée, réception partielle, stock négatif
refusé, transfert, inventaire, isolation), planning (dépendances sans boucle, validation après « terminé »,
rapport journalier toujours créé en brouillon, un par jour, photos rangées dans l’entreprise, rapport validé
figé, réserve validée seulement une fois levée, isolation, module hors offre refusé), bibliothèque des
travaux (ouvrage importé « à vérifier », source d’origine non modifiable, validation réservée au droit
« Valider » et tracée, journal des imports non modifiable, isolation).

```bash
PGHOST=/chemin/socket PGPORT=5432 sh supabase/tests/run.sh   # utilisateur « postgres »
```

## 3. Recette de bout en bout — `node scripts/e2e.mjs`

Pilote un vrai navigateur sur une pile locale (`scripts/local-stack/`) : PostgreSQL avec les migrations,
PostgREST, et une passerelle qui joue l’authentification, le stockage et la fonction serveur de Supabase.
66 étapes : inscription, confirmation, entreprise, client, doublon, projet et lots, article et ouvrage composé,
métré, DQE, devis, PDF, Excel, validation, nouvelle version, invitation d’un métreur sur téléphone,
permissions, demande d’abonnement (offre Professionnelle), activation par l’administration ; facture
d’acompte depuis le devis, émission, paiement partiel, PDF, dépense, onglet Finances du chantier ; dépôts,
demande d’achat approuvée, bon de commande (480 000), réception partielle, transfert, sortie refusée au-delà
du stock, inventaire avec écart, alerte sous le minimum, journal des mouvements ; planning (quatre tâches,
dépendance non respectée et retard signalés, validation, avancement 25 %), rapport journalier avec effectifs,
sorties de stock reprises, photo, soumission, validation et PDF, réserve levée puis validée, fiche chantier ;
rapports (financier en PDF, Excel et CSV, rapport de chantier, comparatif budget / réel), historiques client et
fournisseur, tableau de bord complet (budget du projet repris) ; notifications (tâche en retard, stock
insuffisant), préférences, assistance avec réponse de la plateforme, historique d’abonnement ; puis plans :
dessin (murs, cloison à la longueur saisie, porte, fenêtre), détection des pièces (26,18 m² et 32,98 m²),
aménagement, rendu fidèle (PDF, DXF), rendu IA, métré tiré du plan, import d’un plan scanné, calibration,
détection sur les traits de l’image, éditeur sur téléphone ; tableau de bord et journal ; enfin import d’un DQE
Excel dans la bibliothèque (prix manquant et prix divergents signalés, cellule d’origine affichée, ouvrage validé),
métré créé depuis cet ouvrage avec une quantité « estimée », DQE généré avec le prix de la bibliothèque
(12 × 3 500 = 42 000) et points à revoir signalés, puis DQE type créé directement depuis la bibliothèque.

Le rendu IA y utilise un **fournisseur de test** (`PLANORA_TEST_AI=1`) qui renvoie l’image d’entrée telle
quelle : il vérifie tout le parcours (quota, stockage, état, surcouche, mention) sans service payant.
Il n’existe que dans la pile locale et ne remplace pas un essai avec un vrai fournisseur.

```bash
PGHOST=… PGPORT=… PLANORA_TEST_AI=1 sh scripts/local-stack/start.sh
VITE_SUPABASE_URL=http://localhost:54320 VITE_SUPABASE_PUBLISHABLE_KEY=locale npx vite build
node scripts/e2e.mjs /tmp/captures
```

## 4. Recette manuelle (environnement de test en ligne)

1. Créer un compte, ouvrir le lien de confirmation, se connecter.
2. Créer l’entreprise ; dans Paramètres, ajouter le logo, l’IFU / RCCM, vérifier la TVA.
3. Créer un client, puis un second avec le même téléphone : le doublon doit être signalé.
4. Créer un projet avec les lots standard ; modifier un lot.
5. Bibliothèque de prix : créer un article daté et sourcé, puis un ouvrage composé ; vérifier le calcul affiché.
6. Métré : saisir 5 × 4 en surface (20,00 m²), laisser une hauteur vide sur un volume (« à compléter »).
7. Générer le DQE, renseigner les prix (saisie, bibliothèque), créer le devis, ajouter une remise.
8. Télécharger le PDF et l’Excel : comparer les totaux avec l’écran.
9. Valider et verrouiller ; essayer de modifier (impossible) ; créer une nouvelle version.
10. Inviter un collaborateur « métreur », ouvrir le lien sur un téléphone, vérifier qu’il ne peut pas créer de client.
11. Activer la double authentification, se déconnecter, se reconnecter avec le code.
12. Plans : importer le PDF d’un plan client, calibrer sur une cote de façade, comparer deux cotes
    connues avec l’outil « Mesurer » (écart attendu < 1 %).
13. Tracer les murs d’un niveau, détecter les pièces d’un clic, vérifier deux surfaces à la main.
14. Rendu : choisir un style, proposer l’aménagement, exporter le PDF en A3 et l’imprimer à 100 % :
    mesurer une cote à la règle et vérifier l’échelle indiquée dans le cartouche.
15. Rendu IA (clé configurée) : générer un rendu depuis le rendu fidèle, vérifier que les murs et les
    pièces n’ont pas bougé, que les noms et cotes sont ceux du dessin et que la mention est présente ;
    vérifier la baisse du quota (10 unités).

Critère : chaque étape doit réussir sans message d’erreur, et aucun montant ne doit différer entre
l’écran, le PDF et l’Excel.

## 5. Paquet de test local pour Windows — `scripts/local-package/`

Pour essayer PLANORA BTP sur un PC Windows 10 / 11 (64 bits) sans rien installer ni rien mettre en
ligne : PostgreSQL 16, PostgREST 12, Node.js 22 et le runtime Visual C++ sont embarqués.

```bash
sh scripts/local-package/build.sh /chemin/de/travail   # produit les fichiers à envoyer dans <travail>/sortie
```

- `ASSEMBLER-PLANORA.bat` + `PLANORA-BTP-local.zip.part0`, `.part1`, `.part2` (28 Mo au plus chacune) : placer le tout dans un même
  dossier, double-cliquer sur `ASSEMBLER-PLANORA.bat`, puis sur `PLANORA-BTP\DEMARRER-PLANORA.bat`.
- Premier lancement : création de la base (migrations appliquées une seule fois, suivies dans
  `planora_local.applied`), saisie facultative de l'adresse de l'administrateur de la plateforme.
- Le serveur n'écoute que sur ce PC (127.0.0.1), sert le site, confirme les inscriptions d'office
  (aucun courriel en local) et désactive les routes de recette (`/__dev`).
- Données conservées dans `PLANORA-BTP\donnees` ; `ARRETER-PLANORA.bat` arrête tout.
- Vérification : `scripts/local-package/smoke.mjs` (inscription, entreprise, espace administrateur)
  sur le paquet réassemblé, avec une base vierge. Le lancement des `.bat` lui-même n'a pas pu être
  exécuté ici (pas de Windows dans l'environnement de construction).

## 6. Fichier de démonstration autonome — `npm run build:demo`

Un **seul fichier HTML** (`dist-demo/index.html`, environ 19 Mo) qui s'ouvre d'un double-clic, sans
installation, sans serveur et sans Internet (Chrome, Edge ou Firefox récents) :

- la vraie base PostgreSQL tourne dans le navigateur (PGlite, WebAssembly) avec **les mêmes
  migrations, fonctions et règles d'accès (RLS)** que la production ; `src/demo/backend.ts` traite les
  appels de la bibliothèque Supabase (données, authentification, fichiers) ;
- base de départ (`scripts/demo/build-seed.mjs`) : deux comptes d'essai (`demo@planora.bj`,
  propriétaire et administrateur de la plateforme ; `conducteur@planora.bj`, droits limités ; mot de passe
  `Demo2026`) et une entreprise d'exemple sur l'offre Professionnelle ; toutes les données d'exemple sont
  marquées fictives ;
- données conservées dans le navigateur (IndexedDB), une seule fenêtre à la fois, sauvegarde et restauration
  des données, bouton « Réinitialiser » ; une nouvelle version applique les migrations manquantes à la base
  existante (`src/demo/migrate.ts`, `tests/demo-upgrade.test.ts`) au lieu de repartir de zéro ;
- rendu IA et envoi de courriels indisponibles (services en ligne).

Vérifications :
- `node scripts/demo/serve-backend.mjs` expose le même serveur interne en HTTP (port 54320) : la recette
  complète (`scripts/e2e.mjs`, 66 étapes) y passe entièrement ;
- `node scripts/demo/smoke.mjs dist-demo/index.html` ouvre le fichier depuis le disque : connexion,
  écriture, conservation après rechargement, second onglet refusé, devis et PDF, administration.

## 7. Logiciel installable Windows — `npm run build:desktop`

Même application autonome que la démonstration, dans une fenêtre de logiciel (Electron) avec installeur
Windows (NSIS, x64) : `dist-installer/PLANORA-BTP-Installation-<version>.exe`. Guide : `docs/LOGICIEL_WINDOWS.md`.

Vérifications :
- `tests/demo-upgrade.test.ts` : base de l’ancienne version mise à jour (migrations suivantes appliquées,
  données conservées), second démarrage sans rien refaire, données d’une version plus récente refusées ;
  base de départ déjà à jour ;
- `xvfb-run -a node scripts/desktop/smoke.mjs` (Electron pour Linux, même application) : démarrage et
  connexion, écriture en base, sauvegarde `.planora`, second lancement refusé, fermeture puis réouverture
  (données conservées), restauration (état sauvegardé retrouvé), faux fichier de sauvegarde refusé ;
- installeur installé silencieusement sous Wine (`/S`) : programme, désinstalleur, raccourcis bureau et
  menu Démarrer, icône et informations de version vérifiés ;
- `.github/workflows/logiciel.yml` : construction et même recette sur un vrai Windows (GitHub Actions).
