// Facturation et rentabilité (§16, §17) : construction des factures depuis un devis,
// situation financière d'un projet et alertes. Fonctions pures : les montants des factures
// sont aussi recalculés par la base (doc_totals), avec les mêmes règles d'arrondi.

import { computeDoc, newLine, type DocBody, type DocSettings } from './dqe';
import { roundMoney } from './money';
import { uid } from './ids';

export type InvoiceKind = 'simple' | 'acompte' | 'situation' | 'finale' | 'avoir';
export type InvoiceStatus = 'brouillon' | 'emise' | 'partielle' | 'payee' | 'annulee';

export interface InvoiceLike {
  id: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  reference: string | null;
  quote_id: string | null;
  project_id: string | null;
  client_id: string | null;
  net_ht: number;
  total_ttc: number;
  amount_paid: number;
  issue_date: string | null;
  due_date: string | null;
}

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  simple: 'Facture', acompte: 'Facture d’acompte', situation: 'Facture de situation', finale: 'Facture finale (solde)', avoir: 'Avoir',
};

const oneLine = (designation: string, amount: number, note?: string): DocBody => ({
  lots: [{ id: uid('lot'), code: 'LOT 01', name: 'Facturation', lines: [newLine({ designation, unit: 'ff', qty: 1, unitPrice: amount, note, priceSource: { kind: 'saisie', label: 'calculé depuis le devis' } })] }],
});

/** Montant HT déjà facturé sur un devis (factures émises, hors annulées et avoirs). */
export function invoicedOnQuote(quoteId: string, invoices: InvoiceLike[]): number {
  return invoices.filter((i) => i.quote_id === quoteId && i.kind !== 'avoir' && i.status !== 'brouillon' && i.status !== 'annulee').reduce((s, i) => s + i.net_ht, 0);
}

/** Facture d'acompte : pourcentage du net HT du devis. */
export function acompteBody(quoteRef: string, quoteNetHT: number, pct: number, currency: string): DocBody {
  if (!(pct > 0 && pct <= 100)) throw new Error('Pourcentage d’acompte entre 0 et 100 %.');
  return oneLine(`Acompte de ${String(pct).replace('.', ',')} % sur le devis ${quoteRef}`, roundMoney((quoteNetHT * pct) / 100, currency), `Base : net HT du devis ${quoteNetHT}`);
}

/**
 * Facture de situation : avancement cumulé (en %) appliqué au net HT du devis, moins ce qui a
 * déjà été facturé (acomptes et situations précédentes). Refuse un montant négatif ou nul.
 */
export function situationBody(quoteRef: string, quoteNetHT: number, cumulativePct: number, alreadyHT: number, currency: string, number: number): DocBody {
  if (!(cumulativePct > 0 && cumulativePct <= 100)) throw new Error('Avancement cumulé entre 0 et 100 %.');
  const target = roundMoney((quoteNetHT * cumulativePct) / 100, currency);
  const amount = roundMoney(target - alreadyHT, currency);
  if (amount <= 0) throw new Error(`Rien à facturer : ${cumulativePct} % du devis (${target}) est déjà couvert par les factures émises (${alreadyHT}).`);
  return oneLine(`Situation n° ${number} — avancement cumulé ${String(cumulativePct).replace('.', ',')} % du devis ${quoteRef}`, amount,
    `${cumulativePct} % × ${quoteNetHT} = ${target} ; déjà facturé ${alreadyHT}`);
}

/** Facture finale : toutes les lignes du devis, moins les montants HT déjà facturés. */
export function finaleBody(quoteBody: DocBody, previous: { reference: string; net_ht: number }[]): DocBody {
  const lots = quoteBody.lots.map((l) => ({ ...l, id: uid('lot'), lines: l.lines.map((x) => ({ ...x, id: uid('l') })) }));
  if (previous.length) {
    lots.push({
      id: uid('lot'), code: `LOT ${String(lots.length + 1).padStart(2, '0')}`, name: 'Déjà facturé',
      lines: previous.map((p) => newLine({ designation: `À déduire : facture ${p.reference}`, unit: 'ff', qty: 1, unitPrice: -p.net_ht })),
    });
  }
  return { lots };
}

/** Avoir : lignes de la facture d'origine en négatif (total ou partiel selon les lignes gardées). */
export function avoirBody(invoiceBody: DocBody, invoiceRef: string): DocBody {
  return {
    lots: invoiceBody.lots.map((l) => ({
      ...l, id: uid('lot'), name: `${l.name} (avoir sur ${invoiceRef})`,
      lines: l.lines.map((x) => (x.kind === 'titre' ? { ...x, id: uid('l') } : { ...x, id: uid('l'), unitPrice: x.unitPrice === null ? null : -x.unitPrice })),
    })),
  };
}

export function invoiceTotals(body: DocBody, settings: DocSettings) {
  return computeDoc(body, settings);
}

