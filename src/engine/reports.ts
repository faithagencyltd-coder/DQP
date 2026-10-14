// Rapports (§21) : chaque rapport est construit uniquement à partir des données enregistrées et
// porte sa période, son projet et ses limites. Les exports (PDF, Excel, CSV) lisent cette structure.

import { balance } from './finance';
import { groupMetre, type MetreLine, type MetreRules } from './metre';
import { roundMoney } from './money';
import { isLate, projectProgress, plannedProgress, type ProgressMethod, type TaskLike } from './planning';
import { receivedValue, reconcile, restockAlerts } from './purchasing';

export type ColType = 'text' | 'money' | 'number' | 'date' | 'pct';
export interface ReportColumn { key: string; label: string; type: ColType }
export type Cell = string | number | null;
export interface ReportSection { title: string; columns: ReportColumn[]; rows: Record<string, Cell>[]; totals?: Record<string, Cell> }
export interface Period { from: string | null; to: string | null }
export interface Report {
  title: string;
  period: Period;
  project: string | null;
  currency: string;
  facts: [string, Cell, ColType][];
  sections: ReportSection[];
  limits: string[];
}

export const inPeriod = (d: string | null | undefined, p: Period) => !!d && (!p.from || d.slice(0, 10) >= p.from) && (!p.to || d.slice(0, 10) <= p.to);
export const periodLabel = (p: Period) => {
  const fr = (d: string) => d.split('-').reverse().join('/');
  return p.from && p.to ? `du ${fr(p.from)} au ${fr(p.to)}` : p.from ? `depuis le ${fr(p.from)}` : p.to ? `jusqu’au ${fr(p.to)}` : 'toutes dates';
};
const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
const c = (key: string, label: string, type: ColType = 'text'): ReportColumn => ({ key, label, type });

// ---------------------------------------------------------------- données d'entrée
export interface RProject { id: string; reference: string; name: string; status: string; archived_at: string | null; budget_estimate: number | null; budget_validated: number | null; budget_revised?: number | null; progress_method?: ProgressMethod; client_id: string | null }
export interface RQuote { id: string; kind: string; reference: string; title: string; status: string; issue_date: string; project_id: string | null; client_id: string | null; total_ht: number | null; total_ttc: number | null; archived_at: string | null; incomplete_lines: number }
export interface RInvoice { id: string; kind: 'simple' | 'acompte' | 'situation' | 'finale' | 'avoir'; status: 'brouillon' | 'emise' | 'partielle' | 'payee' | 'annulee'; reference: string | null; title: string; quote_id: string | null; project_id: string | null; client_id: string | null; net_ht: number; total_ttc: number; amount_paid: number; issue_date: string | null; due_date: string | null }
export interface RPayment { id: string; invoice_id: string; amount: number; paid_on: string; method: string; reference: string | null }
export interface RExpense { id: string; project_id: string | null; lot: string | null; supplier_id: string | null; category: string; label: string; expense_date: string; amount_ht: number; amount_ttc: number; status: string; supplier_invoice_ref: string | null; receipt_path: string | null }
export interface ROrder { id: string; reference: string; supplier_id: string | null; project_id: string | null; status: string; order_date: string; currency: string; total_ht: number; lines: { qty: number | null; unit_price: number | null; received_qty?: number }[]; supplier_invoice_ref: string | null; supplier_invoice_amount: number | null }
export interface RLevel { item_id: string; warehouse_id: string; qty: number; min_qty: number | null }
export interface RTask extends TaskLike { project_id: string }
export interface Names { contacts: Map<string, string>; projects: Map<string, string>; items?: Map<string, { name: string; unit: string; price: number | null }>; warehouses?: Map<string, string> }

const issued = (i: RInvoice) => i.status !== 'brouillon' && i.status !== 'annulee';
const plannedBudget = (p: RProject) => p.budget_revised ?? p.budget_validated ?? p.budget_estimate ?? null;

// ---------------------------------------------------------------- rapports

