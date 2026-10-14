// Rapports et exports (§21) : rapports construits sur les données enregistrées, filtrés par
// période et par projet, exportés en PDF (impression), Excel ou CSV, avec leurs limites.

import { BarChart3, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { INVOICE_KIND_LABEL } from '../../engine/finance';
import {
  budgetComparison, expensesReport, financialReport, invoicesSummary, lotQuantities, paymentsReport, periodLabel, progressReport,
  purchasesReport, quotesSummary, siteReport, stockReport, type Names, type Period, type Report,
} from '../../engine/reports';
import { useRows } from '../../lib/api';
import { downloadBlob, safeFileName } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { EXPENSE_CATEGORIES, EXPENSE_STATUS, INVOICE_STATUS, ORDER_STATUS, PAYMENT_METHODS, QUOTE_STATUS, REPORT_STATUS, RESERVE_STATUS, TASK_STATUS, today } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { Contact, DailyReport, Expense, Invoice, MetreDoc, Module, Payment, PriceItem, Project, ProjectLot, PurchaseOrder, Quote, Reserve, StockLevel, Task, Warehouse } from '../../lib/types';
import { Button, Card, EmptyState, Field, Input, Notice, PageHeader, Select, Spinner, useToast } from '../../ui';
import { formatCell } from '../../docs/report-export';

type Kind = 'chantier' | 'financier' | 'depenses' | 'avancement' | 'achats' | 'stocks' | 'devis' | 'factures' | 'paiements' | 'quantitatif' | 'budget';
const CATALOG: { id: Kind; label: string; needs: Module[]; project: 'aucun' | 'option' | 'requis'; period: boolean; hint: string }[] = [
  { id: 'chantier', label: 'Rapport de chantier', needs: ['planning'], project: 'requis', period: true, hint: 'Avancement, tâches, rapports journaliers de la période, réserves.' },
  { id: 'financier', label: 'Rapport financier', needs: ['factures', 'depenses'], project: 'aucun', period: true, hint: 'Par chantier : budget, devis acceptés, facturé, encaissé, dépenses, marge constatée.' },
  { id: 'depenses', label: 'Rapport des dépenses', needs: ['depenses'], project: 'option', period: true, hint: 'Par catégorie et en détail, justificatifs manquants signalés.' },
  { id: 'avancement', label: 'Rapport d’avancement', needs: ['planning'], project: 'aucun', period: false, hint: 'Avancement mesuré et prévu de chaque chantier actif, tâches en retard.' },
  { id: 'achats', label: 'Rapport des achats', needs: ['achats'], project: 'option', period: true, hint: 'Commandes, réceptions, factures fournisseurs et écarts.' },
  { id: 'stocks', label: 'Rapport des stocks', needs: ['stocks'], project: 'aucun', period: false, hint: 'État du stock par dépôt, seuils, alertes, valeur au prix d’achat.' },
  { id: 'devis', label: 'Synthèse des devis', needs: ['devis'], project: 'option', period: true, hint: 'Devis de la période, statuts, montants, taux d’acceptation.' },
  { id: 'factures', label: 'Synthèse des factures', needs: ['factures'], project: 'option', period: true, hint: 'Factures et avoirs émis, payé, reste, échues.' },
  { id: 'paiements', label: 'État des paiements', needs: ['factures'], project: 'option', period: true, hint: 'Paiements déclarés par mode et en détail.' },
  { id: 'quantitatif', label: 'Quantitatif par lot', needs: ['metres'], project: 'requis', period: false, hint: 'Quantités des métrés du projet regroupées par lot et ouvrage.' },
  { id: 'budget', label: 'Comparatif budget prévisionnel / réel', needs: ['projets', 'depenses'], project: 'requis', period: false, hint: 'Budget par lot, dépenses réelles, écart et taux de consommation.' },
];

const monthStart = (d: string) => d.slice(0, 8) + '01';
const PRESETS: { id: string; label: string; period: (t: string) => Period }[] = [
  { id: 'mois', label: 'Ce mois', period: (t) => ({ from: monthStart(t), to: t }) },
  { id: 'trimestre', label: 'Ce trimestre', period: (t) => ({ from: `${t.slice(0, 4)}-${String(Math.floor((+t.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`, to: t }) },
  { id: 'annee', label: 'Cette année', period: (t) => ({ from: `${t.slice(0, 4)}-01-01`, to: t }) },
  { id: 'tout', label: 'Toutes dates', period: () => ({ from: null, to: null }) },
];

export function ReportsPage() {
  const { org, can } = useOrg();
  const toast = useToast();
  const now = today();
  const available = CATALOG.filter((r) => r.needs.every((m) => can(m, 'consulter')));
  const [kind, setKind] = useState<Kind | null>(available[0]?.id ?? null);
  const def = CATALOG.find((r) => r.id === kind) ?? null;
  const [period, setPeriod] = useState<Period>(PRESETS[2].period(now));
  const [pid, setPid] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const need = (k: Kind[]) => !!kind && k.includes(kind);
  const projects = useRows<Project>('projects', org?.id, { order: ['created_at', false], enabled: can('projets', 'consulter') });
  const contacts = useRows<Contact>('contacts', org?.id, { select: 'id, name, kind', key: ['noms'], enabled: can('clients', 'consulter') });
  const quotes = useRows<Quote>('quotes', org?.id, { select: 'id, kind, reference, title, status, issue_date, project_id, client_id, total_ht, total_ttc, archived_at, incomplete_lines', key: ['rapports'], enabled: need(['financier', 'devis', 'budget']) && can('devis', 'consulter') });
  const invoices = useRows<Invoice>('invoices', org?.id, { select: 'id, kind, status, reference, title, quote_id, project_id, client_id, net_ht, total_ttc, amount_paid, issue_date, due_date', key: ['rapports'], enabled: need(['financier', 'factures', 'paiements']) });
  const payments = useRows<Payment>('payments', org?.id, { key: ['rapports'], enabled: need(['financier', 'paiements']) });
  const expenses = useRows<Expense>('expenses', org?.id, { key: ['rapports'], enabled: need(['financier', 'depenses', 'budget']) });
  const tasks = useRows<Task>('tasks', org?.id, { key: ['rapports'], enabled: need(['avancement', 'chantier']) });
  const dailies = useRows<DailyReport>('daily_reports', org?.id, { filter: (q) => q.eq('project_id', pid), key: ['rapports', pid], enabled: need(['chantier']) && !!pid });
  const reserves = useRows<Reserve>('reserves', org?.id, { filter: (q) => q.eq('project_id', pid), key: ['rapports', pid], enabled: need(['chantier']) && !!pid });
  const orders = useRows<PurchaseOrder>('purchase_orders', org?.id, { key: ['rapports'], enabled: need(['achats']) });
  const levels = useRows<StockLevel>('stock_levels', org?.id, { key: ['rapports'], enabled: need(['stocks']) });
  const items = useRows<PriceItem>('price_items', org?.id, { select: 'id, designation, unit, purchase_price, kind', filter: (q) => q.eq('kind', 'article'), key: ['rapports'], enabled: need(['stocks']) });
  const warehouses = useRows<Warehouse>('warehouses', org?.id, { key: ['rapports'], enabled: need(['stocks']) });
  const metres = useRows<MetreDoc>('metres', org?.id, { filter: (q) => q.eq('project_id', pid).is('archived_at', null), key: ['rapports', pid], enabled: need(['quantitatif']) && !!pid });
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', pid), order: ['sort'], key: [pid], enabled: need(['budget']) && !!pid });
  const all = [projects, contacts, quotes, invoices, payments, expenses, tasks, dailies, reserves, orders, levels, items, warehouses, metres, lots];
  const loading = all.some((q) => q.isLoading && q.fetchStatus !== 'idle');
  const error = all.find((q) => q.error)?.error;
  const cur = org?.currency ?? 'XOF';
  const project = (projects.data ?? []).find((p) => p.id === pid) ?? null;

  const report = useMemo<Report | null>(() => {
    if (!def || loading) return null;
    if (def.project === 'requis' && !project) return null;
    const names: Names = {
      contacts: new Map((contacts.data ?? []).map((x) => [x.id, x.name])),
      projects: new Map((projects.data ?? []).map((x) => [x.id, `${x.reference} · ${x.name}`])),
      items: new Map((items.data ?? []).map((i) => [i.id, { name: i.designation, unit: i.unit, price: i.purchase_price }])),
      warehouses: new Map((warehouses.data ?? []).map((w) => [w.id, w.name])),
    };
    const label = (m: Record<string, { label: string }>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.label]));
    const p = pid || null;
    const ps = projects.data ?? [];
    switch (def.id) {
      case 'chantier': return siteReport(project!, tasks.data ?? [], dailies.data ?? [], reserves.data ?? [], period, now, cur, { task: label(TASK_STATUS), report: label(REPORT_STATUS), reserve: label(RESERVE_STATUS) });
      case 'financier': return financialReport(ps.filter((x) => !x.archived_at), quotes.data ?? [], invoices.data ?? [], payments.data ?? [], expenses.data ?? [], period, cur);
      case 'depenses': return expensesReport(expenses.data ?? [], names, period, p, cur, EXPENSE_CATEGORIES, label(EXPENSE_STATUS));
      case 'avancement': return progressReport(ps, tasks.data ?? [], now, cur);
      case 'achats': return purchasesReport(orders.data ?? [], names, period, p, cur, label(ORDER_STATUS));
      case 'stocks': return stockReport((levels.data ?? []).map((l) => ({ ...l, qty: Number(l.qty), min_qty: l.min_qty === null ? null : Number(l.min_qty) })), names, cur, now);
      case 'devis': return quotesSummary(quotes.data ?? [], names, period, p, cur, label(QUOTE_STATUS));
      case 'factures': return invoicesSummary(invoices.data ?? [], names, period, p, cur, now, label(INVOICE_STATUS), INVOICE_KIND_LABEL);
      case 'paiements': return paymentsReport(payments.data ?? [], invoices.data ?? [], names, period, p, cur, PAYMENT_METHODS);
      case 'quantitatif': return lotQuantities(metres.data ?? [], `${project!.reference} · ${project!.name}`, cur);
      case 'budget': return budgetComparison(project!, (lots.data ?? []).map((l) => ({ name: l.name, budget: l.budget ?? null })), expenses.data ?? [], quotes.data ?? [], cur);
    }
  }, [def, loading, project, pid, period, now, cur, contacts.data, projects.data, items.data, warehouses.data, tasks.data, dailies.data, reserves.data, quotes.data, invoices.data, payments.data, expenses.data, orders.data, levels.data, metres.data, lots.data]);

  const fileBase = report ? safeFileName(`${report.title}${report.project ? '_' + report.project : ''}_${now}`) : 'rapport';
  const run = async (what: string, fn: () => Promise<void>) => { setBusy(what); try { await fn(); } catch (e) { toast('bad', errorMessage(e)); } finally { setBusy(null); } };
  const exportPdf = (print: boolean) => run(print ? 'print' : 'pdf', async () => {
    const { buildReportPdf } = await import('../../docs/report-export');
    const doc = await buildReportPdf(org!, report!);
    if (print) { doc.autoPrint(); window.open(doc.output('bloburl'), '_blank', 'noopener'); } else doc.save(`${fileBase}.pdf`);
  });
  const exportXlsx = () => run('xlsx', async () => {
    const { buildReportXlsx } = await import('../../docs/report-export');
    downloadBlob(new Blob([await buildReportXlsx(org!, report!)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase}.xlsx`);
  });
  const exportCsv = () => run('csv', async () => {
    const { buildReportCsv } = await import('../../docs/report-export');
    downloadBlob(new Blob([buildReportCsv(report!)], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`);
  });
  const canExport = can('rapports', 'exporter');

  if (!can('rapports', 'consulter')) return <><PageHeader title="Rapports" /><Notice tone="warn">Votre rôle ne donne pas accès aux rapports. Demandez à l’administrateur de votre entreprise.</Notice></>;
  if (!available.length) return <><PageHeader title="Rapports" /><Notice tone="warn">Aucun rapport n’est accessible avec vos droits actuels.</Notice></>;
  return (
    <>
      <PageHeader title="Rapports" subtitle="Rapports calculés sur vos données enregistrées, avec leur période, leur projet et leurs limites ; export PDF, Excel, CSV ou impression." />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card bodyClass="p-1.5" title="Rapports disponibles">
          <ul role="listbox" aria-label="Rapports disponibles">
            {available.map((r) => (
              <li key={r.id}>
                <button type="button" role="option" aria-selected={kind === r.id} onClick={() => setKind(r.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left ${kind === r.id ? 'bg-navy-900 text-white' : 'hover:bg-navy-50'}`}>
                  <span className="block text-[13.5px] font-semibold">{r.label}</span>
                  <span className={`block text-[11.5px] ${kind === r.id ? 'text-white/70' : 'text-muted'}`}>{r.hint}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-3 py-2 text-[12px] text-muted">DQE et BPU s’exportent depuis le module <Link className="link" to="/app/dqe">DQE et BPU</Link>.</p>
        </Card>
        <div className="grid content-start gap-4">
          {def && (
            <Card>
              <div className="flex flex-wrap items-end gap-3">
                {def.period && <>
                  <Field label="Période" className="w-40">
                    <Select value={PRESETS.find((x) => JSON.stringify(x.period(now)) === JSON.stringify(period))?.id ?? ''} onChange={(e) => { const pr = PRESETS.find((x) => x.id === e.target.value); if (pr) setPeriod(pr.period(now)); }}>
                      <option value="">Personnalisée</option>{PRESETS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Du" className="w-40"><Input type="date" value={period.from ?? ''} onChange={(e) => setPeriod({ ...period, from: e.target.value || null })} /></Field>
                  <Field label="Au" className="w-40"><Input type="date" value={period.to ?? ''} onChange={(e) => setPeriod({ ...period, to: e.target.value || null })} /></Field>
                </>}
                {def.project !== 'aucun' && (
                  <Field label={def.project === 'requis' ? 'Projet (obligatoire)' : 'Projet'} className="w-72">
                    <Select value={pid} onChange={(e) => setPid(e.target.value)}>
                      <option value="">{def.project === 'requis' ? '— Choisir —' : 'Tous les projets'}</option>
                      {(projects.data ?? []).filter((p) => !p.archived_at || p.id === pid).map((p) => <option key={p.id} value={p.id}>{p.reference} · {p.name}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
            </Card>
          )}
          {error ? <Notice tone="bad">{errorMessage(error)}</Notice>
            : def?.project === 'requis' && !project ? <Card><EmptyState icon={<BarChart3 size={22} />} title="Choisissez un projet">Ce rapport porte sur un seul projet.</EmptyState></Card>
              : loading || !report ? <Spinner />
                : <ReportPreview report={report} actions={canExport ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon={<FileText size={15} />} loading={busy === 'pdf'} onClick={() => exportPdf(false)}>PDF</Button>
                    <Button size="sm" icon={<FileSpreadsheet size={15} />} loading={busy === 'xlsx'} onClick={exportXlsx}>Excel</Button>
                    <Button size="sm" icon={<Download size={15} />} loading={busy === 'csv'} onClick={exportCsv}>CSV</Button>
                    <Button size="sm" icon={<Printer size={15} />} loading={busy === 'print'} onClick={() => exportPdf(true)}>Imprimer</Button>
                  </div>) : <span className="text-[12px] text-muted">Export : droit « exporter » sur les rapports requis.</span>} />}
        </div>
      </div>
    </>
  );
}

function ReportPreview({ report, actions }: { report: Report; actions: React.ReactNode }) {
  const LIMIT = 100;
  return (
    <Card title={report.title} subtitle={`${periodLabel(report.period)}${report.project ? ` · ${report.project}` : ''} · généré le ${new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`} actions={actions}>
      {report.facts.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {report.facts.map(([k, v, type]) => <div key={k} className="rounded-lg bg-navy-50/70 px-3 py-2"><span className="block text-[11.5px] text-muted">{k}</span><b className="tabular text-[15px] text-navy-900">{formatCell(v, type, report.currency)}</b></div>)}
        </div>
      )}
      {report.sections.map((s) => (
        <div key={s.title} className="mb-5">
          <h3 className="mb-1.5 text-[13.5px] font-bold text-navy-900">{s.title} <span className="font-normal text-muted">({s.rows.length})</span></h3>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="bg-navy-50 text-left text-[11px] uppercase tracking-wide text-muted"><tr>{s.columns.map((c) => <th key={c.key} className={`px-2.5 py-2 ${c.type === 'text' || c.type === 'date' ? '' : 'text-right'}`}>{c.label}</th>)}</tr></thead>
              <tbody>
                {!s.rows.length && <tr><td colSpan={s.columns.length} className="px-2.5 py-3 text-muted">Aucune donnée.</td></tr>}
                {s.rows.slice(0, LIMIT).map((row, i) => (
                  <tr key={i} className="border-t border-line-2">{s.columns.map((c) => <td key={c.key} className={`px-2.5 py-1.5 ${c.type === 'text' || c.type === 'date' ? '' : 'tabular text-right'}`}>{formatCell(row[c.key] ?? null, c.type, report.currency)}</td>)}</tr>
                ))}
              </tbody>
              {s.totals && <tfoot className="border-t-2 border-line bg-navy-50/60 font-bold"><tr>{s.columns.map((c) => <td key={c.key} className={`px-2.5 py-1.5 ${c.type === 'text' || c.type === 'date' ? '' : 'tabular text-right'}`}>{s.totals![c.key] === undefined ? '' : typeof s.totals![c.key] === 'string' ? s.totals![c.key] : formatCell(s.totals![c.key] ?? null, c.type, report.currency)}</td>)}</tr></tfoot>}
            </table>
          </div>
          {s.rows.length > LIMIT && <p className="mt-1 text-[12px] text-muted">Aperçu limité à {LIMIT} lignes ; les exports contiennent les {s.rows.length} lignes.</p>}
        </div>
      ))}
      {report.limits.length > 0 && <Notice tone="warn" title="Limites des données">{report.limits.map((l) => <span key={l} className="block">{l}</span>)}</Notice>}
    </Card>
  );
}
