// Progression d'une analyse (§13, §20) : étapes réelles, compteurs réels, jamais un simple « Chargement… ».

import { Check } from 'lucide-react';
import type { ImportProgress, ProgressStep } from '../../../core/import';
import { cx, Spinner } from '../../ds/primitives';

const STEPS: { id: ProgressStep; label: string }[] = [
  { id: 'read', label: 'Lecture du fichier' },
  { id: 'extract', label: 'Extraction' },
  { id: 'detect', label: 'Détection' },
  { id: 'verify', label: 'Vérification' },
  { id: 'done', label: 'Terminé' },
];

/** Avancement réel : étapes franchies + fraction de l'étape d'extraction (pages lues). */
export function progressPct(events: ImportProgress[]): number {
  const last = events[events.length - 1];
  if (!last) return 0;
  const currentIdx = STEPS.findIndex((s) => s.id === last.step);
  const extract = [...events].reverse().find((e) => e.step === 'extract');
  const frac = extract?.total ? (extract.done ?? 0) / extract.total : 0;
  return last.step === 'done' ? 100 : Math.round(((Math.max(0, currentIdx) + (last.step === 'extract' ? frac : 1)) / (STEPS.length - 1)) * 100 * 0.98);
}

/** Liste des étapes de l'analyse avec leur état (utilisée dans la file d'import). */
export function AnalysisSteps({ events, failed }: { events: ImportProgress[]; failed?: boolean }) {
  const last = events[events.length - 1];
  const reached = new Set(events.map((e) => e.step));
  const currentIdx = last ? STEPS.findIndex((s) => s.id === last.step) : 0;
  return (
    <ol className="m-0 list-none space-y-1 p-0">
      {STEPS.map((st, i) => {
        const done = reached.has(st.id) && (i < currentIdx || last?.step === 'done');
        const active = i === Math.max(0, currentIdx) && last?.step !== 'done';
        const ev = [...events].reverse().find((e) => e.step === st.id);
        return (
          <li key={st.id} className={cx('flex items-center gap-3 rounded-[7px] px-2.5 py-1', active && !failed && 'bg-brand-soft')}>
            <span className={cx('flex h-5 w-5 items-center justify-center rounded-full border text-[10px]', done ? 'border-[var(--ok)] bg-[var(--ok-bg)] text-[#4ade80]' : active && failed ? 'border-[var(--bad)] text-[#ff7a7a]' : active ? 'border-brand-2 text-brand-2' : 'border-line text-faint')}>
              {done ? <Check size={12} /> : active && failed ? '!' : active ? <Spinner size={12} /> : i + 1}
            </span>
            <span className={cx('flex-1 text-[12px]', done || active ? 'text-fg' : 'text-muted')}>Étape {i + 1}/{STEPS.length} — {st.label}</span>
            {ev && <span className="max-w-[320px] truncate text-[11.5px] text-muted">{ev.label}</span>}
          </li>
        );
      })}
    </ol>
  );
}