export function financialReport(projects: RProject[], quotes: RQuote[], invoices: RInvoice[], payments: RPayment[], expenses: RExpense[], period: Period, currency: string): Report {
  const limits: string[] = ['Les paiements sont déclarés par l’entreprise ; aucun n’est confirmé par un système de paiement.'];
  const inv = invoices.filter((i) => issued(i) && inPeriod(i.issue_date, period));
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const pay = payments.filter((p) => inPeriod(p.paid_on, period));
  const exp = expenses.filter((e) => inPeriod(e.expense_date, period));
  const rows = projects.map((p) => {
    const sold = sum(quotes.filter((q) => q.kind === 'devis' && q.status === 'accepte' && q.project_id === p.id), (q) => q.total_ht ?? 0);
    const invoiced = sum(inv.filter((i) => i.project_id === p.id), (i) => i.net_ht);
    const collected = sum(pay.filter((x) => invById.get(x.invoice_id)?.project_id === p.id), (x) => x.amount);
    const spent = sum(exp.filter((e) => e.project_id === p.id), (e) => e.amount_ht);
    return { projet: `${p.reference} · ${p.name}`, budget: plannedBudget(p), vendu: roundMoney(sold, currency), facture: roundMoney(invoiced, currency), encaisse: roundMoney(collected, currency), depenses: roundMoney(spent, currency), marge: invoiced ? roundMoney(invoiced - spent, currency) : null };
  }).filter((r) => r.budget !== null || r.vendu || r.facture || r.encaisse || r.depenses);
  const unassigned = sum(exp.filter((e) => !e.project_id), (e) => e.amount_ht);
  if (unassigned) limits.push(`Dépenses hors chantier sur la période : ${unassigned} (non réparties).`);
  if (rows.some((r) => r.budget === null)) limits.push('Certains chantiers n’ont pas de budget.');
  const totals = { projet: 'Total', budget: sum(rows, (r) => r.budget ?? 0), vendu: sum(rows, (r) => r.vendu), facture: sum(rows, (r) => r.facture), encaisse: sum(rows, (r) => r.encaisse), depenses: sum(rows, (r) => r.depenses), marge: null };
  const toCollect = sum(invoices.filter((i) => issued(i)), balance);
  return {
    title: 'Rapport financier', period, project: null, currency,
    facts: [['Facturé HT (période)', roundMoney(sum(inv, (i) => i.net_ht), currency), 'money'], ['Encaissé (période)', roundMoney(sum(pay, (p) => p.amount), currency), 'money'], ['Dépenses HT (période)', roundMoney(sum(exp, (e) => e.amount_ht), currency), 'money'], ['Reste à encaisser (à ce jour)', roundMoney(toCollect, currency), 'money']],
    sections: [{ title: 'Par chantier', columns: [c('projet', 'Chantier'), c('budget', 'Budget prévisionnel', 'money'), c('vendu', 'Devis acceptés HT', 'money'), c('facture', 'Facturé HT', 'money'), c('encaisse', 'Encaissé', 'money'), c('depenses', 'Dépenses HT', 'money'), c('marge', 'Marge constatée', 'money')], rows, totals }],
    limits,
  };
}

