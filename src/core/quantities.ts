// Quantités principales d'un projet, regroupées par nature d'ouvrage (béton, maçonnerie,
// carrelage…), à partir des lignes réelles du DQE. Chaque total garde ses lignes sources.

import { detectElements } from './classify';
import type { ProjectResult } from './dqe';
import { worstOf } from './dqe';
import { normalizeText } from './format';
import type { Confidence, Project } from './types';

export interface MainQuantity {
  id: string;
  label: string;
  unit: string;
  value: number;
  lines: string[];
  /** Lignes concernées dont la quantité n'est pas déterminée (non comptées). */
  missing: number;
  status: Confidence;
}

const GROUPS: { id: string; label: string; unit: string; test: (designation: string, element?: string) => boolean }[] = [
  { id: 'beton', label: 'Béton', unit: 'm³', test: (d) => /\bbeton\b/.test(d) },
  { id: 'maconnerie', label: 'Maçonnerie', unit: 'm²', test: (_d, el) => el === 'Murs (maçonnerie)' },
  { id: 'enduits', label: 'Enduits', unit: 'm²', test: (_d, el) => el === 'Enduits' },
  { id: 'carrelage', label: 'Carrelage', unit: 'm²', test: (_d, el) => el === 'Carrelage / revêtements' },
  { id: 'peinture', label: 'Peinture', unit: 'm²', test: (_d, el) => el === 'Peinture' },
  { id: 'faux-plafond', label: 'Faux plafonds', unit: 'm²', test: (_d, el) => el === 'Faux plafonds' },
  { id: 'couverture', label: 'Couverture', unit: 'm²', test: (_d, el) => el === 'Couverture' || el === 'Charpente' },
  { id: 'terrassement', label: 'Terrassement', unit: 'm³', test: (_d, el) => el === 'Terrassements' },
  { id: 'portes', label: 'Portes', unit: 'u', test: (_d, el) => el === 'Portes' },
  { id: 'sanitaire', label: 'Appareils sanitaires', unit: 'u', test: (_d, el) => ['WC', 'Lavabos / vasques', 'Douches', 'Baignoires', 'Éviers'].includes(el ?? '') },
  { id: 'electricite', label: 'Points électriques', unit: 'u', test: (_d, el) => ['Prises', 'Interrupteurs / boutons', 'Luminaires'].includes(el ?? '') },
  { id: 'clim', label: 'Climatiseurs', unit: 'u', test: (_d, el) => el === 'Climatiseurs' },
];

const COUNT = new Set(['u', 'ens']);

export function mainQuantities(project: Project, result: ProjectResult): MainQuantity[] {
  const byLine = new Map<string, string>();
  for (const e of detectElements(project, result)) for (const l of e.lines) byLine.set(l.id, e.element);
  const out: MainQuantity[] = [];
  for (const g of GROUPS) {
    const q: MainQuantity = { id: g.id, label: g.label, unit: g.unit, value: 0, lines: [], missing: 0, status: 'confirmed' };
    for (const lot of project.lots)
      for (const s of lot.sections)
        for (const l of s.lines) {
          const unitOk = g.unit === 'u' ? COUNT.has(l.unit) : l.unit === g.unit;
          if (!unitOk || !g.test(normalizeText(l.designation), byLine.get(l.id))) continue;
          const r = result.lines.get(l.id)!;
          q.lines.push(l.id);
          if (r.retained === null) q.missing++;
          else q.value += r.retained;
          q.status = worstOf(q.status, r.quantityStatus);
        }
    if (q.lines.length) out.push(q);
  }
  return out;
}
