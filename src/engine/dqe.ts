// DQE, BPU et devis (§14, §15) : un seul modèle de document, un seul moteur de calcul.
// Montant de ligne = arrondi(quantité × prix unitaire) ; sous-total de lot = Σ montants ;
// total = Σ lots ; remise, taxes et TTC arrondis selon la devise. Une ligne sans quantité
// ou sans prix n'a PAS de montant : elle est signalée, jamais comptée pour zéro en silence.

import { roundMoney, roundTo } from './money';
import { uid } from './ids';

export type LineKind = 'ouvrage' | 'titre';

export interface DocLine {
  id: string;
  kind: LineKind;
  ref: string;
  designation: string;
  /** Description détaillée (BPU). */
  description?: string;
  unit: string;
  qty: number | null;
  unitPrice: number | null;
  note?: string;
  /** Origine de la quantité et du prix (traçabilité). */
  qtySource?: { kind: 'metre' | 'saisie' | 'import' | 'ia'; label?: string; id?: string; verified?: boolean };
  priceSource?: { kind: 'bpu' | 'bibliotheque' | 'saisie' | 'import' | 'deboursé'; label?: string; id?: string };
}

export interface DocLot {
  id: string;
  code: string;
  name: string;
  lines: DocLine[];
}

export interface DocBody {
  lots: DocLot[];
}

export interface TaxDef {
  label: string;
  rate: number;
}

export interface DocSettings {
  currency: string;
  discountPct?: number | null;
  taxes: TaxDef[];
}

export interface LineResult {
  number: string;
  amount: number | null;
  missing: ('quantité' | 'prix unitaire')[];
}

export interface LotResult {
  id: string;
  subtotal: number;
  lines: number;
  incomplete: number;
}

export interface DocResult {
  lines: Map<string, LineResult>;
  lots: LotResult[];
  totalHT: number;
  discount: number;
  netHT: number;
  taxes: { label: string; rate: number; base: number; amount: number }[];
  totalTTC: number;
  incomplete: number;
  priced: number;
  count: number;
}

export function newLine(partial: Partial<DocLine> = {}): DocLine {
  return { id: uid('l'), kind: 'ouvrage', ref: '', designation: '', unit: '', qty: null, unitPrice: null, ...partial };
}

export function newLot(name: string, index: number): DocLot {
  return { id: uid('lot'), code: `LOT ${String(index + 1).padStart(2, '0')}`, name, lines: [] };
}

export function renumberLots(body: DocBody): DocBody {
  return { lots: body.lots.map((l, i) => ({ ...l, code: `LOT ${String(i + 1).padStart(2, '0')}` })) };
}

export function computeDoc(body: DocBody, settings: DocSettings): DocResult {
  const cur = settings.currency;
  const lines = new Map<string, LineResult>();
  const lots: LotResult[] = [];
  let totalHT = 0, incomplete = 0, priced = 0, count = 0;
  body.lots.forEach((lot, li) => {
    let subtotal = 0, n = 0, inc = 0;
    for (const line of lot.lines) {
      if (line.kind === 'titre') {
        lines.set(line.id, { number: '', amount: null, missing: [] });
        continue;
      }
      n++;
      count++;
      const missing: LineResult['missing'] = [];
      if (line.qty === null || line.qty === undefined) missing.push('quantité');
      if (line.unitPrice === null || line.unitPrice === undefined) missing.push('prix unitaire');
      const amount = missing.length ? null : roundMoney((line.qty as number) * (line.unitPrice as number), cur);
      if (amount === null) inc++;
      else {
        subtotal += amount;
        priced++;
      }
      lines.set(line.id, { number: `${li + 1}.${n}`, amount, missing });
    }
    subtotal = roundMoney(subtotal, cur);
    lots.push({ id: lot.id, subtotal, lines: n, incomplete: inc });
    totalHT += subtotal;
    incomplete += inc;
  });
  totalHT = roundMoney(totalHT, cur);
  const pct = settings.discountPct ?? 0;
  const discount = roundMoney((totalHT * pct) / 100, cur);
  const netHT = roundMoney(totalHT - discount, cur);
  const taxes = settings.taxes.filter((t) => t.rate !== 0 || t.label).map((t) => ({ label: t.label, rate: t.rate, base: netHT, amount: roundMoney((netHT * t.rate) / 100, cur) }));
  const totalTTC = roundMoney(netHT + taxes.reduce((s, t) => s + t.amount, 0), cur);
  return { lines, lots, totalHT, discount, netHT, taxes, totalTTC, incomplete, priced, count };
}

