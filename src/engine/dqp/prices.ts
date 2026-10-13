// Bibliothèque de prix (§14) : création à partir d'un DQE, recherche de correspondances,
// import / export CSV.

import { formatNumber, newId, normalizeText, normalizeUnit, nowIso } from './format';
import { parseCsv, textOf, numberOf, getCell } from './import/grid';
import type { DqeLine, PriceItem, Project } from './types';

export const CATEGORY_LABEL: Record<PriceItem['category'], string> = {
  ouvrage: 'Ouvrage',
  materiau: 'Matériau',
  main_oeuvre: 'Main-d’œuvre',
  fourniture: 'Fourniture',
  equipement: 'Équipement',
  prestation: 'Prestation',
};

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'en', 'pour', 'a', 'et', 'y', 'compris', 'avec', 'sur', 'sous', 'au', 'aux', 'd', 'l']);

function tokens(s: string): Set<string> {
  return new Set(normalizeText(s).split(' ').filter((t) => t && !STOP.has(t)));
}

/** Similarité de désignations (Jaccard sur les mots significatifs), entre 0 et 1. */
export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface PriceMatch {
  item: PriceItem;
  score: number;
  sameUnit: boolean;
}

export function findMatches(line: Pick<DqeLine, 'designation' | 'unit'>, items: PriceItem[], limit = 5): PriceMatch[] {
  return items
    .map((item) => {
      const sameUnit = !line.unit || !item.unit || normalizeUnit(item.unit) === line.unit;
      const score = similarity(line.designation, item.designation) * (sameUnit ? 1 : 0.6);
      return { item, score, sameUnit };
    })
    .filter((m) => m.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Propose des entrées de bibliothèque à partir des lignes chiffrées d'un projet (sans doublons). */
export function itemsFromProject(project: Project, existing: PriceItem[]): PriceItem[] {
  const known = new Set(existing.map((i) => normalizeText(i.designation) + '|' + i.unit));
  const out: PriceItem[] = [];
  let n = existing.length;
  for (const lot of project.lots)
    for (const s of lot.sections)
      for (const l of s.lines) {
        if (!l.designation || l.unitPrice.value === null || l.unitPrice.value <= 0) continue;
        const key = normalizeText(l.designation) + '|' + l.unit;
        if (known.has(key)) continue;
        known.add(key);
        n++;
        out.push({
          id: newId('pr'),
          code: `P${String(n).padStart(4, '0')}`,
          designation: l.designation,
          unit: l.unit,
          price: l.unitPrice.value,
          supplier: '',
          category: 'ouvrage',
          location: project.info.location,
          updatedAt: nowIso(),
          source: `${project.info.name} — ${lot.name}`,
        });
      }
  return out;
}

const CSV_HEADER = ['Code', 'Désignation', 'Unité', 'Prix', 'Fournisseur', 'Catégorie', 'Localisation', 'Mise à jour'];

export function pricesToCsv(items: PriceItem[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = items.map((i) =>
    [i.code, i.designation, i.unit, formatNumber(i.price, 2).replace(/ /g, ''), i.supplier, CATEGORY_LABEL[i.category], i.location, i.updatedAt.slice(0, 10)]
      .map((v) => esc(String(v)))
      .join(';'),
  );
  return '﻿' + [CSV_HEADER.join(';'), ...rows].join('\r\n');
}

export function pricesFromCsv(text: string): PriceItem[] {
  const grid = parseCsv(text);
  const header = grid.rows.get(1);
  if (!header) return [];
  const col = (re: RegExp) => [...header.values()].find((c) => re.test(normalizeText(textOf(c))))?.col;
  const cCode = col(/^code$/);
  const cDes = col(/^(designation|libelle)/);
  const cUnit = col(/^unite?s?$/);
  const cPrice = col(/^(prix|pu|prix unitaire)/);
  const cSup = col(/^fournisseur/);
  const cCat = col(/^categorie/);
  const cLoc = col(/^(localisation|lieu|ville)/);
  if (!cDes || !cPrice) return [];
  const catByLabel = new Map(Object.entries(CATEGORY_LABEL).map(([k, v]) => [normalizeText(v), k as PriceItem['category']]));
  const out: PriceItem[] = [];
  for (let row = 2; row <= grid.maxRow; row++) {
    const des = textOf(getCell(grid, row, cDes));
    const price = numberOf(getCell(grid, row, cPrice));
    if (!des || price === null) continue;
    out.push({
      id: newId('pr'),
      code: cCode ? String(getCell(grid, row, cCode)?.value ?? '') : '',
      designation: des,
      unit: cUnit ? normalizeUnit(String(getCell(grid, row, cUnit)?.value ?? '')) : '',
      price,
      supplier: cSup ? textOf(getCell(grid, row, cSup)) : '',
      category: (cCat && catByLabel.get(normalizeText(textOf(getCell(grid, row, cCat))))) || 'materiau',
      location: cLoc ? textOf(getCell(grid, row, cLoc)) : '',
      updatedAt: nowIso(),
      source: 'Import CSV',
    });
  }
  return out;
}
