# PLANORA BTP — audit du code et plan de développement (15/10/2026)

Réponse au « prompt maître » : état réel de l’existant, analyse du DQE de référence et suite par phases.
« Opérationnel » signifie ici : fonctionne sur une vraie base PostgreSQL avec les règles d’accès, et est
couvert par un test automatisé (voir `docs/TESTS.md`). Le détail fonction par fonction est dans
`docs/ETAT_DES_FONCTIONS.md`.

## 1. Inventaire de l’existant

| Domaine | Contenu | État |
|---|---|---|
| Socle | React 19 + TypeScript + Vite, Supabase (PostgreSQL, authentification, stockage, fonction serveur), 11 migrations | opérationnel |
| Comptes et entreprises | inscription, entreprise, équipe, invitations, rôles et matrice de permissions modifiable, double authentification, journal d’activité | opérationnel |
| Abonnements | offres, limites appliquées par la base, lecture seule à l’échéance, demandes et activation par l’administration | opérationnel ; **paiement en ligne non branché** (prestataire à choisir) |
| Clients, projets, lots | fiches, doublons, projets avec lots standard, fiche chantier | opérationnel |
| Bibliothèque de prix | articles, ouvrages composés (déboursé sec), historique des prix, comparaison, mise à jour en masse ; **nouveau** : bibliothèque des travaux importée d’un DQE Excel | opérationnel |
| Métrés, DQE, BPU, devis | métré manuel et depuis un plan, DQE / BPU / devis versionnés, PDF et Excel aux montants du moteur | opérationnel |
| Plans | éditeur 2D, import PDF / image, calibration, détection des pièces, aménagement, rendu fidèle (PDF, DXF), métré tiré du plan | opérationnel |
| Rendu IA | fonction serveur, quota, mention « non contractuel » | code testé avec un fournisseur de test ; **désactivé par défaut**, nécessite une clé (OpenAI ou Gemini) |
| Finances | factures, acomptes, situations, avoirs, paiements, relances, dépenses, budget, rentabilité | opérationnel |
| Achats et stocks | demandes, commandes, réceptions, dépôts, mouvements, inventaires, alertes | opérationnel |
| Planning et suivi | tâches, dépendances, avancement, rapports journaliers avec photos, réserves | opérationnel |
| Tableau de bord, rapports | indicateurs, budget / réel, 11 rapports en PDF / Excel / CSV | opérationnel |
| Notifications, assistance | notifications dans l’application, préférences, demandes d’assistance | opérationnel ; **e-mail / SMS / WhatsApp non envoyés** (aucun service branché) |
| Démonstration locale | fichier HTML unique (`npm run build:demo`) : même application, même SQL, base PGlite dans le navigateur | démonstration ; pas un serveur de production |

### Ce qui reste simulé ou non branché (affiché comme tel dans l’application)

- **Courriels** : liens générés et partageables ; aucun envoi automatique.
- **Paiement des abonnements** : activation manuelle par l’administration.
- **Rendu IA** : nécessite une clé ; sans clé, la demande échoue explicitement et le quota est restitué.
- **Assistant IA, OCR des plans, mode hors ligne, client externe, permissions par projet** : non réalisés, signalés « bientôt ».
- **Déploiement Supabase réel** : en attente du projet que vous créerez. Les migrations sont testées sur
  PostgreSQL 16 avec un environnement qui imite Supabase, pas encore sur un projet Supabase réel.

## 2. Points de sécurité

Acquis (vérifiés par les 192 contrôles SQL de `supabase/tests/rls_test.sql`) :

- règles d’accès (RLS) sur toutes les tables : isolation par entreprise, droit par module et par action ;
- colonnes modifiables limitées par des autorisations par colonne (source d’un import, numéros, totaux
  calculés : non modifiables par l’utilisateur) ;
- fonctions sensibles en `security definer` avec `search_path` vide ; exécution retirée au public ;
- numérotation, totaux et statuts recalculés ou contrôlés par la base, pas par le navigateur ;
- clés des fournisseurs IA uniquement côté serveur (fonction `rendu-ia`).

À traiter avant la mise en production (phase 6) :

