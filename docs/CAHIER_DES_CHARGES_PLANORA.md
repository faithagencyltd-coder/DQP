# CAHIER DES CHARGES MAÎTRE — PLANORA BTP

**Plateforme SaaS intelligente de conception technique, de métrés, de devis et de gestion de chantiers**

| | |
|---|---|
| Nom du produit | PLANORA BTP |
| Slogan | Du plan au chantier, tout devient plus simple. |
| Version du document | 1.0 |
| Nature du projet | Application web SaaS professionnelle, évolutive et assistée par intelligence artificielle |
| Marchés de lancement | Bénin et Côte d’Ivoire |
| Marchés futurs | Autres pays d’Afrique, puis international |
| Langue initiale | Français |
| Devise initiale | FCFA, avec possibilité d’ajouter d’autres devises |
| Public cible | Entreprises BTP, architectes, ingénieurs, bureaux d’études, métreurs, économistes de la construction, artisans, maîtres d’œuvre, promoteurs immobiliers et particuliers |

> Document fourni par le porteur du projet. Il fait foi pour le développement.
> L’état de réalisation de chaque point est suivi dans [`ETAT_DES_FONCTIONS.md`](ETAT_DES_FONCTIONS.md).

## 1. Présentation générale du projet

### 1.1. Contexte
Le secteur du bâtiment et des travaux publics nécessite la production de plans, le calcul de quantités, la préparation de devis, le suivi des dépenses, la gestion des équipes et le contrôle de l’avancement des travaux.

Ces opérations sont souvent réalisées à l’aide de plusieurs logiciels, de feuilles de calcul, de documents papier et de méthodes manuelles. Cette organisation peut entraîner des erreurs de calcul, des pertes de temps, des incohérences entre les plans et les devis, ainsi qu’un manque de visibilité sur la rentabilité des chantiers.

PLANORA BTP a pour objectif de réunir ces opérations dans une seule plateforme accessible depuis un ordinateur, une tablette ou un téléphone.

### 1.2. Vision
Faire de PLANORA BTP une solution de référence pour la préparation technique, financière et opérationnelle des projets de construction et de rénovation en Afrique.

### 1.3. Mission
Permettre aux professionnels du BTP de :
- concevoir et exploiter des plans techniques ;
- réaliser des métrés et des quantitatifs ;
- produire des DQE, BPU, devis et estimations ;
- calculer les coûts de revient et les marges ;
- organiser les chantiers et les équipes ;
- suivre les achats, les stocks, les dépenses et les paiements ;
- générer rapidement des documents professionnels ;
- utiliser l’intelligence artificielle pour accélérer certaines tâches, tout en gardant la possibilité de vérifier et de corriger les résultats.

### 1.4. Objectifs principaux
1. Réduire le temps nécessaire à la préparation des études et des devis.
2. Limiter les erreurs de métrés et de calcul.
3. Centraliser les informations de chaque projet.
4. Améliorer le suivi financier des chantiers.
5. Faciliter la collaboration entre les différents intervenants.
6. Rendre les outils techniques plus accessibles aux petites et moyennes entreprises.
7. Proposer une tarification adaptée aux marchés africains.
8. Construire une solution évolutive, sécurisée et commercialisable par abonnement.

## 2. Identité du produit

### 2.1. Nom officiel
Le nom à utiliser dans l’ensemble du projet est **PLANORA BTP**. Ce nom doit apparaître sur : la page d’accueil, le tableau de bord, les menus et les écrans, les documents PDF générés, les devis, factures et rapports, les courriels automatiques, les pages de connexion et d’inscription, les pages de paiement et d’abonnement, les supports de communication, les interfaces d’administration, les notifications et les messages système.

Aucun ancien nom de projet ne doit subsister dans l’interface finale.

### 2.2. Identité visuelle souhaitée
Créer une identité visuelle professionnelle, moderne et immédiatement identifiable dans le secteur du BTP.

- Style : professionnel, technologique, institutionnel et épuré.
- Couleurs principales : bleu nuit ou anthracite, blanc et orange de signalisation.
- Couleurs secondaires : gris clair, gris moyen et vert pour les validations.
- Typographie : sans-serif moderne et lisible.
- Icônes : cohérentes, simples et compréhensibles.
- Mise en page : claire, avec une hiérarchie visuelle rigoureuse.
- Interface : adaptée aux écrans d’ordinateur, de tablette et de téléphone.

Le logo doit rester lisible en petit format et fonctionner sur fond clair comme sur fond sombre. La palette définitive devra être définie dans une mini-charte graphique avant la production finale de l’interface.

### 2.3. Expérience utilisateur
L’application doit être facile à prendre en main, même pour un utilisateur qui n’est pas informaticien. Principes obligatoires : navigation claire ; actions principales visibles ; formulaires simples ; sauvegarde automatique lorsque cela est pertinent ; messages d’erreur compréhensibles ; confirmation avant les actions irréversibles ; recherche rapide dans les projets et les documents ; tableaux filtrables et triables ; possibilité de reprendre un travail commencé ; aide contextuelle pour les opérations complexes.

## 3. Utilisateurs et gestion des accès

### 3.1. Types d’utilisateurs
- **Administrateur général de PLANORA BTP** : gère la plateforme entière (entreprises inscrites, comptes utilisateurs, abonnements, paiements et statuts de facturation, offres commerciales, paramètres globaux, journaux d’activité, signalements et demandes d’assistance, paramètres techniques autorisés).
- **Administrateur d’entreprise** : gère son espace professionnel (informations de l’entreprise, collaborateurs, rôles et permissions, projets et chantiers, bibliothèques de prix, documents et modèles, paramètres de facturation, droits d’accès aux projets).
- **Directeur ou chef de projet** : consulte les tableaux de bord, crée des projets, suit les budgets et coordonne les intervenants selon les permissions attribuées.
- **Architecte ou ingénieur** : travaille sur les plans, les documents techniques, les annotations et les quantitatifs autorisés.
- **Métreur ou économiste de la construction** : réalise les métrés, prépare les DQE/BPU, consulte les prix et produit des estimations.
- **Conducteur de travaux** : suit l’avancement, les équipes, les dépenses, les approvisionnements et les observations de chantier.
- **Comptable ou gestionnaire** : accède aux devis, factures, paiements, dépenses et rapports financiers autorisés.
- **Commercial ou chargé d’affaires** : gère les clients, prépare les propositions commerciales et suit les devis.
- **Client externe** : peut recevoir un accès limité à certains documents, devis, rapports ou états d’avancement, si l’entreprise lui ouvre cet accès.

