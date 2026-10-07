# DQP — Cahier des charges

Plateforme intelligente d’analyse de projets BTP, métrés, DQE, estimation, dossiers techniques et
conversion de fichiers. *(Version de référence fournie par le porteur du projet.)*

## 1. Vision
Logiciel professionnel installable sur ordinateur pour les professionnels du BTP, de l’architecture, des
études et du métré. DQP ne remplace pas Archicad, Revit ou AutoCAD. Il reçoit un projet déjà conçu,
l’analyse avec des moteurs spécialisés et l’IA, extrait les informations, quantifie, prépare le DQE et
l’estimation, assiste la production de documents techniques et certaines conversions.

**Principe central :** FICHIER → ANALYSE → EXTRACTION → VÉRIFICATION → MÉTRÉ → QUANTIFICATION → DQE → ESTIMATION

## 2. Hors périmètre de la première version
Pas de création automatique de villa, de génération de plan architectural, de dessin libre, de
modélisation 3D ou BIM complète, de bâtiment généré à partir d’une surface, d’architecture par IA ni de
style architectural automatique.

## 3. Fonction principale
Nouveau projet → Importer un fichier (Archicad, Revit, DWG, DXF, PDF, Excel, CSV, selon les formats
réellement supportés) → analyse.

## 4. Analyse intelligente
- **Architecture :** murs, cloisons, portes, fenêtres, pièces, niveaux, escaliers, dalles, plafonds, toitures, terrasses, balcons, locaux, surfaces, dimensions, hauteurs.
- **Équipements :** WC, lavabos, douches, baignoires, éviers, sanitaires, équipements techniques.
- **Électricité :** prises, interrupteurs, luminaires, tableaux, équipements, circuits, longueurs de câbles si déterminables.
- **Plomberie :** appareils, réseaux, arrivées, évacuations, diamètres si disponibles, longueurs si calculables.
- **Structure :** poteaux, poutres, dalles, voiles, fondations, semelles, escaliers, éléments métalliques.

## 5. Type de projet
Détection proposée (villa, immeuble, appartement, hôtel, restaurant, école, bureau, commerce, entrepôt,
administratif, industriel, centre de santé) et corrigeable par l’utilisateur.

## 6. Analyse d’un PDF
Extraire les dimensions, cotations, murs, ouvertures, pièces, textes, surfaces, niveaux, équipements et annotations. Distinguer
l’information réellement présente de l’information estimée ou déduite.

## 7. Système de confiance
🟢 Confirmé (lu dans le fichier) · 🟠 À vérifier (interprété ou déduit) · 🔴 Non déterminé (information insuffisante).

## 8. Tableau de contrôle de l’analyse
Projet analysé, éléments détectés (pièces, portes, fenêtres, escaliers, niveaux…), compteurs 🟢 🟠 🔴, et
contrôle possible de chaque élément.

## 9. Métré automatique
Maçonnerie (longueurs, surfaces, volumes, déduction des ouvertures), carrelage, peinture, menuiserie, béton.

## 10. Formules visibles
Afficher le calcul et pas seulement le résultat. Exemple : longueur × hauteur, ouvertures déduites, surface nette.

## 11. DQE automatique
ÉLÉMENTS → QUANTITÉS → OUVRAGES → LOTS → DQE. Les quantités viennent du moteur de calcul.

## 12. Lots
Installation de chantier, terrassement, fondations, gros œuvre, charpente, couverture, étanchéité,
menuiserie, revêtements, peinture, plomberie, électricité, climatisation, VRD… Pour chaque lot : créer, supprimer,
renommer, déplacer, fusionner, subdiviser.

## 13. Estimation
Quantitatif (quoi et combien) et estimatif (combien cela coûte). Quantité × PU = montant ; somme = total.

## 14. Bibliothèque de prix
Matériaux, main-d’œuvre, fournitures, équipements, prestations. Champs : code, désignation, unité, prix,
fournisseur, catégorie, localisation, date de mise à jour. Modifiable.

## 15. Fichier de référence
Étudier d’abord les données réellement présentes, puis la manière de les exploiter. Ne pas inventer de capacités.

## 16–17. Modifications
Corriger les informations du projet (ex. 24 → 25 portes) avec recalcul du DQE. Modifier la quantité,
l’unité, le prix, la désignation, le coefficient, la perte et l’observation. Toute modification manuelle est identifiable.

