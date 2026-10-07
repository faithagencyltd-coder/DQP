// Reconnaissance des éléments du projet à partir des désignations du DQE (§4).
// C'est une interprétation par mots-clés : chaque élément garde la liste des lignes
// qui le composent, pour que l'utilisateur puisse contrôler le classement.

import type { ProjectResult } from './dqe';
import { worstOf } from './dqe';
import { normalizeText } from './format';
import type { Confidence, Project } from './types';

export type Family = 'Architecture' | 'Menuiserie' | 'Sanitaire' | 'Électricité' | 'Climatisation' | 'Structure' | 'Maçonnerie' | 'Revêtements' | 'Toiture' | 'Assainissement / VRD';

interface Rule {
  element: string;
  family: Family;
  include: RegExp;
  exclude?: RegExp;
}

const RULES: Rule[] = [
  { element: 'Portails', family: 'Menuiserie', include: /\bportails?\b/ },
  { element: 'Portes', family: 'Menuiserie', include: /\bportes?\b/, exclude: /\bporte (serviette|savon|papier|manteau)|portail/ },
  { element: 'Fenêtres / baies', family: 'Menuiserie', include: /\b(fenetres?|baies?|naco|chassis|vitrages?)\b/ },
  { element: 'Grilles de protection', family: 'Menuiserie', include: /\bgrilles?\b/ },
  { element: 'Garde-corps / rampes', family: 'Menuiserie', include: /\b(garde corps|rampes? d escalier|main courante)\b/ },
  { element: 'WC', family: 'Sanitaire', include: /\b(wc|w c|cuvettes?|toilettes?)\b/ },
  { element: 'Lavabos / vasques', family: 'Sanitaire', include: /\b(lavabos?|vasques?)\b/, exclude: /\b(tablette|glass|miroir)\b/ },
  { element: 'Douches', family: 'Sanitaire', include: /\bdouches?\b/ },
  { element: 'Baignoires', family: 'Sanitaire', include: /\bbaignoires?\b/ },
  { element: 'Éviers', family: 'Sanitaire', include: /\beviers?\b/ },
  { element: 'Siphons de sol', family: 'Sanitaire', include: /\bsiphons?\b/ },
  { element: 'Robinets', family: 'Sanitaire', include: /\brobinets?\b/ },
  { element: 'Accessoires sanitaires', family: 'Sanitaire', include: /\b(porte serviette|porte savon|porte papier|glass|miroir|tablette)\b/ },
  { element: 'Câblage / filerie', family: 'Électricité', include: /\b(filerie|cables?|fourreautage|conduits?)\b/ },
  { element: 'Prises', family: 'Électricité', include: /\bprises?\b/ },
  { element: 'Interrupteurs / boutons', family: 'Électricité', include: /\b(interrupteurs?|boutons?|va et vient)\b/ },
  { element: 'Luminaires', family: 'Électricité', include: /\b(lampes?|lample|lustres?|spots?|appliques?|plafonniers?|reglettes?|hublots?|luminaires?|baes)\b/ },
  { element: 'Tableaux électriques', family: 'Électricité', include: /\btableaux?\b/ },
  { element: 'Interphonie / sonnerie', family: 'Électricité', include: /\b(interphones?|moniteurs?|sonneries?|cameras?)\b/ },
  { element: 'Climatiseurs', family: 'Climatisation', include: /\b(climatiseurs?|split)\b/ },
  { element: 'Extracteurs / ventilation', family: 'Climatisation', include: /\b(extracteurs?|ventilateurs?|vmc)\b/ },
  { element: 'Carrelage / revêtements', family: 'Revêtements', include: /\b(carreaux|carrelage|faience|plinthes?|pierres?)\b/ },
  { element: 'Peinture', family: 'Revêtements', include: /\b(peintures?|badigeon|enduit lisse|grattage|poncage|vernis)\b/ },
  { element: 'Faux plafonds', family: 'Revêtements', include: /\b(faux plafonds?|staff)\b/ },
  { element: 'Fondations', family: 'Structure', include: /\b(semelles?|fondations?|amorces?|chainages? bas|beton de proprete|longrines?)\b/ },
  { element: 'Poteaux', family: 'Structure', include: /\bpoteaux?\b/, exclude: /\bamorces?\b/ },
  { element: 'Poutres / chaînages', family: 'Structure', include: /\b(poutres?|chainages?|linteaux?)\b/, exclude: /\bchainages? bas\b/ },
  { element: 'Dalles / planchers', family: 'Structure', include: /\b(dalles?|planchers?|dallage|nervures?|hourdis|corps creux)\b/, exclude: /\bdalle minerale\b/ },
  { element: 'Escaliers', family: 'Structure', include: /\bescaliers?\b/, exclude: /\brampe\b/ },
  { element: 'Murs (maçonnerie)', family: 'Maçonnerie', include: /\b(murs?|agglos?|parpaings?|cloisons?|briques?)\b/ },
  { element: 'Enduits', family: 'Maçonnerie', include: /\b(enduits?|crepis?)\b/ },
  { element: 'Terrassements', family: 'Maçonnerie', include: /\b(fouilles?|remblais?|deblais?|terrassements?)\b/ },
  { element: 'Charpente', family: 'Toiture', include: /\bcharpente\b/ },
  { element: 'Couverture', family: 'Toiture', include: /\b(couverture|faitieres?|toles?|tuiles?)\b/ },
  { element: 'Étanchéité', family: 'Toiture', include: /\b(etancheite|chape etanche)\b/ },
  { element: 'Ouvrages d’assainissement', family: 'Assainissement / VRD', include: /\b(fosses?|puisards?|regards?|caniveaux?|evacuations?)\b/ },
];

