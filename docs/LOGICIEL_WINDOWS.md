# PLANORA BTP — logiciel installable pour Windows (version d’essai)

PLANORA BTP s’installe sur un ordinateur Windows (10 ou 11, 64 bits) comme un logiciel classique.
Il fonctionne **sans Internet** : la base de données est incluse et vos données restent sur votre
ordinateur. Aucun serveur ni service en ligne n’est nécessaire.

## Installer

1. Récupérez le fichier `PLANORA-BTP-Installation-0.3.0.exe`, environ 90 Mo, de l’une de ces façons :
   - il vous a été envoyé directement ;
   - ou vous le téléchargez depuis la page **Releases** (versions) du dépôt GitHub ;
   - ou vous le téléchargez depuis l’onglet **Actions** du dépôt, construction « PLANORA BTP — logiciel Windows », section *Artifacts*.
2. Double-cliquez sur le fichier. Windows peut afficher « Windows a protégé votre ordinateur », parce que
   le logiciel n’est pas encore signé numériquement. Cliquez alors sur **Informations complémentaires**,
   puis sur **Exécuter quand même**.
3. Suivez l’assistant, en français : choix du dossier, raccourci sur le bureau et dans le menu Démarrer.
4. Ouvrez **PLANORA BTP** depuis le raccourci.

## Premier lancement

- La préparation de la base prend quelques secondes au premier démarrage.
- **Comptes d’essai** (mot de passe `Demo2026`) :
  - `demo@planora.bj` : propriétaire et administrateur ;
  - `conducteur@planora.bj` : droits limités.
- Vous pouvez aussi **créer votre propre compte** : il est validé tout de suite, sans e-mail.

## Vos données

- **Emplacement** : elles sont enregistrées dans votre profil Windows (`%APPDATA%\PLANORA BTP`). Le menu
  *Aide → Dossier des données* ouvre ce dossier.
- **Sauvegarde** : avec le bouton **Sauvegarder les données** (bandeau en haut), vous obtenez un fichier
  `.planora`. Conservez-le hors de l’ordinateur (clé USB, autre ordinateur). Faites-le régulièrement.
- **Restauration** : avec **Restaurer une sauvegarde**, vous remplacez les données actuelles par celles
  d’une sauvegarde. Le fichier est vérifié avant tout remplacement : un fichier invalide est refusé et
  vos données restent intactes.
- **Mise à jour** : installez simplement la nouvelle version par-dessus l’ancienne. La base est mise à jour
  automatiquement, sans effacer vos données. Une base enregistrée par une version plus récente que le
  logiciel installé est refusée, et elle n’est pas modifiée.
- **Désinstallation** : elle n’efface pas vos données.

## Limites de cette version d’essai

- **Un seul ordinateur, une seule fenêtre** : les données ne sont pas partagées entre plusieurs postes.
  Le travail à plusieurs, sur des données partagées, viendra avec la version en ligne.
- **Fonctions indisponibles** : le rendu IA des plans, l’envoi d’e-mails et le paiement en ligne.
- **Logiciel non signé** : d’où l’avertissement de Windows au premier lancement.

## Construire l’installeur (développeurs)

```bash
npm ci
npm run build:desktop        # sous Windows ; sous Linux : PATH=/usr/lib/wine:$PATH (Wine requis)
xvfb-run -a node scripts/desktop/smoke.mjs /tmp/recette-logiciel   # recette (Linux) ; sous Windows sans xvfb-run
```

Le fichier `.github/workflows/logiciel.yml` construit et vérifie l’installeur sur un vrai Windows
(lancement manuel, ou étiquette `v…`, qui publie aussi la version).
