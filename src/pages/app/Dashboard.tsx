// Tableau de bord (§6) : uniquement des indicateurs calculés sur les données enregistrées.
// Les indicateurs qui dépendent de modules non livrés sont signalés, jamais inventés.
import { Briefcase, FileCheck2, FileClock, HardHat, Plus, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRows } from '../../lib/api';
import { PROJECT_STATUS, QUOTE_STATUS, fmtDate } from '../../lib/labels';
import { useAuth, useOrg } from '../../lib/session';
import type { Project, Quote } from '../../lib/types';
import { formatMoney } from '../../engine/money';
import { Badge, Button, Card, EmptyState, Notice, Spinner, Stat } from '../../ui';
import { Allowed } from '../../ui/guard';
import { ActivityList } from './Journal';

function BarList({ rows, format }: { rows: { label: string; value: number; to?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const nav = useNavigate();
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label} : ${format(r.value)}`} className={r.to ? 'cursor-pointer' : undefined} onClick={() => r.to && nav(r.to)}>
          <div className="mb-1 flex justify-between gap-3 text-[13px]"><span className="truncate text-ink-2">{r.label}</span><span className="tabular font-semibold text-navy-900">{format(r.value)}</span></div>
          <div className="h-2 rounded-full bg-line-2"><div className="h-2 rounded-full bg-navy-700" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Dashboard() {
  const { org, can } = useOrg();
  const { profile } = useAuth();
  const cur = org?.currency ?? 'XOF';
  const projects = useRows<Project>('projects', org?.id, { enabled: can('projets', 'consulter') });
  const quotes = useRows<Quote>('quotes', org?.id, { select: 'id, kind, status, total_ttc, total_ht, valid_until, reference, title, project_id, archived_at', enabled: can('devis', 'consulter') || can('dqe', 'consulter') });

  const k = useMemo(() => {
    const ps = (projects.data ?? []).filter((p) => !p.archived_at);
    const active = ps.filter((p) => !['termine', 'annule'].includes(p.status));
    const devis = (quotes.data ?? []).filter((q) => q.kind === 'devis' && !q.archived_at);
    const pending = devis.filter((q) => ['brouillon', 'en_validation', 'envoye'].includes(q.status));
    const accepted = devis.filter((q) => q.status === 'accepte');
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    return {
      active: active.length,
      sites: ps.filter((p) => p.status === 'en_cours').length,
      pending: pending.length,
      pendingAmount: pending.filter((q) => q.status !== 'brouillon').reduce((s, q) => s + (q.total_ttc ?? 0), 0),
      accepted: accepted.length,
      acceptedAmount: accepted.reduce((s, q) => s + (q.total_ttc ?? 0), 0),
      budget: active.reduce((s, p) => s + (p.budget_validated ?? p.budget_estimate ?? 0), 0),
      withoutBudget: active.filter((p) => p.budget_validated === null && p.budget_estimate === null).length,
      budgets: active.filter((p) => (p.budget_validated ?? p.budget_estimate) !== null).map((p) => ({ label: `${p.reference} · ${p.name}`, value: p.budget_validated ?? p.budget_estimate ?? 0, to: `/app/projets/${p.id}` })).sort((a, b) => b.value - a.value).slice(0, 8),
      byStatus: Object.entries(PROJECT_STATUS).map(([s, v]) => ({ label: v.label, value: ps.filter((p) => p.status === s).length })).filter((x) => x.value > 0),
      quoteStates: Object.entries(QUOTE_STATUS).map(([s, v]) => ({ label: v.label, value: devis.filter((q) => q.status === s).length })).filter((x) => x.value > 0),
      expiring: pending.filter((q) => q.status === 'envoye' && q.valid_until && q.valid_until >= today && q.valid_until <= soon),
    };
  }, [projects.data, quotes.data]);

  if (projects.isLoading || quotes.isLoading) return <Spinner />;
  const empty = !(projects.data ?? []).length && !(quotes.data ?? []).length;
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
        <Stat label="Projets actifs" value={k.active} hint={`${k.sites} chantier(s) en cours`} icon={<Briefcase size={17} />} />
        <Stat label="Devis en attente" value={k.pending} hint={`${formatMoney(k.pendingAmount, cur)} envoyés / à valider`} icon={<FileClock size={17} />} tone="warn" />
        <Stat label="Devis acceptés" value={k.accepted} hint={formatMoney(k.acceptedAmount, cur) + ' TTC'} icon={<FileCheck2 size={17} />} tone="ok" />
        <Stat label="Budget des projets actifs" value={<span className="text-[18px]">{formatMoney(k.budget, cur)}</span>} hint={k.withoutBudget ? `${k.withoutBudget} projet(s) sans budget` : 'validé ou, à défaut, estimatif'} icon={<Wallet size={17} />} tone="signal" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Budget par chantier" subtitle="Projets actifs, budget validé sinon estimatif" className="lg:col-span-2">
          {k.budgets.length ? <BarList rows={k.budgets} format={(n) => formatMoney(n, cur)} /> : <p className="text-[13.5px] text-muted">Aucun budget saisi.</p>}
        </Card>
        <Card title="État des devis">
          {k.quoteStates.length ? <BarList rows={k.quoteStates} format={(n) => String(n)} /> : <p className="text-[13.5px] text-muted">Aucun devis.</p>}
        </Card>
        <Card title="Avancement des projets" subtitle="Nombre de projets par statut">
          {k.byStatus.length ? <BarList rows={k.byStatus} format={(n) => String(n)} /> : <p className="text-[13.5px] text-muted">Aucun projet.</p>}
        </Card>
        <Card title="Prochaines échéances" subtitle="Devis envoyés expirant sous 14 jours">
          {k.expiring.length ? (
            <ul className="space-y-2 text-[13.5px]">
              {k.expiring.map((q) => <li key={q.id}><Link className="link" to={`/app/documents-chiffres/${q.id}`}>{q.reference}</Link> · {q.title} <Badge tone="warn">{fmtDate(q.valid_until)}</Badge></li>)}
            </ul>
          ) : <p className="text-[13.5px] text-muted">Aucune échéance proche.</p>}
        </Card>
        <Card title="Activité récente"><div className="max-h-[280px] overflow-y-auto"><ActivityList limit={8} compact /></div></Card>
      </div>
      <Notice tone="navy" className="mt-4" title="Indicateurs financiers et de chantier">
        Chiffre d’affaires facturé, encaissements, dépenses, coût réel, marges, alertes de stock et tâches en retard s’afficheront ici avec les modules
        Facturation, Dépenses, Stocks et Planning (phase 5). Ils ne sont pas estimés en attendant.
      </Notice>
    </>
  );
}