### 3.2. Gestion des rôles
Les droits doivent être configurables par entreprise et, si nécessaire, par projet. Chaque permission doit permettre de distinguer les actions : consulter, créer, modifier, supprimer, valider, exporter, partager, administrer.

Un utilisateur ne doit jamais pouvoir accéder aux données d’une autre entreprise simplement en modifiant une adresse URL ou un identifiant.

## 4. Structure générale de l’application
PLANORA BTP doit être organisé autour d’un tableau de bord principal et de modules interconnectés.

### 4.1. Menu principal
1. Tableau de bord. 2. Clients. 3. Projets et chantiers. 4. Plans techniques. 5. Métrés et quantitatifs. 6. Bibliothèque de prix. 7. DQE et BPU. 8. Devis et propositions commerciales. 9. Commandes et achats. 10. Stocks et matériaux. 11. Facturation et paiements. 12. Dépenses et rentabilité. 13. Planning et équipes. 14. Documents et rapports. 15. Assistant IA PLANORA. 16. Abonnement et facturation de la plateforme. 17. Paramètres. 18. Administration, selon les droits.

Les menus doivent être adaptés au rôle de l’utilisateur.

## 5. Module 1 — Inscription et authentification

### 5.1. Création de compte
Permettre à un utilisateur de : créer un compte avec son nom et son prénom ; saisir son adresse e-mail ; définir un mot de passe sécurisé ; saisir son numéro de téléphone ; confirmer son adresse e-mail ; accepter les conditions d’utilisation et la politique de confidentialité ; créer son entreprise ou rejoindre une entreprise existante sur invitation.

### 5.2. Connexion
Connexion par e-mail et mot de passe ; déconnexion sécurisée ; réinitialisation du mot de passe ; vérification des sessions ; protection contre les tentatives répétées de connexion ; possibilité d’activer une authentification à deux facteurs.

### 5.3. Profil et entreprise
Nom commercial ; raison sociale ; logo ; adresse ; pays ; ville ; téléphone ; e-mail professionnel ; site Internet ; numéro d’identification fiscale, si applicable ; informations légales adaptées au pays ; devise et paramètres de facturation ; coordonnées bancaires, si nécessaire sur les documents.

Les champs légaux doivent être configurables selon le pays et ne doivent pas être imposés de manière identique à toutes les juridictions.

## 6. Module 2 — Tableau de bord

### 6.1. Indicateurs principaux
Nombre de projets actifs ; nombre de chantiers en cours ; devis en attente ; devis acceptés ; montant total des devis en cours ; chiffre d’affaires facturé ; montant encaissé ; montant restant à encaisser ; dépenses enregistrées ; budget prévisionnel des chantiers ; coût réel des travaux ; marge prévisionnelle et marge constatée ; prochaines échéances ; alertes de stock ; tâches en retard.

### 6.2. Visualisations
Évolution des dépenses et des recettes ; répartition du budget par chantier ; comparaison entre budget prévisionnel et dépenses réelles ; état des devis ; avancement des projets ; répartition des coûts par lot de travaux.

Les indicateurs doivent être calculés à partir des données réelles enregistrées. Aucun chiffre fictif ne doit être présenté comme une donnée réelle de l’entreprise. Un compte de démonstration peut proposer des données d’exemple clairement identifiées comme telles.

## 7. Module 3 — Clients, fournisseurs et contacts

### 7.1. Gestion des clients
Nom ou raison sociale ; type de client ; téléphone ; e-mail ; adresse ; pays et ville ; identifiants légaux, si nécessaires ; personne de contact ; historique des projets ; historique des devis ; historique des factures ; paiements et soldes ; notes internes ; documents associés.

### 7.2. Gestion des fournisseurs
Coordonnées ; catégories de produits ou services ; articles fournis ; tarifs enregistrés ; délais habituels ; historique des achats ; documents et factures fournisseurs ; notes et évaluations internes.

### 7.3. Fonctions communes
Recherche rapide ; filtres ; import de contacts par fichier CSV ; export autorisé ; détection des doublons ; historique des modifications ; archivage plutôt que suppression définitive lorsque cela est nécessaire.

## 8. Module 4 — Projets et gestion des chantiers

### 8.1. Création d’un projet
Nom du projet ; référence unique ; client ; localisation ; type de projet ; description ; date de début ; date de fin prévisionnelle ; responsable ; membres de l’équipe ; budget estimatif ; budget validé ; statut ; documents associés.

Types de projets : construction neuve ; rénovation ; aménagement intérieur ; réhabilitation ; extension ; travaux de finition ; voirie et réseaux divers ; construction commerciale ; construction résidentielle ; travaux industriels ; travaux d’entretien.

### 8.2. Organisation par lots
Installation de chantier ; terrassement ; fondations ; gros œuvre ; maçonnerie ; béton armé et structure ; charpente et couverture ; étanchéité ; menuiserie bois ; menuiserie aluminium ; métallerie ; électricité ; plomberie ; climatisation et ventilation ; cloisons et faux plafonds ; carrelage ; peinture ; revêtements ; aménagement intérieur ; signalétique et communication visuelle ; VRD ; espaces extérieurs ; nettoyage et réception.

L’utilisateur doit pouvoir ajouter, modifier et supprimer des lots selon ses besoins.

### 8.3. Fiche de chantier
Informations générales ; plans et versions ; DQE et BPU ; devis ; budget ; achats ; dépenses ; matériaux ; équipe ; planning ; photos ; rapports journaliers ; réserves et observations ; documents de réception.

### 8.4. Historique du projet
Création d’un document ; modification d’un budget ; validation d’un devis ; changement de version d’un plan ; ajout d’une dépense ; modification des quantités ; validation d’une étape. L’historique doit indiquer l’utilisateur, la date et la nature de l’opération.

