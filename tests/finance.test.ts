import { describe, expect, it } from 'vitest';
import { computeDoc, type DocBody } from '../src/engine/dqe';
import {
  acompteBody, avoirBody, balance, dueState, finaleBody, financeAlerts, invoicedOnQuote, projectFinance, priceRises, situationBody,
  type ExpenseLike, type InvoiceLike,
} from '../src/engine/finance';

const XOF = { currency: 'XOF', discountPct: 5, taxes: [{ label: 'TVA', rate: 18 }] };

const inv = (p: Partial<InvoiceLike>): InvoiceLike => ({
  id: Math.random().toString(36), kind: 'simple', status: 'emise', reference: 'FAC-1', quote_id: 'q', project_id: 'p', client_id: 'c', net_ht: 0, total_ttc: 0, amount_paid: 0, issue_date: '2026-10-01', due_date: '2026-10-31', ...p,
});
const exp = (p: Partial<ExpenseLike>): ExpenseLike => ({
  id: Math.random().toString(36), project_id: 'p', lot: 'Gros œuvre', category: 'materiaux', label: 'x', amount_ht: 0, amount_ttc: 0, status: 'payee', receipt_path: 'r', expense_date: '2026-10-01', ...p,
});

describe('facturation', () => {
  it('même total que la base de données (fixture partagée avec rls_test.sql)', () => {
    const body: DocBody = { lots: [{ id: 'l1', code: 'LOT 01', name: 'Gros œuvre', lines: [
      { id: 'a', kind: 'titre', ref: '', designation: 'Titre', unit: '', qty: null, unitPrice: null },
      { id: 'b', kind: 'ouvrage', ref: '', designation: '', unit: '', qty: 3, unitPrice: 1000.5 },
      { id: 'c', kind: 'ouvrage', ref: '', designation: '', unit: '', qty: 2.5, unitPrice: 333 },
      { id: 'd', kind: 'ouvrage', ref: '', designation: '', unit: '', qty: null, unitPrice: 10 },
    ] }] };
    const r = computeDoc(body, XOF);
    expect([r.totalHT, r.netHT, r.totalTTC, r.incomplete]).toEqual([3835, 3643, 4299, 1]);
    body.lots[0].lines[3].qty = 1;
    expect(computeDoc(body, XOF).totalTTC).toBe(4311);
  });

  it('acompte, situations et solde depuis un devis', () => {
    const a = acompteBody('DEV-1', 1_000_000, 30, 'XOF');
    expect(a.lots[0].lines[0]).toMatchObject({ qty: 1, unitPrice: 300_000 });
    // Situation 1 : 50 % cumulés, 300 000 déjà facturés → 200 000.
    expect(situationBody('DEV-1', 1_000_000, 50, 300_000, 'XOF', 1).lots[0].lines[0].unitPrice).toBe(200_000);
    expect(() => situationBody('DEV-1', 1_000_000, 25, 300_000, 'XOF', 2)).toThrow(/Rien à facturer/);
    const quote: DocBody = { lots: [{ id: 'x', code: 'LOT 01', name: 'GO', lines: [{ id: 'y', kind: 'ouvrage', ref: '', designation: 'Béton', unit: 'm3', qty: 10, unitPrice: 100_000 }] }] };
    const f = finaleBody(quote, [{ reference: 'FAC-1', net_ht: 300_000 }, { reference: 'FAC-2', net_ht: 200_000 }]);
    expect(computeDoc(f, { currency: 'XOF', taxes: [] }).netHT).toBe(500_000);
    expect(computeDoc(avoirBody(quote, 'FAC-3'), { currency: 'XOF', taxes: [] }).netHT).toBe(-1_000_000);
  });

  it('déjà facturé : factures émises seulement, sans avoirs ni brouillons', () => {
    const list = [inv({ net_ht: 100 }), inv({ net_ht: 50, status: 'brouillon' }), inv({ net_ht: 70, status: 'annulee' }), inv({ net_ht: -20, kind: 'avoir' }), inv({ net_ht: 30, status: 'payee' })];
    expect(invoicedOnQuote('q', list)).toBe(130);
  });

  it('échéances pour les relances', () => {
    expect(dueState(inv({ due_date: '2026-10-20' }), '2026-10-14')).toEqual({ state: 'a_echeance', days: 6 });
    expect(dueState(inv({ due_date: '2026-10-10' }), '2026-10-14')).toEqual({ state: 'echue', days: 4 });
    expect(dueState(inv({ due_date: '2026-12-10' }), '2026-10-14').state).toBe('en_cours');
    expect(dueState(inv({ status: 'payee' }), '2026-10-14').state).toBe('payee');
    expect(balance(inv({ total_ttc: 1180, amount_paid: 500 }))).toBe(680);
  });
});

describe('rentabilité et alertes', () => {
  const project = { id: 'p', budget_estimate: 9_000_000, budget_validated: 10_000_000, budget_revised: null, margin_target_pct: 20 };

  it('distingue engagé, facturé, payé, facturé client, encaissé', () => {
    const f = projectFinance(project, [{ name: 'Gros œuvre', budget: 6_000_000 }, { name: 'Finitions', budget: null }], 12_000_000,
      [inv({ net_ht: 4_000_000, total_ttc: 4_720_000, amount_paid: 2_000_000, status: 'partielle' }), inv({ net_ht: 1_000_000, total_ttc: 1_180_000, status: 'brouillon' })],
      [exp({ amount_ht: 1_000_000, status: 'engagee' }), exp({ amount_ht: 2_000_000, status: 'facturee' }), exp({ amount_ht: 500_000, status: 'payee', lot: 'Finitions' })]);
    expect(f).toMatchObject({ committedHT: 1_000_000, billedByVendorsHT: 2_000_000, paidOutHT: 500_000, expensesHT: 3_500_000, invoicedHT: 4_000_000, collectedTTC: 2_000_000, toCollectTTC: 2_720_000, toPayHT: 2_000_000 });
    expect(f.plannedCost).toBe(6_000_000);
    expect(f.plannedCostSource).toBe('budgets de 1 lot(s)');
    expect(f.limits[0]).toMatch(/1 lot\(s\) sans budget/);
    expect(f.plannedMargin).toBe(6_000_000);
    expect(f.actualMargin).toBe(500_000);
  });

  it('alertes : dépassement, retard, marge, justificatif, dépense inhabituelle, hausse de prix', () => {
    const expenses = [exp({ amount_ht: 7_000_000, receipt_path: null, label: 'Fer à béton' })];
    const org = [...expenses, ...[1, 2, 3, 4, 5].map((i) => exp({ amount_ht: 1_000_000 + i }))];
    const invoices = [inv({ reference: 'FAC-9', net_ht: 8_000_000, total_ttc: 9_440_000, due_date: '2026-09-30' })];
    const f = projectFinance(project, [], 10_000_000, invoices, expenses);
    const codes = financeAlerts(f, { ...project, margin_target_pct: 20 }, invoices, expenses, org, '2026-10-14').map((a) => a.code);
    expect(codes).toEqual(expect.arrayContaining(['retard', 'marge', 'justificatif', 'inhabituel']));
    const f2 = projectFinance({ ...project, budget_revised: 5_000_000 }, [], 10_000_000, [], expenses);
    expect(financeAlerts(f2, project, [], expenses, org, '2026-10-14').map((a) => a.code)).toContain('budget');
    expect(priceRises([{ item_id: 'c', designation: 'Ciment', price: 5000, at: '2026-01' }, { item_id: 'c', designation: 'Ciment', price: 5600, at: '2026-06' }])[0].text).toMatch(/12 %/);
  });
});
