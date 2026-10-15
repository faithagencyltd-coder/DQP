// Métrés (§11) : chaque ligne garde ses dimensions, sa formule, ses déductions et les
// étapes du calcul. Une dimension absente n'est JAMAIS devinée : la quantité reste
// non déterminée et la ligne indique ce qui manque.

import { evaluate, ExprError, variablesOf } from './expr';
import { formatNumber, roundTo } from './money';
import { normalizeUnit } from './units';

export type MetreFormula = 'unite' | 'longueur' | 'surface' | 'volume' | 'perimetre' | 'mur' | 'forfait' | 'libre';

export const FORMULAS: Record<MetreFormula, { label: string; expression: string; unit: string; dims: ('L' | 'l' | 'H' | 'N')[] }> = {
  unite: { label: 'Nombre d’éléments', expression: 'N', unit: 'u', dims: ['N'] },
  longueur: { label: 'Longueur', expression: 'L × N', unit: 'ml', dims: ['L', 'N'] },
  surface: { label: 'Surface rectangulaire', expression: 'L × l × N', unit: 'm²', dims: ['L', 'l', 'N'] },
  volume: { label: 'Volume parallélépipédique', expression: 'L × l × H × N', unit: 'm³', dims: ['L', 'l', 'H', 'N'] },
  perimetre: { label: 'Périmètre rectangulaire', expression: '2 × (L + l) × N', unit: 'ml', dims: ['L', 'l', 'N'] },
  mur: { label: 'Surface nette de mur', expression: 'L × H × N − ouvertures', unit: 'm²', dims: ['L', 'H', 'N'] },
  forfait: { label: 'Quantité forfaitaire', expression: 'quantité saisie', unit: 'ff', dims: [] },
  libre: { label: 'Formule libre', expression: '', unit: '', dims: [] },
};

export const DIM_LABEL = { L: 'longueur', l: 'largeur', H: 'hauteur', N: 'nombre' } as const;

/**
 * Origine d'une quantité (prompt maître, partie E) : une quantité estimée ou reconnue sur un plan
 * n'a pas la même valeur qu'une quantité calculée à partir de dimensions relevées.
 */
export type QtyOrigin = 'calcule' | 'reconnu' | 'estime' | 'saisi';
export const ORIGIN_LABEL: Record<QtyOrigin, { label: string; short: string; help: string; tone: 'grey' | 'navy' | 'warn' | 'ok' }> = {
  calcule: { label: 'Calculée', short: 'calculée', help: 'à partir des dimensions saisies', tone: 'ok' },
  reconnu: { label: 'Reconnue sur plan', short: 'plan', help: 'mesurée sur un plan calibré', tone: 'navy' },
  estime: { label: 'Estimée', short: 'estimée', help: 'hypothèse ou ratio, à confirmer', tone: 'warn' },
  saisi: { label: 'Saisie', short: 'saisie', help: 'quantité donnée directement', tone: 'grey' },
};

export interface Opening {
  label: string;
  width: number | null;
  height: number | null;
  count: number | null;
}

export interface MetreLine {
  id: string;
  ref: string;
  designation: string;
  location: string;
  lot: string;
  formula: MetreFormula;
  /** Formule libre : variables L, l, H, N. */
  expression?: string;
  L: number | null;
  l: number | null;
  H: number | null;
  N: number | null;
  /** Quantité saisie (forfait). */
  qty?: number | null;
  openings: Opening[];
  unit: string;
  /** Coefficient de pertes en % (appliqué après calcul, visible dans les étapes). */
  lossPct?: number | null;
  source: string;
  notes: string;
  /** Origine de la quantité ; à défaut, déduite de la ligne (voir lineOrigin). */
  origin?: QtyOrigin;
  /** Ouvrage de la bibliothèque des travaux d'où vient la ligne. */
  itemId?: string | null;
  itemCode?: string;
}

/** Origine effective d'une ligne : celle choisie, sinon plan → reconnue, forfait → saisie, sinon calculée. */
export function lineOrigin(line: Pick<MetreLine, 'origin' | 'source' | 'formula'>): QtyOrigin {
  if (line.origin) return line.origin;
  if (/^Plan /.test(line.source ?? '')) return 'reconnu';
  return line.formula === 'forfait' ? 'saisi' : 'calcule';
}

