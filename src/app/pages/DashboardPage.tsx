// Tableau de bord : projets en cours et leur avancement, puis — pour le projet ouvert —
// montant, coûts, confiance, évolution, quantités, analyses, fichiers et modifications.
// Toutes les valeurs viennent des projets enregistrés ; rien n'est simulé.

import {
  Activity, ArrowRight, CircleDollarSign, Clock, FileText, FolderKanban, FolderOpen, FolderPlus, Import, Layers, Ruler, ScanSearch, ShieldCheck, TriangleAlert,
} from 'lucide-react';
import { useMemo } from 'react';
import { formatMoney, formatNumber } from '../../core/format';
import { confidence, progressSummary, projectSteps } from '../../core/progress';
import { mainQuantities } from '../../core/quantities';
import { SeverityBadge } from '../ds/legacy';
import { BarList, Donut, LineChart } from '../ds/charts';
import { Button, Card, cx, ProgressBar, Ring, useCountUp } from '../ds/primitives';
import { useStore } from '../stores/app-store';

function Kpi({ label, value, sub, icon, onClick, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ReactNode; onClick?: () => void; tone?: string }) {
  return (
    <button onClick={onClick} className="group flex min-w-0 items-center gap-3 rounded-[11px] border border-line-2 bg-surface p-3.5 text-left transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong">
      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px]', tone ?? 'bg-brand-soft text-brand-2')}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-[0.08em] text-muted">{label}</span>
        <span className="block truncate text-[19px] font-bold tabular-nums tracking-[-0.01em] text-fg">{value}</span>
        {sub && <span className="block truncate text-[11.5px] text-muted">{sub}</span>}
      </span>
    </button>
  );
}

function Money({ value, currency }: { value: number; currency: string }) {
  const v = useCountUp(value);
  return <>{formatMoney(v, currency)}</>;
}

