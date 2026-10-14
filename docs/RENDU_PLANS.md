# PLANORA BTP — plans 2D et rendus de présentation

Demande du porteur du projet (14/10/2026) : transformer un plan 2D (comme ceux reçus des clients) en
rendu 2D professionnel et élégant, en deux modes : **rendu fidèle** et **rendu par IA**.

## 1. Parcours

1. **Plans techniques → Nouveau plan** : nom, niveau, type, projet ; fichier facultatif (PDF, PNG, JPG, WEBP).
2. **Échelle** (si un fichier est importé) : cliquer deux points d’une cote connue, saisir la distance réelle.
   Avant cela, toutes les mesures portent « ≈ » et un bandeau le rappelle (règle §9.4).
3. **Dessin** : murs (épaisseur réelle), cloisons, portes, fenêtres ; pièces détectées d’un clic (ou tracées
   point par point) ; mobilier proposé puis ajusté ; cotes et textes. Sauvegarde automatique.
4. **Rendu** : choix du style, aperçu en direct, export PNG / PDF à l’échelle / DXF, ou enregistrement du PDF
   dans les documents du projet.
5. **Rendu IA** (facultatif) : choix de la source et de l’ambiance, génération, visualisation, téléchargement.

## 2. Rendu fidèle (mode principal)

Calculé uniquement à partir du dessin : les murs, ouvertures, pièces, surfaces et cotes affichés sont
exactement ceux du plan. Rien n’est inventé :

- surfaces = polygone de chaque pièce (entre les faces intérieures des murs) ;
- cotes automatiques = entraxes des murs par façade et dimensions hors tout, recalculées à chaque
  modification ; elles ne peuvent pas être saisies à la main ;
- sans échelle vérifiée, les valeurs portent « ≈ » et le cartouche l’indique ;
- le PDF est posé à une échelle normalisée (1/50, 1/100…) indiquée dans le cartouche (impression à 100 %).

Gratuit, instantané, fonctionne sur téléphone ; aucune donnée n’est envoyée à un tiers.

## 3. Rendu par IA (option)

### Fonctionnement

- Source recommandée : le **rendu fidèle sans aucun texte** (image envoyée au format 1536 × 1024,
  1024 × 1536 ou 1024 × 1024). La consigne demande de conserver murs, ouvertures, pièces et mobilier,
  de ne rien ajouter ni déplacer et de **n’écrire aucun texte**.
- Les noms, surfaces et cotes affichés sur l’image IA sont **posés ensuite par PLANORA**, à partir du dessin,
  dans le même cadre que l’image d’entrée : ils sont exacts même si l’IA en écrit de mauvais (problème
  visible sur les rendus IA classiques, où les cotes deviennent illisibles).
- Source possible : le fichier importé tel quel. L’IA aménage alors les pièces à sa façon ; PLANORA ne
  peut poser ni noms ni cotes. L’écran le signale.
- Toute image IA, à l’écran comme téléchargée, porte la mention :
  « Illustration générée par IA — non contractuelle. Seules les cotes du plan technique font foi. »

### Ce que l’IA peut mal faire (limites)

Un modèle d’images peut déformer légèrement un mur, changer un meuble, ajouter un détail. C’est pour cela
que le résultat reste une illustration commerciale, jamais un document technique. Le rendu fidèle est le
seul document à utiliser pour des cotes, des quantités ou un devis.

### Coûts, quotas et protection contre les abus (§22.5)

| Élément | Règle |
|---|---|
| Coût d’un rendu | 10 unités IA (une question à l’assistant, phase 4, coûtera 1 unité) |
| Quotas mensuels (modifiables dans Administration → Offres) | Découverte 0 · Artisan 50 · Professionnelle 300 (30 rendus) · Entreprise 1 500 (150 rendus) |
| Module Plans | inclus dans Professionnelle et Entreprise (modifiable par l’administration) |
| Réservation | les unités sont réservées à la demande, consommées au succès, **restituées à l’échec** ou si la demande est abandonnée (15 min) |
| Simultanéité | 3 rendus en cours au plus par entreprise |
| Traçabilité | chaque demande est inscrite au journal ; consommation du mois visible dans l’administration |
| Coût fournisseur indicatif (à vérifier au moment de l’ouverture du compte) | OpenAI `gpt-image-1` en qualité haute : de l’ordre de 0,15 à 0,25 $ par image ; Google `gemini-2.5-flash-image` : de l’ordre de 0,04 $ par image |

Avec ces ordres de grandeur, 30 rendus/mois (offre Professionnelle) coûtent environ 1 à 8 $ selon le
fournisseur, à comparer au prix de l’offre (29 900 FCFA). Les quotas sont à ajuster après les premiers mois.

### Confidentialité

- L’image envoyée au fournisseur est le plan (rendu fidèle ou fichier importé) ; aucune autre donnée du
  client (nom, adresse, montants) n’est transmise.
- La clé du fournisseur est un secret du serveur (Supabase) : elle n’est jamais envoyée au navigateur.
- Les images d’entrée et de sortie restent dans le stockage privé de l’entreprise ; elles sont supprimées
  avec le rendu ou avec le plan.
- Les conditions d’utilisation des données du fournisseur choisi (conservation, entraînement) doivent être
  vérifiées et mentionnées dans la politique de confidentialité avant l’ouverture au public.

### Disponibilité

Si la clé n’est pas configurée ou si le fournisseur ne répond pas, la demande passe en « Échec » avec un
message clair et les unités sont restituées ; aucun résultat n’est simulé.

## 4. Formats

| Format | Visualiser | Modifier | Exporter |
|---|---|---|---|
| PDF (vectoriel ou scanné) | ✅ (page au choix) | dessin par-dessus | — |
| PNG, JPG, WEBP | ✅ | dessin par-dessus | — |
| Dessin PLANORA | ✅ | ✅ | PNG, PDF à l’échelle, DXF |
| DXF | — | — | ✅ (export) |
| DWG | ❌ non pris en charge : exporter le plan en PDF depuis le logiciel de DAO | | |