// ------------------------------------------------------------------ échéances et relances
export type DueState = 'brouillon' | 'payee' | 'annulee' | 'a_echeance' | 'echue' | 'en_cours';

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** État d'une facture pour les relances (§16.3) à la date `today` (AAAA-MM-JJ). */
export function dueState(i: InvoiceLike, today: string, beforeDays = 7): { state: DueState; days: number | null } {
  if (i.status === 'brouillon') return { state: 'brouillon', days: null };
  if (i.status === 'annulee') return { state: 'annulee', days: null };
  if (i.kind === 'avoir' || i.status === 'payee') return { state: 'payee', days: null };
  if (!i.due_date) return { state: 'en_cours', days: null };
  const d = daysBetween(today, i.due_date);
  if (d < 0) return { state: 'echue', days: -d };
  if (d <= beforeDays) return { state: 'a_echeance', days: d };
  return { state: 'en_cours', days: d };
}

export const balance = (i: InvoiceLike) => (i.kind === 'avoir' ? 0 : Math.max(0, i.total_ttc - i.amount_paid));

// ------------------------------------------------------------------ situation financière
export interface ExpenseLike {
  id: string;
  project_id: string | null;
  lot: string | null;
  category: string;
  label: string;
  amount_ht: number;
  amount_ttc: number;
  status: 'engagee' | 'facturee' | 'payee';
  receipt_path: string | null;
  expense_date: string;
}

export interface ProjectLike {
  id: string;
  budget_estimate: number | null;
  budget_validated: number | null;
  budget_revised: number | null;
  margin_target_pct: number | null;
}

export interface FinanceSummary {
  budgetInitial: number | null;
  budgetRevised: number | null;
  /** Coût prévisionnel : somme des budgets de lots si renseignés, sinon budget révisé, validé ou estimatif. */
  plannedCost: number | null;
  plannedCostSource: string;
  /** Montant HT des devis acceptés. */
  soldHT: number;
  /** Dépenses HT par état (§17.3 : engagé, facturé, payé). */
  committedHT: number;
  billedByVendorsHT: number;
  paidOutHT: number;
  expensesHT: number;
  /** Factures clients émises (net des avoirs). */
  invoicedHT: number;
  invoicedTTC: number;
  collectedTTC: number;
  toCollectTTC: number;
  /** Dépenses facturées par les fournisseurs et non encore payées. */
  toPayHT: number;
  plannedMargin: number | null;
  plannedMarginPct: number | null;
  /** Marge constatée = facturé HT − dépenses HT enregistrées (données disponibles). */
  actualMargin: number | null;
  actualMarginPct: number | null;
  byLot: { lot: string; budget: number | null; spentHT: number }[];
  limits: string[];
}

export function projectFinance(p: ProjectLike, lots: { name: string; budget: number | null }[], acceptedQuotesHT: number, invoices: InvoiceLike[], expenses: ExpenseLike[]): FinanceSummary {
  const limits: string[] = [];
  const valid = invoices.filter((i) => i.status !== 'brouillon' && i.status !== 'annulee');
  const invoicedHT = valid.reduce((s, i) => s + i.net_ht, 0);
  const invoicedTTC = valid.reduce((s, i) => s + i.total_ttc, 0);
  const collectedTTC = valid.filter((i) => i.kind !== 'avoir').reduce((s, i) => s + i.amount_paid, 0);
  const toCollectTTC = valid.reduce((s, i) => s + balance(i), 0);
  const sum = (st?: ExpenseLike['status']) => expenses.filter((e) => !st || e.status === st).reduce((s, e) => s + e.amount_ht, 0);
  const lotBudgets = lots.filter((l) => l.budget !== null);
  let plannedCost: number | null = null;
  let plannedCostSource = 'non renseigné';
  if (lotBudgets.length) {
    plannedCost = lotBudgets.reduce((s, l) => s + (l.budget ?? 0), 0);
    plannedCostSource = `budgets de ${lotBudgets.length} lot(s)`;
    if (lotBudgets.length < lots.length) limits.push(`${lots.length - lotBudgets.length} lot(s) sans budget : coût prévisionnel partiel.`);
  } else if (p.budget_revised !== null) { plannedCost = p.budget_revised; plannedCostSource = 'budget révisé'; }
  else if (p.budget_validated !== null) { plannedCost = p.budget_validated; plannedCostSource = 'budget validé'; }
  else if (p.budget_estimate !== null) { plannedCost = p.budget_estimate; plannedCostSource = 'budget estimatif'; }
  else limits.push('Aucun budget renseigné : marge prévisionnelle non calculable.');
  const expensesHT = sum();
  const plannedMargin = plannedCost !== null && acceptedQuotesHT > 0 ? acceptedQuotesHT - plannedCost : null;
  if (!acceptedQuotesHT) limits.push('Aucun devis accepté : chiffre d’affaires prévisionnel inconnu.');
  const actualMargin = invoicedHT > 0 ? invoicedHT - expensesHT : null;
  if (invoicedHT === 0) limits.push('Rien n’est encore facturé : marge constatée non calculable.');
  const lotNames = new Set([...lots.map((l) => l.name), ...expenses.map((e) => e.lot ?? '')]);
  const byLot = [...lotNames].map((name) => ({
    lot: name || 'Sans lot',
    budget: lots.find((l) => l.name === name)?.budget ?? null,
    spentHT: expenses.filter((e) => (e.lot ?? '') === name).reduce((s, e) => s + e.amount_ht, 0),
  })).filter((x) => x.budget !== null || x.spentHT > 0);
  return {
    budgetInitial: p.budget_validated ?? p.budget_estimate, budgetRevised: p.budget_revised, plannedCost, plannedCostSource, soldHT: acceptedQuotesHT,
    committedHT: sum('engagee'), billedByVendorsHT: sum('facturee'), paidOutHT: sum('payee'), expensesHT,
    invoicedHT, invoicedTTC, collectedTTC, toCollectTTC, toPayHT: sum('facturee'),
    plannedMargin, plannedMarginPct: plannedMargin !== null && acceptedQuotesHT ? (plannedMargin / acceptedQuotesHT) * 100 : null,
    actualMargin, actualMarginPct: actualMargin !== null && invoicedHT ? (actualMargin / invoicedHT) * 100 : null,
    byLot, limits,
  };
}