export function expensesReport(expenses: RExpense[], names: Names, period: Period, projectId: string | null, currency: string, categories: Record<string, string>, statuses: Record<string, string>): Report {
  const rows = expenses.filter((e) => inPeriod(e.expense_date, period) && (!projectId || e.project_id === projectId)).sort((a, b) => a.expense_date.localeCompare(b.expense_date)).map((e) => ({
    date: e.expense_date, projet: names.projects.get(e.project_id ?? '') ?? 'Hors chantier', lot: e.lot ?? '', categorie: categories[e.category] ?? e.category, libelle: e.label,
    fournisseur: names.contacts.get(e.supplier_id ?? '') ?? '', ht: e.amount_ht, ttc: e.amount_ttc, etat: statuses[e.status] ?? e.status, justificatif: e.receipt_path ? 'oui' : 'non',
  }));
  const byCat = Object.entries(rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.categorie]: (m[r.categorie] ?? 0) + Number(r.ht) }), {})).map(([categorie, ht]) => ({ categorie, ht: roundMoney(ht, currency) })).sort((a, b) => b.ht - a.ht);
  const missing = rows.filter((r) => r.justificatif === 'non').length;
  return {
    title: 'Rapport des dépenses', period, project: projectId ? names.projects.get(projectId) ?? null : null, currency,
    facts: [['Nombre de dépenses', rows.length, 'number'], ['Total HT', roundMoney(sum(rows, (r) => Number(r.ht)), currency), 'money'], ['Total TTC', roundMoney(sum(rows, (r) => Number(r.ttc)), currency), 'money']],
    sections: [
      { title: 'Par catégorie', columns: [c('categorie', 'Catégorie'), c('ht', 'Montant HT', 'money')], rows: byCat, totals: { categorie: 'Total', ht: sum(byCat, (r) => r.ht) } },
      { title: 'Détail', columns: [c('date', 'Date', 'date'), c('projet', 'Chantier'), c('lot', 'Lot'), c('categorie', 'Catégorie'), c('libelle', 'Libellé'), c('fournisseur', 'Fournisseur'), c('ht', 'HT', 'money'), c('ttc', 'TTC', 'money'), c('etat', 'État'), c('justificatif', 'Justificatif')], rows, totals: { date: 'Total', ht: sum(rows, (r) => Number(r.ht)), ttc: sum(rows, (r) => Number(r.ttc)) } },
    ],
    limits: missing ? [`${missing} dépense(s) sans justificatif.`] : [],
  };
}

export function progressReport(projects: RProject[], tasks: RTask[], today: string, currency: string): Report {
  const limits: string[] = [];
  const rows = projects.filter((p) => !p.archived_at && !['termine', 'annule'].includes(p.status)).map((p) => {
    const pt = tasks.filter((t) => t.project_id === p.id);
    const method = p.progress_method ?? 'taches';
    const pr = projectProgress(pt, method);
    if (pr.excluded.length) limits.push(`${p.reference} : ${pr.excluded.length} tâche(s) exclue(s) du calcul faute de donnée.`);
    return { projet: `${p.reference} · ${p.name}`, methode: { taches: 'Tâches terminées', quantites: 'Quantités exécutées', ponderation: 'Pondération' }[method], taches: pt.length, terminees: pr.done, retard: pt.filter((t) => isLate(t, today)).length, mesure: pr.pct, prevu: plannedProgress(pt, method, today) };
  });
  if (rows.some((r) => !r.taches)) limits.push('Les chantiers sans tâche n’ont pas d’avancement mesurable.');
  return {
    title: 'Rapport d’avancement', period: { from: null, to: today }, project: null, currency, facts: [['Chantiers actifs', rows.length, 'number'], ['Tâches en retard', sum(rows, (r) => r.retard), 'number']],
    sections: [{ title: 'Par chantier', columns: [c('projet', 'Chantier'), c('methode', 'Méthode'), c('taches', 'Tâches', 'number'), c('terminees', 'Terminées', 'number'), c('retard', 'En retard', 'number'), c('mesure', 'Avancement mesuré', 'pct'), c('prevu', 'Avancement prévu', 'pct')], rows }],
    limits,
  };
}

