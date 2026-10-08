// Outils de métré sur le plan (§9, §10) : étalonner, longueur, surface, mur, comptage.
// Aimantation sur les extrémités des tracés du PDF ; Maj = trait horizontal / vertical.
// Toute mesure affiche sa formule et peut alimenter une ligne du DQE (lien vivant).

import { Check, ChevronDown, ChevronRight, Crosshair, Hash, Link2, MousePointer2, Ruler, Spline, Square, Trash2, Wand2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { allLines } from '../../../core/dqe';
import { formatNumber, normalizeText, parseNumberFr } from '../../../core/format';
import {
  addMeasurement, calibrate, computeMeasure, deductionFrom, scaleConflict, deleteMeasurement, linkMeasureToLine, MEASURE_LABEL, MEASURE_UNIT, scaleFor, unitsCompatible, updateMeasurement,
} from '../../../core/metre/measure';
import { snapPoints, wallCandidates, type Segment } from '../../../core/pdf/vectors';
import type { Measurement, MeasureKind, SourceFile } from '../../../core/types';
import { Modal, StatusBadge } from '../../ds/legacy';
import { Button, cx, Dropdown, IconButton, Tooltip } from '../../ds/primitives';
import { useStore } from '../../stores/app-store';
import type { OverlayCtx } from './PlanCanvas';

export type Tool = 'select' | 'calibrate' | MeasureKind;
type Pt = [number, number];

export const KIND_COLOR: Record<MeasureKind | 'calibrate', string> = {
  length: '#2dd4ef',
  area: '#8b7cf6',
  wall: '#5297ff',
  count: '#f472b6',
  calibrate: '#f5a524',
};

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'select', label: 'Sélection', icon: <MousePointer2 size={15} />, hint: 'Sélectionner les éléments détectés' },
  { id: 'calibrate', label: 'Étalonner', icon: <Crosshair size={15} />, hint: 'Cliquer les deux extrémités d’une cote connue, puis saisir sa longueur réelle' },
  { id: 'length', label: 'Longueur', icon: <Spline size={15} />, hint: 'Linéaire (plinthes, réseaux, clôtures…)' },
  { id: 'area', label: 'Surface', icon: <Square size={15} />, hint: 'Contour d’une surface (pièce, dalle, toiture…)' },
  { id: 'wall', label: 'Mur', icon: <Ruler size={15} />, hint: 'Longueur × hauteur − ouvertures' },
  { id: 'count', label: 'Comptage', icon: <Hash size={15} />, hint: 'Pointer des éléments à compter' },
];

