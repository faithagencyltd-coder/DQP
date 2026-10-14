// Fiche chantier (§8) — onglet « Gestion de chantier » : avancement mesuré, retards, derniers
// rapports, réserves, commandes et sorties de stock du chantier, tirés des vraies données.

import { Link } from 'react-router-dom';
import { formatMoney, formatNumber } from '../../engine/money';
import { isLate } from '../../engine/planning';
import { useRows } from '../../lib/api';
import { ORDER_STATUS, REPORT_STATUS, RESERVE_STATUS, fmtDate, today } from '../../lib/labels';
import { useOrg } from '../../lib/session';
import type { DailyReport, PriceItem, Project, PurchaseOrder, Reserve, StockMovement } from '../../lib/types';
import { Badge, Card } from '../../ui';
import { ProgressSummary, useTasks } from './Planning';

export function ProjectSite({ project }: { project: Project }) {
  const { org, can } = useOrg();
  const pl = can('planning', 'consulter');
  const tasks = useTasks(project.id);
  const reports = useRows<DailyReport>('daily_reports', org?.id, { select: 'id, reference, report_date, status, work_done, photos', filter: (q) => q.eq('project_id', project.id), order: ['report_date', false], limit: 5, key: ['fiche', project.id], enabled: pl });
  const reserves = useRows<Reserve>('reserves', org?.id, { select: 'id, reference, title, status, due_date', filter: (q) => q.eq('project_id', project.id).in('status', ['ouverte', 'en_cours']), key: ['fiche', project.id], enabled: pl });
  const orders = useRows<PurchaseOrder>('purchase_orders', org?.id, { select: 'id, reference, status, total_ht, currency, order_date', filter: (q) => q.eq('project_id', project.id), order: ['order_date', false], key: ['fiche', project.id], enabled: can('achats', 'consulter') });
  const outs = useRows<StockMovement>('stock_movements', org?.id, { filter: (q) => q.eq('project_id', project.id).eq('kind', 'sortie'), order: ['moved_on', false], limit: 200, key: ['fiche', project.id], enabled: can('stocks', 'consulter') });
  const items = useRows<PriceItem>('price_items', org?.id, { select: 'id, designation, unit', filter: (q) => q.eq('kind', 'article'), key: ['articles-min'], enabled: !!outs.data?.length });
  const now = today();
  const late = (tasks.data ?? []).filter((t) => isLate(t, now));
  const link = (onglet: string, label: string) => <Link className="link text-[13px]" to={`/app/planning?projet=${project.id}&onglet=${onglet}`}>{label}</Link>;
  const consumed = new Map<string, number>();
  for (const m of outs.data ?? []) consumed.set(m.item_id, (consumed.get(m.item_id) ?? 0) - Number(m.qty));
  const iname = new Map((items.data ?? []).map((i) => [i.id, i]));
  const active = (orders.data ?? []).filter((o) => o.status !== 'annulee');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {pl && (
        <Card title="Avancement" actions={link('avancement', 'Détail')}>
          <ProgressSummary project={project} compact />
          {late.length > 0 && <p className="mt-3 text-[13px] font-semibold text-bad-600">{late.length} tâche(s) en retard : {late.slice(0, 3).map((t) => t.title).join(', ')}{late.length > 3 ? '…' : ''}</p>}
          <div className="mt-3">{link('taches', `Planning (${tasks.data?.length ?? 0} tâche(s))`)}</div>
        </Card>
      )}
      {pl && (
        <Card title="Rapports journaliers" actions={link('rapports', 'Tous les rapports')}>
          {!reports.data?.length ? <p className="text-[13px] text-muted">Aucun rapport pour ce chantier.</p> : (
            <ul className="grid gap-1.5 text-[13.5px]">
              {reports.data.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <Link className="link min-w-0 truncate" to={`/app/planning/rapports/${r.id}`}>{fmtDate(r.report_date)} — {r.work_done ?? 'sans description'}</Link>
                  <span className="flex shrink-0 items-center gap-2">{r.photos.length > 0 && <span className="text-[12px] text-muted">{r.photos.length} photo(s)</span>}<Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {pl && (
        <Card title={`Réserves non levées (${reserves.data?.length ?? 0})`} actions={link('reserves', 'Toutes les réserves')}>
          {!reserves.data?.length ? <p className="text-[13px] text-muted">Aucune réserve en attente de levée.</p> : (
            <ul className="grid gap-1.5 text-[13.5px]">
              {reserves.data.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate"><span className="text-muted">{r.reference}</span> · {r.title}</span>
                  <span className="flex shrink-0 items-center gap-2">{r.due_date && <span className={`text-[12px] ${r.due_date < now ? 'font-semibold text-bad-600' : 'text-muted'}`}>{fmtDate(r.due_date)}</span>}<Badge tone={RESERVE_STATUS[r.status].tone}>{RESERVE_STATUS[r.status].label}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {can('achats', 'consulter') && (
        <Card title="Achats du chantier" actions={<Link className="link text-[13px]" to="/app/achats">Achats</Link>}>
          {!active.length ? <p className="text-[13px] text-muted">Aucune commande rattachée à ce chantier.</p> : (
            <>
              <ul className="grid gap-1.5 text-[13.5px]">
                {active.slice(0, 6).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <Link className="link" to={`/app/achats/${o.id}`}>{o.reference}</Link>
                    <span className="flex items-center gap-2"><span className="tabular">{formatMoney(o.total_ht, o.currency)}</span><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12.5px] text-muted">Total commandé HT (hors annulées) : <b className="tabular">{formatMoney(active.reduce((s, o) => s + Number(o.total_ht), 0), org!.currency)}</b></p>
            </>
          )}
        </Card>
      )}
      {can('stocks', 'consulter') && (
        <Card title="Matériaux sortis du stock vers ce chantier" actions={<Link className="link text-[13px]" to="/app/stocks">Stocks</Link>}>
          {!consumed.size ? <p className="text-[13px] text-muted">Aucune sortie de stock affectée à ce chantier.</p> : (
            <ul className="grid gap-1 text-[13.5px]">
              {[...consumed.entries()].map(([id, q]) => <li key={id} className="flex justify-between"><span>{iname.get(id)?.designation ?? 'Article'}</span><b className="tabular">{formatNumber(q, 3)} {iname.get(id)?.unit ?? ''}</b></li>)}
            </ul>
          )}
        </Card>
      )}
      <Card title="Documents de réception">
        <p className="text-[13px] text-ink-2">Procès-verbaux, plans de récolement et photos de réception se déposent dans l’onglet « Documents » du chantier (type « Procès-verbal » ou « Document de réception »). La liste des réserves s’exporte en PDF depuis l’onglet Réserves du planning.</p>
      </Card>
    </div>
  );
}
