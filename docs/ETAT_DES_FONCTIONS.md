# PLANORA BTP — état des fonctions (version 0.2.0)

Liste exigée par le cahier des charges (§35, §36.8). « Terminé » signifie : l’action fonctionne réellement
(base de données, calcul, fichier produit) et elle est couverte par un test automatisé.

## Livraison immédiate (annexe B)

| Élément | État | Vérification |
|---|---|---|
| Page d’accueil PLANORA BTP (offres lues en base) | ✅ Terminé | recette navigateur, étape 1 |
| Inscription (prénom, nom, e-mail, téléphone, mot de passe, acceptation des conditions, confirmation d’e-mail) | ✅ Terminé | recette 2 à 4, tests de base |
| Connexion, déconnexion, mot de passe oublié, nouveau mot de passe | ✅ Terminé | recette 3-4 (oubli / nouveau mot de passe : écrans prêts, envoi du courriel par Supabase) |
| Création d’entreprise (essai Découverte 30 jours, champs légaux selon le pays) | ✅ Terminé | recette 5, tests de base |
| Tableau de bord (indicateurs calculés sur les données réelles) | ✅ Terminé pour les modules livrés | recette 35 |
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
| Rôles et permissions (9 rôles, matrice configurable par entreprise, 8 actions, vérification serveur) | ✅ Terminé | 107 contrôles de sécurité, recette 19-22 |
| Documentation de test | ✅ | `docs/TESTS.md` |

## Plans techniques et rendus de présentation (version 0.2.0, demande du 14/10/2026)

Détail du module, des coûts et des limites : `docs/RENDU_PLANS.md`.

| Élément | État | Vérification |
|---|---|---|
| Bibliothèque de plans par projet, niveau, type et statut (travail, vérifié, approuvé = figé) | ✅ Terminé | recette 26, contrôles de sécurité |
| Import d’un plan PDF (page au choix, traits vectoriels utilisés pour l’accroche) ou image (PNG, JPG, WEBP) | ✅ Terminé | recette 32 |
| Visualiseur : zoom et déplacement (souris, deux doigts), calques visibles / verrouillés, opacité du fond | ✅ Terminé | recette 26-34 |
| Calibration sur deux points et une distance réelle ; mesures marquées « ≈ » tant que l’échelle n’est pas vérifiée | ✅ Terminé | tests moteur, recette 32-33 |
| Éditeur 2D : murs et cloisons (épaisseur réelle), portes (battante, double, coulissante, garage), fenêtres, baies, pièces (contour ou détection d’un clic), mobilier (25 éléments), cotes, textes, mesure | ✅ Terminé | tests moteur, recette 26-28 |
| Aide au dessin : accroche aux points, aux axes des murs, angle droit, grille de 5 cm, longueur saisie au clavier, annuler / rétablir, sauvegarde automatique | ✅ Terminé | recette 26 |
| Détection d’une pièce d’un clic (murs dessinés et / ou traits du fichier importé), surface exacte entre les faces des murs | ✅ Terminé | tests moteur (pièce en L), recette 27 et 33 |
| Aménagement proposé selon le type de pièce (dans la pièce, sans chevauchement, portes dégagées), modifiable | ✅ Terminé | tests moteur, recette 28 |
| **Rendu de présentation fidèle** : 4 styles (Moderne, Chaleureux, Prestige, Épuré), textures de sol, ombres, mobilier, noms et surfaces des pièces, cotes automatiques par façade, barre d’échelle, cartouche | ✅ Terminé | tests moteur, recette 29 |
| Exports : image PNG, PDF à une échelle normalisée (1/50, 1/100…) en A4 / A3, DXF (calques MURS, PIECES, COTES…), enregistrement du PDF dans les documents du projet | ✅ Terminé | recette 29 |
| Métré créé depuis le plan (sols, plinthes, surfaces nettes des murs avec ouvertures ; hauteurs manquantes « à compléter ») | ✅ Terminé | tests moteur, recette 31 |
| **Rendu par IA** : depuis le rendu fidèle ou le fichier importé, 4 ambiances, quota mensuel par offre (10 unités par rendu), réservation / consommation / restitution, 3 rendus simultanés au plus, état réel suivi, noms et cotes exacts posés par PLANORA, mention « illustration non contractuelle » sur toute image | ✅ Terminé côté PLANORA | 29 contrôles SQL, 9 tests de la fonction serveur, recette 30 avec un fournisseur **de test** |
| Rendu IA avec un vrai fournisseur (OpenAI ou Google Gemini) | ⚠️ **À activer** | nécessite une clé (secret `IA_IMAGE_API_KEY`) ; pas encore essayé avec un service réel |