/** Formule de métré par défaut pour une unité. */
export function formulaForUnit(unit: string): MetreFormula {
  return ({ 'm²': 'surface', 'm³': 'volume', ml: 'longueur', m: 'longueur', u: 'unite', pce: 'unite' } as Record<string, MetreFormula>)[normalizeUnit(unit)] ?? 'forfait';
}

/**
 * Vérifie une formule paramétrable de la bibliothèque (variables L, l, H, N) : renvoie le problème
 * en clair, ou null si elle est utilisable.
 */
export function checkFormula(expr: string): string | null {
  if (!expr.trim()) return 'Formule vide';
  const bad = variablesOf(expr).filter((v) => !['L', 'l', 'H', 'N'].includes(v));
  if (bad.length) return `Variable(s) inconnue(s) : ${bad.join(', ')} (utilisez L, l, H, N)`;
  try {
    evaluate(expr, { L: 1.7, l: 1.3, H: 2.9, N: 2 });
    return null;
  } catch (e) {
    return (e as ExprError).message;
  }
}

export interface LibraryWork { id: string; code: string; designation: string; unit: string; trade?: string | null; category?: string; formula?: string | null; metre_method?: string | null }

/**
 * Ligne de métré pour un ouvrage de la bibliothèque : désignation et unité de l'ouvrage, sa formule
 * paramétrable si elle est valide, sinon la formule standard de son unité. Aucune dimension n'est
 * pré-remplie : elles restent à saisir.
 */
export function lineFromLibrary(item: LibraryWork, id: string, lot?: string): MetreLine {
  const expr = item.formula?.trim() ?? '';
  const useExpr = !!expr && checkFormula(expr) === null;
  const formula = useExpr ? 'libre' : formulaForUnit(item.unit);
  return {
    id, ref: item.code, designation: item.designation, location: '', lot: lot || item.trade || item.category || '',
    formula, expression: useExpr ? expr : undefined, L: null, l: null, H: null, N: formula === 'forfait' || useExpr ? null : 1, qty: null,
    openings: [], unit: normalizeUnit(item.unit), source: `Bibliothèque ${item.code || item.designation}`,
    notes: [item.metre_method ? `Méthode : ${item.metre_method}` : '', expr && !useExpr ? `Formule de la bibliothèque inutilisable (${checkFormula(expr)}) : formule standard appliquée` : ''].filter(Boolean).join(' · '),
    itemId: item.id, itemCode: item.code,
  };
}

export interface MetreRules {
  /** Décimales de la quantité retenue. */
  decimals: number;
  /** Les ouvertures dont la surface unitaire est ≤ à ce seuil (m²) ne sont pas déduites. */
  openingThreshold: number;
}

export const DEFAULT_RULES: MetreRules = { decimals: 2, openingThreshold: 0 };

export interface MetreResult {
  /** Quantité retenue (arrondie), ou null si une donnée manque. */
  qty: number | null;
  raw: number | null;
  steps: string[];
  missing: string[];
  error?: string;
}

const f = (n: number) => formatNumber(n, 3);

