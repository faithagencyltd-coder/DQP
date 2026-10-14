# PLANORA BTP — mini-charte graphique

## Logo
Un « P » tracé comme un trait de plan, en blanc sur un carré bleu nuit, souligné d’une ligne de cote
orange. Variante inversée (carré blanc, P bleu nuit) pour les fonds sombres. Lisible dès 16 px
(`public/favicon.svg`, composant `src/ui/Logo.tsx`).

## Couleurs

| Rôle | Nom | Valeur |
|---|---|---|
| Principale | Bleu nuit | `#0f1f38` (variantes `#16294a`, `#1f3a63`) |
| Accent, actions | Orange de signalisation | `#f26a1b` (survol `#d9570f`) |
| Fond | Blanc / gris très clair | `#ffffff` / `#f5f7fa` |
| Texte | Anthracite | `#1b2433`, secondaire `#667085` |
| Traits | Gris clair | `#e3e8ef` |
| Validation | Vert | `#15803d` |
| Avertissement | Ambre | `#b45309` |
| Erreur | Rouge | `#c42b1c` |

L’orange est réservé aux actions principales et aux repères (cotes, état actif) ; les états
(validé, à compléter, erreur) utilisent toujours une couleur **et** un libellé.

## Typographie
Inter (sans-serif), chiffres tabulaires pour les montants et quantités. Titres 22–24 px gras, texte 13,5–14 px.

## Documents PDF
En-tête : logo et coordonnées de l’entreprise à gauche, type de document et références à droite,
filet orange. Tableaux à en-tête bleu nuit, lots sur fond bleu très clair, totaux sur bandeau bleu nuit.
Pied de page : mentions de l’entreprise, « généré par PLANORA BTP », numéro de page.
