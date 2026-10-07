// Recherche globale (Ctrl+K) : projets, fichiers, lots, lignes de DQE, éléments des plans,
// prix et commandes. Tout vient des données réelles ; rien n'est suggéré par défaut.

import { CornerDownLeft, FileSpreadsheet, FileText, FolderKanban, Layers, ScanLine, Search, Tag, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { allLines } from '../../../core/dqe';
import { formatNumber, normalizeText } from '../../../core/format';
import { cx, Kbd } from '../../ds/primitives';
import { ALL_NAV } from '../../layouts/nav';
import { useStore, type View } from '../../stores/app-store';

interface Result {
  id: string;
  group: string;
  icon: ReactNode;
  label: string;
  sub?: string;
  right?: string;
  run: () => void;
}

const GROUP_ORDER = ['Commandes', 'Modules', 'Projets', 'Fichiers', 'Lots', 'Ouvrages du DQE', 'Éléments des plans', 'Prix'];

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: { id: string; label: string; hint?: string; run: () => void }[] }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const n = normalizeText(q);
    const match = (...texts: (string | undefined)[]) => !n || n.split(' ').every((w) => texts.some((t) => t && normalizeText(t).includes(w)));
    const out: Result[] = [];
    const go = (v: View, focus?: string) => () => { s.go(v, focus); onClose(); };
    for (const c of commands) if (match(c.label, c.hint)) out.push({ id: 'c' + c.id, group: 'Commandes', icon: <Zap size={15} />, label: c.label, sub: c.hint, run: () => { onClose(); c.run(); } });
    for (const it of ALL_NAV) if (match(it.label, 'module page', it.phase)) {
      const disabled = it.needsProject && !s.project;
      if (!disabled) out.push({ id: 'n' + it.view, group: 'Modules', icon: <it.icon size={15} />, label: it.label, sub: it.phase ? `Moteur prévu en ${it.phase}` : undefined, run: go(it.view) });
    }
    if (n) {
      for (const p of s.projects) if (match(p.name, p.location, p.projectType)) out.push({ id: 'p' + p.folder, group: 'Projets', icon: <FolderKanban size={15} />, label: p.name, sub: [p.projectType, p.location].filter(Boolean).join(' · '), right: `${formatNumber(p.total, 0)} FCFA`, run: () => { onClose(); void s.openProject(p.folder); } });
      const p = s.project;
      if (p) {
        for (const f of p.sourceFiles) if (match(f.name, f.kind)) out.push({ id: 'f' + f.id, group: 'Fichiers', icon: <FileText size={15} />, label: f.name, sub: f.kind.toUpperCase(), run: go(f.kind === 'pdf' ? 'viewer' : 'analysis') });
        for (const l of p.lots) if (match(l.name, l.code)) out.push({ id: 'l' + l.id, group: 'Lots', icon: <Layers size={15} />, label: `${l.code} — ${l.name}`, right: s.result ? `${formatNumber(s.result.lots.get(l.id)?.amount ?? 0, 0)}` : undefined, run: go('dqe') });
        let n2 = 0;
        for (const line of allLines(p)) {
          if (n2 > 30) break;
          if (match(line.designation, line.code, line.number, line.unit)) {
            n2++;
            const r = s.result?.lines.get(line.id);
            out.push({ id: 'q' + line.id, group: 'Ouvrages du DQE', icon: <FileSpreadsheet size={15} />, label: line.designation, sub: `${formatNumber(r?.quantity ?? null)} ${line.unit}`, right: r?.amount != null ? formatNumber(r.amount, 0) : '—', run: go('dqe', line.id) });
          }
        }
        let n3 = 0;
        for (const e of p.elements) {
          if (n3 > 20) break;
          if (match(e.name, e.category, e.level)) {
            n3++;
            out.push({ id: 'e' + e.id, group: 'Éléments des plans', icon: <ScanLine size={15} />, label: `${e.category} — ${e.name}`, sub: `${e.level ?? ''} · ${e.source.fileName} p.${e.source.page}`, run: go('viewer', e.id) });
          }
        }
      }
      let n4 = 0;
      for (const it of s.prices) {
        if (n4 > 15) break;
        if (match(it.designation, it.code, it.supplier)) {
          n4++;
          out.push({ id: 'x' + it.id, group: 'Prix', icon: <Tag size={15} />, label: it.designation, sub: it.code, right: `${formatNumber(it.price, 0)} / ${it.unit}`, run: go('prices') });
        }
      }
    }
    return out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [q, s, commands, onClose]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;
  let lastGroup = '';
  return createPortal(
    <div className="anim-fade fixed inset-0 z-[160] flex items-start justify-center bg-[rgba(2,6,14,.6)] pt-[12vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="anim-pop flex max-h-[70vh] w-[min(680px,92vw)] flex-col overflow-hidden rounded-[13px] border border-line bg-surface shadow-ds-3" role="dialog" aria-label="Recherche globale">
        <div className="flex items-center gap-3 border-b border-line-2 px-4">
          <Search size={17} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); results[active]?.run(); }
              else if (e.key === 'Escape') onClose();
            }}
            placeholder="Rechercher un projet, un fichier, un ouvrage, un élément, un prix…"
            className="h-12 flex-1 border-none bg-transparent text-[14px] text-fg shadow-none outline-none placeholder:text-faint focus-visible:shadow-none"
          />
          <Kbd>Échap</Kbd>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 && <div className="px-4 py-10 text-center text-[12.5px] text-muted">Aucun résultat pour « {q} ».</div>}
          {results.map((r, i) => {
            const head = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {head && <div className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{head}</div>}
                <button
                  data-i={i}
                  onMouseMove={() => setActive(i)}
                  onClick={r.run}
                  className={cx('flex w-full items-center gap-3 rounded-[7px] px-2.5 py-2 text-left transition-colors duration-100', active === i ? 'bg-brand-soft' : 'hover:bg-hover')}
                >
                  <span className={cx('flex h-7 w-7 items-center justify-center rounded-[6px] border', active === i ? 'border-brand-2/50 text-brand-2' : 'border-line text-muted')}>{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{r.label}</span>
                    {r.sub && <span className="block truncate text-[11.5px] text-muted">{r.sub}</span>}
                  </span>
                  {r.right && <span className="text-[12px] tabular-nums text-fg-2">{r.right}</span>}
                  {active === i && <CornerDownLeft size={14} className="text-muted" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-line-2 px-4 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> naviguer</span>
          <span className="flex items-center gap-1"><Kbd>Entrée</Kbd> ouvrir</span>
          <span className="ml-auto">{results.length} résultat(s)</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