## 9. Module 5 — Importation et gestion des plans

### 9.1. Formats d’importation
PDF ; PNG ; JPG et JPEG ; images scannées ; DXF ; DWG lorsque le traitement est techniquement disponible par une solution compatible ; autres formats techniques ultérieurement. Pour chaque format, indiquer clairement les possibilités de visualisation, de modification et d’exportation.

### 9.2. Bibliothèque de plans
Organiser les plans par projet, bâtiment, niveau, lot et version. Chaque plan comporte : nom du fichier ; type de plan ; date d’importation ; auteur ou importateur ; échelle déclarée ; unité ; version ; statut ; commentaires ; historique des modifications.

### 9.3. Visualiseur de plans
Zoom avant et arrière ; déplacement ; rotation, si nécessaire ; ajustement à l’écran ; affichage à l’échelle après calibration ; affichage des dimensions ; mesure de distances ; mesure de surfaces ; ajout d’annotations ; gestion des calques, lorsque le format le permet ; affichage et masquage des éléments ; comparaison de versions.

### 9.4. Calibration de l’échelle
1. L’utilisateur sélectionne deux points. 2. Le logiciel mesure la distance sur le fichier. 3. L’utilisateur saisit la distance réelle. 4. Le logiciel calcule le facteur d’échelle. 5. Les mesures suivantes utilisent ce facteur. 6. L’utilisateur peut vérifier et modifier la calibration.

Le logiciel doit conserver la calibration et l’unité utilisée. **Règle impérative : aucune mesure extraite d’une image ou d’un PDF ne doit être présentée comme exacte tant que l’échelle n’a pas été vérifiée.**

### 9.5. Comparaison des versions
Comparer deux versions d’un plan afin de repérer les modifications visibles et de signaler les zones qui nécessitent une vérification humaine.

## 10. Module 6 — Création et modification de plans 2D

### 10.1. Objectif
Développer un éditeur 2D simple, accessible et évolutif, destiné aux plans de bâtiment et aux documents techniques. L’éditeur ne doit pas prétendre remplacer intégralement un logiciel de CAO professionnel dès la première version.

### 10.2. Outils de dessin
Ligne ; polyligne ; rectangle ; cercle ; arc ; décalage ; déplacement ; copie ; rotation ; suppression ; annulation et rétablissement ; cotation ; texte ; repères ; hachures simples ; alignement ; accrochage aux points ; grille ; gestion des unités ; zoom et déplacement ; calques.

### 10.3. Bibliothèque d’éléments
Murs ; cloisons ; portes ; fenêtres ; escaliers ; poteaux ; poutres représentées en plan ; appareils sanitaires ; mobilier courant ; symboles électriques ; symboles de plomberie ; symboles de ventilation ; repères de coupe ; légendes. Les bibliothèques doivent pouvoir évoluer et être adaptées aux usages des différents pays.

### 10.4. Gestion des calques
Nom ; couleur ; visibilité ; verrouillage ; type de ligne, lorsque pertinent ; regroupement par discipline (architecture, électricité, plomberie, structure, cotations, annotations).

### 10.5. Cotations et unités
Unités métriques : millimètres, centimètres et mètres, selon les paramètres du projet. Les cotations doivent être liées aux éléments lorsque la structure du dessin le permet. Toute cotation modifiée doit rester cohérente avec la géométrie.

### 10.6. Sauvegarde et export
Sauvegarde automatique ; historique des versions ; export PDF ; export DXF lorsque l’éditeur le permet ; impression avec échelle et format de page ; choix de la feuille ; cartouche personnalisable ; légende et informations du projet. Ne pas annoncer l’édition complète des fichiers DWG si cette fonctionnalité n’a pas réellement été implémentée et testée.

## 11. Module 7 — Métrés et calculs de quantités

### 11.1. Objectif
Permettre le calcul, la vérification et l’organisation des quantités nécessaires à la réalisation d’un ouvrage.

### 11.2. Types de métrés
Longueurs (ml) ; surfaces (m²) ; volumes (m³) ; quantités à l’unité ; poids (kg ou t) ; temps de main-d’œuvre (heures ou journées) ; quantités forfaitaires.

### 11.3. Formules de calcul
- Surface rectangulaire = longueur × largeur.
- Volume parallélépipédique = longueur × largeur × hauteur.
- Périmètre rectangulaire = 2 × (longueur + largeur).
- Surface nette d’un mur = surface brute − surfaces des ouvertures prises en compte.
- Volume de béton = longueur × largeur × hauteur, selon la géométrie de l’ouvrage.

Ces formules doivent être complétées par des règles métier configurables.

### 11.4. Règles de métré
Paramétrer : déductions d’ouvertures ; coefficients de pertes ; arrondis ; unités ; règles de regroupement ; quantités forfaitaires ; méthodes de calcul par type d’ouvrage. Chaque règle appliquée doit être visible et modifiable par un utilisateur autorisé.

### 11.5. Fiche de métré
Chaque ligne : référence ; désignation ; localisation ; lot ; formule ; longueur ; largeur ; hauteur ; nombre d’éléments ; quantité calculée ; unité ; source de la mesure ; observations. Le système doit conserver le détail des calculs, pas seulement le résultat final.

### 11.6. Liaison avec les plans
Lorsque cela est techniquement possible, l’utilisateur doit pouvoir sélectionner un élément du plan et créer une mesure associée. Toute quantité calculée automatiquement à partir d’un plan doit être vérifiable et modifiable. Une modification du plan ne doit pas écraser silencieusement les quantités déjà validées : le système doit signaler les éléments potentiellement affectés.

## 12. Module 8 — Assistance IA pour les plans et les métrés

### 12.1. Objectif
Intégrer un assistant IA capable d’aider l’utilisateur à analyser des documents, préparer des quantitatifs et identifier les éléments susceptibles de nécessiter une vérification.