- activer et vérifier sur le projet Supabase réel : confirmation des e-mails, limites de tentatives de
  connexion, sauvegardes, conseiller de sécurité de Supabase ;
- en-têtes de sécurité (CSP, HSTS) chez l’hébergeur du site ;
- pas d’analyse antivirus des fichiers déposés (le type réel et la taille sont contrôlés) ;
- la démonstration HTML contient deux comptes de démonstration à mot de passe connu : elle ne doit
  jamais servir de base réelle.

## 3. Analyse du fichier de référence « DQE PM SENOU »

Le fichier client n’est **pas** versionné (`samples/private/` est ignoré par git). Analyse faite en local
par le moteur d’import de PLANORA BTP :

- une feuille utile (`Feuil1`), 7 corps d’état : MACONNERIE - BETON (33 lignes), CHARPENTE - COUVERTURE (4),
  PLOMBERIE - SANITAIRE (22), ELECTRICITE (38), REVÊTEMENT - CARREAUX (6), MENUISERIE (12),
  PEINTURE - BADIGEON (5) — 120 lignes d’ouvrage ;
- **formules cassées** `#REF!` aux totaux « TOTAL BATIMENT PRINCIPAL » : F384, F520, F618, F741, F831
  (`=#REF!+Fxxx+#REF!`) — signalées, non corrigées ;
- quantité D366 (« Evier à 2 bacs cuisine secondaire ») : formule `=---E366` qui renvoie à sa propre ligne → à vérifier ;
- le total du gros œuvre (E201 = 14 413 664 FCFA) **n’inclut pas** la partie « I - INSTALLATION »
  (3 lignes, 375 208 FCFA) ; le total général (E884 = 39 070 857 FCFA) ne la compte donc pas non plus ;
- phrase d’arrêté A204 : « 14 413 66 » au lieu de 14 413 664 ;
- deux intitulés de projet dans le même fichier (A186 « villa basse », A637 « résidence R+1 avec sous-sol
  à Zopah, commune d’Abomey-Calavi ») ;
- numérotation non unique (ex. N° 7 utilisé 18 fois en plomberie) ;
- unités écrites `m2`, `m²`, `m3` : harmonisées en m² / m³ et signalé ;
- fautes de frappe d’origine conservées telles quelles (« barraque », « Lample », « cpourants »…).

Bibliothèque proposée à partir de ce fichier : **117 ouvrages** (3 occurrences regroupées), dont
14 sans prix, 1 à prix 0 (« Construction de barraque »), 14 ouvrages présents à des prix différents selon
la partie (ex. enduits verticaux à 2 200 FCFA au rez-de-chaussée et 1 600 FCFA pour la clôture) — tous
importés « à vérifier ».

## 4. Plan par phases

| Phase | Contenu | État |
|---|---|---|
| 1. Audit et sécurisation | cet audit ; nom « PLANORA BTP » partout (messages de l’ancien moteur « DQP » corrigés) | ✅ fait |
| 2. Bibliothèque et métré | import d’un DQE Excel dans la bibliothèque, traçabilité (fichier, feuille, cellule), anomalies, statut de validation, fiche d’ouvrage (corps d’état, méthode de métré, formule) | ✅ fait (import, validation) |
| 2 (suite) | appliquer la méthode de métré et la formule de l’ouvrage dans le moteur de métré ; origine de chaque quantité : *calculée*, *reconnue sur plan*, *estimée*, *saisie* | à faire |
| 3. DQE, BPU, documents | DQE construit depuis la bibliothèque des travaux (par corps d’état, sections reprises), BPU, contrôle des ouvrages « à vérifier » avant émission | à faire |
| 4. Plans techniques | électricité, plomberie, CVC, aération, carrelage, peinture : symboles, comptages et longueurs **tracés ou confirmés par l’utilisateur** ; aucune reconnaissance automatique présentée comme fiable sans test | à faire |
| 5. Assistants par corps d’état | listes de contrôle et calculs par métier à partir de la bibliothèque validée ; IA facultative et désactivée par défaut | à faire |
| 6. Production | projet Supabase (créé par vous), déploiement, service de courriel, prestataire de paiement, sauvegardes, supervision | en attente de vos choix |
