# PLANORA BTP — état des fonctions (version 0.1.0)

Liste exigée par le cahier des charges (§35, §36.8). « Terminé » signifie : l’action fonctionne réellement
(base de données, calcul, fichier produit) et elle est couverte par un test automatisé.

## Livraison immédiate (annexe B)

| Élément | État | Vérification |
|---|---|---|
| Page d’accueil PLANORA BTP (offres lues en base) | ✅ Terminé | recette navigateur, étape 1 |
| Inscription (prénom, nom, e-mail, téléphone, mot de passe, acceptation des conditions, confirmation d’e-mail) | ✅ Terminé | recette 2 à 4, tests de base |
| Connexion, déconnexion, mot de passe oublié, nouveau mot de passe | ✅ Terminé | recette 3-4 (oubli / nouveau mot de passe : écrans prêts, envoi du courriel par Supabase) |
| Création d’entreprise (essai Découverte 30 jours, champs légaux selon le pays) | ✅ Terminé | recette 5, tests de base |
| Tableau de bord (indicateurs calculés sur les données réelles) | ✅ Terminé pour les modules livrés | recette 26 |
| Clients et fournisseurs (fiches, recherche, filtres, import / export CSV, doublons, archivage, historique) | ✅ Terminé | recette 6-7, tests moteur |
| Projets et chantiers (référence unique, types, lots standard modifiables, budget, journal) | ✅ Terminé | recette 8, tests de base |
| Bibliothèque de prix (pays, ville, date, source, historique, import CSV / Excel, export, mise à jour en masse, comparaison, prix anciens signalés) | ✅ Terminé | recette 9, tests de base |
| Décomposition des coûts (déboursé sec, pertes, frais indirects, marge, coefficient K) | ✅ Terminé | tests moteur, recette 9 |
| Métré manuel (longueur, surface, volume, périmètre, mur net avec ouvertures et seuil, unité, forfait, formule libre, pertes, arrondi, détail du calcul) | ✅ Terminé | tests moteur, recette 10-12 |
| DQE (depuis un métré, un DQE, un fichier Excel importé ou en saisie) | ✅ Terminé | recette 13, test d’import |
| BPU (généré depuis un DQE, prix repris dans un DQE par référence) | ✅ Terminé | tests moteur |
| Devis (depuis un DQE, un devis existant ou en saisie ; remise ; taxes paramétrables ; statuts ; décision du client) | ✅ Terminé | recette 14 |
| Versions validées et verrouillées, nouvelle version, historique | ✅ Terminé | recette 17-18, tests de base |
| Export PDF (en-tête, logo, client, projet, sous-totaux par lot, totaux, montant en lettres, conditions, signatures, pagination) | ✅ Terminé | recette 15, test de cohérence des montants |
| Export Excel (DQE, BPU, devis, métré) | ✅ Terminé | recette 16, test de cohérence des montants |
| Base de données persistante | ✅ Prête (migrations) | **à appliquer sur votre projet Supabase** |
| Rôles et permissions (9 rôles, matrice configurable par entreprise, 8 actions, vérification serveur) | ✅ Terminé | 78 contrôles de sécurité, recette 19-22 |
| Documentation de test | ✅ | `docs/TESTS.md` |

## Autres fonctions livrées

| Élément | État |
|---|---|
| Gestion documentaire : dépôt privé, vérification du type réel et de la taille, versions, statuts (travail / vérifié / approuvé / archivé), liens de téléchargement temporaires | ✅ Terminé |
| Équipe : invitations par lien (7 jours, liées à l’adresse e-mail), changement de rôle, retrait, au moins un propriétaire | ✅ Terminé |
| Double authentification (application TOTP), exigée aussi par le serveur une fois activée | ✅ Terminé (testée côté serveur ; à essayer sur Supabase réel) |
| Déconnexion de tous les appareils | ✅ Terminé |
| Journal d’activité (qui, quand, quoi) | ✅ Terminé |
| Abonnements : offres et limites appliquées par le serveur (utilisateurs, projets, documents, stockage, modules), lecture seule à l’échéance sans perte de données, demande de changement d’offre | ✅ Terminé |
| Administration de la plateforme : statistiques, entreprises, activation / suspension, traitement des demandes, modification des offres | ✅ Terminé |
| Application responsive (ordinateur, tablette, téléphone ; tableaux en fiches sur téléphone) | ✅ Terminé |

## Partiel

| Élément | Ce qui manque |
|---|---|
| Envoi des courriels (invitation, devis) | Les liens sont générés et partageables (e-mail, WhatsApp) ; l’envoi automatique attend un service de courriel. L’application ne prétend jamais qu’un envoi a réussi. |
| Paiement des abonnements | Demande + activation manuelle par l’administration ; le paiement en ligne (Mobile Money, carte) attend le choix d’un prestataire. |
| Permissions par projet | La matrice est par entreprise ; la restriction par projet viendra avec les équipes de chantier. |
| Client externe | Rôle non encore ouvert (accès limité aux devis et rapports). |
| Rapports | DQE, BPU, devis et métrés s’exportent ; les rapports de chantier et financiers arrivent avec la phase 5. |

## Non réalisé (signalé « bientôt » dans l’application)

| Module | Phase |
|---|---|
| Plans techniques : import, visualiseur, calibration, mesures, annotations, éditeur 2D, export DXF | Phase 3 (le moteur PDF de DQP est déjà dans `src/engine/dqp`) |
| Assistant IA, OCR, quotas IA | Phase 4 |
| Facturation et encaissements, dépenses et rentabilité, achats, stocks, planning, rapports journaliers | Phase 5 |
| Notifications (application, e-mail, SMS), support | Phase 6 |
| Mode hors ligne | Non commencé (l’application est installable sur l’écran d’accueil mais nécessite Internet) |