### 12.2. Fonctions souhaitées
Reconnaissance de texte sur les plans et documents ; extraction de dimensions lisibles ; détection assistée de portes, fenêtres et murs ; identification de symboles courants ; proposition de catégories d’ouvrages ; préparation d’un premier quantitatif ; repérage de valeurs manquantes ; détection de doublons potentiels ; comparaison assistée de versions ; génération de descriptions d’ouvrages ; explication des formules ; suggestions d’amélioration du devis.

### 12.3. Fonctionnement obligatoire
Le système doit distinguer clairement : les informations lues directement ; les mesures calculées ; les résultats estimés par l’IA ; les hypothèses proposées ; les données saisies par l’utilisateur ; les éléments vérifiés et validés. L’IA ne doit jamais inventer une dimension manquante et la présenter comme une donnée réelle. Lorsqu’une information est illisible ou absente, elle doit être signalée comme « à confirmer ».

### 12.4. Validation humaine
Avant qu’un quantitatif généré par IA soit intégré à un DQE ou à un devis validé, l’utilisateur doit pouvoir : examiner les résultats ; modifier les quantités ; corriger les désignations ; accepter ou rejeter les suggestions ; consulter les hypothèses ; confirmer la version retenue.

### 12.5. Limites techniques
La reconnaissance de plans complexes doit être développée progressivement. Elle ne doit pas être simulée avec de simples valeurs fictives. Si une fonction IA nécessite un service externe, son coût, ses limites, ses exigences de confidentialité et sa disponibilité doivent être documentés.

## 13. Module 9 — Bibliothèque de matériaux et de prix

### 13.1. Objectif
Créer une base de données de matériaux, de main-d’œuvre, d’équipements et de prestations, exploitable dans les métrés, DQE/BPU et devis.

### 13.2. Catégories de prix
Ciment ; sable ; gravier ; fer à béton ; béton ; parpaings et briques ; bois ; charpente ; couverture ; peinture ; carrelage ; revêtements ; menuiserie bois ; menuiserie aluminium ; vitrerie ; électricité ; plomberie ; climatisation ; étanchéité ; faux plafonds ; cloisons ; quincaillerie ; matériel de chantier ; main-d’œuvre ; location d’équipements ; transport ; prestations spécialisées.

### 13.3. Fiche article
Code article ; désignation ; catégorie ; description ; unité ; prix d’achat ; prix de vente ; fournisseur ; pays ou zone géographique ; date du prix ; devise ; conditions d’achat ; coefficient de perte ; historique des prix ; statut actif ou archivé.

### 13.4. Gestion des prix par pays
Les prix doivent être organisés par pays, ville ou zone géographique lorsque les données le permettent. Le prix d’un matériau au Bénin ne doit pas être automatiquement considéré comme identique à celui de Côte d’Ivoire.

### 13.5. Importation et actualisation
Saisie manuelle ; importation CSV ou Excel ; exportation ; mise à jour en masse ; historique des modifications ; comparaison des prix ; signalement des prix anciens. Les prix ne doivent pas être présentés comme des prix de marché actuels sans source et date de référence.

## 14. Module 10 — DQE, BPU et devis quantitatifs

### 14.1. Objectif
Générer des documents professionnels pour les appels d’offres, études de prix et propositions commerciales.

### 14.2. DQE
Colonnes : N° ; référence ; désignation ; unité ; quantité ; prix unitaire ; montant. Montant de ligne = quantité × prix unitaire. Le total est calculé à partir des lignes du document.

### 14.3. BPU
Référence ; désignation détaillée ; unité ; prix unitaire ; observations, si nécessaire. Le BPU doit pouvoir être relié au DQE pour reprendre les prix unitaires correspondants.

### 14.4. Décomposition des coûts
Pour chaque ouvrage, si nécessaire : matériaux ; main-d’œuvre ; matériel ; transport ; sous-traitance ; pertes et consommables ; frais indirects ; marge. Les calculs doivent être configurables selon la méthode utilisée par l’entreprise.

### 14.5. Présentation des documents
Logo ; nom de l’entreprise ; coordonnées ; client ; projet ; référence ; date ; version ; tableau détaillé ; sous-totaux par lot ; total général ; conditions éventuelles ; signatures, si nécessaires.

### 14.6. Exportation
PDF professionnel ; Excel ou CSV pour les données structurées ; impression ; dupliquer un document ; créer une nouvelle version ; verrouiller une version validée.

## 15. Module 11 — Devis et propositions commerciales

### 15.1. Création d’un devis
À partir d’un DQE ; à partir d’un métré ; à partir d’un modèle ; à partir d’un devis existant ; manuellement.

### 15.2. Informations
Numéro unique ; date d’émission ; date de validité ; client ; projet ; désignations ; quantités ; unités ; prix unitaires ; remises ; taxes applicables ; total HT, si applicable ; taxes calculées ; total TTC, si applicable ; conditions de paiement ; délai d’exécution ; observations ; signature ou zone de validation. Les taxes et mentions légales doivent être paramétrables selon le pays et le statut fiscal de l’entreprise.

### 15.3. Statuts
Brouillon ; en attente de validation ; envoyé ; accepté ; refusé ; expiré ; annulé ; converti en commande ou en contrat, selon les fonctions disponibles.

### 15.4. Gestion commerciale
Génération PDF ; envoi par e-mail ; téléchargement ; historique des versions ; dupliquer ; convertir en facture selon le processus autorisé ; relancer un client ; enregistrer la décision du client. L’envoi d’un document ne doit pas être déclaré réussi si le système n’a pas obtenu de confirmation du service utilisé.

## 16. Module 12 — Facturation et encaissements

### 16.1. Fonctions
Création de factures à partir des documents autorisés ; numérotation contrôlée ; factures d’acompte ; factures intermédiaires ; factures finales ; avoirs, si pris en charge ; échéances ; paiements partiels ; paiements complets ; soldes restants ; historique des encaissements.

### 16.2. Modes de paiement
Espèces, lorsque leur utilisation est légalement autorisée ; virement bancaire ; chèque ; Mobile Money ; paiement en ligne, si un prestataire compatible est intégré ; autres modes configurables. Les paiements Mobile Money ou bancaires doivent utiliser des intégrations autorisées. Ne jamais afficher une transaction comme confirmée sans vérification auprès du système de paiement.

