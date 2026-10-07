// En-tête de l'espace de travail d'un projet : identité, indicateurs réels, étapes du
// parcours avec leur état, confiance globale et onglets (§6, §7, §9).

import { Calendar, FileStack, MapPin, Ruler, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatNumber } from '../../../core/format';
import { confidence, knownSurface, projectSteps, type StepId } from '../../../core/progress';
import { cx, Drawer, ProgressBar, Ring, Stepper, Tabs, Tooltip } from '../../ds/primitives';
import { StatusBadge } from '../../ds/legacy';
import { WORKSPACE_TABS } from '../../layouts/nav';
import { useStore, type View } from '../../stores/app-store';

const STEP_VIEW: Record<StepId, View> = {
  import: 'import', analyse: 'analysis', verification: 'analysis', metre: 'metre', quantification: 'quantitatif', dqe: 'dqe', estimation: 'estimate', export: 'documents',
};

function Meta({ icon, label, value, tip }: { icon: React.ReactNode; label: string; value: React.ReactNode; tip?: string }) {
  const body = (
    <div className="flex min-w-0 items-center gap-2.5 rounded-[9px] border border-line-2 bg-bg-2/60 px-3 py-1.5">
      <span className="text-brand-2">{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[10px] uppercase tracking-[0.1em] text-faint">{label}</span>
        <span className="block truncate text-[12.5px] font-semibold text-fg">{value}</span>
      </span>
    </div>
  );
  return tip ? <Tooltip label={tip} side="bottom">{body}</Tooltip> : body;
}

export function ConfidenceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  if (!s.project || !s.result) return null;
  const c = confidence(s.project, s.result);
  const rows = [
    { k: 'confirmed', label: 'Confirmé', n: c.confirmed, tone: 'ok' as const, text: 'Lu directement dans un fichier, ou validé par l’utilisateur.' },
    { k: 'to_verify', label: 'À vérifier', n: c.to_verify, tone: 'warn' as const, text: 'Interprété ou déduit (proximité, étiquette, valeur nulle ou suspecte).' },
    { k: 'undetermined', label: 'Non déterminé', n: c.undetermined, tone: 'bad' as const, text: 'Information absente des fichiers. DQP ne l’invente pas.' },
  ];
  return (
    <Drawer open={open} onClose={onClose} title="Niveau de confiance du projet">
      <div className="mb-5 flex items-center gap-5">
        <Ring value={c.pct} size={104} stroke={9} sub="confirmé" segments={[{ value: c.confirmed, color: 'var(--ok)' }, { value: c.to_verify, color: 'var(--warn)' }, { value: c.undetermined, color: 'var(--bad)' }]} />
        <p className="m-0 text-[12.5px] text-fg-2">
          Sur <b className="text-fg">{c.total}</b> informations du projet (lignes de DQE et éléments des plans), <b className="text-fg">{c.confirmed}</b> sont confirmées.
        </p>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.k} className="rounded-[9px] border border-line-2 bg-bg-2 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-[13px]">
              <StatusBadge status={r.k as 'confirmed'} />
              <span className="ml-auto text-[16px] font-bold tabular-nums text-fg">{r.n}</span>
              <span className="w-12 text-right text-[12px] tabular-nums text-muted">{c.total ? formatNumber((r.n / c.total) * 100, 0) : 0} %</span>
            </div>
            <ProgressBar value={c.total ? (r.n / c.total) * 100 : 0} tone={r.tone} />
            <p className="mb-0 mt-2 text-[11.5px] text-muted">{r.text}</p>
          </div>
        ))}
      </div>
      <button className="btn primary mt-4" onClick={() => { onClose(); s.go('analysis'); }}>Vérifier les éléments</button>
    </Drawer>
  );
}

