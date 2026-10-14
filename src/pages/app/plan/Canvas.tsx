// Zone de dessin du plan : affichage (fond importé, pièces, murs, ouvertures, mobilier,
// cotes, textes), outils de dessin, accroche (points, axes des murs, angles droits, grille),
// zoom et déplacement à la souris comme au doigt (pincer pour zoomer).

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { FURNITURE, newItem } from '../../../engine/plan/furniture';
import {
  add, clampOpening, dist, formatArea, itemCorners, labelPoint, mulp, newId, OPENING_KINDS, type OpeningKind, planBounds, type PlanModel,
  pointInPolygon, polygonArea, projectOnSegment, type Pt, ROOM_KINDS, type RoomKind, segDistance, sub, WALL_KINDS, type WallKind,
  wallDir, wallEndExtensions, wallLength, wallNormal, wallSolidSpans, wallSpanPolygon,
} from '../../../engine/plan/model';
import { openingSvg, THEMES } from '../../../engine/plan/render';

export type Tool = 'select' | 'mur' | 'ouverture' | 'piece' | 'piece_auto' | 'meuble' | 'cote' | 'texte' | 'mesure' | 'echelle';
export type Sel = { kind: 'wall' | 'opening' | 'room' | 'item' | 'dim' | 'note'; id: string } | null;

export interface ToolOptions {
  wallKind: WallKind;
  thickness: number;
  openingKind: OpeningKind;
  roomKind: RoomKind;
  furnitureType: string;
}

interface View { x0: number; y0: number; s: number }

interface Props {
  model: PlanModel;
  current: MutableRefObject<PlanModel>;
  bgUrl: string | null;
  bgSnap: Pt[];
  tool: Tool;
  opts: ToolOptions;
  selection: Sel;
  readOnly: boolean;
  onSelect: (s: Sel) => void;
  begin: () => void;
  live: (m: PlanModel) => void;
  commit: (m: PlanModel) => void;
  cancel: () => void;
  onCalibrate: (a: Pt, b: Pt) => void;
  onDetect: (at: Pt) => void;
  onNote: (at: Pt) => void;
  onInfo: (msg: string) => void;
  lengthRequest: { value: number; seq: number } | null;
  fitSignal: number;
  finishSignal: number;
}

const ROOM_COLORS: Record<RoomKind, string> = {
  sejour: '#f3c98b', salon: '#f3c98b', salle_manger: '#f1d29e', cuisine: '#b9d7ea', chambre: '#c9e2b8', sdb: '#a9d4d9', wc: '#a9d4d9',
  bureau: '#e3cfe8', circulation: '#e6e2da', buanderie: '#c8d3e0', magasin: '#d7d2c8', garage: '#cfcfcf', terrasse: '#e2d6c2', jardin: '#b7d69a', autre: '#e7e7e7',
};

const theme = THEMES.moderne;