### 16.3. Relances
Le système peut signaler les factures à échéance prochaine, échues, partiellement réglées, totalement réglées. Les relances automatiques doivent être configurables par l’entreprise.

## 17. Module 13 — Dépenses, budget et rentabilité

### 17.1. Dépenses de chantier
Achat de matériaux ; main-d’œuvre ; transport ; location de matériel ; sous-traitance ; carburant ; hébergement et déplacements ; frais administratifs ; autres dépenses. Chaque dépense doit pouvoir être associée à un projet, un lot, un fournisseur et un justificatif.

### 17.2. Comparaison financière
Budget initial ; budget révisé ; coût prévisionnel ; dépenses réelles ; montants facturés ; montants encaissés ; montants restant à payer ; marge prévisionnelle ; marge calculée sur les données disponibles.

### 17.3. Alertes
Dépenses supérieures au budget ; retard d’encaissement ; achat inhabituel ; hausse du coût d’un matériau ; marge inférieure à l’objectif ; dépense sans justificatif. Le logiciel doit distinguer les montants engagés, facturés, payés et encaissés.

## 18. Module 14 — Achats, commandes et stocks

### 18.1. Demandes d’achat
Projet ; lot ; article ; quantité ; unité ; date souhaitée ; demandeur ; fournisseur proposé ; justification.

### 18.2. Commandes fournisseurs
Création d’une commande ; validation selon les droits ; envoi ou export de la commande ; suivi du statut ; réception totale ou partielle ; rapprochement avec la facture fournisseur.

### 18.3. Stocks
Entrées ; sorties ; transferts entre dépôts ; affectation au chantier ; inventaires ; ajustements justifiés ; stock minimum ; alertes de réapprovisionnement. Chaque mouvement doit conserver une trace.

### 18.4. Gestion des unités
Pièce ; sac ; carton ; mètre ; mètre carré ; mètre cube ; kilogramme ; tonne ; litre. Une conversion ne doit être appliquée que si son facteur est connu et validé.

## 19. Module 15 — Planning, équipes et suivi de chantier

### 19.1. Planning
Vue calendrier et vue chronologique des tâches. Chaque tâche : titre ; projet ; lot ; responsable ; date de début ; date de fin ; durée ; statut ; priorité ; dépendances, si nécessaire ; observations.

### 19.2. Statuts des tâches
À faire ; en cours ; en attente ; bloqué ; terminé ; validé.

### 19.3. Suivi journalier
Date ; chantier ; conditions observées ; travaux exécutés ; effectifs présents ; matériaux utilisés ; matériels mobilisés ; incidents ; retards ; observations ; photos ; signature ou validation, selon le processus retenu.

### 19.4. Suivi de l’avancement
Pourcentage d’avancement défini selon une méthode transparente : tâches terminées, quantités exécutées ou pondération validée. Ne pas calculer un avancement réel uniquement à partir d’une estimation IA non vérifiée.

## 20. Module 16 — Gestion documentaire

### 20.1. Documents pris en charge
Plans ; devis ; DQE et BPU ; factures ; bons de commande ; contrats ; rapports ; photos ; comptes rendus ; procès-verbaux ; documents de réception ; fiches techniques ; documents administratifs.

### 20.2. Organisation
Classement par entreprise, projet, lot, type de document, date, auteur, version, statut.

### 20.3. Fonctions
Téléversement ; téléchargement ; prévisualisation selon le format ; recherche ; filtrage ; partage contrôlé ; historique des versions ; gestion des droits ; archivage. Les fichiers doivent être protégés contre les accès non autorisés et les téléchargements publics non intentionnels.

## 21. Module 17 — Rapports et exports
Rapport de chantier ; rapport financier ; rapport des dépenses ; rapport d’avancement ; rapport des achats ; rapport des stocks ; synthèse des devis ; synthèse des factures ; état des paiements ; quantitatif par lot ; DQE/BPU ; comparatif budget prévisionnel/réel. Formats : PDF, XLSX, CSV, impression. Les rapports doivent afficher la date de génération, la période étudiée, le projet concerné et les éventuelles limites des données.

## 22. Module 18 — Assistant IA PLANORA

### 22.1. Objectif
Créer un assistant intégré qui aide l’utilisateur à effectuer ses tâches courantes.

### 22.2. Exemples d’utilisation
« Prépare un DQE à partir de ce quantitatif. » ; « Classe ces dépenses par lot. » ; « Résume les dépenses du chantier. » ; « Identifie les lignes sans prix unitaire. » ; « Compare ces deux versions de devis. » ; « Prépare une première liste de matériaux à commander. » ; « Explique le calcul de ce volume de béton. » ; « Rédige une description professionnelle de ces travaux. » ; « Repère les incohérences possibles dans ce document. »

### 22.3. Règles de fonctionnement
Respecter les permissions de l’utilisateur ; accéder uniquement aux données autorisées ; indiquer les informations manquantes ; expliquer les hypothèses importantes ; distinguer faits, calculs et suggestions ; demander confirmation avant une action importante ; ne pas modifier ou supprimer des données sans autorisation ; ne pas inventer des prix, des dimensions, des devis ou des résultats.

### 22.4. Validation des actions
L’assistant peut préparer une opération, mais l’utilisateur doit pouvoir la vérifier avant son enregistrement définitif. Toute action irréversible doit nécessiter une confirmation explicite.

### 22.5. Coûts et quotas IA
Quotas par abonnement ; suivi de consommation ; limites configurables ; messages en cas de dépassement ; protections contre les requêtes abusives ; possibilité de désactiver certaines fonctions.

## 23. Module 19 — Abonnements et monétisation

### 23.1. Modèle commercial
PLANORA BTP est destiné à être commercialisé sous forme d’abonnement. Les tarifs définitifs doivent être définis après estimation des coûts techniques, des services IA, du stockage et des besoins des clients.

