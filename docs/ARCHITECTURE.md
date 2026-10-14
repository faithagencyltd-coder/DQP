# PLANORA BTP — architecture technique

## Choix et justification (§26.1)

Le cahier des charges recommande React + TypeScript, un backend (FastAPI ou équivalent justifié) et PostgreSQL.

| Couche | Choix | Pourquoi |
|---|---|---|
| Interface | React 19, TypeScript, Vite, Tailwind CSS 4 | web responsive (ordinateur, tablette, téléphone), installable sur l’écran d’accueil |
| Données et API | **Supabase** : PostgreSQL + API générée (PostgREST) + fonctions SQL | équivalent justifié à un backend FastAPI : chaque requête passe par PostgreSQL, qui applique les règles d’accès (RLS) ; pas de serveur à maintenir pour démarrer |
| Authentification | Supabase Auth | mots de passe hachés, confirmation d’e-mail, réinitialisation, limitation des tentatives, double authentification TOTP, révocation des sessions |
| Fichiers | Supabase Storage, compartiment privé | liens de téléchargement temporaires, droits vérifiés par la base |
| Calculs | moteur TypeScript partagé `src/engine` | un seul moteur pour l’écran, le PDF et l’Excel (§30.2), testé |
| Hébergement | GitHub Pages (application statique) | gratuit, HTTPS |

Les traitements lourds à venir (OCR, IA, analyse de plans) seront exécutés dans des fonctions serveur
(Supabase Edge Functions) ou un service dédié, avec un suivi d’état « en attente / en cours / terminé / échec ».

## Sécurité : où sont appliquées les règles

Toutes dans la base (`supabase/migrations/`), jamais seulement dans l’interface :

- `can(entreprise, module, action)` : appartenance à l’entreprise, rôle et matrice de permissions,
  offre qui inclut le module, abonnement valide (sinon lecture et export seuls), double authentification.
- Chaque table métier a des règles de lecture, création, modification et suppression basées sur `can`.
- Les colonnes sensibles (offre, échéance, références, verrouillage) ne sont modifiables que par des
  fonctions serveur contrôlées.
- Les fichiers sont rangés sous `<id entreprise>/…` et les règles du stockage vérifient ce dossier.

## Modèle de données

| Table | Contenu |
|---|---|
| `subscription_plans` | offres, prix, limites, modules |
| `organizations`, `members`, `role_permissions`, `invitations`, `profiles`, `platform_admins` | entreprises, membres, matrice des droits |
| `contacts` | clients et fournisseurs |
| `projects`, `project_lots`, `project_members` | projets, lots, équipe |
| `documents` | fichiers (métadonnées, versions, statuts) |
| `price_items`, `price_history` | bibliothèque de prix, historique |
| `metres` | métrés (lignes et règles en JSON, détail recalculable) |
| `quotes`, `quote_versions` | DQE, BPU, devis ; versions figées |
| `billing_requests` | demandes d’abonnement |
| `activity_log`, `counters` | journal, numérotation |

## Arborescence

```
src/engine/      moteur de calcul (métrés, DQE/BPU/devis, déboursé sec, arrondis, CSV, doublons, import Excel)
src/engine/dqp/  analyseur de DQE Excel et de plans PDF repris de DQP (phase 3)
src/docs/        génération PDF et Excel
src/lib/         accès aux données, session, permissions, libellés
src/ui/          composants d’interface
src/pages/       écrans
supabase/        migrations et tests de sécurité
scripts/         pile de test locale et recette de bout en bout
```