## 18. Incohérences
Dimensions incohérentes, quantités impossibles, éléments sans dimensions, prix ou unités manquants, doublons,
lignes sans quantité, quantités sans ouvrage, formules erronées.

## 19. Rapport d’analyse
Informations générales (projet, type, niveaux, surface, fichiers), éléments, métré, alertes.

## 20–21. Plans techniques
Pas de dessin automatique d’un bâtiment. À partir d’un projet existant, DQP assiste les plans électriques,
les schémas de plomberie, les fondations et le plan de masse. Ce sont des propositions à contrôler, modifier, valider et exporter, sans
prétention de conformité automatique aux normes.

## 22. DQP Engineering
Dimensionnement assisté (béton, poteaux, poutres, dalles, escaliers, fondations). Toujours afficher les données, les
hypothèses, la formule, le résultat, le référentiel et les avertissements. Vérification obligatoire par un professionnel qualifié.

## 23–25. DQP Converter
Conversions seulement quand les bibliothèques et licences le permettent. Classement : directe, partielle ou
impossible (avec explication). Jamais de faux fichier par simple changement d’extension. L’IA assiste
(identification, structure, pertes, contrôle) ; la conversion est faite par des moteurs fiables.

## 26–27. Import multiple et croisement
Plusieurs fichiers par projet. Différences détectées entre sources (ex. 24 contre 25 portes) : l’utilisateur décide.

## 28. DQP AI
Couche d’assistance : analyse, interprétation, explication, incohérences, classification, aide au DQE,
conversions. **IA ≠ moteur de calcul.**

## 29. Connexion Internet
Fonctions locales hors ligne. Internet pour l’IA, l’analyse avancée, les mises à jour, la synchronisation, les services
distants et la sauvegarde cloud. Indiquer clairement quand Internet est nécessaire.

## 30–31. Architecture et interface
Modules : Dashboard, Projets, Import, Analyse, Détection, Métré, Quantitatif, DQE, Estimation, Prix, Plans
techniques, Engineering, Converter, Documents, DQP AI, Paramètres. Interface de logiciel de bureau
professionnel : barre supérieure, barre latérale, zone centrale.

## 32. Flux principal
01 Nouveau projet → 02 Importer → 03 Analyser → 04 Vérifier → 05 Métré → 06 DQE → 07 Estimation → 08 Rapport → 09 Exporter.

## 33. Dossier projet
`Fichiers_sources`, `Analyse`, `Metre`, `Quantites`, `DQE`, `Estimation`, `Plans`, `Documents`, `Exports`.

## 34. Windows
Cible Windows 10/11, installation par `DQP Setup.exe`.

## 35. Base de données
Project, SourceFile, BuildingElement, Measurement, Quantity, Lot, WorkItem, Price, DQE, AnalysisResult,
Validation, Conversion, Document, ProjectVersion.

## 36. Règle absolue
Ne jamais faire croire qu’une information a été détectée si elle ne l’a pas été (ex. 🔴 diamètre non déterminé, jamais « Ø32 » sans source).

## 37. Traçabilité
Pour chaque quantité importante : sa source et son calcul.

## 38–39. Exports
DQE Excel (lots, sous-lots, désignations, unités, quantités, PU, montants, totaux) et DQE PDF
professionnel. Rapport : projet, fichiers, éléments, quantités, erreurs, points à vérifier, DQE, estimation, date, version.

## 40. Sécurité et sauvegarde
Sauvegarde automatique, historique, récupération, versionnement, protection des projets, journal des modifications.

## 41. Phases
1 Core · 2 Analyse de fichiers (PDF) · 3 Métré intelligent · 4 Formats BIM/CAO · 5 Plans techniques · 6 Engineering · 7 Converter · 8 DQP AI.

## 42–43. Ce que DQP doit être
Un analyseur intelligent de projets BTP, un moteur de métré, de DQE et d’estimation, des outils techniques et un convertisseur. Pas un nouvel
Archicad, pas un générateur de maisons, pas une IA qui invente des plans.

## 44. Règle de développement
Ne pas tout construire en même temps : d’abord le moteur central, puis les capacités branchées dessus.
Avant de choisir les technologies d’import Archicad, Revit, DWG ou PDF, vérifier pour chaque format ce qui est accessible
techniquement et juridiquement.