export function purchasesReport(orders: ROrder[], names: Names, period: Period, projectId: string | null, currency: string, statuses: Record<string, string>): Report {
  const list = orders.filter((o) => inPeriod(o.order_date, period) && (!projectId || o.project_id === projectId) && o.status !== 'brouillon');
  const rows = list.map((o) => {
    const r = reconcile(o.lines, o.currency, o.supplier_invoice_amount);
    return { numero: o.reference, date: o.order_date, fournisseur: names.contacts.get(o.supplier_id ?? '') ?? '', chantier: names.projects.get(o.project_id ?? '') ?? '', statut: statuses[o.status] ?? o.status, commande: o.total_ht, recu: receivedValue(o.lines, o.currency), facture: o.supplier_invoice_amount, ecart: r.status === 'sans_facture' ? null : r.gap };
  });
  const gaps = rows.filter((r) => r.ecart !== null && Math.abs(Number(r.ecart)) > 1).length;
  return {
    title: 'Rapport des achats', period, project: projectId ? names.projects.get(projectId) ?? null : null, currency,
    facts: [['Commandes', rows.length, 'number'], ['Total commandé HT', roundMoney(sum(rows, (r) => r.commande), currency), 'money'], ['Écarts facture / réception', gaps, 'number']],
    sections: [{ title: 'Commandes', columns: [c('numero', 'Numéro'), c('date', 'Date', 'date'), c('fournisseur', 'Fournisseur'), c('chantier', 'Chantier'), c('statut', 'Statut'), c('commande', 'Commandé HT', 'money'), c('recu', 'Reçu HT', 'money'), c('facture', 'Facturé HT', 'money'), c('ecart', 'Écart', 'money')], rows, totals: { numero: 'Total', commande: sum(rows, (r) => r.commande), recu: sum(rows, (r) => r.recu) } }],
    limits: rows.some((r) => r.facture === null) ? ['Certaines commandes n’ont pas encore de facture fournisseur saisie.'] : [],
  };
}

export function stockReport(levels: RLevel[], names: Names, currency: string, today: string): Report {
  const alerts = new Set(restockAlerts(levels).map((l) => l.item_id + l.warehouse_id));
  const rows = levels.map((l) => {
    const it = names.items?.get(l.item_id);
    return { article: it?.name ?? 'Article', unite: it?.unit ?? '', depot: names.warehouses?.get(l.warehouse_id) ?? '', quantite: Number(l.qty), minimum: l.min_qty, alerte: alerts.has(l.item_id + l.warehouse_id) ? 'à réapprovisionner' : '', valeur: it?.price == null ? null : roundMoney(Math.max(0, Number(l.qty)) * it.price, currency) };
  }).sort((a, b) => a.article.localeCompare(b.article, 'fr'));
  return {
    title: 'Rapport des stocks', period: { from: null, to: today }, project: null, currency,
    facts: [['Lignes de stock', rows.length, 'number'], ['Alertes', alerts.size, 'number'], ['Valeur au prix d’achat', sum(rows, (r) => r.valeur ?? 0), 'money']],
    sections: [{ title: 'État du stock', columns: [c('article', 'Article'), c('unite', 'Unité'), c('depot', 'Dépôt'), c('quantite', 'Quantité', 'number'), c('minimum', 'Minimum', 'number'), c('alerte', 'Alerte'), c('valeur', 'Valeur HT', 'money')], rows, totals: { article: 'Total', valeur: sum(rows, (r) => r.valeur ?? 0) } }],
    limits: rows.some((r) => r.valeur === null) ? ['Articles sans prix d’achat : non valorisés.'] : [],
  };
}

export function quotesSummary(quotes: RQuote[], names: Names, period: Period, projectId: string | null, currency: string, statuses: Record<string, string>): Report {
  const rows = quotes.filter((q) => q.kind === 'devis' && !q.archived_at && inPeriod(q.issue_date, period) && (!projectId || q.project_id === projectId)).map((q) => ({
    numero: q.reference, date: q.issue_date, titre: q.title, client: names.contacts.get(q.client_id ?? '') ?? '', chantier: names.projects.get(q.project_id ?? '') ?? '', statut: statuses[q.status] ?? q.status, ht: q.total_ht, ttc: q.total_ttc, incomplet: q.incomplete_lines,
  }));
  const by = (s: string) => rows.filter((r) => r.statut === (statuses[s] ?? s));
  return {
    title: 'Synthèse des devis', period, project: projectId ? names.projects.get(projectId) ?? null : null, currency,
    facts: [['Devis', rows.length, 'number'], ['Acceptés', by('accepte').length, 'number'], ['Montant accepté TTC', sum(by('accepte'), (r) => r.ttc ?? 0), 'money'], ['Taux d’acceptation (devis décidés)', (() => { const dec = by('accepte').length + by('refuse').length; return dec ? Math.round((by('accepte').length / dec) * 1000) / 10 : null; })(), 'pct']],
    sections: [{ title: 'Devis', columns: [c('numero', 'Numéro'), c('date', 'Date', 'date'), c('titre', 'Objet'), c('client', 'Client'), c('chantier', 'Chantier'), c('statut', 'Statut'), c('ht', 'Total HT', 'money'), c('ttc', 'Total TTC', 'money')], rows, totals: { numero: 'Total', ht: sum(rows, (r) => r.ht ?? 0), ttc: sum(rows, (r) => r.ttc ?? 0) } }],
    limits: rows.some((r) => r.incomplet) ? ['Certains devis contiennent des lignes incomplètes (non comptées dans les totaux).'] : [],
  };
}