## Finances, achats et stocks (§16 à §18)

| Élément | État | Vérification |
|---|---|---|
| Factures depuis un devis validé : acompte (%), situation (avancement cumulé), solde (déduit les factures précédentes), facture simple ; numéro définitif FAC-AAAA-0001 attribué à l’émission ; facture émise figée, corrigée par un avoir (AVO-) | ✅ Terminé | 6 tests moteur, contrôles SQL (totaux recalculés par le serveur), recette 27 |
| Paiements déclarés (jamais « vérifiés » automatiquement), reste à payer, statut partiel / payé, relances par WhatsApp ou e-mail tracées, échéances et factures échues | ✅ Terminé | contrôles SQL, recette 28 |
| Dépenses par chantier et par lot : engagée / facturée / payée, justificatif privé, export CSV | ✅ Terminé | recette 29 |
| Onglet Finances du chantier : budget initial et révisé, budget par lot, facturé, encaissé, dépenses, marge réelle et objectif, alertes de dépassement | ✅ Terminé | tests moteur, recette 30 |
| Demandes d’achat (DA-) approuvées ou refusées selon les droits, regroupées en bon de commande | ✅ Terminé | contrôles SQL, recette 32 |
| Bons de commande (BC-) : lignes, total recalculé par le serveur, validation puis figés, envoi, annulation, PDF ; réceptions totales ou partielles avec entrée en stock ; rapprochement avec la facture du fournisseur et création de la dépense | ✅ Terminé | 3 tests moteur, contrôles SQL, recette 33 |
| Stocks par dépôt calculés **uniquement** à partir des mouvements ; stock négatif refusé par le serveur ; entrées, sorties affectées à un chantier, transferts, inventaires (écart tracé avec motif), ajustements motivés ; seuils minimums et alertes ; journal et exports CSV | ✅ Terminé | contrôles SQL, recette 31 et 34-37 |

## Planning et suivi de chantier (§19)

| Élément | État | Vérification |
|---|---|---|
| Tâches : titre, chantier, lot, responsable (membre ou intervenant externe), début, fin, durée, statut (à faire, en cours, en attente, bloqué, terminé, validé), priorité, dépendances, observations | ✅ Terminé | contrôles SQL, recette 38 |
| Vues chronologique (Gantt avec flèches de dépendance, aujourd’hui, retards), calendrier mensuel et liste ; export CSV | ✅ Terminé | recette 38 |
| Règles serveur : dépendances du même chantier sans boucle, « validé » réservé au droit « valider » et seulement après « terminé », tâche validée non supprimable | ✅ Terminé | contrôles SQL, recette 39 |
| Avancement selon une méthode choisie et affichée (tâches terminées, quantités exécutées, pondération) ; tâches sans donnée exclues et listées, jamais estimées ; avancement prévu d’après les dates | ✅ Terminé | 5 tests moteur, recette 40 |
| Rapports journaliers : conditions, travaux, effectifs, matériaux (avec reprise des sorties de stock réelles du jour), matériels, incidents, retards, observations, photos réduites avant envoi ; soumission, validation ou renvoi ; rapport validé figé ; PDF avec photos | ✅ Terminé | contrôles SQL, recette 41 |
| Réserves : constat avec photos, localisation, intervenant, échéance, levée puis validation de la levée ; export CSV et PDF | ✅ Terminé | contrôles SQL, recette 42 |
| Fiche chantier « Gestion de chantier » : avancement, retards, rapports, réserves, commandes et matériaux sortis du stock | ✅ Terminé | recette 43 |

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
| Rapports | DQE, BPU, devis, métrés, factures, bons de commande, dépenses, stocks, planning, rapports journaliers et réserves s’exportent ; les rapports de synthèse (financier, avancement, achats) arrivent avec le tableau de bord complet. |

## Non réalisé (signalé « bientôt » dans l’application)

| Module | Phase |
|---|---|
| Plans : comparaison de versions (§9.5), fichiers DWG (exporter en PDF) et import DXF, rotation du fond, outils de CAO avancés (arc, cercle, décalage, hachures), symboles électriques / plomberie / ventilation | Phase 3 (suite) |
| Assistant IA, OCR (le quota IA est déjà en place) | Phase 4 |
| Notifications (application, e-mail, SMS), support | Phase 6 |
| Mode hors ligne | Non commencé (l’application est installable sur l’écran d’accueil mais nécessite Internet) |
