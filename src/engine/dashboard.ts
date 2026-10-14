// Indicateurs du tableau de bord (§6) calculés uniquement sur les données enregistrées.
// Chaque agrégat indique ses limites (données absentes) au lieu de les combler.

import { roundMoney } from './money';

export interface InvoiceRow { kind: string; status: string; net_ht: number; total_ttc: number; amount_paid: number; issue_date: string | null; due_date: string | null; project_id: string | null }
export interface PaymentRow { amount: number; paid_on: string }
export interface ExpenseRow { amount_ht: number; expense_date: string; project_id: string | null; lot: string | null; status: string }
export interface QuoteRow { kind: string; status: string; total_ht: number | null; total_ttc: number | null; project_id: string | null; archived_at: string | null }
export interface ProjectRow { id: string; reference: string; name: string; status: string; archived_at: string | null; budget_estimate: number | null; budget_validated: number | null; budget_revised?: number | null }

const issued = (i: InvoiceRow) => i.status !== 'brouillon' && i.status !== 'annulee';
const isActive = (p: ProjectRow) => !p.archived_at && !['termine', 'annule'].includes(p.status);
export const plannedBudget = (p: ProjectRow) => p.budget_revised ?? p.budget_validated ?? p.budget_estimate ?? null;

/** Les n derniers mois (AAAA-MM), du plus ancien au mois de `today`. */
export function lastMonths(today: string, n: number): string[] {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7) - 1;
  return Array.from({ length: n }, (_, i) => {
    const k = y * 12 + m - (n - 1 - i);
    return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
  });
}

export interface MonthFlow { month: string; invoicedHT: number; collected: number; expensesHT: number }

/** Recettes (facturé HT à l'émission, encaissé à la date du paiement) et dépenses HT par mois. */
export function monthlyFlows(invoices: InvoiceRow[], payments: PaymentRow[], expenses: ExpenseRow[], months: string[], currency: string): MonthFlow[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const out = months.map((month) => ({ month, invoicedHT: 0, collected: 0, expensesHT: 0 }));
  for (const i of invoices) {
    if (!issued(i) || !i.issue_date) continue;
    const k = idx.get(i.issue_date.slice(0, 7));
    if (k !== undefined) out[k].invoicedHT += Number(i.net_ht);
  }
  for (const p of payments) { const k = idx.get(p.paid_on.slice(0, 7)); if (k !== undefined) out[k].collected += Number(p.amount); }
  for (const e of expenses) { const k = idx.get(e.expense_date.slice(0, 7)); if (k !== undefined) out[k].expensesHT += Number(e.amount_ht); }
  return out.map((f) => ({ ...f, invoicedHT: roundMoney(f.invoicedHT, currency), collected: roundMoney(f.collected, currency), expensesHT: roundMoney(f.expensesHT, currency) }));
}

export interface OrgKpis {
  activeProjects: number; sitesInProgress: number;
  quotesPending: number; quotesPendingTTC: number; quotesAccepted: number; quotesAcceptedTTC: number;
  invoicedHT: number; invoicedTTC: number; collectedTTC: number; toCollectTTC: number; overdueTTC: number; overdueCount: number;
  expensesHT: number; plannedBudget: number; projectsWithoutBudget: number;
  plannedMargin: number | null; plannedMarginBase: number; actualMargin: number | null;
  limits: string[];
}