const near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** État et interactions de l'outil de mesure pour une page de plan. */
export function useMeasureTool(file: SourceFile | undefined, page: number) {
  const s = useStore();
  const [tool, setTool] = useState<Tool>('select');
  const [draft, setDraft] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<{ pt: Pt; snapped: boolean } | null>(null);
  const [finish, setFinish] = useState<{ kind: Tool; points: Pt[] } | null>(null);
  const ctxRef = useRef<OverlayCtx | null>(null);
  const snapsRef = useRef<{ segs: Segment[]; pts: Pt[] } | null>(null);

  const reset = useCallback(() => { setDraft([]); setCursor(null); }, []);
  useEffect(() => { reset(); }, [tool, file?.id, page, reset]);

  const snap = (pt: Pt, shift: boolean): { pt: Pt; snapped: boolean } => {
    const ctx = ctxRef.current;
    let out: Pt = pt;
    if (shift && draft.length) {
      const last = draft[draft.length - 1];
      out = Math.abs(pt[0] - last[0]) > Math.abs(pt[1] - last[1]) ? [pt[0], last[1]] : [last[0], pt[1]];
    }
    if (ctx && ctx.segments.length) {
      if (snapsRef.current?.segs !== ctx.segments) snapsRef.current = { segs: ctx.segments, pts: snapPoints(ctx.segments) };
      const tol = 10 / ctx.pxPerPt;
      let best: Pt | null = null;
      let bd = tol;
      for (const sp of snapsRef.current.pts) {
        const d = near(sp, out);
        if (d < bd) { bd = d; best = sp; }
      }
      if (best) return { pt: best, snapped: true };
    }
    return { pt: out, snapped: false };
  };

  const complete = useCallback((pts: Pt[]) => {
    const min = tool === 'area' ? 3 : tool === 'count' ? 1 : 2;
    if (pts.length < min) return;
    setFinish({ kind: tool, points: pts });
    setDraft([]);
  }, [tool]);

  const onPagePoint = (raw: Pt, e: React.PointerEvent) => {
    if (tool === 'select' || !file) return;
    const { pt } = snap(raw, e.shiftKey);
    // Double-clic sur le dernier point : terminer.
    if (draft.length && near(pt, draft[draft.length - 1]) < 4 / (ctxRef.current?.pxPerPt ?? 1) && tool !== 'count') return complete(draft);
    const next = [...draft, pt];
    if (tool === 'calibrate' && next.length === 2) return complete(next);
    setDraft(next);
  };
  const onPageMove = (raw: Pt | null, e?: React.PointerEvent) => {
    if (!raw || tool === 'select') return setCursor(null);
    setCursor(snap(raw, !!e?.shiftKey));
  };

  useEffect(() => {
    if (tool === 'select') return;
    const k = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement).tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      if (e.key === 'Escape') { if (draft.length) reset(); else setTool('select'); }
      else if (e.key === 'Enter') complete(draft);
      else if (e.key === 'Backspace') setDraft((d) => d.slice(0, -1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [tool, draft, complete, reset]);

  const overlay = (ctx: OverlayCtx, selectedId: string | null) => {
    ctxRef.current = ctx;
    const measures = s.project!.measurements.filter((m) => m.fileId === file?.id && m.page === page);
    return <MeasureOverlay ctx={ctx} measures={measures} draft={draft} cursor={tool !== 'select' ? cursor : null} tool={tool} selectedId={selectedId} />;
  };

  return { tool, setTool, draft, overlay, onPagePoint, onPageMove, finish, setFinish, measuring: tool !== 'select' };
}

function MeasureOverlay({ ctx, measures, draft, cursor, tool, selectedId }: { ctx: OverlayCtx; measures: Measurement[]; draft: Pt[]; cursor: { pt: Pt; snapped: boolean } | null; tool: Tool; selectedId: string | null }) {
  const s = useStore();
  const px = 1 / ctx.pxPerPt; // un pixel écran, en points de page
  const label = (m: Measurement) => {
    const r = computeMeasure(s.project!, m);
    return r.value === null ? `${m.label} : ?` : `${m.label} : ${formatNumber(r.value)} ${r.unit}`;
  };
  const path = (pts: Pt[], close = false) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') + (close ? ' Z' : '');
  const draftColor = KIND_COLOR[tool === 'select' ? 'length' : tool];
  const live = cursor && draft.length ? [...draft, cursor.pt] : draft;

  return (
    <g>
      {measures.map((m) => {
        const c = KIND_COLOR[m.kind];
        const sel = m.id === selectedId;
        const w = (sel ? 3.5 : 2.2) * px;
        const parts = m.parts ?? [m.points];
        const anchor = m.points[0] ?? parts[0]?.[0];
        return (
          <g key={m.id} opacity={m.origin === 'proposal' && !m.accepted ? 0.75 : 1}>
            {m.kind === 'area' && <path d={path(m.points, true)} fill={`${c}26`} stroke={c} strokeWidth={w} />}
            {(m.kind === 'length' || m.kind === 'wall') && parts.map((pts, i) => <path key={i} d={path(pts)} fill="none" stroke={c} strokeWidth={m.kind === 'wall' ? w * 2.2 : w} strokeOpacity={0.85} strokeDasharray={m.origin === 'proposal' && !m.accepted ? `${6 * px} ${4 * px}` : undefined} strokeLinecap="round" />)}
            {m.kind === 'count' && m.points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={6 * px} fill={`${c}55`} stroke={c} strokeWidth={1.5 * px} />)}
            {anchor && (
              <g transform={`translate(${anchor[0] + 6 * px},${anchor[1] - 8 * px})`}>
                <text fontSize={11 * px} fill="#0b1220" stroke="#fff" strokeWidth={3 * px} paintOrder="stroke" fontFamily="Inter Variable, sans-serif" fontWeight={600}>{label(m)}</text>
              </g>
            )}
          </g>
        );
      })}
      {live.length > 0 && tool !== 'count' && (
        <path d={path(live, tool === 'area' && live.length > 2)} fill={tool === 'area' ? `${draftColor}22` : 'none'} stroke={draftColor} strokeWidth={2 * px} strokeDasharray={`${5 * px} ${3 * px}`} />
      )}
      {draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3.5 * px} fill="#fff" stroke={draftColor} strokeWidth={1.5 * px} />)}
      {cursor && (
        <g>
          <circle cx={cursor.pt[0]} cy={cursor.pt[1]} r={(cursor.snapped ? 6 : 3) * px} fill="none" stroke={cursor.snapped ? '#22c55e' : draftColor} strokeWidth={1.8 * px} />
          {cursor.snapped && <rect x={cursor.pt[0] - 2 * px} y={cursor.pt[1] - 2 * px} width={4 * px} height={4 * px} fill="#22c55e" />}
        </g>
      )}
    </g>
  );
}

