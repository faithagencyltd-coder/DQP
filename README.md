# PLANORA BTP

**Du plan au chantier, tout devient plus simple.**

Plateforme SaaS de métrés, DQE / BPU, devis et gestion de chantiers pour les professionnels du BTP —
Bénin et Côte d’Ivoire, en FCFA. Application web utilisable sur ordinateur, tablette et téléphone.

- Cahier des charges : [`docs/CAHIER_DES_CHARGES_PLANORA.md`](docs/CAHIER_DES_CHARGES_PLANORA.md)
- **État des fonctions** (terminées, partielles, à venir) : [`docs/ETAT_DES_FONCTIONS.md`](docs/ETAT_DES_FONCTIONS.md)
- Tests et recette : [`docs/TESTS.md`](docs/TESTS.md)
- Installation, Supabase, publication, sauvegardes : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md)
- Architecture : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Charte : [`docs/CHARTE_GRAPHIQUE.md`](docs/CHARTE_GRAPHIQUE.md)

## Version 0.1.0 — livraison immédiate (annexe B)

Page d’accueil, inscription avec confirmation d’e-mail, connexion, création d’entreprise, tableau de bord,
clients et fournisseurs, projets et lots, bibliothèque de prix avec déboursé sec, métré manuel, DQE / BPU,
devis avec versions verrouillées, exports PDF et Excel, gestion documentaire, équipe et matrice de permissions,
double authentification, abonnements et administration de la plateforme.

## Version 0.2.0 — plans 2D et rendus de présentation

Import d’un plan (PDF, image), calibration, éditeur 2D (murs, portes, fenêtres, pièces détectées d’un clic,
mobilier, cotes), **rendu fidèle** élégant (4 styles, textures, ombres, noms, surfaces, cotes exactes ; PNG,
PDF à l’échelle, DXF), métré tiré du plan, et **rendu par IA** en option (quota mensuel, noms et cotes exacts
posés par PLANORA, mention « illustration non contractuelle »). Détails : [`docs/RENDU_PLANS.md`](docs/RENDU_PLANS.md).

Les modules des phases suivantes (assistant IA, facturation, achats, stocks, planning) apparaissent
dans le menu avec la mention « bientôt » et ne sont pas simulés.

## Règles appliquées dans le code

- **Aucune donnée inventée** : une quantité, un prix ou une dimension absente reste « à compléter » et n’est
  jamais comptée pour zéro en silence.
- **Calculs centralisés** : `src/engine` calcule pour l’écran, le PDF et l’Excel ; des tests vérifient que les
  trois donnent les mêmes montants.
- **Droits vérifiés par le serveur** : les règles d’accès sont dans PostgreSQL (RLS) ; changer une adresse ou
  un identifiant ne donne accès à rien.
- **Traçabilité** : journal des opérations, historique des prix, versions des documents chiffrés.

## Démarrer

```bash
npm install
cp .env.example .env.local     # adresse et clé publiable du projet Supabase
npm run dev
npm test && npm run typecheck  # moteur, PDF, Excel, import, plans, fonction rendu IA
```

L’ancienne application de bureau DQP reste disponible dans la branche `dqp-desktop` (version 0.4.0).
