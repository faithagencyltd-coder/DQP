# PLANORA BTP — installation et déploiement

## Services utilisés

| Service | Rôle | Coût |
|---|---|---|
| Supabase (PostgreSQL, authentification, stockage) | base de données, comptes, fichiers, règles d’accès | gratuit pour démarrer (2 projets actifs par compte), Pro ≈ 25 $/mois |
| GitHub Pages | hébergement de l’application web (fichiers statiques) | gratuit (dépôt public) |
| GitHub Actions | tests et publication automatiques | gratuit (dépôt public) |

## 1. Créer le projet Supabase

1. Sur supabase.com, créer un projet dédié « planora-btp » (région Europe de l’Ouest, la plus proche de
   l’Afrique de l’Ouest). Ne pas réutiliser le projet d’une autre application : les comptes seraient partagés.
2. Appliquer les migrations, dans l’ordre, depuis `supabase/migrations/` (SQL Editor, ou `supabase db push`).
3. Déclarer l’administrateur de la plateforme (adresse confirmée) :
   `insert into public.platform_admins (email) values ('votre@adresse');`
4. Authentication → URL Configuration : *Site URL* = adresse de l’application
   (ex. `https://<compte>.github.io/DQP/`), et l’ajouter aux *Redirect URLs*.
5. Authentication → Providers → Email : confirmation d’e-mail activée ; longueur minimale du mot de passe 8.
6. Pour la production : configurer un service SMTP (le service intégré est limité à quelques courriels par heure).

## 2. Publier l’application

Dans le dépôt GitHub : Settings → Secrets and variables → Actions → **Variables** :
- `SUPABASE_URL` = `https://<projet>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` = la clé publiable (`sb_publishable_…`). Elle est faite pour être publique ;
  les données sont protégées par les règles de la base. **Ne jamais y mettre la clé `service_role`.**

Puis Settings → Pages → Source : **GitHub Actions**. Chaque envoi sur `main` lance les tests puis publie le site.

## 3. Développer en local

```bash
npm install
cp .env.example .env.local   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
npm test && npm run typecheck
```

## Sauvegarde et restauration

- Supabase réalise une sauvegarde quotidienne (7 jours sur l’offre Pro ; restauration à un instant précis en option).
- Export manuel complet : `pg_dump` avec la chaîne de connexion du projet (Settings → Database).
- Les fichiers sont dans le compartiment privé `documents` (un dossier par entreprise).
- Restauration : recréer le projet, appliquer les migrations ou restaurer le `pg_dump`, recopier le compartiment.

## Coûts récurrents estimés (démarrage)

Supabase gratuit puis Pro (≈ 25 $/mois), nom de domaine (≈ 15 $/an), service de courriel (gratuit jusqu’à quelques
milliers de courriels/mois chez la plupart des fournisseurs). Services IA et paiement : à chiffrer lors des phases 4 et 6.