/** Barre d'outils flottante au-dessus du plan. */
export function MeasureToolbar({ tool, setTool, file, page, onPropose, segmentsReady }: { tool: Tool; setTool: (t: Tool) => void; file: SourceFile; page: number; onPropose: () => void; segmentsReady: boolean }) {
  const s = useStore();
  const sc = scaleFor(s.project!, file.id, page);
  return (
    <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-[9px] border border-line bg-[rgba(14,23,40,.92)] p-1 shadow-ds-2 backdrop-blur">
      {TOOLS.map((t) => (
        <Tooltip key={t.id} label={<><b>{t.label}</b><br />{t.hint}</>} side="bottom">
          <button
            onClick={() => setTool(t.id)}
            aria-pressed={tool === t.id}
            aria-label={t.label}
            className={cx('flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] transition-colors', tool === t.id ? 'bg-brand text-white' : 'text-fg-2 hover:bg-hover hover:text-fg')}
          >
            {t.icon}
            <span className="hidden 2xl:inline">{t.label}</span>
          </button>
        </Tooltip>
      ))}
      <span className="mx-1 h-5 w-px bg-line" />
      <Tooltip label={sc ? `Échelle : ${sc.label}` : 'Échelle non déterminée : utilisez « Étalonner » sur une cote connue'} side="bottom">
        <button onClick={() => setTool('calibrate')} className={cx('flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11.5px] font-semibold', !sc ? 'text-[#ff7a7a]' : sc.status === 'confirmed' ? 'text-[#4ade80]' : 'text-[#fbbf24]')}>
          <span className={cx('h-2 w-2 rounded-full', !sc ? 'bg-[var(--bad)]' : sc.status === 'confirmed' ? 'bg-[var(--ok)]' : 'bg-[var(--warn)]')} />
          {sc ? `1/${Math.round(sc.mmPerPt / (25.4 / 72))}` : 'Échelle ?'}
        </button>
      </Tooltip>
      <IconButton label="Proposer les murs (traits épais du plan) — à vérifier" size="sm" disabled={!segmentsReady} onClick={onPropose}><Wand2 size={15} /></IconButton>
    </div>
  );
}

