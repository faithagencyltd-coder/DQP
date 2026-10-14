// Tableau de bord (§6) : uniquement des indicateurs calculés sur les données enregistrées,
// selon les droits de l'utilisateur. Les limites des données sont affichées, jamais comblées.
import { AlertTriangle, Banknote, Briefcase, CalendarClock, FileCheck2, FileClock, HandCoins, HardHat, Plus, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { budgetVsActual, costsByLot, lastMonths, monthlyFlows, orgKpis, type MonthFlow } from '../../engine/dashboard';
import { formatMoney, formatNumber } from '../../engine/money';
import { addDays, isLate, projectProgress } from '../../engine/planning';
import { restockAlerts } from '../../engine/purchasing';
import { useRows } from '../../lib/api';
import { QUOTE_STATUS, fmtDate, today as todayStr } from '../../lib/labels';
import { useAuth, useOrg } from '../../lib/session';
import type { Expense, Invoice, Payment, Project, Quote, Reserve, StockLevel, Task } from '../../lib/types';
import { Badge, Button, Card, EmptyState, Notice, Spinner, Stat } from '../../ui';
import { Allowed } from '../../ui/guard';
import { ActivityList } from './Journal';

function BarList({ rows, format, color = 'bg-navy-700' }: { rows: { label: string; value: number; to?: string }[]; format: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const nav = useNavigate();
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label} : ${format(r.value)}`} className={r.to ? 'cursor-pointer' : undefined} onClick={() => r.to && nav(r.to)}>
          <div className="mb-1 flex justify-between gap-3 text-[13px]"><span className="truncate text-ink-2">{r.label}</span><span className="tabular font-semibold text-navy-900">{format(r.value)}</span></div>
          <div className="h-2 rounded-full bg-line-2"><div className={`h-2 rounded-full ${color}`} style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const compact = (n: number) => (Math.abs(n) >= 1e6 ? `${formatNumber(n / 1e6, 1)} M` : Math.abs(n) >= 1e3 ? `${formatNumber(n / 1e3, 0)} k` : formatNumber(n, 0));

/** Recettes et dépenses par mois (barres groupées, SVG). */
function FlowChart({ flows, series, currency }: { flows: MonthFlow[]; series: { key: keyof Omit<MonthFlow, 'month'>; label: string; color: string }[]; currency: string }) {
  const W = 720, H = 240, L = 54, B = 26, T = 10;
  const max = Math.max(1, ...flows.flatMap((f) => series.map((s) => f[s.key])));
  const step = (W - L - 8) / flows.length;
  const bw = Math.min(16, (step - 8) / series.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Évolution mensuelle des recettes et des dépenses">
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} stroke="#e3e8ef" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#667085">{compact(v)}</text></g>)}
        {flows.map((f, i) => (
          <g key={f.month}>
            {series.map((s, j) => {
              const v = f[s.key];
              const x = L + i * step + (step - bw * series.length) / 2 + j * bw;
              return <rect key={s.key} x={x} y={y(v)} width={bw - 1.5} height={Math.max(0, H - B - y(v))} rx="2" fill={s.color}><title>{`${MONTH_SHORT[+f.month.slice(5) - 1]} ${f.month.slice(0, 4)} — ${s.label} : ${formatMoney(v, currency)}`}</title></rect>;
            })}
            <text x={L + i * step + step / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#667085">{MONTH_SHORT[+f.month.slice(5) - 1]}</text>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[12px] text-muted">{series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}</div>
    </div>
  );
}

function BudgetBars({ rows, currency }: { rows: { id: string; label: string; budget: number | null; spent: number }[]; currency: string }) {
  const nav = useNavigate();
  const max = Math.max(1, ...rows.flatMap((r) => [r.budget ?? 0, r.spent]));
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const over = r.budget !== null && r.spent > r.budget;
        return (
          <li key={r.id} className="cursor-pointer" onClick={() => nav(`/app/projets/${r.id}`)}>
            <div className="mb-1 flex justify-between gap-3 text-[13px]"><span className="truncate text-ink-2">{r.label}</span>
              <span className={`tabular font-semibold ${over ? 'text-bad-600' : 'text-navy-900'}`}>{formatMoney(r.spent, currency)} / {r.budget === null ? 'sans budget' : formatMoney(r.budget, currency)}</span></div>
            <div className="h-1.5 rounded-full bg-line-2"><div className="h-1.5 rounded-full bg-[#9fb0c8]" style={{ width: `${((r.budget ?? 0) / max) * 100}%` }} /></div>
            <div className="mt-0.5 h-1.5 rounded-full bg-line-2"><div className={`h-1.5 rounded-full ${over ? 'bg-bad-600' : 'bg-signal-500'}`} style={{ width: `${(r.spent / max) * 100}%` }} /></div>
          </li>
        );
      })}
    </ul>
  );
}

export function Dashboard() {
  const { org, can } = useOrg();
  const { profile } = useAuth();
  const cur = org?.currency ?? 'XOF';
  const today = todayStr();
  const projects = useRows<Project>('projects', org?.id, { enabled: can('projets', 'consulter') });
  const quotes = useRows<Quote>('quotes', org?.id, { select: 'id, kind, status, total_ttc, total_ht, valid_until, reference, title, project_id, archived_at', key: ['tableau'], enabled: can('devis', 'consulter') || can('dqe', 'consulter') });
  const fin = can('factures', 'consulter');
  const invoices = useRows<Invoice>('invoices', org?.id, { select: 'id, reference, kind, status, net_ht, total_ttc, amount_paid, issue_date, due_date, project_id, title', key: ['tableau'], enabled: fin });
  const payments = useRows<Payment>('payments', org?.id, { select: 'id, amount, paid_on', key: ['tableau'], enabled: fin });
  const expenses = useRows<Expense>('expenses', org?.id, { select: 'id, amount_ht, expense_date, project_id, lot, status', key: ['tableau'], enabled: can('depenses', 'consulter') });
  const tasks = useRows<Task>('tasks', org?.id, { key: ['tableau'], enabled: can('planning', 'consulter') });
  const reserves = useRows<Reserve>('reserves', org?.id, { select: 'id, reference, title, status, due_date, project_id', filter: (q) => q.in('status', ['ouverte', 'en_cours']), key: ['tableau'], enabled: can('planning', 'consulter') });
  const levels = useRows<StockLevel>('stock_levels', org?.id, { key: ['tableau'], enabled: can('stocks', 'consulter') });

  const d = useMemo(() => {
    const ps = (projects.data ?? []).filter((p) => !p.archived_at);
    const k = orgKpis(ps, quotes.data ?? [], invoices.data ?? [], expenses.data ?? [], today, cur);
    const devis = (quotes.data ?? []).filter((q) => q.kind === 'devis' && !q.archived_at);
    const pname = new Map(ps.map((p) => [p.id, `${p.reference} · ${p.name}`]));
    const tasksAll = tasks.data ?? [];
    const late = tasksAll.filter((t) => isLate(t, today) && pname.has(t.project_id));
    const progress = ps.filter((p) => !['termine', 'annule'].includes(p.status)).map((p) => {
      const pt = tasksAll.filter((t) => t.project_id === p.id);
      return { id: p.id, label: pname.get(p.id)!, tasks: pt.length, pct: pt.length ? projectProgress(pt, p.progress_method ?? 'taches').pct : null };
    });
    const soon = addDays(today, 14);
    const week = addDays(today, 7);
    const deadlines: { date: string; label: string; to: string; tone: 'bad' | 'warn' | 'navy'; kind: string }[] = [
      ...(invoices.data ?? []).filter((i) => i.kind !== 'avoir' && ['emise', 'partielle'].includes(i.status) && i.due_date && i.due_date <= soon)
        .map((i) => ({ date: i.due_date!, label: `${i.reference} · ${i.title}`, to: `/app/factures/${i.id}`, tone: (i.due_date! < today ? 'bad' : 'warn') as 'bad' | 'warn', kind: i.due_date! < today ? 'Facture échue' : 'Facture à échéance' })),
      ...devis.filter((q) => q.status === 'envoye' && q.valid_until && q.valid_until >= today && q.valid_until <= soon)
        .map((q) => ({ date: q.valid_until!, label: `${q.reference} · ${q.title}`, to: `/app/documents-chiffres/${q.id}`, tone: 'warn' as const, kind: 'Devis expirant' })),
      ...tasksAll.filter((t) => !['termine', 'valide'].includes(t.status) && t.end_date >= today && t.end_date <= week && pname.has(t.project_id))
        .map((t) => ({ date: t.end_date, label: `${t.title} (${pname.get(t.project_id)})`, to: `/app/planning?projet=${t.project_id}`, tone: 'navy' as const, kind: 'Fin de tâche' })),
      ...(reserves.data ?? []).filter((r) => r.due_date && r.due_date <= week)
        .map((r) => ({ date: r.due_date!, label: `${r.reference} · ${r.title}`, to: `/app/planning?projet=${r.project_id}&onglet=reserves`, tone: (r.due_date! < today ? 'bad' : 'warn') as 'bad' | 'warn', kind: 'Levée de réserve' })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const projectExpenses = (expenses.data ?? []).filter((e) => e.project_id);
    return {
      k, late, progress, deadlines,
      flows: monthlyFlows(invoices.data ?? [], payments.data ?? [], expenses.data ?? [], lastMonths(today, 12), cur),
      budgets: budgetVsActual(ps, expenses.data ?? []).slice(0, 8),
      lots: costsByLot(projectExpenses).slice(0, 8).map((x) => ({ label: x.lot, value: x.value })),
      realCost: projectExpenses.reduce((s, e) => s + Number(e.amount_ht), 0),
      quoteStates: Object.entries(QUOTE_STATUS).map(([s, v]) => ({ label: v.label, value: devis.filter((q) => q.status === s).length })).filter((x) => x.value > 0),
      stockAlerts: restockAlerts((levels.data ?? []).map((l) => ({ ...l, qty: Number(l.qty), min_qty: l.min_qty === null ? null : Number(l.min_qty) }))),
    };
  }, [projects.data, quotes.data, invoices.data, payments.data, expenses.data, tasks.data, reserves.data, levels.data, today, cur]);

  if (projects.isLoading || quotes.isLoading) return <Spinner />;
  const { k } = d;
  const empty = !(projects.data ?? []).length && !(quotes.data ?? []).length;
  const money = (n: number | null) => (n === null ? '—' : formatMoney(n, cur));
  const big = (n: number | null) => <span className="text-[18px]">{money(n)}</span>;
  const dep = can('depenses', 'consulter');
  const series = [
    ...(fin ? [{ key: 'invoicedHT' as const, label: 'Facturé HT', color: '#1e3a5f' }, { key: 'collected' as const, label: 'Encaissé', color: '#16a34a' }] : []),
    ...(dep ? [{ key: 'expensesHT' as const, label: 'Dépenses HT', color: '#f26a1b' }] : []),
  ];
  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-navy-900">Bonjour{profile?.first_name ? ` ${profile.first_name}` : ''}</h1>
          <p className="mt-1 text-[14px] text-muted">{org?.name} · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Allowed module="projets" action="creer"><Link to="/app/projets"><Button icon={<Plus size={16} />}>Projet</Button></Link></Allowed>
          <Allowed module="devis" action="creer"><Link to="/app/devis"><Button variant="primary" icon={<Plus size={16} />}>Devis</Button></Link></Allowed>
        </div>
      </div>
      {empty && (
        <Card className="mb-5">
          <EmptyState icon={<HardHat size={22} />} title="Votre espace est prêt" action={<div className="flex flex-wrap justify-center gap-2"><Link to="/app/clients"><Button>Ajouter un client</Button></Link><Link to="/app/projets"><Button variant="primary">Créer un projet</Button></Link></div>}>
            Les indicateurs ci-dessous se rempliront à partir de vos propres données : aucun chiffre n’est inventé.
          </EmptyState>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Projets actifs" value={k.activeProjects} hint={`${k.sitesInProgress} chantier(s) en cours`} icon={<Briefcase size={17} />} />
        <Stat label="Devis en attente" value={k.quotesPending} hint={`${money(k.quotesPendingTTC)} TTC envoyés ou à valider`} icon={<FileClock size={17} />} tone="warn" />
        <Stat label="Devis acceptés" value={k.quotesAccepted} hint={`${money(k.quotesAcceptedTTC)} TTC`} icon={<FileCheck2 size={17} />} tone="ok" />
        <Stat label="Budget prévisionnel des chantiers" value={big(k.plannedBudget)} hint={k.projectsWithoutBudget ? `${k.projectsWithoutBudget} projet(s) actif(s) sans budget` : 'révisé, validé ou estimatif'} icon={<Wallet size={17} />} tone="signal" />
        {fin && <>
          <Stat label="Chiffre d’affaires facturé" value={big(k.invoicedHT)} hint={`HT, avoirs déduits · ${money(k.invoicedTTC)} TTC`} icon={<Receipt size={17} />} />
          <Stat label="Encaissé" value={big(k.collectedTTC)} hint="paiements déclarés (TTC)" icon={<HandCoins size={17} />} tone="ok" />
          <Stat label="Reste à encaisser" value={big(k.toCollectTTC)} hint={k.overdueCount ? `dont ${money(k.overdueTTC)} échus (${k.overdueCount} facture(s))` : 'aucune facture échue'} icon={<CalendarClock size={17} />} tone={k.overdueCount ? 'bad' : 'warn'} />
        </>}
        {dep && <Stat label="Dépenses enregistrées" value={big(k.expensesHT)} hint={`HT · coût réel des travaux (chantiers) : ${money(d.realCost)}`} icon={<Banknote size={17} />} tone="signal" />}
        {fin && dep && <>
          <Stat label="Marge prévisionnelle" value={big(k.plannedMargin)} hint={k.plannedMargin === null ? 'devis accepté + budget nécessaires' : `devis acceptés HT − budget, sur ${k.plannedMarginBase} chantier(s)`} icon={<TrendingUp size={17} />} />
          <Stat label="Marge constatée" value={big(k.actualMargin)} hint="facturé HT − dépenses HT enregistrées" icon={<TrendingUp size={17} />} tone={k.actualMargin !== null && k.actualMargin < 0 ? 'bad' : 'ok'} />
        </>}
        {(can('stocks', 'consulter') || can('planning', 'consulter')) && (
          <Stat label="Alertes" value={d.stockAlerts.length + d.late.length} hint={`${d.stockAlerts.length} article(s) sous le minimum · ${d.late.length} tâche(s) en retard`} icon={<AlertTriangle size={17} />} tone={d.stockAlerts.length + d.late.length ? 'bad' : 'ok'} />
        )}
      </div>
      {k.limits.length > 0 && (fin || dep) && <Notice tone="navy" className="mt-3" title="Limites des données">{k.limits.map((l) => <span key={l} className="block">{l}</span>)}</Notice>}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {series.length > 0 && (
          <Card title="Évolution des recettes et des dépenses" subtitle="12 derniers mois, par date de facture, de paiement et de dépense" className="lg:col-span-2">
            {d.flows.some((f) => f.invoicedHT || f.collected || f.expensesHT) ? <FlowChart flows={d.flows} series={series} currency={cur} /> : <p className="text-[13.5px] text-muted">Aucune facture, aucun paiement ni aucune dépense sur la période.</p>}
          </Card>
        )}
        <Card title="Prochaines échéances" subtitle="Factures, devis, tâches et réserves">
          {d.deadlines.length ? (
            <ul className="max-h-[280px] space-y-2 overflow-y-auto text-[13px]">
              {d.deadlines.slice(0, 12).map((x) => (
                <li key={x.kind + x.to + x.label} className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className="block text-[11.5px] font-semibold uppercase tracking-wide text-muted">{x.kind}</span><Link className="link block truncate" to={x.to}>{x.label}</Link></span>
                  <Badge tone={x.tone}>{fmtDate(x.date)}</Badge>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13.5px] text-muted">Aucune échéance proche.</p>}
        </Card>
        {dep && (
          <Card title="Budget prévisionnel et dépenses réelles" subtitle="Par chantier actif : budget (gris) et dépenses HT (orange)" className="lg:col-span-2">
            {d.budgets.length ? <BudgetBars rows={d.budgets} currency={cur} /> : <p className="text-[13.5px] text-muted">Aucun budget ni aucune dépense de chantier.</p>}
          </Card>
        )}
        {!dep && (
          <Card title="Budget par chantier" subtitle="Projets actifs, budget révisé, validé ou estimatif" className="lg:col-span-2">
            {d.budgets.length ? <BarList rows={d.budgets.filter((b) => b.budget !== null).map((b) => ({ label: b.label, value: b.budget!, to: `/app/projets/${b.id}` }))} format={(n) => formatMoney(n, cur)} /> : <p className="text-[13.5px] text-muted">Aucun budget saisi.</p>}
          </Card>
        )}
        <Card title="État des devis">
          {d.quoteStates.length ? <BarList rows={d.quoteStates} format={(n) => String(n)} /> : <p className="text-[13.5px] text-muted">Aucun devis.</p>}
        </Card>
        {can('planning', 'consulter') && (
          <Card title="Avancement des projets" subtitle="Mesuré selon la méthode de chaque chantier">
            {d.progress.length ? (
              <ul className="space-y-2.5">
                {d.progress.map((p) => (
                  <li key={p.id}>
                    <div className="mb-1 flex justify-between gap-3 text-[13px]"><Link className="truncate text-ink-2 hover:underline" to={`/app/planning?projet=${p.id}&onglet=avancement`}>{p.label}</Link><span className="tabular font-semibold text-navy-900">{p.pct === null ? (p.tasks ? 'non mesurable' : 'aucune tâche') : `${formatNumber(p.pct, 1)} %`}</span></div>
                    <div className="h-2 rounded-full bg-line-2"><div className="h-2 rounded-full bg-ok-600" style={{ width: `${p.pct ?? 0}%` }} /></div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13.5px] text-muted">Aucun projet actif.</p>}
          </Card>
        )}
        {dep && (
          <Card title="Répartition des coûts par lot" subtitle="Dépenses HT des chantiers">
            {d.lots.length ? <BarList rows={d.lots} format={(n) => formatMoney(n, cur)} color="bg-signal-500" /> : <p className="text-[13.5px] text-muted">Aucune dépense de chantier.</p>}
          </Card>
        )}
        {(d.stockAlerts.length > 0 || d.late.length > 0) && (
          <Card title="Alertes">
            <ul className="space-y-1.5 text-[13px]">
              {d.stockAlerts.length > 0 && <li><Link className="link" to="/app/stocks">{d.stockAlerts.length} article(s) sous le stock minimum</Link></li>}
              {d.late.slice(0, 6).map((t) => <li key={t.id}><Link className="link" to={`/app/planning?projet=${t.project_id}`}>Tâche en retard : {t.title}</Link> <span className="text-muted">(fin {fmtDate(t.end_date)})</span></li>)}
            </ul>
          </Card>
        )}
        <Card title="Activité récente"><div className="max-h-[280px] overflow-y-auto"><ActivityList limit={8} compact /></div></Card>
      </div>
    </>
  );
}