export interface DetectedElement {
  element: string;
  family: Family;
  unit: string;
  quantity: number;
  lines: { id: string; designation: string; quantity: number | null }[];
  status: Confidence;
}

/** Classe chaque ligne dans le PREMIER élément dont les mots-clés correspondent. */
export function detectElements(project: Project, result: ProjectResult): DetectedElement[] {
  const map = new Map<string, DetectedElement>();
  for (const lot of project.lots)
    for (const s of lot.sections)
      for (const l of s.lines) {
        const n = normalizeText(l.designation).replace(/\+/g, ' ');
        const rule = RULES.find((r) => r.include.test(n) && !(r.exclude && r.exclude.test(n)));
        if (!rule) continue;
        const r = result.lines.get(l.id)!;
        const key = `${rule.element}|${l.unit}`;
        const e = map.get(key) ?? { element: rule.element, family: rule.family, unit: l.unit, quantity: 0, lines: [], status: 'confirmed' as Confidence };
        e.quantity += r.quantity ?? 0;
        e.lines.push({ id: l.id, designation: l.designation, quantity: r.quantity });
        e.status = worstOf(e.status, r.quantityStatus);
        map.set(key, e);
      }
  const order = RULES.map((r) => r.element);
  return [...map.values()].sort((a, b) => order.indexOf(a.element) - order.indexOf(b.element));
}

/** Niveaux et zones mentionnés dans la structure du DQE. */
export function detectStructure(project: Project): { zones: string[]; levels: string[] } {
  const zones = new Set<string>();
  const levels = new Set<string>();
  const LEVEL = /\b(rez de chaussee|rdc|r\+\d+|\d+ ?(er|e|eme) etage|etage|sous sol|niveau|mezzanine|combles?)\b/;
  for (const lot of project.lots)
    for (const s of lot.sections)
      for (const part of [...s.path, s.title]) {
        const clean = part.replace(/^\s*([IVXLC]+|[A-Z]|\d+)\s*[-–.)]\s*/, '').trim();
        const n = normalizeText(clean);
        if (LEVEL.test(n)) levels.add(clean.toUpperCase());
        else if (/^(batiment|amenagement|bloc|annexe)/.test(n)) zones.add(clean.toUpperCase());
      }
  return { zones: [...zones], levels: [...levels] };
}
