// Progression d'une analyse (§13, §20) : étapes réelles, compteurs réels, jamais un simple « Chargement… ».

import { Check, FileSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ImportProgress, ProgressStep } from '../../../core/import';
import { formatNumber } from '../../../core/format';
import { cx, ProgressBar, Spinner } from '../../ds/primitives';

const STEPS: { id: ProgressStep; label: string }[] = [
  { id: 'read', label: 'Lecture du fichier' },
  { id: 'extract', label: 'Extraction' },
  { id: 'detect', label: 'Détection' },
  { id: 'verify', label: 'Vérification' },
  { id: 'done', label: 'Terminé' },
];

export function AnalysisProgress({ name, kind, events, started }: { name: string; kind: 'dqe' | 'plan'; events: ImportProgress[]; started: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const last = events[events.length - 1];
  const reached = new Set(events.map((e) => e.step));
  const currentIdx = last ? STEPS.findIndex((s) => s.id === last.step) : 0;
  // Avancement : étapes franchies + fraction de l'étape d'extraction (pages lues).
  const extract = [...events].reverse().find((e) => e.step === 'extract');
  const frac = extract?.total ? (extract.done ?? 0) / extract.total : 0;
  const pct = last?.step === 'done' ? 100 : Math.round(((Math.max(0, currentIdx) + (last?.step === 'extract' ? frac : 1)) / (STEPS.length - 1)) * 100 * 0.98);
  const detected = [...events].reverse().find((e) => e.step === 'detect')?.count;

  return createPortal(
    <div className="anim-fade fixed inset-0 z-[170] flex items-center justify-center bg-[rgba(2,6,14,.62)] backdrop-blur-[2px]" role="dialog" aria-live="polite" aria-label="Analyse en cours">
      <div className="anim-pop w-[min(520px,92vw)] rounded-[13px] border border-line bg-surface p-5 shadow-ds-3">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-soft text-brand-2"><FileSearch size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-fg">Analyse {kind === 'plan' ? 'du plan' : 'du DQE'}</div>
            <div className="truncate text-[12px] text-muted">{name}</div>
          </div>
          <div className="text-right">
            <div className="text-[18px] font-bold tabular-nums text-fg">{pct} %</div>
            <div className="text-[11px] tabular-nums text-muted">{((now - started) / 1000).toFixed(1)} s</div>
          </div>
        </div>
        <ProgressBar value={pct} className="mb-4 h-2" />
        <ol className="m-0 list-none space-y-1.5 p-0">
          {STEPS.map((st, i) => {
            const done = reached.has(st.id) && (i < currentIdx || last?.step === 'done');
            const active = i === Math.max(0, currentIdx) && last?.step !== 'done';
            const ev = [...events].reverse().find((e) => e.step === st.id);
            return (
              <li key={st.id} className={cx('flex items-center gap-3 rounded-[7px] px-2.5 py-1.5 transition-colors', active && 'bg-brand-soft')}>
                <span className={cx('flex h-5 w-5 items-center justify-center rounded-full border text-[10px]', done ? 'border-[var(--ok)] bg-[var(--ok-bg)] text-[#4ade80]' : active ? 'border-brand-2 text-brand-2' : 'border-line text-faint')}>
                  {done ? <Check size={12} /> : active ? <Spinner size={12} /> : i + 1}
                </span>
                <span className={cx('flex-1 text-[12.5px]', done || active ? 'text-fg' : 'text-muted')}>
                  Étape {i + 1}/{STEPS.length} — {st.label}
                </span>
                {ev && <span className="max-w-[230px] truncate text-[11.5px] text-muted">{ev.label}</span>}
              </li>
            );
          })}
        </ol>
        {detected !== undefined && (
          <div className="mt-3 rounded-[7px] border border-line-2 bg-bg-2 px-3 py-2 text-[12px] text-fg-2">
            <b className="tabular-nums text-fg">{formatNumber(detected, 0)}</b> {kind === 'plan' ? 'élément(s) détecté(s) sur le plan' : 'ligne(s) d’ouvrage reconnue(s)'}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