### 23.2. Formules proposées
- **Offre Découverte** : fonctions de base ; nombre de projets limité ; quantité de documents limitée ; quota IA réduit ou nul ; exports limités selon la politique commerciale.
- **Offre Artisan** : gestion des clients ; projets ; devis ; bibliothèque de prix ; dépenses simples ; exports PDF ; quota IA défini.
- **Offre Professionnelle** : gestion avancée des projets ; plans et métrés ; DQE/BPU ; gestion financière ; achats et stocks ; collaboration ; rapports avancés ; exports selon les modules ; quota IA supérieur.
- **Offre Entreprise** : gestion multi-utilisateurs ; permissions avancées ; suivi multi-projets ; gestion documentaire renforcée ; paramétrages avancés ; rapports consolidés ; assistance prioritaire selon le contrat ; quotas et capacités personnalisés.

### 23.3. Paramètres d’abonnement
Abonnement mensuel ; abonnement annuel ; période d’essai, si souhaitée ; changement de formule ; renouvellement ; annulation ; historique de facturation ; gestion des échecs de paiement ; notifications avant échéance. Les limites de chaque offre doivent être configurables depuis l’administration.

### 23.4. Moyens de paiement
Étudier des prestataires adaptés aux pays de lancement pour : Mobile Money ; carte bancaire ; virement ; autres solutions locales disponibles. Le prestataire retenu devra être vérifié pour sa disponibilité réelle dans chaque pays, ses frais et ses conditions contractuelles.

### 23.5. Gestion des restrictions
Lorsqu’un abonnement expire ou qu’un quota est atteint, le système doit appliquer une politique claire. Il est préférable de bloquer les nouvelles opérations payantes tout en préservant un accès raisonnable aux données existantes, selon les conditions contractuelles. Aucune donnée client ne doit être supprimée silencieusement à cause d’un changement d’abonnement.

## 24. Module 20 — Administration de PLANORA BTP

### 24.1. Tableau de bord administrateur
Nombre de comptes ; nombre d’entreprises ; utilisateurs actifs ; abonnements actifs ; abonnements expirés ; revenus enregistrés ; paiements échoués ; consommation IA ; volume de stockage ; incidents techniques ; demandes de support.

### 24.2. Gestion des entreprises
Consulter les comptes professionnels ; modifier les paramètres de plateforme autorisés ; gérer les abonnements ; suspendre un accès en cas de nécessité ; consulter les journaux techniques ; traiter les demandes d’assistance. L’accès au contenu des documents privés doit être strictement limité, justifié et audité.

### 24.3. Gestion des offres
Modifier : le prix ; la périodicité ; les limites de projets ; le nombre d’utilisateurs ; le quota IA ; le stockage ; les fonctionnalités incluses ; les conditions d’essai. Les changements de formule ne doivent pas provoquer de perte de données.

## 25. Module 21 — Notifications
Dans l’application ; par e-mail ; par SMS ou messagerie externe, si une intégration est activée.

Événements : invitation d’un collaborateur ; devis envoyé ou accepté ; facture proche de l’échéance ; paiement enregistré ; tâche en retard ; dépassement de budget ; stock insuffisant ; échec de paiement d’abonnement ; quota IA atteint ; échec d’une opération importante. L’utilisateur doit pouvoir configurer les notifications qu’il souhaite recevoir.

## 26. Exigences techniques

### 26.1. Architecture générale
Application web SaaS multi-entreprises avec séparation stricte des données. Architecture recommandée : frontend React avec TypeScript ; backend Python avec FastAPI, ou une technologie équivalente justifiée ; base PostgreSQL ; stockage objet sécurisé ; file de tâches pour les traitements lourds ; cache selon les besoins mesurés ; déploiement Docker et hébergement adapté ; surveillance (journaux, alertes, suivi des erreurs et disponibilité). Les technologies peuvent être adaptées par le développeur si une justification technique claire est fournie.

### 26.2. Principes de développement
Architecture modulaire ; code maintenable ; API documentée ; gestion des erreurs ; validation des données côté serveur ; tests automatisés ; gestion des migrations de base de données ; environnements séparés de développement, test et production ; variables et secrets protégés ; procédure de sauvegarde et de restauration documentée.

### 26.3. Base de données
Entités : utilisateurs ; entreprises ; rôles ; permissions ; abonnements ; paiements ; clients ; fournisseurs ; projets ; chantiers ; lots ; plans ; versions de plans ; éléments géométriques ; calibrations ; métrés ; lignes de quantitatif ; articles ; prix ; DQE ; BPU ; devis ; factures ; dépenses ; commandes ; stocks ; tâches ; rapports ; documents ; notifications ; journaux d’activité. Les relations doivent garantir la cohérence des données et leur rattachement à la bonne entreprise.

### 26.4. API
API structurées, documentées et sécurisées pour : authentification ; entreprises ; utilisateurs ; projets ; plans ; métrés ; prix ; devis ; factures ; dépenses ; stocks ; documents ; abonnements ; notifications ; assistant IA. Les routes doivent vérifier les permissions et l’appartenance des données à l’entreprise concernée.

### 26.5. Traitements lourds
L’analyse de plans, l’OCR, les exports complexes et les traitements IA doivent pouvoir s’exécuter en arrière-plan. L’interface doit afficher l’état du traitement : en attente ; en cours ; terminé ; échec ; action requise. Un échec doit être signalé sans faire croire que le document a été correctement produit.

## 27. Sécurité et confidentialité

### 27.1. Authentification et permissions
Mots de passe stockés sous forme de hachages sécurisés ; sessions protégées ; permissions vérifiées côté serveur ; protection contre les attaques courantes ; limitation des tentatives abusives ; authentification à deux facteurs, si activée ; révocation des sessions.

### 27.2. Protection des données
HTTPS obligatoire en production ; contrôle des accès aux documents ; isolation des données par entreprise ; sauvegardes chiffrées lorsque possible ; gestion sécurisée des clés et secrets ; durées de conservation définies ; procédure de suppression et d’export des données ; politique de confidentialité ; conditions d’utilisation ; procédure de réponse aux incidents.

### 27.3. Sécurité des fichiers
Vérification des types de fichiers ; limites de taille configurables ; contrôle des accès ; noms de fichiers sécurisés ; protection contre les fichiers malveillants ; liens de partage temporaires lorsque nécessaire ; absence d’accès public non intentionnel.

