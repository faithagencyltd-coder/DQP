# PLANORA BTP — documentation de test

Trois niveaux de tests automatisés, plus une recette manuelle.

## 1. Moteur de calcul, PDF et Excel — `npm test`

- `tests/engine.test.ts` : arrondis FCFA (1,005 → 1,01), lecture des nombres saisis en français, montants
  en lettres, conversions d’unités (seulement si le facteur est connu), métrés (5 m × 4 m = 20 m² avant
  déduction, volume, périmètre, mur net avec seuil de déduction, dimension manquante jamais devinée,
  pertes, formule libre sûre), DQE / BPU / devis (montant de ligne arrondi, sous-totaux, remise, TVA,
  lignes incomplètes non comptées), déboursé sec (trois méthodes), CSV, doublons.
- `tests/documents.test.ts` : le PDF et l’Excel d’un devis contiennent **exactement** les montants du moteur.
- `tests/import.test.ts` : import d’un DQE Excel (lots, sous-parties, valeurs absentes signalées).
- `tests/plan.test.ts` : plans — calibration (le dessin change d’échelle, pas les épaisseurs ni les
  meubles), relecture robuste, détection d’une pièce entre les faces des murs (rectangle et pièce en L,
  zone ouverte refusée), aménagement proposé (dans la pièce, porte dégagée), rendu fidèle (noms,
  surfaces, cotes 500 / 1020, « ≈ » si l’échelle n’est pas vérifiée), image d’entrée IA sans aucun texte
  et surcouche alignée, lignes de métré (37,83 m² ; mur 8 × 2,8 − 0,9 × 2,1 = 20,51 m²), DXF.
- `tests/rendu-ia.test.ts` : fonction serveur du rendu IA — session et propriétaire vérifiés, absence de
  clé = échec explicite et unités restituées, succès (image déposée, demande close), échec du
  fournisseur sans fuite de secret, consigne (géométrie conservée, aucun texte), format des requêtes
  OpenAI et Gemini, choix du fournisseur par les secrets.

## 2. Sécurité et règles de la base — `sh supabase/tests/run.sh`

Applique les migrations sur un PostgreSQL vierge, avec un environnement qui imite Supabase
(`supabase/tests/shim_supabase.sql`), puis exécute `supabase/tests/rls_test.sql` : 107 contrôles, parmi lesquels :
isolation entre entreprises (lecture, écriture, fichiers, journal), permissions par rôle et matrice
modifiable, invitations, limites d’offre, abonnement échu en lecture seule, versions verrouillées, métré
approuvé figé, historique des prix, demandes d’abonnement, administration sans accès au contenu,
double authentification, plans (isolation, module selon l’offre, fichiers d’un plan soumis aux droits
« Plans », plan approuvé figé), rendus IA (quota mensuel, réservation puis consommation ou restitution,
seul le serveur clôt un rendu, 3 rendus simultanés au plus, demandes abandonnées restituées, journal).

```bash
PGHOST=/chemin/socket PGPORT=5432 sh supabase/tests/run.sh   # utilisateur « postgres »
```

## 3. Recette de bout en bout — `node scripts/e2e.mjs`

Pilote un vrai navigateur sur une pile locale (`scripts/local-stack/`) : PostgreSQL avec les migrations,
PostgREST, et une passerelle qui joue l’authentification, le stockage et la fonction serveur de Supabase.
35 étapes : inscription, confirmation, entreprise, client, doublon, projet et lots, article et ouvrage composé,
métré, DQE, devis, PDF, Excel, validation, nouvelle version, invitation d’un métreur sur téléphone,
permissions, demande d’abonnement (offre Professionnelle), activation par l’administration, puis plans :
dessin (murs, cloison à la longueur saisie, porte, fenêtre), détection des pièces (26,18 m² et 32,98 m²),
aménagement, rendu fidèle (PDF, DXF), rendu IA, métré tiré du plan, import d’un plan scanné, calibration,
détection sur les traits de l’image, éditeur sur téléphone ; enfin tableau de bord et journal.

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