export function PlanCanvas(p: Props) {
  const { model } = p;
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ x0: -1, y0: -1, s: 60 });
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<{ p: Pt; snap: 'point' | 'axe' | 'ortho' | 'grille' | 'libre' } | null>(null);
  const [measure, setMeasure] = useState<[Pt, Pt] | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: 'none' | 'pan' | 'pinch' | 'drag';
    start: { x: number; y: number };
    view: View;
    moved: boolean;
    pinch?: { d: number; cx: number; cy: number };
    drag?: { sel: NonNullable<Sel>; handle?: number; origin: Pt; model: PlanModel };
  }>({ mode: 'none', start: { x: 0, y: 0 }, view, moved: false });

  // Taille de la zone.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Cadrage sur le contenu (ou sur le fond importé).
  const fit = useCallback(() => {
    const b = planBounds(p.current.current, true) ?? { minX: 0, minY: 0, maxX: 12, maxY: 9 };
    const w = Math.max(1, b.maxX - b.minX), h = Math.max(1, b.maxY - b.minY);
    const s = Math.min(size.w / (w * 1.15), size.h / (h * 1.15));
    setView({ s, x0: b.minX - (size.w / s - w) / 2, y0: b.minY - (size.h / s - h) / 2 });
  }, [p.current, size.w, size.h]);
  useEffect(() => { fit(); }, [p.fitSignal, size.w > 0 && size.h > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changement d'outil : brouillon abandonné.
  useEffect(() => { setDraft([]); setMeasure(null); }, [p.tool]);

  const toWorld = useCallback((cx: number, cy: number): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return [view.x0 + (cx - r.left) / view.s, view.y0 + (cy - r.top) / view.s];
  }, [view]);

  // ------------------------------------------------------------------ accroche
  const snapPts = useMemo(() => {
    const m = model;
    const pts: Pt[] = [];
    for (const w of m.walls) pts.push(w.a, w.b);
    for (const r of m.rooms) pts.push(...r.points);
    for (const d of m.dims) pts.push(d.a, d.b);
    if (m.background && m.layers.fond.visible) for (const q of p.bgSnap) pts.push([q[0] * m.background.mpp, q[1] * m.background.mpp]);
    return pts;
  }, [model, p.bgSnap]);

  const snap = useCallback((raw: Pt, from?: Pt, ignore?: string): { p: Pt; snap: 'point' | 'axe' | 'ortho' | 'grille' | 'libre' } => {
    const tol = 12 / view.s;
    let best: Pt | null = null, bd = tol;
    for (const q of snapPts) {
      const d = Math.abs(q[0] - raw[0]) + Math.abs(q[1] - raw[1]);
      if (d < bd * 1.2 && dist(q, raw) < bd) { bd = dist(q, raw); best = q; }
    }
    if (best) return { p: [best[0], best[1]], snap: 'point' };
    let q = raw;
    let kind: 'axe' | 'ortho' | 'grille' | 'libre' = 'libre';
    if (from) {
      const dx = raw[0] - from[0], dy = raw[1] - from[1];
      const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 90;
      if (ang < 6 || ang > 84) {
        q = Math.abs(dx) >= Math.abs(dy) ? [raw[0], from[1]] : [from[0], raw[1]];
        kind = 'ortho';
      }
    }
    for (const w of model.walls) {
      if (w.id === ignore) continue;
      const pr = projectOnSegment(q, w.a, w.b);
      if (pr.d < tol) {
        if (kind === 'ortho' && from) {
          // Intersection de la contrainte d'angle droit avec l'axe du mur.
          const horizontal = q[1] === from[1];
          const dd = wallDir(w);
          if (horizontal && Math.abs(dd[1]) > 1e-6) {
            const t = (from[1] - w.a[1]) / dd[1];
            const x = w.a[0] + dd[0] * t;
            if (t >= -1e-6 && t <= wallLength(w) + 1e-6) return { p: [x, from[1]], snap: 'axe' };
          } else if (!horizontal && Math.abs(dd[0]) > 1e-6) {
            const t = (from[0] - w.a[0]) / dd[0];
            const y = w.a[1] + dd[1] * t;
            if (t >= -1e-6 && t <= wallLength(w) + 1e-6) return { p: [from[0], y], snap: 'axe' };
          }
          continue;
        }
        // Sans fond importé, le point glisse sur l'axe par pas de 5 cm.
        if (!model.background) {
          const g = 0.05;
          if (Math.abs(w.a[1] - w.b[1]) < 1e-9) return { p: [Math.round(pr.p[0] / g) * g, w.a[1]], snap: 'axe' };
          if (Math.abs(w.a[0] - w.b[0]) < 1e-9) return { p: [w.a[0], Math.round(pr.p[1] / g) * g], snap: 'axe' };
        }
        return { p: pr.p, snap: 'axe' };
      }
    }
    if (!model.background && kind !== 'ortho') {
      const g = 0.05;
      return { p: [Math.round(q[0] / g) * g, Math.round(q[1] / g) * g], snap: 'grille' };
    }
    if (!model.background && kind === 'ortho') {
      const g = 0.05;
      return { p: [Math.round(q[0] / g) * g, Math.round(q[1] / g) * g], snap: 'ortho' };
    }
    return { p: q, snap: kind };
  }, [snapPts, view.s, model.walls, model.background]);

  // ------------------------------------------------------------------ sélection
  const hit = useCallback((w: Pt): Sel => {
    const m = p.current.current;
    const tol = 8 / view.s;
    const L = m.layers;
    if (L.textes.visible && !L.textes.locked) for (const n of [...m.notes].reverse()) if (dist(n.at, w) < Math.max(tol, n.size)) return { kind: 'note', id: n.id };
    if (L.cotes.visible && !L.cotes.locked) for (const d of m.dims) {
      const len = dist(d.a, d.b) || 1;
      const nr: Pt = [(d.b[1] - d.a[1]) / len, -(d.b[0] - d.a[0]) / len];
      if (segDistance(w, add(d.a, mulp(nr, d.offset)), add(d.b, mulp(nr, d.offset))) < tol) return { kind: 'dim', id: d.id };
    }
    if (L.ouvertures.visible && !L.ouvertures.locked) for (const o of m.openings) {
      const wall = m.walls.find((x) => x.id === o.wallId);
      if (!wall) continue;
      const pr = projectOnSegment(w, wall.a, wall.b);
      if (pr.d < wall.thickness / 2 + tol && Math.abs(pr.t * wallLength(wall) - o.pos) < o.width / 2) return { kind: 'opening', id: o.id };
    }
    if (L.mobilier.visible && !L.mobilier.locked) for (const i of [...m.items].reverse()) if (pointInPolygon(w, itemCorners(i))) return { kind: 'item', id: i.id };
    if (L.murs.visible && !L.murs.locked) for (const wall of m.walls) if (segDistance(w, wall.a, wall.b) < wall.thickness / 2 + tol) return { kind: 'wall', id: wall.id };
    if (L.pieces.visible && !L.pieces.locked) for (const r of [...m.rooms].reverse()) if (pointInPolygon(w, r.points)) return { kind: 'room', id: r.id };
    return null;
  }, [p.current, view.s]);

  /** Poignées de l'élément sélectionné (extrémités de mur, sommets de pièce, bouts de cote). */
  const handles = useMemo((): Pt[] => {
    const s = p.selection;
    if (!s || p.readOnly) return [];
    if (s.kind === 'wall') { const w = model.walls.find((x) => x.id === s.id); return w ? [w.a, w.b] : []; }
    if (s.kind === 'room') return model.rooms.find((x) => x.id === s.id)?.points ?? [];
    if (s.kind === 'dim') { const d = model.dims.find((x) => x.id === s.id); return d ? [d.a, d.b] : []; }
    return [];
  }, [p.selection, model, p.readOnly]);

  // ------------------------------------------------------------------ actions des outils
  const roomName = (kind: RoomKind) => {
    const base = ROOM_KINDS[kind];
    const n = p.current.current.rooms.filter((r) => r.kind === kind).length;
    return n ? `${base} ${n + 1}` : base;
  };

  const finishDraft = useCallback(() => {
    if (p.tool === 'piece' && draft.length >= 3) {
      const m = p.current.current;
      const id = newId('r');
      p.commit({ ...m, rooms: [...m.rooms, { id, name: roomName(p.opts.roomKind), kind: p.opts.roomKind, points: draft }] });
      p.onSelect({ kind: 'room', id });
    }
    setDraft([]);
  }, [p, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (p.finishSignal) finishDraft(); }, [p.finishSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const click = (raw: Pt, exact = false) => {
    const m = p.current.current;
    const last = draft[draft.length - 1];
    // Une longueur saisie au clavier est exacte : pas d'accroche.
    const { p: pt } = exact ? { p: raw } : snap(raw, last);
    switch (p.tool) {
      case 'select': {
        p.onSelect(hit(raw));
        return;
      }
      case 'mur': {
        if (!last) return setDraft([pt]);
        if (dist(last, pt) < 0.05) return;
        const id = newId('w');
        p.commit({ ...m, walls: [...m.walls, { id, a: last, b: pt, thickness: p.opts.thickness, kind: p.opts.wallKind }] });
        if (draft.length > 1 && dist(pt, draft[0]) < 1e-6) return setDraft([]);
        return setDraft([...draft, pt]);
      }
      case 'ouverture': {
        let best: { id: string; t: number; d: number; side: 1 | -1 } | null = null;
        for (const w of m.walls) {
          const pr = projectOnSegment(raw, w.a, w.b);
          if (pr.d < w.thickness / 2 + 14 / view.s && (!best || pr.d < best.d)) {
            const n = wallNormal(w);
            const side = (raw[0] - pr.p[0]) * n[0] + (raw[1] - pr.p[1]) * n[1] >= 0 ? 1 : -1;
            best = { id: w.id, t: pr.t, d: pr.d, side };
          }
        }
        if (!best) return p.onInfo('Cliquez sur un mur pour y placer la porte ou la fenêtre.');
        const w = m.walls.find((x) => x.id === best!.id)!;
        const def = OPENING_KINDS[p.opts.openingKind];
        const o = clampOpening({ id: newId('o'), wallId: w.id, pos: best.t * wallLength(w), width: def.width, height: null, kind: p.opts.openingKind, side: best.side, flip: false }, w);
        const id = o.id;
        p.commit({ ...m, openings: [...m.openings, { ...o, pos: Math.round(o.pos * 100) / 100 }] });
        p.onSelect({ kind: 'opening', id });
        return;
      }
      case 'piece': {
        if (draft.length >= 3 && dist(pt, draft[0]) < 12 / view.s) return finishDraft();
        return setDraft([...draft, pt]);
      }
      case 'piece_auto':
        return p.onDetect(raw);
      case 'meuble': {
        const it = newItem(p.opts.furnitureType, Math.round(raw[0] * 100) / 100, Math.round(raw[1] * 100) / 100);
        p.commit({ ...m, items: [...m.items, it] });
        p.onSelect({ kind: 'item', id: it.id });
        return;
      }
      case 'cote': {
        if (draft.length < 2) {
          if (draft.length === 1 && dist(draft[0], pt) < 0.01) return;
          return setDraft([...draft, pt]);
        }
        const [a, b] = draft;
        const len = dist(a, b);
        const nr: Pt = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
        const offset = Math.round(((raw[0] - a[0]) * nr[0] + (raw[1] - a[1]) * nr[1]) * 100) / 100 || 0.5;
        const id = newId('d');
        p.commit({ ...m, dims: [...m.dims, { id, a, b, offset }] });
        p.onSelect({ kind: 'dim', id });
        return setDraft([]);
      }
      case 'texte':
        return p.onNote(pt);
      case 'mesure': {
        if (!last || measure) { setMeasure(null); return setDraft([pt]); }
        setMeasure([last, pt]);
        return setDraft([]);
      }
      case 'echelle': {
        if (!last) return setDraft([pt]);
        if (dist(last, pt) < 1e-6) return;
        setDraft([]);
        return p.onCalibrate(last, pt);
      }
    }
  };

  // Longueur tapée au clavier : point suivant dans la direction du curseur.
  useEffect(() => {
    if (!p.lengthRequest) return;
    const last = draft[draft.length - 1];
    if (!last || !hover) return p.onInfo('Placez d’abord le premier point, puis orientez le trait avec le curseur.');
    const d = sub(hover.p, last);
    const len = Math.hypot(d[0], d[1]);
    if (len < 1e-6) return;
    let dir: Pt = [d[0] / len, d[1] / len];
    if (Math.abs(dir[0]) > 0.995) dir = [Math.sign(dir[0]), 0];
    if (Math.abs(dir[1]) > 0.995) dir = [0, Math.sign(dir[1])];
    const target = add(last, mulp(dir, p.lengthRequest.value));
    click(target, true);
    setHover({ p: target, snap: 'libre' });
  }, [p.lengthRequest?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Échap / Entrée pendant un tracé.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') { setDraft([]); setMeasure(null); }
      if (e.key === 'Enter') finishDraft();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishDraft]);

  // ------------------------------------------------------------------ gestes
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { mode: 'pinch', start: { x: e.clientX, y: e.clientY }, view, moved: true, pinch: { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 } };
      return;
    }
    g.start = { x: e.clientX, y: e.clientY };
    g.view = view;
    g.moved = false;
    g.mode = e.button === 1 ? 'pan' : 'none';
    g.drag = undefined;
    if (p.tool === 'select' && !p.readOnly && e.button === 0) {
      const w = toWorld(e.clientX, e.clientY);
      // Poignée de l'élément sélectionné ?
      const hi = handles.findIndex((h) => dist(h, w) < 10 / view.s);
      const sel = hi >= 0 ? p.selection : hit(w);
      if (sel && (hi >= 0 || (p.selection && sel.kind === p.selection.kind && sel.id === p.selection.id) || e.pointerType === 'mouse')) {
        if (hi < 0) p.onSelect(sel);
        g.drag = { sel, handle: hi >= 0 ? hi : undefined, origin: w, model: p.current.current };
      }
    }
  };

  const applyDrag = (w: Pt) => {
    const d = gesture.current.drag!;
    const m0 = d.model;
    const delta = sub(w, d.origin);
    const mv = (q: Pt): Pt => [Math.round((q[0] + delta[0]) * 1000) / 1000, Math.round((q[1] + delta[1]) * 1000) / 1000];
    const s = d.sel;
    let m: PlanModel = m0;
    if (s.kind === 'item') m = { ...m0, items: m0.items.map((i) => (i.id === s.id ? { ...i, x: mv([i.x, i.y])[0], y: mv([i.x, i.y])[1] } : i)) };
    else if (s.kind === 'note') m = { ...m0, notes: m0.notes.map((n) => (n.id === s.id ? { ...n, at: mv(n.at) } : n)) };
    else if (s.kind === 'opening') {
      m = { ...m0, openings: m0.openings.map((o) => {
        if (o.id !== s.id) return o;
        const wall = m0.walls.find((x) => x.id === o.wallId)!;
        const pr = projectOnSegment(w, wall.a, wall.b);
        return clampOpening({ ...o, pos: Math.round(pr.t * wallLength(wall) * 100) / 100 }, wall);
      }) };
    } else if (s.kind === 'wall') {
      m = { ...m0, walls: m0.walls.map((x) => {
        if (x.id !== s.id) return x;
        if (d.handle === undefined) return { ...x, a: mv(x.a), b: mv(x.b) };
        const other = d.handle === 0 ? x.b : x.a;
        const q = snap(w, other, x.id).p;
        return d.handle === 0 ? { ...x, a: q } : { ...x, b: q };
      }) };
    } else if (s.kind === 'room') {
      m = { ...m0, rooms: m0.rooms.map((r) => {
        if (r.id !== s.id) return r;
        if (d.handle === undefined) return { ...r, points: r.points.map(mv) };
        const pts = [...r.points];
        pts[d.handle] = snap(w, pts[(d.handle + pts.length - 1) % pts.length]).p;
        return { ...r, points: pts };
      }) };
    } else if (s.kind === 'dim') {
      m = { ...m0, dims: m0.dims.map((x) => {
        if (x.id !== s.id) return x;
        if (d.handle === undefined) {
          const len = dist(x.a, x.b) || 1;
          const nr: Pt = [(x.b[1] - x.a[1]) / len, -(x.b[0] - x.a[0]) / len];
          return { ...x, offset: Math.round(((w[0] - x.a[0]) * nr[0] + (w[1] - x.a[1]) * nr[1]) * 100) / 100 };
        }
        const q = snap(w).p;
        return d.handle === 0 ? { ...x, a: q } : { ...x, b: q };
      }) };
    }
    p.live(m);
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.mode === 'pinch' && pointers.current.size >= 2 && g.pinch) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const r = svg.current!.getBoundingClientRect();
      const s = Math.min(2000, Math.max(2, g.view.s * (d / g.pinch.d)));
      const wx = g.view.x0 + (g.pinch.cx - r.left) / g.view.s, wy = g.view.y0 + (g.pinch.cy - r.top) / g.view.s;
      setView({ s, x0: wx - (cx - r.left) / s, y0: wy - (cy - r.top) / s });
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (pointers.current.size === 0 || e.pointerType !== 'mouse' || pointers.current.size === 1) {
      const last = draft[draft.length - 1];
      setHover(snap(w, last));
    }
    if (!pointers.current.has(e.pointerId)) return;
    const moved = Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > 5;
    if (!moved && !g.moved) return;
    if (!g.moved) {
      g.moved = true;
      if (g.drag) { p.begin(); g.mode = 'drag'; } else if (g.mode === 'none') g.mode = 'pan';
    }
    if (g.mode === 'drag' && g.drag) return applyDrag(w);
    if (g.mode === 'pan') setView({ ...g.view, x0: g.view.x0 - (e.clientX - g.start.x) / g.view.s, y0: g.view.y0 - (e.clientY - g.start.y) / g.view.s });
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g.mode === 'pinch') {
      if (pointers.current.size === 0) g.mode = 'none';
      return;
    }
    if (g.mode === 'drag') {
      p.commit(p.current.current);
    } else if (!g.moved && e.button !== 1) {
      if (!p.readOnly || p.tool === 'select' || p.tool === 'mesure') click(toWorld(e.clientX, e.clientY));
    }
    g.mode = 'none';
    g.drag = undefined;
  };

  const onWheel = (e: RWheelEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const k = Math.exp(-e.deltaY * 0.0015);
    const s = Math.min(2000, Math.max(2, view.s * k));
    const wx = view.x0 + (e.clientX - r.left) / view.s, wy = view.y0 + (e.clientY - r.top) / view.s;
    setView({ s, x0: wx - (e.clientX - r.left) / s, y0: wy - (e.clientY - r.top) / s });
  };
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  // ------------------------------------------------------------------ dessin
  const px = (n: number) => n / view.s;
  const approx = model.scaleVerified ? '' : '≈ ';
  const L = model.layers;
  const sel = p.selection;
  const last = draft[draft.length - 1];
  const preview = hover && last && ['mur', 'piece', 'cote', 'mesure', 'echelle'].includes(p.tool) ? hover.p : null;
  const lenLabel = (a: Pt, b: Pt) => `${approx}${dist(a, b).toFixed(2).replace('.', ',')} m`;

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden bg-[#f6f7f9]" style={{ touchAction: 'none' }}>
      <svg ref={svg} role="img" aria-label="Zone de dessin du plan" width={size.w} height={size.h}
        viewBox={`${view.x0} ${view.y0} ${size.w / view.s} ${size.h / view.s}`}
        className={p.tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)} onWheel={onWheel} onDoubleClick={() => finishDraft()} onContextMenu={(e) => e.preventDefault()}>
        <defs>
          <pattern id="grid1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#d9dde3" strokeWidth={px(1)} /></pattern>
        </defs>
        <rect x={view.x0} y={view.y0} width={size.w / view.s} height={size.h / view.s} fill="url(#grid1)" />
        {model.background && p.bgUrl && L.fond.visible && (
          <image href={p.bgUrl} x={0} y={0} width={model.background.widthPx * model.background.mpp} height={model.background.heightPx * model.background.mpp} opacity={model.background.opacity} preserveAspectRatio="none" />
        )}
        {L.pieces.visible && model.rooms.map((r) => {
          const [lx, ly] = labelPoint(r.points);
          const on = sel?.kind === 'room' && sel.id === r.id;
          return (
            <g key={r.id}>
              <polygon points={r.points.map((q) => q.join(',')).join(' ')} fill={ROOM_COLORS[r.kind]} fillOpacity={model.background ? 0.45 : 0.75} stroke={on ? '#f26a1b' : '#8a94a3'} strokeWidth={px(on ? 2.5 : 1)} />
              <text x={lx} y={ly} fontSize={px(13)} textAnchor="middle" fill="#0f1f38" fontWeight={600} style={{ pointerEvents: 'none' }}>{r.name}</text>
              <text x={lx} y={ly + px(15)} fontSize={px(11.5)} textAnchor="middle" fill="#475467" style={{ pointerEvents: 'none' }}>{approx}{formatArea(polygonArea(r.points))}</text>
            </g>
          );
        })}
        {L.mobilier.visible && model.items.map((i) => {
          const def = FURNITURE[i.type];
          const on = sel?.kind === 'item' && sel.id === i.id;
          return (
            <g key={i.id}>
              {def && <g transform={`translate(${i.x} ${i.y}) rotate(${i.rot})`} dangerouslySetInnerHTML={{ __html: def.draw(i.w, i.d, theme.palette) }} />}
              {on && <polygon points={itemCorners(i).map((q) => q.join(',')).join(' ')} fill="none" stroke="#f26a1b" strokeWidth={px(2)} strokeDasharray={`${px(5)} ${px(3)}`} />}
            </g>
          );
        })}
        {L.murs.visible && model.walls.map((w) => {
          const on = sel?.kind === 'wall' && sel.id === w.id;
          const spans = wallSolidSpans(w, L.ouvertures.visible ? model.openings : [], wallEndExtensions(w, model.walls));
          return <g key={w.id} fill={on ? '#f26a1b' : w.kind === 'cloison' ? '#4b5563' : '#1f2933'}>{spans.map(([a, b], k) => <polygon key={k} points={wallSpanPolygon(w, a, b).map((q) => q.join(',')).join(' ')} />)}</g>;
        })}
        {L.murs.visible && L.ouvertures.visible && model.openings.map((o) => {
          const w = model.walls.find((x) => x.id === o.wallId);
          if (!w) return null;
          const on = sel?.kind === 'opening' && sel.id === o.id;
          return (
            <g key={o.id}>
              <g dangerouslySetInnerHTML={{ __html: openingSvg(o, w, theme) }} />
              {on && <polygon points={wallSpanPolygon(w, o.pos - o.width / 2, o.pos + o.width / 2).map((q) => q.join(',')).join(' ')} fill="none" stroke="#f26a1b" strokeWidth={px(2.5)} />}
            </g>
          );
        })}
        {L.cotes.visible && model.dims.map((d) => {
          const len = dist(d.a, d.b) || 1;
          const nr: Pt = [(d.b[1] - d.a[1]) / len, -(d.b[0] - d.a[0]) / len];
          const A = add(d.a, mulp(nr, d.offset)), B = add(d.b, mulp(nr, d.offset));
          const on = sel?.kind === 'dim' && sel.id === d.id;
          let ang = (Math.atan2(B[1] - A[1], B[0] - A[0]) * 180) / Math.PI;
          if (ang > 89.99) ang -= 180;
          if (ang <= -90.01) ang += 180;
          const mid = mulp(add(A, B), 0.5);
          const c = on ? '#f26a1b' : '#334155';
          return (
            <g key={d.id} stroke={c} strokeWidth={px(1.2)}>
              <line x1={d.a[0]} y1={d.a[1]} x2={A[0]} y2={A[1]} opacity={0.6} />
              <line x1={d.b[0]} y1={d.b[1]} x2={B[0]} y2={B[1]} opacity={0.6} />
              <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} />
              <text x={mid[0]} y={mid[1] - px(4)} fontSize={px(12)} textAnchor="middle" fill={c} stroke="none" transform={`rotate(${ang} ${mid[0]} ${mid[1]})`}>{approx}{model.dimUnit === 'cm' ? Math.round(len * 100) : len.toFixed(2).replace('.', ',')}</text>
            </g>
          );
        })}
        {L.textes.visible && model.notes.map((n) => (
          <text key={n.id} x={n.at[0]} y={n.at[1]} fontSize={n.size} fill={sel?.kind === 'note' && sel.id === n.id ? '#f26a1b' : '#0f1f38'}>{n.text}</text>
        ))}
        {model.calibration && p.tool === 'echelle' && (
          <line x1={model.calibration.a[0]} y1={model.calibration.a[1]} x2={model.calibration.b[0]} y2={model.calibration.b[1]} stroke="#16a34a" strokeWidth={px(2)} strokeDasharray={`${px(6)} ${px(4)}`} />
        )}
        {/* Tracé en cours */}
        {draft.length > 0 && (
          <g pointerEvents="none">
            {p.tool === 'piece' && <polyline points={[...draft, ...(preview ? [preview] : [])].map((q) => q.join(',')).join(' ')} fill="rgba(242,106,27,0.12)" stroke="#f26a1b" strokeWidth={px(2)} />}
            {p.tool !== 'piece' && draft.slice(1).map((q, i) => <line key={i} x1={draft[i][0]} y1={draft[i][1]} x2={q[0]} y2={q[1]} stroke="#f26a1b" strokeWidth={px(2)} />)}
            {preview && p.tool !== 'piece' && <line x1={last[0]} y1={last[1]} x2={preview[0]} y2={preview[1]} stroke="#f26a1b" strokeWidth={p.tool === 'mur' ? p.opts.thickness : px(2)} strokeOpacity={p.tool === 'mur' ? 0.45 : 1} strokeDasharray={p.tool === 'mur' ? undefined : `${px(6)} ${px(4)}`} />}
            {draft.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={px(4)} fill="#f26a1b" />)}
            {preview && <text x={preview[0] + px(10)} y={preview[1] - px(10)} fontSize={px(13)} fontWeight={700} fill="#0f1f38" stroke="#fff" strokeWidth={px(3)} paintOrder="stroke">{lenLabel(last, preview)}</text>}
          </g>
        )}
        {measure && (
          <g pointerEvents="none">
            <line x1={measure[0][0]} y1={measure[0][1]} x2={measure[1][0]} y2={measure[1][1]} stroke="#2563eb" strokeWidth={px(2)} />
            <text x={(measure[0][0] + measure[1][0]) / 2} y={(measure[0][1] + measure[1][1]) / 2 - px(8)} fontSize={px(14)} fontWeight={700} fill="#1d4ed8" stroke="#fff" strokeWidth={px(3)} paintOrder="stroke" textAnchor="middle">{lenLabel(measure[0], measure[1])}</text>
          </g>
        )}
        {handles.map((h, i) => <rect key={i} x={h[0] - px(5)} y={h[1] - px(5)} width={px(10)} height={px(10)} fill="#fff" stroke="#f26a1b" strokeWidth={px(2)} />)}
        {hover && p.tool !== 'select' && (
          <g pointerEvents="none">
            {hover.snap === 'point' ? <rect x={hover.p[0] - px(6)} y={hover.p[1] - px(6)} width={px(12)} height={px(12)} fill="none" stroke="#16a34a" strokeWidth={px(2)} />
              : hover.snap === 'axe' ? <path d={`M ${hover.p[0] - px(6)} ${hover.p[1] - px(6)} L ${hover.p[0] + px(6)} ${hover.p[1] + px(6)} M ${hover.p[0] + px(6)} ${hover.p[1] - px(6)} L ${hover.p[0] - px(6)} ${hover.p[1] + px(6)}`} stroke="#16a34a" strokeWidth={px(2)} />
                : <circle cx={hover.p[0]} cy={hover.p[1]} r={px(3.5)} fill="#f26a1b" />}
          </g>
        )}
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[11.5px] text-muted shadow-sm tabular">
        {hover ? `x ${hover.p[0].toFixed(2)} · y ${hover.p[1].toFixed(2)} m` : 'Molette ou deux doigts : zoom · glisser : déplacer'}
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1">
        <button type="button" className="rounded border border-line bg-white px-2 py-1 text-[12px] shadow-sm" onClick={fit}>Tout voir</button>
      </div>
    </div>
  );
}

export const WALL_PRESETS = WALL_KINDS;