### 27.4. Traçabilité
Journaux pour les opérations sensibles : connexions ; changements de permissions ; exportations sensibles ; modifications financières ; actions administratives ; suppressions et archivages. La collecte de journaux doit rester proportionnée et documentée.

### 27.5. Conformité
Avant la commercialisation, faire vérifier les obligations applicables dans les pays ciblés concernant : données personnelles ; facturation et fiscalité ; conservation documentaire ; paiements ; conditions commerciales ; hébergement et transfert de données.

## 28. Performance et compatibilité

### 28.1. Appareils
Ordinateurs Windows ; ordinateurs macOS ; tablettes ; smartphones Android ; smartphones iOS.

### 28.2. Navigateurs
Versions récentes des principaux navigateurs, notamment Chrome, Edge, Firefox et Safari.

### 28.3. Responsive design
Les écrans doivent s’adapter à la largeur disponible. Sur mobile, privilégier : la consultation ; la prise de photos ; les observations ; les rapports journaliers ; le suivi des tâches ; la validation de documents ; la consultation des devis et dépenses. Les fonctions de dessin avancé peuvent être optimisées pour ordinateur si une utilisation complète sur téléphone n’est pas raisonnable.

### 28.4. Performance
Affichage rapide des pages courantes ; pagination des grands tableaux ; chargement progressif des fichiers volumineux ; traitements asynchrones pour les opérations lourdes ; absence de recalcul inutile ; indicateurs de progression lors des exports et analyses. Les objectifs précis de performance seront fixés après les premiers tests de charge.

## 29. Application mobile et mode hors ligne
La première version peut être une application web responsive. À moyen terme, prévoir une expérience mobile enrichie, éventuellement sous forme de PWA ou d’application native. Fonctions mobiles utiles : consultation des chantiers ; photos de chantier ; rapports journaliers ; consultation des plans ; notes et observations ; validation de tâches ; consultation des documents. Le mode hors ligne devra être conçu explicitement : données mises en cache, opérations en attente, synchronisation et résolution des conflits. Ne pas présenter une fonctionnalité hors ligne comme opérationnelle si elle n’a pas été développée et testée.

## 30. Exports et qualité des documents

### 30.1. Présentation
Logo de l’entreprise ; en-tête et pied de page ; numéro de page ; références ; dates ; tableaux lisibles ; totaux correctement mis en évidence ; conditions commerciales ; zone de signature ; mise en page adaptée au format A4, avec d’autres formats si nécessaire.

### 30.2. Cohérence des calculs
Les calculs doivent être réalisés côté serveur ou dans un moteur de calcul partagé et testé, afin d’éviter des résultats différents entre les écrans et les exports. Le même document doit présenter des montants cohérents sur l’interface, le PDF, l’export Excel et les rapports. Les arrondis et règles fiscales doivent être centralisés.

### 30.3. Gestion des versions
Les documents validés doivent pouvoir être figés en version. Une modification ultérieure doit produire une nouvelle version ou une révision traçable, et non modifier silencieusement un document déjà envoyé.

## 31. Exigences métier et limites professionnelles
PLANORA BTP est un outil d’aide à la préparation technique et à la gestion. Il ne doit pas présenter tous les résultats comme automatiquement conformes aux normes ou directement exécutables sur chantier. Pour les plans et calculs techniques : les hypothèses doivent être documentées ; les données manquantes doivent être signalées ; les résultats automatiques doivent être vérifiables ; les calculs structurels doivent être validés par un professionnel qualifié ; les installations électriques et hydrauliques doivent être contrôlées selon les exigences applicables ; les plans destinés à l’exécution doivent faire l’objet des validations nécessaires ; les normes doivent être adaptées au pays et au type de projet. Le logiciel doit permettre de distinguer les documents de travail, les documents vérifiés et les documents approuvés.

## 32. Phases de développement
- **Phase 1 — Fondations SaaS** : identité de PLANORA BTP ; inscription et connexion ; entreprises et utilisateurs ; rôles et permissions ; tableau de bord ; clients et fournisseurs ; projets ; gestion documentaire de base ; paramètres de l’entreprise. *Résultat attendu : une application fonctionnelle avec base de données, authentification et gestion réelle des projets.*
- **Phase 2 — Métrés, prix et devis** : bibliothèque de prix ; formules de calcul ; métrés manuels ; DQE ; BPU ; devis ; exports PDF et tableurs ; historique des versions. *Résultat attendu : de vrais quantitatifs et devis avec des calculs vérifiés.*
- **Phase 3 — Plans techniques** : importation de PDF et d’images ; visualiseur ; calibration ; mesures ; annotations ; gestion des versions ; premiers outils de dessin 2D ; export des formats réellement pris en charge.
- **Phase 4 — Intelligence artificielle** : OCR ; extraction de texte et de dimensions ; assistance aux métrés ; suggestions de désignations ; détection d’anomalies ; assistant IA ; gestion des quotas et des coûts.
- **Phase 5 — Gestion opérationnelle** : achats ; stocks ; dépenses ; facturation ; paiements ; planning ; équipes ; rapports de chantier ; rentabilité.
- **Phase 6 — Commercialisation** : abonnements ; paiements ; facturation de la plateforme ; tableau de bord administrateur ; notifications ; assistance utilisateur ; conditions d’utilisation ; politique de confidentialité ; outils de support et de suivi technique.

## 33. Tests et recette
- **Tests fonctionnels** : création et connexion d’un compte ; création d’une entreprise ; gestion des rôles ; création d’un client ; création d’un projet ; importation d’un plan ; calibration d’une image ; calcul d’une surface ; calcul d’un volume ; création d’un DQE ; calcul des totaux ; génération d’un devis ; export PDF ; enregistrement d’une dépense ; enregistrement d’un paiement ; mise à jour d’un stock ; gestion d’un abonnement ; fonctionnement des notifications.
- **Tests de sécurité** : isolation entre entreprises ; contrôle des permissions ; protection des documents ; sécurité des sessions ; résistance aux entrées malveillantes ; fonctionnement des sauvegardes ; procédures de récupération ; actions d’administration.
- **Tests des calculs** : cas de test de référence pour les formules et les montants (exemple : une surface de 5 m × 4 m doit produire 20 m² avant toute déduction) ; unités, conversions, arrondis et règles de déduction.
- **Tests IA** : qualité de lecture des documents ; erreurs de détection ; précision des propositions ; traitement des dimensions manquantes ; traçabilité des hypothèses ; possibilité de corriger les résultats ; comportement sur des plans de qualité médiocre.
- **Recette finale** : chaque module est accepté sur la base de critères écrits. Un module ne peut pas être déclaré terminé si son écran existe mais que ses actions principales ne fonctionnent pas réellement.

