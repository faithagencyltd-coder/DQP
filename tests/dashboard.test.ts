import { describe, expect, it } from 'vitest';
import { budgetVsActual, costsByLot, lastMonths, monthlyFlows, orgKpis, type ExpenseRow, type InvoiceRow, type ProjectRow, type QuoteRow } from '../src/engine/dashboard';

const projects: ProjectRow[] = [
  { id: 'p1', reference: 'PRJ-1', name: 'Villa', status: 'en_cours', archived_at: null, budget_estimate: 40_000_000, budget_validated: 45_000_000 },
  { id: 'p2', reference: 'PRJ-2', name: 'Boutique', status: 'etude', archived_at: null, budget_estimate: null, budget_validated: null },
  { id: 'p3', reference: 'PRJ-3', name: 'Ancien', status: 'termine', archived_at: null, budget_estimate: 1, budget_validated: null },
];
const quotes: QuoteRow[] = [
  { kind: 'devis', status: 'accepte', total_ht: 50_000_000, total_ttc: 59_000_000, project_id: 'p1', archived_at: null },
  { kind: 'devis', status: 'envoye', total_ht: 1_000_000, total_ttc: 1_180_000, project_id: 'p2', archived_at: null },
  { kind: 'devis', status: 'brouillon', total_ht: 5, total_ttc: 5, project_id: 'p2', archived_at: null },
  { kind: 'dqe', status: 'accepte', total_ht: 9, total_ttc: 9, project_id: 'p1', archived_at: null },
];
const invoices: InvoiceRow[] = [
  { kind: 'acompte', status: 'partielle', net_ht: 15_000_000, total_ttc: 17_700_000, amount_paid: 10_000_000, issue_date: '2026-08-10', due_date: '2026-09-09', project_id: 'p1' },
  { kind: 'simple', status: 'emise', net_ht: 100_000, total_ttc: 118_000, amount_paid: 0, issue_date: '2026-10-01', due_date: '2026-10-31', project_id: 'p2' },
  { kind: 'simple', status: 'brouillon', net_ht: 999, total_ttc: 999, amount_paid: 0, issue_date: null, due_date: null, project_id: 'p2' },
  { kind: 'avoir', status: 'emise', net_ht: -50_000, total_ttc: -59_000, amount_paid: 0, issue_date: '2026-10-05', due_date: null, project_id: 'p2' },
];
const expenses: ExpenseRow[] = [
  { amount_ht: 6_000_000, expense_date: '2026-08-20', project_id: 'p1', lot: 'Fondations', status: 'payee' },
  { amount_ht: 2_500_000, expense_date: '2026-10-02', project_id: 'p1', lot: 'Gros œuvre', status: 'facturee' },
  { amount_ht: 75_000, expense_date: '2026-10-03', project_id: null, lot: null, status: 'engagee' },
];

describe('tableau de bord', () => {
  it('derniers mois et flux mensuels', () => {
    expect(lastMonths('2026-02-14', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    const f = monthlyFlows(invoices, [{ amount: 10_000_000, paid_on: '2026-09-01' }], expenses, lastMonths('2026-10-14', 3), 'XOF');
    expect(f).toEqual([
      { month: '2026-08', invoicedHT: 15_000_000, collected: 0, expensesHT: 6_000_000 },
      { month: '2026-09', invoicedHT: 0, collected: 10_000_000, expensesHT: 0 },
      { month: '2026-10', invoicedHT: 50_000, collected: 0, expensesHT: 2_575_000 },
    ]);
  });

  it('indicateurs de l’entreprise', () => {
    const k = orgKpis(projects, quotes, invoices, expenses, '2026-10-14', 'XOF');
    expect(k.activeProjects).toBe(2);
    expect(k.sitesInProgress).toBe(1);
    expect([k.quotesPending, k.quotesPendingTTC, k.quotesAccepted]).toEqual([1, 1_180_000, 1]);
    expect(k.invoicedHT).toBe(15_050_000); // avoir déduit, brouillon exclu
    expect(k.collectedTTC).toBe(10_000_000);
    expect(k.toCollectTTC).toBe(7_818_000);
    expect([k.overdueCount, k.overdueTTC]).toEqual([1, 7_700_000]);
    expect(k.expensesHT).toBe(8_575_000);
    expect(k.plannedBudget).toBe(45_000_000);
    expect(k.projectsWithoutBudget).toBe(1);
    expect(k.plannedMargin).toBe(5_000_000); // 50 M vendus − 45 M de budget, seul projet complet
    expect(k.actualMargin).toBe(6_475_000);
    expect(k.limits.some((l) => l.includes('sans budget'))).toBe(true);
  });

  it('budget / réel par chantier et coûts par lot', () => {
    expect(budgetVsActual(projects, expenses)).toEqual([{ id: 'p1', label: 'PRJ-1 · Villa', budget: 45_000_000, spent: 8_500_000 }]);
    expect(costsByLot(expenses)).toEqual([{ lot: 'Fondations', value: 6_000_000 }, { lot: 'Gros œuvre', value: 2_500_000 }, { lot: 'Sans lot', value: 75_000 }]);
  });
});