export function invoicesSummary(invoices: RInvoice[], names: Names, period: Period, projectId: string | null, currency: string, today: string, statuses: Record<string, string>, kinds: Record<string, string>): Report {
  const list = invoices.filter((i) => issued(i) && inPeriod(i.issue_date, period) && (!projectId || i.project_id === projectId));
  const rows = list.map((i) => ({
    numero: i.reference ?? '', type: kinds[i.kind] ?? i.kind, date: i.issue_date, client: names.contacts.get(i.client_id ?? '') ?? '', chantier: names.projects.get(i.project_id ?? '') ?? '',
    ht: i.net_ht, ttc: i.total_ttc, paye: i.kind === 'avoir' ? null : i.amount_paid, reste: i.kind === 'avoir' ? null : balance(i), echeance: i.due_date, etat: i.kind !== 'avoir' && balance(i) > 0 && i.due_date && i.due_date < today ? 'échue' : statuses[i.status] ?? i.status,
  }));
  return {
    title: 'Synthèse des factures', period, project: projectId ? names.projects.get(projectId) ?? null : null, currency,
    facts: [['Factures et avoirs émis', rows.length, 'number'], ['Facturé TTC', roundMoney(sum(rows, (r) => r.ttc), currency), 'money'], ['Reste à encaisser', roundMoney(sum(rows, (r) => r.reste ?? 0), currency), 'money'], ['Factures échues', rows.filter((r) => r.etat === 'échue').length, 'number']],
    sections: [{ title: 'Factures', columns: [c('numero', 'Numéro'), c('type', 'Type'), c('date', 'Date', 'date'), c('client', 'Client'), c('chantier', 'Chantier'), c('ht', 'HT', 'money'), c('ttc', 'TTC', 'money'), c('paye', 'Payé', 'money'), c('reste', 'Reste', 'money'), c('echeance', 'Échéance', 'date'), c('etat', 'État')], rows, totals: { numero: 'Total', ht: sum(rows, (r) => r.ht), ttc: sum(rows, (r) => r.ttc), paye: sum(rows, (r) => r.paye ?? 0), reste: sum(rows, (r) => r.reste ?? 0) } }],
    limits: ['Brouillons et factures annulées exclus.'],
  };
}

export function paymentsReport(payments: RPayment[], invoices: RInvoice[], names: Names, period: Period, projectId: string | null, currency: string, methods: Record<string, string>): Report {
  const inv = new Map(invoices.map((i) => [i.id, i]));
  const rows = payments.filter((p) => inPeriod(p.paid_on, period) && (!projectId || inv.get(p.invoice_id)?.project_id === projectId)).sort((a, b) => a.paid_on.localeCompare(b.paid_on)).map((p) => {
    const i = inv.get(p.invoice_id);
    return { date: p.paid_on, facture: i?.reference ?? '', client: names.contacts.get(i?.client_id ?? '') ?? '', chantier: names.projects.get(i?.project_id ?? '') ?? '', mode: methods[p.method] ?? p.method, reference: p.reference ?? '', montant: p.amount, statut: 'déclaré' };
  });
  const byMode = Object.entries(rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.mode]: (m[r.mode] ?? 0) + Number(r.montant) }), {})).map(([mode, montant]) => ({ mode, montant }));
  return {
    title: 'État des paiements', period, project: projectId ? names.projects.get(projectId) ?? null : null, currency,
    facts: [['Paiements', rows.length, 'number'], ['Total encaissé', roundMoney(sum(rows, (r) => Number(r.montant)), currency), 'money']],
    sections: [
      { title: 'Par mode de paiement', columns: [c('mode', 'Mode'), c('montant', 'Montant', 'money')], rows: byMode, totals: { mode: 'Total', montant: sum(byMode, (r) => r.montant) } },
      { title: 'Détail', columns: [c('date', 'Date', 'date'), c('facture', 'Facture'), c('client', 'Client'), c('chantier', 'Chantier'), c('mode', 'Mode'), c('reference', 'Référence'), c('montant', 'Montant', 'money'), c('statut', 'Statut')], rows, totals: { date: 'Total', montant: sum(rows, (r) => Number(r.montant)) } },
    ],
    limits: ['Paiements déclarés par l’entreprise, non confirmés par un système de paiement.'],
  };
}