export function WorkspaceHeader() {
  const s = useStore();
  const p = s.project!;
  const r = s.result!;
  const [confOpen, setConfOpen] = useState(false);
  const steps = useMemo(() => projectSteps(p, r), [p, r]);
  const conf = useMemo(() => confidence(p, r), [p, r]);
  const surface = useMemo(() => knownSurface(p), [p]);
  const lastAnalysis = p.analyses.map((a) => a.analyzedAt).sort().pop();
  const state = steps.every((x) => x.state === 'done') ? { cls: 'ok', label: 'Prêt' } : steps.some((x) => x.state === 'verify') ? { cls: 'warn', label: 'À vérifier' } : { cls: 'info', label: 'En cours' };
  const tabState = (v: View) => WORKSPACE_TABS.find((t) => t.view === v);

  return (
    <div className="shrink-0 border-b border-line-2 bg-[linear-gradient(180deg,rgba(18,30,51,.55),rgba(10,17,32,.2))]">
      <div className="flex flex-wrap items-center gap-3 px-5 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-line-strong bg-[#0b1a33]">
            <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full opacity-60" aria-hidden>
              {[8, 16, 24, 32, 40].map((v) => <line key={'h' + v} x1="0" x2="44" y1={v} y2={v} stroke="#1f3a66" strokeWidth=".6" />)}
              {[8, 16, 24, 32, 40].map((v) => <line key={'v' + v} y1="0" y2="44" x1={v} x2={v} stroke="#1f3a66" strokeWidth=".6" />)}
              <path d="M9 34V18l13-9 13 9v16zM18 34v-9h8v9" fill="none" stroke="#5297ff" strokeWidth="1.6" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="m-0 truncate text-[18px] font-bold tracking-[-0.01em] text-fg">{p.info.name}</h1>
              <span className={`badge ${state.cls}`}>{state.label}</span>
            </div>
            <div className="truncate text-[12px] text-muted">
              {p.info.projectType || 'Type non déterminé'} {p.info.projectType && <StatusBadge status={p.info.projectTypeStatus} short />}
              {p.info.client && <> · {p.info.client}</>}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 xl:justify-center">
          <Meta icon={<MapPin size={15} />} label="Localisation" value={p.info.location || <span className="text-muted">non déterminée</span>} />
          <Meta icon={<FileStack size={15} />} label="Fichiers" value={`${p.sourceFiles.length} fichier(s)`} tip={p.sourceFiles.map((f) => f.name).join(' · ') || 'Aucun fichier'} />
          <Meta
            icon={<Ruler size={15} />}
            label="Surface totale"
            value={surface ? `${formatNumber(surface.value)} m²` : <span className="text-muted">non déterminée</span>}
            tip={surface ? `Source : ${surface.source}` : 'Aucune surface écrite dans les plans importés'}
          />
          <Meta icon={<Calendar size={15} />} label="Dernière analyse" value={lastAnalysis ? new Date(lastAnalysis).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : <span className="text-muted">aucune</span>} />
        </div>
        <Tooltip label="Voir le détail de la confiance" side="bottom">
          <button onClick={() => setConfOpen(true)} className="flex items-center gap-2.5 rounded-[10px] border border-line-2 bg-bg-2/60 py-1 pl-1 pr-3 transition-colors hover:border-line-strong hover:bg-hover">
            <Ring value={conf.pct} size={44} stroke={5} label={<span className="text-[11px]">{conf.pct}%</span>} segments={[{ value: conf.confirmed, color: 'var(--ok)' }, { value: conf.to_verify, color: 'var(--warn)' }, { value: conf.undetermined, color: 'var(--bad)' }]} />
            <span className="text-left leading-tight">
              <span className="flex items-center gap-1 text-[12px] font-semibold text-fg"><ShieldCheck size={13} className="text-[var(--ok)]" />Confiance</span>
              <span className="text-[11px] tabular-nums text-muted">🟢 {conf.confirmed} · 🟠 {conf.to_verify} · 🔴 {conf.undetermined}</span>
            </span>
          </button>
        </Tooltip>
      </div>
      <div className="px-5 pb-2 pt-1">
        <Stepper
          steps={steps.map((x) => ({ id: x.id, label: x.label, state: x.state, detail: x.detail }))}
          onSelect={(id) => s.go(STEP_VIEW[id as StepId])}
        />
      </div>
      <div className="px-3">
        <Tabs
          items={WORKSPACE_TABS.map((t) => ({ id: t.view, label: t.label, icon: <t.icon size={14} />, hint: t.hint, badge: t.phase ? <span className="ml-0.5 rounded-full border border-line px-1 text-[9px] text-faint">{t.phase.replace('Phase ', 'P')}</span> : undefined }))}
          value={(tabState(s.view) ? s.view : 'overview') as View}
          onChange={(v) => s.go(v)}
        />
      </div>
      <ConfidenceDrawer open={confOpen} onClose={() => setConfOpen(false)} />
      <span className={cx('hidden')} />
    </div>
  );
}