export function orgKpis(projects: ProjectRow[], quotes: QuoteRow[], invoices: InvoiceRow[], expenses: ExpenseRow[], today: string, currency: string): OrgKpis {
  const limits: string[] = [];
  const active = projects.filter(isActive);
  const devis = quotes.filter((q) => q.kind === 'devis' && !q.archived_at);
  const pending = devis.filter((q) => ['en_validation', 'envoye'].includes(q.status));
  const accepted = devis.filter((q) => q.status === 'accepte');
  const inv = invoices.filter(issued);
  const r = (v: number) => roundMoney(v, currency);
  const invoicedHT = r(inv.reduce((s, i) => s + Number(i.net_ht), 0));
  const invoicedTTC = r(inv.reduce((s, i) => s + Number(i.total_ttc), 0));
  const collectedTTC = r(inv.filter((i) => i.kind !== 'avoir').reduce((s, i) => s + Number(i.amount_paid), 0));
  const open = inv.filter((i) => i.kind !== 'avoir');
  const due = (i: InvoiceRow) => Math.max(0, Number(i.total_ttc) - Number(i.amount_paid));
  const toCollectTTC = r(open.reduce((s, i) => s + due(i), 0));
  const overdue = open.filter((i) => due(i) > 0 && i.due_date && i.due_date < today);
  const expensesHT = r(expenses.reduce((s, e) => s + Number(e.amount_ht), 0));
  const budgets = active.map(plannedBudget);
  const withoutBudget = budgets.filter((b) => b === null).length;
  if (withoutBudget) limits.push(`${withoutBudget} projet(s) actif(s) sans budget : budget prévisionnel partiel.`);
  // Marge prévisionnelle : seulement sur les projets qui ont à la fois un devis accepté et un budget.
  let plannedMargin: number | null = null;
  let base = 0;
  for (const p of active) {
    const sold = accepted.filter((q) => q.project_id === p.id).reduce((s, q) => s + Number(q.total_ht ?? 0), 0);
    const b = plannedBudget(p);
    if (sold > 0 && b !== null) { plannedMargin = (plannedMargin ?? 0) + sold - b; base++; }
  }
  if (plannedMargin === null) limits.push('Marge prévisionnelle : aucun projet actif n’a à la fois un devis accepté et un budget.');
  const actualMargin = invoicedHT > 0 ? r(invoicedHT - expensesHT) : null;
  if (actualMargin === null) limits.push('Marge constatée : rien n’est encore facturé.');
  return {
    activeProjects: active.length, sitesInProgress: projects.filter((p) => !p.archived_at && p.status === 'en_cours').length,
    quotesPending: pending.length, quotesPendingTTC: r(pending.reduce((s, q) => s + Number(q.total_ttc ?? 0), 0)),
    quotesAccepted: accepted.length, quotesAcceptedTTC: r(accepted.reduce((s, q) => s + Number(q.total_ttc ?? 0), 0)),
    invoicedHT, invoicedTTC, collectedTTC, toCollectTTC, overdueTTC: r(overdue.reduce((s, i) => s + due(i), 0)), overdueCount: overdue.length,
    expensesHT, plannedBudget: r(budgets.reduce<number>((s, b) => s + (b ?? 0), 0)), projectsWithoutBudget: withoutBudget,
    plannedMargin: plannedMargin === null ? null : r(plannedMargin), plannedMarginBase: base, actualMargin, limits,
  };
}

/** Budget prévisionnel et dépenses réelles HT par chantier actif. */
export function budgetVsActual(projects: ProjectRow[], expenses: ExpenseRow[]) {
  return projects.filter(isActive).map((p) => ({
    id: p.id, label: `${p.reference} · ${p.name}`, budget: plannedBudget(p),
    spent: expenses.filter((e) => e.project_id === p.id).reduce((s, e) => s + Number(e.amount_ht), 0),
  })).filter((x) => x.budget !== null || x.spent > 0).sort((a, b) => (b.budget ?? b.spent) - (a.budget ?? a.spent));
}

/** Coûts HT par lot de travaux, tous chantiers confondus (dépenses sans lot regroupées). */
export function costsByLot(expenses: ExpenseRow[]) {
  const map = new Map<string, number>();
  for (const e of expenses) map.set(e.lot || 'Sans lot', (map.get(e.lot || 'Sans lot') ?? 0) + Number(e.amount_ht));
  return [...map.entries()].map(([lot, value]) => ({ lot, value })).sort((a, b) => b.value - a.value);
}