/** Fenêtre de fin de mesure : libellé, hauteur (mur) ou longueur réelle (étalonnage). */
export function FinishDialog({ file, page, finish, onClose, onCreated }: { file: SourceFile; page: number; finish: { kind: Tool; points: Pt[] }; onClose: () => void; onCreated: (id: string) => void }) {
  const s = useStore();
  const n = s.project!.measurements.filter((m) => m.kind === finish.kind).length + 1;
  const [label, setLabel] = useState(finish.kind === 'calibrate' ? '' : `${MEASURE_LABEL[finish.kind as MeasureKind]} ${n}`);
  const [value, setValue] = useState('');
  const isCal = finish.kind === 'calibrate';
  const num = parseNumberFr(value);
  const ok = isCal ? num !== null && num > 0 : label.trim() !== '' && (finish.kind !== 'wall' || value === '' || (num !== null && num > 0));
  const submit = () => {
    if (!ok) return;
    if (isCal) {
      s.update((p) => calibrate(p, file.id, page, finish.points[0], finish.points[1], num!));
      s.toast('success', `Planche étalonnée : ${formatNumber(num!)} m entre les deux points. Les mesures de la page sont recalculées.`);
    } else {
      const r = addMeasurement(s.project!, {
        kind: finish.kind as MeasureKind, label: label.trim(), fileId: file.id, fileName: file.name, page, points: finish.points,
        height: finish.kind === 'wall' ? num : undefined, deductions: [], origin: 'manual',
      });
      s.update(() => r.project);
      onCreated(r.id);
    }
    onClose();
  };
  return (
    <Modal
      title={isCal ? 'Étalonner la planche' : `Nouvelle mesure — ${MEASURE_LABEL[finish.kind as MeasureKind]}`}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" disabled={!ok} onClick={submit}>{isCal ? 'Étalonner' : 'Enregistrer la mesure'}</button></>}
    >
      <div className="form" onKeyDown={(e) => e.key === 'Enter' && submit()}>
        {isCal ? (
          <label className="f" style={{ gridColumn: '1 / -1' }}>
            <span>Longueur réelle entre les deux points (m)</span>
            <input className="in" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex. 4,20 (lire la cote sur le plan)" />
          </label>
        ) : (
          <>
            <label className="f" style={{ gridColumn: finish.kind === 'wall' ? undefined : '1 / -1' }}>
              <span>Libellé</span>
              <input className="in" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            {finish.kind === 'wall' && (
              <label className="f">
                <span>Hauteur du mur (m)</span>
                <input className="in" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex. 3,00 — vide = non déterminée" />
              </label>
            )}
          </>
        )}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        {isCal
          ? 'L’étalonnage rend l’échelle « confirmée ». Choisissez la plus longue cote lisible pour plus de précision.'
          : finish.kind === 'wall'
            ? 'La hauteur ne figure pas sur une vue en plan : DQP ne la devine pas. Les ouvertures se déduisent ensuite dans le panneau des mesures.'
            : `${finish.points.length} point(s) relevé(s).`}
      </p>
    </Modal>
  );
}