export function lotQuantities(metres: { reference: string; title: string; status: string; rules: MetreRules; lines: MetreLine[] }[], project: string, currency: string): Report {
  const rows: Record<string, Cell>[] = [];
  let incomplete = 0;
  for (const m of metres) {
    for (const g of groupMetre(m.lines, m.rules)) {
      if (g.incomplete) incomplete++;
      rows.push({ lot: g.lot || 'Sans lot', designation: g.designation, unite: g.unit, quantite: g.qty, metre: m.reference, statut: m.status });
    }
  }
  rows.sort((a, b) => String(a.lot).localeCompare(String(b.lot), 'fr') || String(a.designation).localeCompare(String(b.designation), 'fr'));
  return {
    title: 'Quantitatif par lot', period: { from: null, to: null }, project, currency,
    facts: [['Métrés', metres.length, 'number'], ['Ouvrages', rows.length, 'number']],
    sections: [{ title: 'Quantités', columns: [c('lot', 'Lot'), c('designation', 'Désignation'), c('unite', 'Unité'), c('quantite', 'Quantité', 'number'), c('metre', 'Métré'), c('statut', 'Statut du métré')], rows }],
    limits: incomplete ? [`${incomplete} ouvrage(s) avec des dimensions manquantes : quantité laissée vide, non estimée.`] : [],
  };
}

export function budgetComparison(project: RProject, lots: { name: string; budget: number | null }[], expenses: RExpense[], quotes: RQuote[], currency: string): Report {
  const exp = expenses.filter((e) => e.project_id === project.id);
  const names = [...new Set([...lots.map((l) => l.name), ...exp.map((e) => e.lot ?? '')])];
  const rows = names.map((n) => {
    const budget = lots.find((l) => l.name === n)?.budget ?? null;
    const spent = roundMoney(sum(exp.filter((e) => (e.lot ?? '') === n), (e) => e.amount_ht), currency);
    return { lot: n || 'Sans lot', budget, reel: spent, ecart: budget === null ? null : roundMoney(spent - budget, currency), consomme: budget ? Math.round((spent / budget) * 1000) / 10 : null };
  }).filter((r) => r.budget !== null || r.reel);
  const sold = sum(quotes.filter((q) => q.kind === 'devis' && q.status === 'accepte' && q.project_id === project.id), (q) => q.total_ht ?? 0);
  const limits: string[] = [];
  if (!lots.some((l) => l.budget !== null)) limits.push('Aucun budget par lot : seul le budget global du projet est connu.');
  if (rows.some((r) => r.budget === null && r.reel)) limits.push('Dépenses sur des lots sans budget.');
  return {
    title: 'Comparatif budget prévisionnel / réel', period: { from: null, to: null }, project: `${project.reference} · ${project.name}`, currency,
    facts: [['Budget global', plannedBudget(project), 'money'], ['Devis acceptés HT', sold, 'money'], ['Dépenses HT', roundMoney(sum(exp, (e) => e.amount_ht), currency), 'money']],
    sections: [{ title: 'Par lot', columns: [c('lot', 'Lot'), c('budget', 'Budget', 'money'), c('reel', 'Dépenses réelles HT', 'money'), c('ecart', 'Écart', 'money'), c('consomme', 'Consommé', 'pct')], rows, totals: { lot: 'Total', budget: sum(rows, (r) => r.budget ?? 0), reel: sum(rows, (r) => r.reel) } }],
    limits,
  };
}