export function DashboardPage({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  const s = useStore();
  const p = s.project;
  const r = s.result;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  // Le projet ouvert est affiché avec ses valeurs en direct (la liste est relue depuis le disque).
  const projects = useMemo(
    () =>
      s.projects.map((x) =>
        x.folder === s.folder && p && r
          ? { ...x, name: p.info.name, total: r.totalHT, lines: r.lineCount, files: p.sourceFiles.length, projectType: p.info.projectType, location: p.info.location, progress: progressSummary(projectSteps(p, r)) }
          : x,
      ),
    [s.projects, s.folder, p, r],
  );
  const portfolio = useMemo(() => projects.reduce((t, x) => t + x.total, 0), [projects]);

  const data = useMemo(() => {
    if (!p || !r) return null;
    const conf = confidence(p, r);
    const steps = projectSteps(p, r);
    const alerts = [...p.analyses.flatMap((a) => a.fileAlerts), ...s.alerts].filter((a) => a.severity !== 'info');
    return {
      conf,
      steps,
      alerts,
      quantities: mainQuantities(p, r),
      costs: p.lots.map((l) => ({ id: l.id, label: l.name, value: r.lots.get(l.id)!.amount })).filter((d) => d.value > 0),
      history: p.journal.filter((j) => typeof j.total === 'number').map((j) => ({ t: Date.parse(j.at), v: j.total!, label: j.action })),
    };
  }, [p, r, s.alerts]);

  return (
    <div className="mx-auto max-w-[1680px] space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[21px] font-bold tracking-[-0.015em] text-fg">{hello}{s.settings?.userName ? `, ${s.settings.userName.split(' ')[0]}` : ''}</h1>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {projects.length} projet(s) · portefeuille estimé {formatMoney(portfolio)} HT
          </p>
        </div>
        <Button variant="secondary" icon={<FolderOpen size={14} />} onClick={() => s.go('projects')}>Ouvrir un projet</Button>
        {p && <Button variant="secondary" icon={<Import size={14} />} onClick={onImport}>Importer</Button>}
        <Button variant="primary" icon={<FolderPlus size={14} />} onClick={onNew}>Nouveau projet</Button>
      </div>

      {/* Projets en cours */}
      <Card title="Projets en cours" icon={<FolderKanban size={15} />} actions={<button className="btn sm" onClick={() => s.go('projects')}>Tous les projets <ArrowRight size={12} /></button>} bodyClass="p-3">
        {projects.length === 0 ? (
          <div className="flex flex-wrap items-center gap-4 p-3">
            <div className="flex-1 text-[12.5px] text-fg-2">
              <b className="text-[14px] text-fg">Commencez par créer un projet.</b>
              <p className="mb-0 mt-1 text-muted">Importez ensuite vos fichiers : DQE Excel/CSV, plans PDF. DQP les analyse, signale ce qui est à vérifier et prépare le DQE et l’estimation.</p>
            </div>
            <Button variant="primary" icon={<FolderPlus size={14} />} onClick={onNew}>Créer mon premier projet</Button>
          </div>
        ) : (
          <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {projects.slice(0, 8).map((x) => {
              const pr = x.progress;
              const active = x.folder === s.folder;
              return (
                <button
                  key={x.folder}
                  onClick={() => (active ? s.go('overview') : void s.openProject(x.folder))}
                  className={cx('group rounded-[10px] border bg-bg-2/60 p-3 text-left transition-[border-color,transform,background] duration-150 hover:-translate-y-px hover:border-line-strong hover:bg-surface-2', active ? 'border-brand-2/60' : 'border-line-2')}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg">{x.name}</span>
                    {active && <span className="badge info">ouvert</span>}
                  </div>
                  <div className="mb-2.5 truncate text-[11.5px] text-muted">{[x.projectType, x.location].filter(Boolean).join(' · ') || 'Type et localisation non déterminés'}</div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                    <span>{pr ? `Étape : ${pr.current}` : '—'}</span>
                    <span className="tabular-nums">{pr ? `${pr.done}/${pr.total}` : ''}</span>
                  </div>
                  <ProgressBar value={pr ? (pr.done / pr.total) * 100 : 0} />
                  <div className="mt-2.5 flex items-center justify-between text-[12px]">
                    <span className="font-semibold tabular-nums text-fg">{formatMoney(x.total)}</span>
                    <span className="text-[11px] text-muted">{x.lines} lignes · {x.files ?? 0} fichier(s)</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {p && r && data && (
        <>
          <div className="flex items-center gap-2 pt-1">
            <h2 className="m-0 text-[14px] font-semibold text-fg">{p.info.name}</h2>
            <span className="text-[12px] text-muted">— projet ouvert</span>
            <button className="btn sm ml-auto" onClick={() => s.go('overview')}>Ouvrir l’espace de travail <ArrowRight size={12} /></button>
          </div>
          <div className="stagger grid grid-cols-2 gap-3 xl:grid-cols-5">
            <Kpi label="Montant estimatif HT" value={<Money value={r.totalHT} currency={p.settings.currency} />} sub={r.incomplete ? `${r.incomplete} ligne(s) non chiffrée(s)` : 'toutes les lignes chiffrées'} icon={<CircleDollarSign size={19} />} onClick={() => s.go('estimate')} />
            <Kpi label="Lots / lignes" value={`${p.lots.length} / ${r.lineCount}`} sub="ouvrages du DQE" icon={<Layers size={19} />} onClick={() => s.go('dqe')} />
            <Kpi label="Confiance" value={`${data.conf.pct} %`} sub={`🟢 ${data.conf.confirmed} · 🟠 ${data.conf.to_verify} · 🔴 ${data.conf.undetermined}`} icon={<ShieldCheck size={19} />} tone="bg-[var(--ok-bg)] text-[#4ade80]" onClick={() => s.go('analysis')} />
            <Kpi label="Alertes" value={data.alerts.length} sub={`${data.alerts.filter((a) => a.severity === 'error').length} erreur(s)`} icon={<TriangleAlert size={19} />} tone="bg-[var(--warn-bg)] text-[#fbbf24]" onClick={() => s.go('analysis')} />
            <Kpi label="Avancement" value={`${data.steps.filter((x) => x.state === 'done').length}/${data.steps.length}`} sub={`Étape : ${data.steps.find((x) => x.state !== 'done')?.label ?? 'terminé'}`} icon={<Activity size={19} />} onClick={() => s.go('overview')} />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <Card title="Répartition des coûts" icon={<CircleDollarSign size={15} />} className="xl:col-span-2">
              {data.costs.length ? <Donut data={data.costs} size={164} onSelect={() => s.go('estimate')} center={<><span className="text-[10.5px] text-muted">Total HT</span><span className="text-[14px] font-bold tabular-nums text-fg">{formatNumber(r.totalHT / 1e6, 2)} M</span></>} /> : <p className="m-0 text-[12px] text-muted">Aucun montant chiffré.</p>}
            </Card>
            <Card title="Niveau de confiance" icon={<ShieldCheck size={15} />}>
              <div className="flex items-center gap-4">
                <Ring value={data.conf.pct} size={112} stroke={10} sub="confirmé" segments={[{ value: data.conf.confirmed, color: 'var(--ok)' }, { value: data.conf.to_verify, color: 'var(--warn)' }, { value: data.conf.undetermined, color: 'var(--bad)' }]} />
                <div className="flex-1 space-y-2 text-[12px]">
                  {[['Confirmé', data.conf.confirmed, 'ok'], ['À vérifier', data.conf.to_verify, 'warn'], ['Non déterminé', data.conf.undetermined, 'bad']].map(([l, n, t]) => (
                    <div key={l as string}>
                      <div className="mb-1 flex justify-between"><span className="text-fg-2">{l}</span><span className="tabular-nums text-fg">{n as number}</span></div>
                      <ProgressBar value={data.conf.total ? ((n as number) / data.conf.total) * 100 : 0} tone={t as 'ok'} />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <Card title="Évolution du montant estimatif" icon={<Activity size={15} />} className="xl:col-span-2">
              <LineChart points={data.history} height={180} empty="L’historique se construit à chaque modification du projet." format={(v) => formatMoney(v, p.settings.currency)} />
            </Card>
            <Card title="Quantités principales" icon={<Ruler size={15} />}>
              {data.quantities.length ? (
                <BarList data={data.quantities.slice(0, 7).map((q) => ({ id: q.id, label: q.label, value: q.value, sub: q.unit }))} format={(v) => formatNumber(v)} onSelect={() => s.go('quantitatif')} max={undefined} />
              ) : <p className="m-0 text-[12px] text-muted">Aucune quantité.</p>}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <Card title="Alertes récentes" icon={<TriangleAlert size={15} />} bodyClass="max-h-[280px] overflow-y-auto p-1.5">
              {data.alerts.slice(0, 10).map((a) => (
                <button key={a.id} onClick={() => s.go(a.lineId ? 'dqe' : 'analysis', a.lineId)} className="flex w-full gap-2.5 rounded-[7px] px-2 py-1.5 text-left hover:bg-hover">
                  <SeverityBadge severity={a.severity} />
                  <span className="line-clamp-2 text-[12px] text-fg-2">{a.message}</span>
                </button>
              ))}
              {data.alerts.length === 0 && <p className="px-2 text-[12px] text-muted">Aucune alerte.</p>}
            </Card>
            <Card title="Dernières analyses et fichiers" icon={<ScanSearch size={15} />} bodyClass="max-h-[280px] overflow-y-auto p-1.5">
              {[...p.sourceFiles].reverse().map((f) => {
                const a = p.analyses.find((x) => x.fileId === f.id);
                return (
                  <button key={f.id} onClick={() => s.go(f.kind === 'pdf' ? 'viewer' : 'analysis')} className="flex w-full items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-left hover:bg-hover">
                    <FileText size={15} className="shrink-0 text-brand-2" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-fg">{f.name}</span>
                      <span className="block text-[11px] text-muted">{a ? `Analysé · ${a.stats.lines ? `${a.stats.lines} lignes` : `${a.stats.elements ?? 0} éléments`} · ${a.fileAlerts.length} contrôle(s)` : 'Joint, non analysé'}</span>
                    </span>
                    <span className="text-[11px] tabular-nums text-muted">{new Date(f.importedAt).toLocaleDateString('fr-FR')}</span>
                  </button>
                );
              })}
              {p.sourceFiles.length === 0 && <p className="px-2 text-[12px] text-muted">Aucun fichier importé.</p>}
            </Card>
            <Card title="Dernières modifications" icon={<Clock size={15} />} bodyClass="max-h-[280px] overflow-y-auto p-1.5">
              {[...p.journal].reverse().slice(0, 14).map((j, i) => (
                <div key={i} className="flex gap-2.5 rounded-[7px] px-2 py-1.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-2" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-fg">{j.action}</span>
                    {j.detail && <span className="block truncate text-[11px] text-muted">{j.detail}</span>}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted">{new Date(j.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