## 34. Critères d’acceptation du produit
1. Les utilisateurs peuvent créer un compte et se connecter.
2. Les entreprises disposent d’espaces de données isolés.
3. Les projets et les clients sont enregistrés en base de données.
4. Les plans pris en charge peuvent être importés et consultés.
5. La calibration permet des mesures vérifiables.
6. Les métrés produisent des résultats reproductibles.
7. Les DQE/BPU et devis sont réellement calculés.
8. Les PDF et tableurs sont générés et téléchargeables.
9. Les modifications importantes sont traçables.
10. Les droits d’accès sont vérifiés côté serveur.
11. Les données sont sauvegardées et récupérables.
12. Les abonnements appliquent correctement les limites configurées.
13. Les fonctions IA indiquent les incertitudes et les données manquantes.
14. Les erreurs sont présentées clairement.
15. Les fonctions annoncées correspondent aux fonctions effectivement disponibles.

## 35. Livrables exigés du développeur
Code source complet ; dépôt de code et historique ; schéma de la base de données ; scripts de migration ; documentation des API ; documentation d’installation ; fichiers de configuration d’environnement, sans secrets ; procédures de déploiement ; procédures de sauvegarde et de restauration ; tests automatisés ; instructions de maintenance ; documentation utilisateur ; liste des services externes utilisés ; coûts récurrents estimés ; licences des composants utilisés ; liste des fonctions terminées, partielles et non réalisées ; accès administrateur convenus ; conditions de propriété intellectuelle et de transfert du code.

## 36. Instructions impératives à l’intention de l’IA ou du développeur
1. **Ne pas produire une simple maquette** : chaque fonctionnalité présentée comme opérationnelle doit avoir son fonctionnement réel.
2. **Construire progressivement** : base SaaS solide d’abord, puis modules métier dans l’ordre défini.
3. **Ne pas simuler les résultats** : ne pas inventer les prix, mesures, quantités, factures, paiements, statuts de traitement, résultats de reconnaissance IA, données de chantier. Les exemples de démonstration doivent être identifiés comme tels.
4. **Assurer la cohérence des calculs** : calculs centralisés, documentés et testés ; montant de ligne = quantité × prix unitaire selon les règles d’arrondi définies ; totaux cohérents entre l’écran, les exports et les rapports.
5. **Préserver les données** : aucune perte sans avertissement et mécanisme de protection ; sauvegardes, versions, archivage, restauration.
6. **Documenter les limites** : signaler clairement ce qui n’est pas réalisable dans la version actuelle et proposer une solution progressive.
7. **Respecter l’identité du produit** : PLANORA BTP partout.
8. **Fournir une livraison vérifiable** : à chaque phase, fonctionnalités développées, testées, non terminées, problèmes connus, instructions de test, accès de démonstration si nécessaire, éléments nécessaires à la validation.

## 37. Priorités pour la première version commerciale
- **Priorité 1 — Indispensable** : authentification ; gestion des entreprises ; gestion des clients ; gestion des projets ; bibliothèque de prix ; métrés manuels ; DQE/BPU ; devis ; export PDF ; gestion documentaire ; tableau de bord de base ; permissions ; sauvegardes.
- **Priorité 2 — Différenciation technique** : importation des plans ; calibration ; mesures sur plans ; annotations ; assistant IA pour les documents et les métrés ; exports avancés ; historique des versions.
- **Priorité 3 — Gestion complète** : facturation ; dépenses ; achats ; stocks ; planning ; rapports de chantier ; rentabilité ; notifications.
- **Priorité 4 — Évolution** : éditeur 2D plus complet ; reconnaissance avancée des plans ; collaboration en temps réel ; mode hors ligne ; application mobile dédiée ; intégrations comptables ; bibliothèques de prix enrichies par pays.

Il vaut mieux une première version fiable qu’une application très ambitieuse dont les principales fonctions ne sont pas opérationnelles.

## 38. Conclusion
PLANORA BTP doit relier les plans techniques, les métrés, les quantitatifs, les prix, les devis et la gestion des chantiers. Son avantage repose sur : la **simplicité**, la **fiabilité**, l’**intelligence** (assistance IA utile, transparente et contrôlée) et l’**adaptation au marché** africain.

*PLANORA BTP — Du plan au chantier, tout devient plus simple.*

## Annexe A — Questions à valider avant le développement
1. Budget global disponible. 2. Délai de livraison souhaité. 3. Fonctionnalités de la première version. 4. Nombre d’utilisateurs attendu au démarrage. 5. Pays prioritaires. 6. Solutions de paiement disponibles. 7. Services IA envisagés et leur coût. 8. Formats de plans à prendre en charge en premier. 9. Modèles de documents commerciaux. 10. Règles fiscales à appliquer selon le pays. 11. Besoins d’hébergement et de sauvegarde. 12. Responsabilités de maintenance et d’assistance.

La disponibilité du nom de domaine et la disponibilité juridique de la marque PLANORA BTP devront être vérifiées séparément avant la commercialisation.

## Annexe B — Livrable immédiat attendu
Une application web accessible en environnement de test avec : une page d’accueil PLANORA BTP ; une page d’inscription ; une page de connexion ; un tableau de bord ; la création d’une entreprise ; la création d’un client ; la création d’un projet ; une bibliothèque de prix simple ; un module de métré manuel ; un générateur DQE/BPU ; un générateur de devis ; un export PDF fonctionnel ; une base de données persistante ; une gestion des rôles et permissions ; une documentation de test.

Les plans assistés par IA, la reconnaissance automatique avancée et les fonctions de gestion complète des chantiers pourront être intégrés après validation de cette première livraison.