/** Valeur d'une cellule pour un fichier CSV / Excel (nombres bruts, dates ISO). */
export const rawCell = (v: Cell) => (v === null || v === undefined ? '' : v);

export interface RDaily { report_date: string; reference: string; status: string; work_done: string | null; workforce: { role: string; count: number }[]; incidents: string | null; delays: string | null; photos: unknown[] }
export interface RReserve { reference: string; title: string; location: string | null; status: string; due_date: string | null; raised_on: string; lifted_on: string | null }

/** Rapport de chantier : avancement, tâches, rapports journaliers de la période, réserves. */
export function siteReport(project: RProject, tasks: RTask[], dailies: RDaily[], reserves: RReserve[], period: Period, today: string, currency: string, labels: { task: Record<string, string>; report: Record<string, string>; reserve: Record<string, string> }): Report {
  const pt = tasks.filter((t) => t.project_id === project.id);
  const method = project.progress_method ?? 'taches';
  const pr = projectProgress(pt, method);
  const days = dailies.filter((d) => inPeriod(d.report_date, period)).sort((a, b) => a.report_date.localeCompare(b.report_date));
  const staff = (d: RDaily) => d.workforce.reduce((s, w) => s + Number(w.count || 0), 0);
  const open = reserves.filter((r) => r.status === 'ouverte' || r.status === 'en_cours');
  const limits = [...pr.excluded.map((e) => `Tâche « ${e.title} » exclue de l’avancement : ${e.reason}.`)];
  if (days.some((d) => d.status !== 'valide')) limits.push('Certains rapports journaliers de la période ne sont pas encore validés.');
  return {
    title: 'Rapport de chantier', period, project: `${project.reference} · ${project.name}`, currency,
    facts: [
      ['Avancement mesuré', pr.pct, 'pct'], ['Avancement prévu à ce jour', plannedProgress(pt, method, today), 'pct'],
      ['Tâches en retard', pt.filter((t) => isLate(t, today)).length, 'number'], ['Rapports journaliers (période)', days.length, 'number'],
      ['Effectif cumulé (période)', days.reduce((s, d) => s + staff(d), 0), 'number'], ['Jours avec incident', days.filter((d) => d.incidents?.trim()).length, 'number'],
      ['Réserves non levées', open.length, 'number'],
    ],
    sections: [
      { title: 'Tâches', columns: [c('tache', 'Tâche'), c('debut', 'Début', 'date'), c('fin', 'Fin', 'date'), c('statut', 'Statut'), c('retard', 'Retard')], rows: pt.map((t) => ({ tache: t.title, debut: t.start_date, fin: t.end_date, statut: labels.task[t.status] ?? t.status, retard: isLate(t, today) ? 'oui' : '' })) },
      { title: 'Rapports journaliers', columns: [c('date', 'Date', 'date'), c('travaux', 'Travaux exécutés'), c('effectif', 'Effectif', 'number'), c('incidents', 'Incidents'), c('retards', 'Retards'), c('photos', 'Photos', 'number'), c('statut', 'Statut')],
        rows: days.map((d) => ({ date: d.report_date, travaux: d.work_done ?? '', effectif: staff(d), incidents: d.incidents ?? '', retards: d.delays ?? '', photos: d.photos.length, statut: labels.report[d.status] ?? d.status })) },
      { title: 'Réserves', columns: [c('reference', 'Réf.'), c('reserve', 'Réserve'), c('lieu', 'Localisation'), c('constatee', 'Constatée le', 'date'), c('echeance', 'Échéance', 'date'), c('statut', 'Statut'), c('levee', 'Levée le', 'date')],
        rows: reserves.map((r) => ({ reference: r.reference, reserve: r.title, lieu: r.location ?? '', constatee: r.raised_on, echeance: r.due_date, statut: labels.reserve[r.status] ?? r.status, levee: r.lifted_on })) },
    ],
    limits,
  };
}