// ------------------------------------------------------------------ BPU
export interface BpuItem {
  ref: string;
  designation: string;
  description?: string;
  unit: string;
  unitPrice: number | null;
  note?: string;
}

/** BPU tiré d'un DQE : un article par référence (ou par désignation + unité sans référence). */
export function bpuFromDoc(body: DocBody): { items: BpuItem[]; conflicts: string[] } {
  const map = new Map<string, BpuItem>();
  const conflicts: string[] = [];
  for (const lot of body.lots)
    for (const l of lot.lines) {
      if (l.kind === 'titre') continue;
      const key = l.ref.trim() ? 'r:' + l.ref.trim().toLowerCase() : 'd:' + l.designation.trim().toLowerCase() + '|' + l.unit;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ref: l.ref, designation: l.designation, description: l.description, unit: l.unit, unitPrice: l.unitPrice, note: l.note });
      } else if (prev.unitPrice !== l.unitPrice && l.unitPrice !== null && prev.unitPrice !== null) {
        conflicts.push(`${l.ref || l.designation} : deux prix différents (${prev.unitPrice} et ${l.unitPrice})`);
      }
    }
  return { items: [...map.values()], conflicts };
}

/** Reprend dans le DQE les prix unitaires du BPU (par référence). Retourne les lignes non trouvées. */
export function applyBpu(body: DocBody, items: BpuItem[]): { body: DocBody; applied: number; unmatched: string[] } {
  const byRef = new Map(items.filter((i) => i.ref.trim()).map((i) => [i.ref.trim().toLowerCase(), i]));
  let applied = 0;
  const unmatched: string[] = [];
  const lots = body.lots.map((lot) => ({
    ...lot,
    lines: lot.lines.map((l) => {
      if (l.kind === 'titre') return l;
      const it = l.ref.trim() ? byRef.get(l.ref.trim().toLowerCase()) : undefined;
      if (!it) {
        unmatched.push(l.ref || l.designation);
        return l;
      }
      if (it.unitPrice === null) return l;
      applied++;
      return { ...l, unitPrice: it.unitPrice, priceSource: { kind: 'bpu' as const, label: `BPU ${it.ref}` } };
    }),
  }));
  return { body: { lots }, applied, unmatched };
}

/** Lignes sans prix ou sans quantité (aide à la vérification). */
export function missingLines(body: DocBody): { lot: string; line: DocLine; missing: string[] }[] {
  const out: { lot: string; line: DocLine; missing: string[] }[] = [];
  for (const lot of body.lots)
    for (const l of lot.lines) {
      if (l.kind === 'titre') continue;
      const m: string[] = [];
      if (l.qty === null) m.push('quantité');
      if (l.unitPrice === null) m.push('prix unitaire');
      if (m.length) out.push({ lot: lot.name, line: l, missing: m });
    }
  return out;
}

export function cloneBody(body: DocBody): DocBody {
  return { lots: body.lots.map((l) => ({ ...l, id: uid('lot'), lines: l.lines.map((x) => ({ ...x, id: uid('l') })) })) };
}

export function quantityTotal(body: DocBody): number {
  return roundTo(body.lots.reduce((s, l) => s + l.lines.reduce((a, x) => a + (x.qty ?? 0), 0), 0), 3);
}
