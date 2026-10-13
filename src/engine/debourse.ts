// Décomposition des coûts d'un ouvrage (§14.4) : déboursé sec, pertes, frais indirects,
// marge, prix de vente. Deux méthodes, au choix de l'entreprise :
//  - « additive » : PR = (DS + pertes) × (1 + FI %) ; PV = PR × (1 + marge %) ou PR ÷ (1 − marge %) ;
//  - « coefficient » : PV = DS × K (coefficient de vente unique).

import { formatNumber, roundMoney } from './money';

export type CostKind = 'materiau' | 'main_oeuvre' | 'materiel' | 'transport' | 'sous_traitance' | 'consommable';

export const COST_KIND_LABEL: Record<CostKind, string> = {
  materiau: 'Matériaux',
  main_oeuvre: 'Main-d’œuvre',
  materiel: 'Matériel',
  transport: 'Transport',
  sous_traitance: 'Sous-traitance',
  consommable: 'Consommables',
};

export interface CostComponent {
  kind: CostKind;
  designation: string;
  unit: string;
  qty: number | null;
  unitCost: number | null;
}

export interface CostBreakdown {
  /** Quantité d'ouvrage à laquelle se rapportent les composants (souvent 1). */
  baseQty: number;
  components: CostComponent[];
  method: 'additive' | 'coefficient';
  /** Pertes en % appliquées aux matériaux. */
  lossPct: number;
  /** Frais indirects (frais de chantier, frais généraux) en %. */
  indirectPct: number;
  marginPct: number;
  marginBase: 'cout' | 'vente';
  coefficient: number;
}

export interface BreakdownResult {
  byKind: Record<CostKind, number>;
  ds: number;
  losses: number;
  indirect: number;
  costPrice: number;
  margin: number;
  salePrice: number | null;
  k: number | null;
  steps: string[];
  missing: string[];
}

export const DEFAULT_BREAKDOWN: CostBreakdown = {
  baseQty: 1, components: [], method: 'additive', lossPct: 0, indirectPct: 15, marginPct: 10, marginBase: 'cout', coefficient: 1.3,
};

export function computeBreakdown(b: CostBreakdown, currencyCode = 'XOF'): BreakdownResult {
  const m = (x: number) => roundMoney(x, currencyCode);
  const fmt = (x: number) => formatNumber(x, 2);
  const byKind = { materiau: 0, main_oeuvre: 0, materiel: 0, transport: 0, sous_traitance: 0, consommable: 0 } as Record<CostKind, number>;
  const missing: string[] = [];
  const steps: string[] = [];
  for (const c of b.components) {
    if (c.qty === null || c.unitCost === null) {
      missing.push(c.designation || COST_KIND_LABEL[c.kind]);
      continue;
    }
    byKind[c.kind] += c.qty * c.unitCost;
  }
  const base = b.baseQty > 0 ? b.baseQty : 1;
  for (const k of Object.keys(byKind) as CostKind[]) byKind[k] = m(byKind[k] / base);
  const ds = m(Object.values(byKind).reduce((s, x) => s + x, 0));
  steps.push(`Déboursé sec (par unité d’ouvrage) = ${(Object.keys(byKind) as CostKind[]).filter((k) => byKind[k]).map((k) => `${COST_KIND_LABEL[k]} ${fmt(byKind[k])}`).join(' + ') || '0'} = ${fmt(ds)}`);
  if (missing.length) {
    steps.push(`Composant(s) incomplet(s) : ${missing.join(', ')}. Prix de vente non déterminé.`);
    return { byKind, ds, losses: 0, indirect: 0, costPrice: ds, margin: 0, salePrice: null, k: null, steps, missing };
  }
  if (b.method === 'coefficient') {
    const pv = m(ds * b.coefficient);
    steps.push(`Prix de vente = DS × K = ${fmt(ds)} × ${fmt(b.coefficient)} = ${fmt(pv)}`);
    return { byKind, ds, losses: 0, indirect: 0, costPrice: ds, margin: m(pv - ds), salePrice: pv, k: b.coefficient, steps, missing };
  }
  const losses = m((byKind.materiau * b.lossPct) / 100);
  if (b.lossPct) steps.push(`Pertes sur matériaux = ${fmt(byKind.materiau)} × ${fmt(b.lossPct)} % = ${fmt(losses)}`);
  const indirect = m(((ds + losses) * b.indirectPct) / 100);
  steps.push(`Frais indirects = (${fmt(ds)} + ${fmt(losses)}) × ${fmt(b.indirectPct)} % = ${fmt(indirect)}`);
  const costPrice = m(ds + losses + indirect);
  steps.push(`Prix de revient = ${fmt(costPrice)}`);
  let pv: number;
  if (b.marginBase === 'vente') {
    if (b.marginPct >= 100) {
      steps.push('Marge sur prix de vente ≥ 100 % : impossible.');
      return { byKind, ds, losses, indirect, costPrice, margin: 0, salePrice: null, k: null, steps, missing: ['marge'] };
    }
    pv = m(costPrice / (1 - b.marginPct / 100));
    steps.push(`Prix de vente = PR ÷ (1 − ${fmt(b.marginPct)} %) = ${fmt(pv)}`);
  } else {
    pv = m(costPrice * (1 + b.marginPct / 100));
    steps.push(`Prix de vente = PR × (1 + ${fmt(b.marginPct)} %) = ${fmt(pv)}`);
  }
  const k = ds > 0 ? Math.round((pv / ds) * 10000) / 10000 : null;
  if (k !== null) steps.push(`Coefficient de vente équivalent K = ${formatNumber(k, 4)}`);
  return { byKind, ds, losses, indirect, costPrice, margin: m(pv - costPrice), salePrice: pv, k, steps, missing };
}