/** Panneau des mesures : formules, déductions, liaison au DQE. */
export function MeasurePanel({ file, page, selectedId, onSelect }: { file: SourceFile; page: number; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const s = useStore();
  const p = s.project!;
  const list = p.measurements.filter((m) => m.fileId === file.id && m.page === page);
  const sc = scaleFor(p, file.id, page);
  const conflict = scaleConflict(p, file.id, page);
  return (
    <div className="h-full overflow-y-auto">
      <div className={cx('m-3 rounded-[8px] border px-3 py-2 text-[12px]', !sc ? 'border-[rgba(240,75,75,.35)] bg-[var(--bad-bg)]' : sc.status === 'confirmed' ? 'border-[rgba(34,197,94,.3)] bg-[var(--ok-bg)]' : 'border-[rgba(245,165,36,.3)] bg-[var(--warn-bg)]')}>
        <b className="text-fg">Échelle de la page</b>
        <div className="text-fg-2">{sc ? sc.label : 'Non déterminée — étalonnez la planche sur une cote connue (outil « Étalonner »).'}</div>
        {conflict && (
          <div className="mt-1 text-[#fbbf24]">
            Attention : l’étalonnage donne ≈ 1/{conflict.calibrated} alors que la planche indique 1/{conflict.written}. Vérifiez la cote utilisée (ou le PDF a été redimensionné).
          </div>
        )}
      </div>
      {list.length === 0 && <p className="px-4 text-[12.5px] text-muted">Aucune mesure sur cette page. Choisissez un outil en haut à droite du plan.</p>}
      {list.map((m) => <MeasureItem key={m.id} m={m} open={selectedId === m.id} onToggle={() => onSelect(selectedId === m.id ? null : m.id)} />)}
    </div>
  );
}

function MeasureItem({ m, open, onToggle }: { m: Measurement; open: boolean; onToggle: () => void }) {
  const s = useStore();
  const p = s.project!;
  const r = computeMeasure(p, m);
  const lines = useMemo(() => allLines(p), [p]);
  const linked = lines.filter((l) => l.quantity.expression?.includes(`{M:${m.id}}`));
  const openings = p.elements.filter((e) => e.kind === 'opening' && e.source.fileId === m.fileId);
  const [q, setQ] = useState('');
  const setDed = (i: number, k: 'label' | 'width' | 'height' | 'count', v: string) => {
    const deductions = m.deductions.map((d, j) => (j !== i ? d : { ...d, [k]: k === 'label' ? v : parseNumberFr(v) ?? (k === 'count' ? 1 : 0) }));
    s.update((x) => updateMeasurement(x, m.id, { deductions }));
  };
  return (
    <div className={cx('border-t border-line-2', open && 'bg-bg-2/60')}>
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-3.5 py-2 text-left hover:bg-hover">
        {open ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-muted" />}
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: KIND_COLOR[m.kind] }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-fg">{m.label}</span>
          <span className="block text-[11px] text-muted">{MEASURE_LABEL[m.kind]}{m.origin === 'proposal' ? ' · proposition automatique' : ''}{linked.length ? ` · ${linked.length} ligne(s) du DQE` : ''}</span>
        </span>
        <span className="text-right">
          <span className="block text-[13px] font-bold tabular-nums text-fg">{r.value === null ? '—' : formatNumber(r.value)} <span className="text-[11px] font-normal text-muted">{r.unit}</span></span>
          <StatusBadge status={r.status} short />
        </span>
      </button>
      {open && (
        <div className="anim-fade space-y-3 px-4 pb-3 text-[12px]">
          <div>
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">Formule</div>
            <ol className="steps small">{r.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
          </div>
          <label className="f"><span>Libellé</span><input className="in" defaultValue={m.label} key={m.id + m.label} onBlur={(e) => e.target.value.trim() && e.target.value !== m.label && s.update((x) => updateMeasurement(x, m.id, { label: e.target.value.trim() }))} /></label>
          {m.kind === 'wall' && (
            <>
              <label className="f">
                <span>Hauteur (m)</span>
                <input className="in" defaultValue={m.height == null ? '' : String(m.height).replace('.', ',')} key={m.id + String(m.height)} placeholder="non déterminée"
                  onBlur={(e) => { const v = e.target.value.trim() === '' ? null : parseNumberFr(e.target.value); if (v === null && e.target.value.trim() !== '') return; s.update((x) => updateMeasurement(x, m.id, { height: v })); }} />
              </label>
              <div>
                <div className="mb-1 flex items-center text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Ouvertures déduites
                  <Dropdown
                    align="right"
                    trigger={(_o, t) => <button className="btn sm ml-auto" onClick={t}>+ Ajouter</button>}
                    items={[
                      { label: 'Ouverture saisie', onSelect: () => s.update((x) => updateMeasurement(x, m.id, { deductions: [...m.deductions, { label: 'Ouverture', width: 0.9, height: 2.1, count: 1 }] })) },
                      ...(openings.length ? [{ separator: true }] : []),
                      ...openings.map((o) => {
                        const d = deductionFrom(o.name, o.props.largeur?.value as number | null, o.props.hauteur?.value as number | null, o.id);
                        return { label: `${o.category} ${o.props.code?.value ?? o.name}`, hint: d ? `${formatNumber(d.width)} × ${formatNumber(d.height)} m — lu sur le plan` : 'dimensions non écrites sur le plan', disabled: !d, onSelect: () => d && s.update((x) => updateMeasurement(x, m.id, { deductions: [...m.deductions, d] })) };
                      }),
                    ]}
                  />
                </div>
                {m.deductions.length === 0 && <div className="text-muted">Aucune.</div>}
                {m.deductions.map((d, i) => (
                  <div key={i} className="mb-1 flex items-center gap-1">
                    <input className="in w-[34%]" defaultValue={d.label} onBlur={(e) => setDed(i, 'label', e.target.value)} />
                    <input className="in w-[18%] text-right" defaultValue={String(d.width).replace('.', ',')} title="Largeur (m)" onBlur={(e) => setDed(i, 'width', e.target.value)} />×
                    <input className="in w-[18%] text-right" defaultValue={String(d.height).replace('.', ',')} title="Hauteur (m)" onBlur={(e) => setDed(i, 'height', e.target.value)} />×
                    <input className="in w-[12%] text-right" defaultValue={String(d.count)} title="Nombre" onBlur={(e) => setDed(i, 'count', e.target.value)} />
                    <button className="icon-btn" title="Retirer" onClick={() => s.update((x) => updateMeasurement(x, m.id, { deductions: m.deductions.filter((_, j) => j !== i) }))}><X size={13} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div>
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">Lignes du DQE alimentées</div>
            {linked.map((l) => <div key={l.id} className="flex items-center gap-1.5 text-fg-2"><Link2 size={12} className="text-brand-2" />{l.designation} <span className="text-muted">({l.unit})</span></div>)}
            <Dropdown
              width={380}
              trigger={(_o, t) => <button className="btn sm mt-1" onClick={t}><Link2 size={12} />Utiliser comme quantité d’une ligne…</button>}
            >
              {(close) => {
                const n = normalizeText(q);
                const cands = lines.filter((l) => unitsCompatible(MEASURE_UNIT[m.kind], l.unit) && (!n || normalizeText(l.designation).includes(n))).slice(0, 40);
                return (
                  <div className="p-1.5">
                    <input className="in mb-1.5 w-full" autoFocus placeholder={`Ouvrage en ${MEASURE_UNIT[m.kind]}…`} value={q} onChange={(e) => setQ(e.target.value)} />
                    <div className="max-h-[260px] overflow-y-auto">
                      {cands.map((l) => (
                        <button key={l.id} className="block w-full rounded-[6px] px-2 py-1.5 text-left text-[12px] text-fg-2 hover:bg-hover hover:text-fg"
                          onClick={() => { s.update((x) => linkMeasureToLine(x, l.id, m.id)); s.toast('success', `« ${l.designation} » utilise maintenant la mesure « ${m.label} ».`); close(); }}>
                          {l.designation} <span className="text-muted">· {l.unit}</span>
                        </button>
                      ))}
                      {cands.length === 0 && <div className="px-2 py-2 text-[12px] text-muted">Aucune ligne en {MEASURE_UNIT[m.kind]}.</div>}
                    </div>
                  </div>
                );
              }}
            </Dropdown>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {m.origin === 'proposal' && !m.accepted && <Button size="sm" variant="primary" icon={<Check size={13} />} onClick={() => s.update((x) => updateMeasurement(x, m.id, { accepted: true }))}>Valider la proposition</Button>}
            <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => { s.update((x) => deleteMeasurement(x, m.id)); s.toast('info', `Mesure « ${m.label} » supprimée.`, { label: 'Annuler', run: s.undo }); }}>Supprimer</Button>
          </div>
          {m.note && <p className="m-0 text-[11.5px] text-muted">{m.note}</p>}
        </div>
      )}
    </div>
  );
}

/** Proposition automatique de murs à partir des traits épais de la page (toujours à vérifier). */
export function proposeWalls(segments: Segment[]): { parts: Pt[][]; threshold: number } | null {
  const { walls, threshold } = wallCandidates(segments);
  if (!walls.length) return null;
  return { parts: walls.map((w) => [[w.x1, w.y1], [w.x2, w.y2]] as Pt[]), threshold };
}
