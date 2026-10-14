import { describe, expect, it } from 'vitest';
import type { MetreLine } from '../src/engine/metre';
import { budgetComparison, financialReport, inPeriod, invoicesSummary, lotQuantities, paymentsReport, periodLabel, type Names, type RExpense, type RInvoice, type RProject } from '../src/engine/reports';

let n = 0;
const newMetreLine = (): MetreLine => ({ id: `m${++n}`, ref: '', designation: '', location: '', lot: '', formula: 'surface', L: null, l: null, H: null, N: 1, openings: [], unit: 'm²', source: 'test', notes: '' });
const project: RProject = { id: 'p1', reference: 'PRJ-1', name: 'Villa', status: 'en_cours', archived_at: null, budget_estimate: null, budget_validated: 10_000_000, client_id: 'c1' };
const names: Names = { contacts: new Map([['c1', 'M. Hounkpè']]), projects: new Map([['p1', 'PRJ-1 · Villa']]) };
const invoices: RInvoice[] = [
  { id: 'i1', kind: 'acompte', status: 'partielle', reference: 'FAC-1', title: 'Acompte', quote_id: null, project_id: 'p1', client_id: 'c1', net_ht: 3_000_000, total_ttc: 3_540_000, amount_paid: 1_000_000, issue_date: '2026-09-10', due_date: '2026-10-10' },
  { id: 'i2', kind: 'simple', status: 'brouillon', reference: null, title: 'Brouillon', quote_id: null, project_id: 'p1', client_id: 'c1', net_ht: 5, total_ttc: 5, amount_paid: 0, issue_date: null, due_date: null },
];
const expenses: RExpense[] = [
  { id: 'e1', project_id: 'p1', lot: 'Fondations', supplier_id: null, category: 'materiaux', label: 'Ciment', expense_date: '2026-09-15', amount_ht: 1_200_000, amount_ttc: 1_416_000, status: 'payee', supplier_invoice_ref: null, receipt_path: null },
  { id: 'e2', project_id: 'p1', lot: 'Hors budget', supplier_id: null, category: 'transport', label: 'Camion', expense_date: '2026-08-01', amount_ht: 50_000, amount_ttc: 50_000, status: 'payee', supplier_invoice_ref: null, receipt_path: null },
];

describe('rapports', () => {
  it('période', () => {
    expect(inPeriod('2026-09-10', { from: '2026-09-01', to: '2026-09-30' })).toBe(true);
    expect(inPeriod('2026-10-01T08:00:00Z', { from: '2026-09-01', to: '2026-09-30' })).toBe(false);
    expect(inPeriod(null, { from: null, to: null })).toBe(false);
    expect(periodLabel({ from: '2026-09-01', to: '2026-09-30' })).toBe('du 01/09/2026 au 30/09/2026');
  });

  it('rapport financier sur une période', () => {
    const r = financialReport([project], [], invoices, [{ id: 'x', invoice_id: 'i1', amount: 1_000_000, paid_on: '2026-09-20', method: 'virement', reference: null }], expenses, { from: '2026-09-01', to: '2026-09-30' }, 'XOF');
    expect(r.sections[0].rows).toEqual([{ projet: 'PRJ-1 · Villa', budget: 10_000_000, vendu: 0, facture: 3_000_000, encaisse: 1_000_000, depenses: 1_200_000, marge: 1_800_000 }]);
    expect(r.facts.find((f) => f[0].startsWith('Reste'))?.[1]).toBe(2_540_000);
  });

  it('factures et paiements', () => {
    const f = invoicesSummary(invoices, names, { from: null, to: null }, null, 'XOF', '2026-10-14', { partielle: 'Partiellement payée' }, { acompte: 'Acompte' });
    expect(f.sections[0].rows).toHaveLength(1);
    expect(f.sections[0].rows[0].etat).toBe('échue');
    const p = paymentsReport([{ id: 'x', invoice_id: 'i1', amount: 1_000_000, paid_on: '2026-09-20', method: 'mobile_money', reference: 'MM-1' }], invoices, names, { from: null, to: null }, 'p1', 'XOF', { mobile_money: 'Mobile Money' });
    expect(p.sections[0].rows).toEqual([{ mode: 'Mobile Money', montant: 1_000_000 }]);
    expect(p.sections[1].rows[0].client).toBe('M. Hounkpè');
  });

  it('comparatif budget / réel par lot et quantitatif', () => {
    const b = budgetComparison(project, [{ name: 'Fondations', budget: 1_000_000 }, { name: 'Gros œuvre', budget: null }], expenses, [], 'XOF');
    expect(b.sections[0].rows).toEqual([
      { lot: 'Fondations', budget: 1_000_000, reel: 1_200_000, ecart: 200_000, consomme: 120 },
      { lot: 'Hors budget', budget: null, reel: 50_000, ecart: null, consomme: null },
    ]);
    expect(b.limits).toContain('Dépenses sur des lots sans budget.');
    const l1 = { ...newMetreLine(), designation: 'Dalle', lot: 'Gros œuvre', formula: 'surface' as const, L: 5, l: 4, unit: 'm²' };
    const l2 = { ...newMetreLine(), designation: 'Dalle', lot: 'Gros œuvre', formula: 'surface' as const, L: 2, l: 1, unit: 'm²' };
    const l3 = { ...newMetreLine(), designation: 'Poteaux', lot: 'Gros œuvre', formula: 'volume' as const, L: 1, l: 0.2, H: null, unit: 'm³' };
    const q = lotQuantities([{ reference: 'MET-1', title: 'GO', status: 'travail', rules: { decimals: 2, openingThreshold: 0 }, lines: [l1, l2, l3] }], 'PRJ-1', 'XOF');
    expect(q.sections[0].rows.map((r) => [r.designation, r.quantite])).toEqual([['Dalle', 22], ['Poteaux', null]]);
    expect(q.limits[0]).toMatch(/non estimée/);
  });
});
