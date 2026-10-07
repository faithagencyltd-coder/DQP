// Détection du type de projet (§5) à partir de textes trouvés dans les fichiers.
// Résultat toujours « à vérifier » : c'est une déduction, l'utilisateur corrige.

import { normalizeText } from '../format';

export const PROJECT_TYPES = [
  'Villa',
  'Immeuble résidentiel',
  'Appartement',
  'Hôtel',
  'Restaurant',
  'École',
  'Bureaux',
  'Commerce',
  'Entrepôt',
  'Bâtiment administratif',
  'Bâtiment industriel',
  'Centre de santé',
  'Autre',
];

const RULES: [RegExp, string][] = [
  [/\bvilla\b/, 'Villa'],
  [/\b(immeuble|residence r ?\+ ?\d|r ?\+ ?[2-9]\d*|logements collectifs)\b/, 'Immeuble résidentiel'],
  [/\bresidence\b/, 'Immeuble résidentiel'],
  [/\bappartement/, 'Appartement'],
  [/\b(hotel|auberge|motel)\b/, 'Hôtel'],
  [/\b(restaurant|maquis)\b/, 'Restaurant'],
  [/\b(ecole|college|lycee|universite|salle de classe|epp|ceg)\b/, 'École'],
  [/\bbureaux?\b/, 'Bureaux'],
  [/\b(commerce|boutique|magasin|supermarche|marche)\b/, 'Commerce'],
  [/\b(entrepot|hangar|depot)\b/, 'Entrepôt'],
  [/\b(mairie|prefecture|ministere|administratif|administration)\b/, 'Bâtiment administratif'],
  [/\b(usine|industriel|atelier)\b/, 'Bâtiment industriel'],
  [/\b(centre de sante|dispensaire|clinique|hopital|maternite|csc|cs)\b/, 'Centre de santé'],
];

export function detectProjectType(text: string): { type: string; keyword: string } | null {
  const n = normalizeText(text);
  for (const [re, type] of RULES) {
    const m = re.exec(n);
    if (m) return { type, keyword: m[0] };
  }
  return null;
}