// ------------------------------------------------------------------ alertes (§17.3)
export interface FinanceAlert { level: 'warn' | 'bad'; code: string; text: string }

export function financeAlerts(f: FinanceSummary, p: ProjectLike, invoices: InvoiceLike[], expenses: ExpenseLike[], allOrgExpenses: ExpenseLike[], today: string): FinanceAlert[] {
  const out: FinanceAlert[] = [];
  if (f.plannedCost !== null && f.expensesHT > f.plannedCost) out.push({ level: 'bad', code: 'budget', text: `Dépenses (${fmt(f.expensesHT)} HT) supérieures au coût prévisionnel (${fmt(f.plannedCost)}, ${f.plannedCostSource}).` });
  for (const l of f.byLot) if (l.budget !== null && l.spentHT > l.budget) out.push({ level: 'warn', code: 'budget_lot', text: `Lot « ${l.lot} » : ${fmt(l.spentHT)} dépensés pour un budget de ${fmt(l.budget)}.` });
  for (const i of invoices) {
    const d = dueState(i, today);
    if (d.state === 'echue') out.push({ level: 'bad', code: 'retard', text: `Facture ${i.reference} échue depuis ${d.days} jour(s) : ${fmt(balance(i))} restent à encaisser.` });
  }
  if (p.margin_target_pct !== null) {
    if (f.actualMarginPct !== null && f.actualMarginPct < p.margin_target_pct) out.push({ level: 'warn', code: 'marge', text: `Marge constatée ${f.actualMarginPct.toFixed(1).replace('.', ',')} % inférieure à l’objectif de ${p.margin_target_pct} %.` });
    else if (f.actualMarginPct === null && f.plannedMarginPct !== null && f.plannedMarginPct < p.margin_target_pct) out.push({ level: 'warn', code: 'marge', text: `Marge prévisionnelle ${f.plannedMarginPct.toFixed(1).replace('.', ',')} % inférieure à l’objectif de ${p.margin_target_pct} %.` });
  }
  const noReceipt = expenses.filter((e) => e.status !== 'engagee' && !e.receipt_path);
  if (noReceipt.length) out.push({ level: 'warn', code: 'justificatif', text: `${noReceipt.length} dépense(s) facturée(s) ou payée(s) sans justificatif.` });
  // Achat inhabituel : plus de 3 fois la médiane des dépenses de la même catégorie (au moins 5 références).
  for (const e of expenses) {
    const same = allOrgExpenses.filter((x) => x.category === e.category && x.id !== e.id).map((x) => x.amount_ht).sort((a, b) => a - b);
    if (same.length < 5) continue;
    const med = same[Math.floor(same.length / 2)];
    if (med > 0 && e.amount_ht > 3 * med) out.push({ level: 'warn', code: 'inhabituel', text: `Dépense inhabituelle : « ${e.label} » (${fmt(e.amount_ht)}) dépasse 3 fois la dépense habituelle de cette catégorie (${fmt(med)}).` });
  }
  return out;
}

/** Hausse de prix d'un article de la bibliothèque (historique) au-delà d'un seuil. */
export function priceRises(history: { item_id: string; designation: string; price: number; at: string }[], thresholdPct = 10): FinanceAlert[] {
  const by = new Map<string, typeof history>();
  for (const h of history) by.set(h.item_id, [...(by.get(h.item_id) ?? []), h]);
  const out: FinanceAlert[] = [];
  for (const list of by.values()) {
    const s = [...list].sort((a, b) => a.at.localeCompare(b.at));
    if (s.length < 2) continue;
    const prev = s[s.length - 2].price, last = s[s.length - 1].price;
    if (prev > 0 && ((last - prev) / prev) * 100 >= thresholdPct) {
      out.push({ level: 'warn', code: 'hausse_prix', text: `Hausse de ${(((last - prev) / prev) * 100).toFixed(0)} % : « ${s[0].designation} » (${fmt(prev)} → ${fmt(last)}).` });
    }
  }
  return out;
}

const fmt = (v: number) => Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' ');
