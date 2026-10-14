// Situation financière d'un chantier (§17.2, §17.3) : budget initial et révisé, coût
// prévisionnel, dépenses engagées / facturées / payées, facturé, encaissé, marges et alertes.
// Chaque indicateur indique sa source ; les limites des données sont affichées.

import { AlertTriangle, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { financeAlerts, projectFinance } from '../../engine/finance';
import { formatMoney, formatNumber, parseNumber } from '../../engine/money';
import { updateRow, useAction, useRows } from '../../lib/api';
import { today } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { Expense, Invoice, Project, ProjectLot, Quote } from '../../lib/types';
import { Button, Card, Field, Input, KeyValue, Notice, Spinner } from '../../ui';
import { Allowed } from '../../ui/guard';
import { ExpenseForm } from './Expenses';

export function ProjectFinance({ project }: { project: Project }) {
  const { org, can } = useOrg();
  const cur = org?.currency ?? 'XOF';
  const lots = useRows<ProjectLot>('project_lots', org?.id, { filter: (q) => q.eq('project_id', project.id), order: ['sort'], key: [project.id] });
  const quotes = useRows<Quote>('quotes', org?.id, { select: 'id, kind, status, total_ht', filter: (q) => q.eq('project_id', project.id).eq('kind', 'devis'), key: ['finance', project.id] });
  const invoices = useRows<Invoice>('invoices', org?.id, { select: 'id, kind, status, reference, quote_id, project_id, client_id, net_ht, total_ttc, amount_paid, issue_date, due_date', filter: (q) => q.eq('project_id', project.id), key: [project.id], enabled: can('factures', 'consulter') });
  const allExpenses = useRows<Expense>('expenses', org?.id, { select: 'id, project_id, lot, category, label, amount_ht, amount_ttc, status, receipt_path, expense_date', enabled: can('depenses', 'consulter') });
  const [budget, setBudget] = useState<{ revised: string; target: string } | null>(null);
  const [newExpense, setNewExpense] = useState(false);

  const expenses = useMemo(() => (allExpenses.data ?? []).filter((e) => e.project_id === project.id), [allExpenses.data, project.id]);
  const sold = (quotes.data ?? []).filter((q) => q.status === 'accepte').reduce((s, q) => s + (q.total_ht ?? 0), 0);
  const f = useMemo(() => projectFinance(
    { id: project.id, budget_estimate: project.budget_estimate, budget_validated: project.budget_validated, budget_revised: project.budget_revised ?? null, margin_target_pct: project.margin_target_pct ?? null },
    (lots.data ?? []).map((l) => ({ name: l.name, budget: l.budget ?? null })), sold, invoices.data ?? [], expenses), [project, lots.data, sold, invoices.data, expenses]);
  const alerts = useMemo(() => financeAlerts(f, { id: project.id, budget_estimate: project.budget_estimate, budget_validated: project.budget_validated, budget_revised: project.budget_revised ?? null, margin_target_pct: project.margin_target_pct ?? null },
    invoices.data ?? [], expenses, allExpenses.data ?? [], today()), [f, project, invoices.data, expenses, allExpenses.data]);

  const saveBudget = useAction(() => updateRow('projects', project.id, { budget_revised: parseNumber(budget!.revised), margin_target_pct: parseNumber(budget!.target) }), { success: 'Budget mis à jour.', invalidate: [['projects']] });
  const saveLot = useAction(({ id, v }: { id: string; v: number | null }) => updateRow('project_lots', id, { budget: v }), { invalidate: [['project_lots']] });

  if (lots.isLoading || quotes.isLoading) return <Spinner />;
  const m = (v: number | null) => (v === null ? <span className="text-muted">non calculable</span> : formatMoney(v, cur));
  const pct = (v: number | null) => (v === null ? '' : ` (${formatNumber(v, 1)} %)`);
  return (
    <div className="grid gap-4">
      {alerts.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><AlertTriangle size={16} className="text-warn-600" /> Alertes du chantier</span>}>
          <ul className="grid gap-1.5 text-[13.5px]">{alerts.map((a, i) => <li key={i} className={a.level === 'bad' ? 'text-bad-600' : 'text-warn-700'}>• {a.text}</li>)}</ul>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Budget">
          <KeyValue items={[
            ['Budget initial', m(f.budgetInitial)], ['Budget révisé', m(f.budgetRevised)],
            ['Coût prévisionnel', <span key="c">{m(f.plannedCost)}<span className="block text-[11.5px] text-muted">{f.plannedCostSource}</span></span>],
            ['Devis acceptés (HT)', formatMoney(f.soldHT, cur)],
            ['Objectif de marge', project.margin_target_pct !== null && project.margin_target_pct !== undefined ? `${project.margin_target_pct} %` : '—'],
          ]} />
          <Allowed module="projets" action="modifier">
            {budget ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field label="Budget révisé"><Input inputMode="decimal" value={budget.revised} onChange={(e) => setBudget({ ...budget, revised: e.target.value })} /></Field>
                <Field label="Objectif de marge (%)"><Input inputMode="decimal" value={budget.target} onChange={(e) => setBudget({ ...budget, target: e.target.value })} /></Field>
                <Button size="sm" variant="primary" loading={saveBudget.isPending} onClick={() => saveBudget.mutate(undefined, { onSuccess: () => setBudget(null) })}>Enregistrer</Button>
                <Button size="sm" onClick={() => setBudget(null)}>Annuler</Button>
              </div>
            ) : <Button size="sm" className="mt-3" onClick={() => setBudget({ revised: project.budget_revised ? String(project.budget_revised) : '', target: project.margin_target_pct ? String(project.margin_target_pct) : '' })}>Modifier le budget</Button>}
          </Allowed>
        </Card>
        <Card title="Dépenses (HT)">
          <KeyValue items={[
            ['Engagées (commandées)', formatMoney(f.committedHT, cur)], ['Facturées par les fournisseurs', formatMoney(f.billedByVendorsHT, cur)],
            ['Payées', formatMoney(f.paidOutHT, cur)], ['Total des dépenses', <b key="t">{formatMoney(f.expensesHT, cur)}</b>], ['Reste à payer aux fournisseurs', formatMoney(f.toPayHT, cur)],
          ]} />
          <div className="mt-3 flex gap-2">
            <Allowed module="depenses" action="creer"><Button size="sm" icon={<Plus size={14} />} onClick={() => setNewExpense(true)}>Dépense</Button></Allowed>
            <Link to={`/app/depenses?projet=${project.id}`}><Button size="sm" variant="ghost">Voir les dépenses</Button></Link>
          </div>
        </Card>
        <Card title="Facturation client">
          <KeyValue items={[
            ['Facturé HT', formatMoney(f.invoicedHT, cur)], ['Facturé TTC', formatMoney(f.invoicedTTC, cur)], ['Encaissé', formatMoney(f.collectedTTC, cur)],
            ['Reste à encaisser', <b key="r">{formatMoney(f.toCollectTTC, cur)}</b>],
            ['Marge prévisionnelle', <span key="mp">{m(f.plannedMargin)}{pct(f.plannedMarginPct)}</span>],
            ['Marge constatée', <span key="mc">{m(f.actualMargin)}{pct(f.actualMarginPct)}<span className="block text-[11.5px] text-muted">facturé HT − dépenses enregistrées</span></span>],
          ]} />
          <Link to={`/app/factures?projet=${project.id}`}><Button size="sm" variant="ghost" className="mt-3">Voir les factures</Button></Link>
        </Card>
      </div>
      {f.limits.length > 0 && <Notice tone="navy" title="Limites des données">{f.limits.map((l) => <div key={l}>• {l}</div>)}</Notice>}
      <Card title="Budget et dépenses par lot" bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line bg-navy-50/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted"><th className="px-3 py-2">Lot</th><th className="px-3 text-right">Budget</th><th className="px-3 text-right">Dépensé HT</th><th className="px-3 text-right">Écart</th><th className="px-3">Consommation</th></tr></thead>
            <tbody>
              {(lots.data ?? []).map((l) => {
                const spent = expenses.filter((e) => e.lot === l.name).reduce((s, e) => s + e.amount_ht, 0);
                const b = l.budget ?? null;
                const ratio = b ? Math.min(1.5, spent / b) : null;
                return (
                  <tr key={l.id} className="border-b border-line-2">
                    <td className="px-3 py-2 font-semibold text-navy-900">{l.name}</td>
                    <td className="px-3 text-right">{can('projets', 'modifier') ? <LotBudget value={b} onSave={(v) => saveLot.mutate({ id: l.id, v })} /> : formatMoney(b, cur)}</td>
                    <td className="tabular px-3 text-right">{formatMoney(spent, cur)}</td>
                    <td className={`tabular px-3 text-right ${b !== null && spent > b ? 'font-semibold text-bad-600' : ''}`}>{b === null ? '—' : formatMoney(b - spent, cur)}</td>
                    <td className="px-3">{ratio !== null && <div className="h-2 w-40 overflow-hidden rounded bg-navy-50"><div className={`h-full ${ratio > 1 ? 'bg-bad-600' : ratio > 0.85 ? 'bg-warn-500' : 'bg-ok-600'}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {newExpense && <ExpenseForm initial={{ project_id: project.id, expense_date: today(), category: 'materiaux', status: 'engagee', amount_ht: 0, tax_amount: 0 }} onClose={() => setNewExpense(false)} />}
    </div>
  );
}

function LotBudget({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const [txt, setTxt] = useState(value === null ? '' : String(value));
  return <input aria-label="Budget du lot" inputMode="decimal" className="cell-input w-32 text-right" value={txt} placeholder="—" onChange={(e) => setTxt(e.target.value)}
    onBlur={() => { const v = txt.trim() ? parseNumber(txt) : null; if (v !== value && (v === null || v >= 0)) onSave(v); }} />;
}