export function computeMetre(line: MetreLine, rules: MetreRules = DEFAULT_RULES): MetreResult {
  const steps: string[] = [];
  const missing: string[] = [];
  const N = line.N ?? (line.formula === 'forfait' || line.formula === 'libre' ? null : 1);
  const dims: Record<string, number | null> = { L: line.L, l: line.l, H: line.H, N };
  const def = FORMULAS[line.formula];
  for (const d of def.dims) if (dims[d] === null || dims[d] === undefined) missing.push(DIM_LABEL[d]);
  if (line.formula === 'forfait' && (line.qty === null || line.qty === undefined)) missing.push('quantité');
  if (missing.length) {
    return { qty: null, raw: null, steps: [`Donnée(s) manquante(s) : ${missing.join(', ')}. Quantité non déterminée.`], missing };
  }
  const L = line.L ?? 0, l = line.l ?? 0, H = line.H ?? 0, n = N ?? 1;
  let raw: number;
  switch (line.formula) {
    case 'unite': raw = n; steps.push(`Nombre = ${f(n)}`); break;
    case 'longueur': raw = L * n; steps.push(`Longueur = ${f(L)} × ${f(n)} = ${f(raw)}`); break;
    case 'surface': raw = L * l * n; steps.push(`Surface = ${f(L)} × ${f(l)} × ${f(n)} = ${f(raw)}`); break;
    case 'volume': raw = L * l * H * n; steps.push(`Volume = ${f(L)} × ${f(l)} × ${f(H)} × ${f(n)} = ${f(raw)}`); break;
    case 'perimetre': raw = 2 * (L + l) * n; steps.push(`Périmètre = 2 × (${f(L)} + ${f(l)}) × ${f(n)} = ${f(raw)}`); break;
    case 'forfait': raw = line.qty as number; steps.push(`Quantité forfaitaire saisie = ${f(raw)}`); break;
    case 'mur': {
      const brute = L * H * n;
      steps.push(`Surface brute = ${f(L)} × ${f(H)} × ${f(n)} = ${f(brute)}`);
      let ded = 0;
      for (const o of line.openings) {
        if (o.width === null || o.height === null || o.count === null) {
          missing.push(`dimensions de l’ouverture « ${o.label || 'sans nom'} »`);
          continue;
        }
        const unit = o.width * o.height;
        if (unit <= rules.openingThreshold) {
          steps.push(`Ouverture « ${o.label} » ${f(o.width)} × ${f(o.height)} = ${f(unit)} m² ≤ seuil ${f(rules.openingThreshold)} m² : non déduite`);
          continue;
        }
        const d = unit * o.count;
        ded += d;
        steps.push(`Ouverture « ${o.label} » : ${f(o.count)} × ${f(o.width)} × ${f(o.height)} = ${f(d)} m² déduits`);
      }
      if (missing.length) {
        return { qty: null, raw: null, steps: [...steps, `Donnée(s) manquante(s) : ${missing.join(', ')}. Quantité non déterminée.`], missing };
      }
      raw = Math.max(0, brute - ded);
      steps.push(`Surface nette = ${f(brute)} − ${f(ded)} = ${f(raw)}`);
      break;
    }
    case 'libre': {
      if (!line.expression?.trim()) return { qty: null, raw: null, steps: ['Formule libre vide.'], missing: ['formule'] };
      try {
        raw = evaluate(line.expression, { L: line.L, l: line.l, H: line.H, N: line.N });
      } catch (e) {
        const msg = (e as ExprError).message;
        return { qty: null, raw: null, steps: [`Formule « ${line.expression} » : ${msg}`], missing: msg.startsWith('Valeur manquante') ? [msg] : [], error: msg };
      }
      steps.push(`Formule ${line.expression} = ${f(raw)}`);
      break;
    }
  }
  if (line.lossPct) {
    const before = raw;
    raw = raw * (1 + line.lossPct / 100);
    steps.push(`Pertes ${f(line.lossPct)} % : ${f(before)} × ${f(1 + line.lossPct / 100)} = ${f(raw)}`);
  }
  const qty = roundTo(raw, rules.decimals);
  if (qty !== raw) steps.push(`Arrondi à ${rules.decimals} décimale(s) : ${formatNumber(qty, rules.decimals)}`);
  return { qty, raw, steps, missing: [] };
}

export interface MetreGroup {
  key: string;
  lot: string;
  designation: string;
  unit: string;
  qty: number | null;
  lineIds: string[];
  incomplete: number;
  /** Origines des quantités du groupe (une quantité estimée rend le groupe « estimé »). */
  origins: QtyOrigin[];
  /** Ouvrage de bibliothèque commun à toutes les lignes du groupe, sinon null. */
  itemId: string | null;
}

/** Regroupe les lignes par lot + désignation + unité (règle de regroupement pour le DQE). */
export function groupMetre(lines: MetreLine[], rules: MetreRules = DEFAULT_RULES): MetreGroup[] {
  const map = new Map<string, MetreGroup>();
  for (const line of lines) {
    const key = [line.lot.trim().toLowerCase(), line.designation.trim().toLowerCase(), line.unit].join('|');
    const r = computeMetre(line, rules);
    let g = map.get(key);
    if (!g) {
      g = { key, lot: line.lot.trim(), designation: line.designation.trim(), unit: line.unit, qty: 0, lineIds: [], incomplete: 0, origins: [], itemId: line.itemId ?? null };
      map.set(key, g);
    } else if (g.itemId !== (line.itemId ?? null)) g.itemId = null;
    g.lineIds.push(line.id);
    const o = lineOrigin(line);
    if (!g.origins.includes(o)) g.origins.push(o);
    if (r.qty === null) g.incomplete++;
    else if (g.qty !== null) g.qty = roundTo(g.qty + r.qty, rules.decimals);
  }
  // Un groupe dont une ligne est incomplète n'a pas de quantité totale fiable.
  for (const g of map.values()) if (g.incomplete) g.qty = null;
  return [...map.values()];
}
