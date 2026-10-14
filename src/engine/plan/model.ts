// Modèle d'un plan 2D (cahier §9, §10). Toutes les coordonnées sont en mètres, axe y vers le
// bas (repère de l'écran). Le fichier importé (PDF ou image) sert de fond : il est placé à
// l'origine, sa taille en mètres dépend de l'échelle (mètres par pixel).
// Règle §9.4 : tant que l'échelle d'un fond importé n'est pas vérifiée, les mesures sont
// indicatives ; un plan dessiné sans fond est exact par construction.

import { uid } from '../ids';

export type Pt = [number, number];

export type WallKind = 'mur' | 'cloison' | 'muret';
export interface Wall {
  id: string;
  a: Pt;
  b: Pt;
  /** Épaisseur réelle en mètres. */
  thickness: number;
  kind: WallKind;
}

export type OpeningKind = 'porte' | 'porte_double' | 'coulissante' | 'porte_garage' | 'fenetre' | 'baie';
export interface Opening {
  id: string;
  wallId: string;
  /** Distance (m) entre l'extrémité « a » du mur et le centre de l'ouverture. */
  pos: number;
  width: number;
  /** Hauteur (m) pour le métré ; null = non renseignée (jamais devinée). */
  height: number | null;
  kind: OpeningKind;
  /** Côté du mur vers lequel la porte s'ouvre (1 = côté gauche du mur orienté a→b). */
  side: 1 | -1;
  /** Charnière à l'extrémité « a » (false) ou « b » (true) de l'ouverture. */
  flip: boolean;
}

export type RoomKind =
  | 'sejour' | 'salon' | 'salle_manger' | 'cuisine' | 'chambre' | 'sdb' | 'wc' | 'bureau'
  | 'circulation' | 'buanderie' | 'magasin' | 'garage' | 'terrasse' | 'jardin' | 'autre';
export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  points: Pt[];
  /** Contour détecté sur l'image importée : précision limitée par la résolution du fichier. */
  fromImage?: boolean;
}

export interface Item {
  id: string;
  type: string;
  x: number;
  y: number;
  /** Largeur et profondeur réelles (m). */
  w: number;
  d: number;
  /** Rotation en degrés, sens horaire à l'écran. 0 = dos de l'objet vers le haut. */
  rot: number;
}

export interface Dim {
  id: string;
  a: Pt;
  b: Pt;
  /** Décalage perpendiculaire de la ligne de cote (m), côté gauche de a→b si positif. */
  offset: number;
}

export interface Note {
  id: string;
  at: Pt;
  text: string;
  /** Hauteur du texte en mètres (taille réelle sur le plan). */
  size: number;
}

export interface Background {
  kind: 'image' | 'pdf';
  /** Taille de l'image de fond (pixels ; pour un PDF, page rendue à 2 px par point). */
  widthPx: number;
  heightPx: number;
  /** Mètres par pixel. */
  mpp: number;
  opacity: number;
  visible: boolean;
}

export interface Calibration {
  a: Pt;
  b: Pt;
  /** Distance réelle saisie (m). */
  length: number;
  at: string;
}

export type LayerId = 'fond' | 'murs' | 'ouvertures' | 'pieces' | 'mobilier' | 'cotes' | 'textes';
export interface LayerState { visible: boolean; locked: boolean }

export interface PlanModel {
  v: 1;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  items: Item[];
  dims: Dim[];
  notes: Note[];
  background: Background | null;
  calibration: Calibration | null;
  /** Échelle vérifiée (calibration faite) ou plan dessiné sans fond. */
  scaleVerified: boolean;
  /** Hauteur sous plafond (m) utilisée pour le métré des murs ; null = à renseigner. */
  wallHeight: number | null;
  /** Unité d'affichage des cotes. */
  dimUnit: 'cm' | 'm';
  layers: Record<LayerId, LayerState>;
}

export const LAYERS: { id: LayerId; label: string }[] = [
  { id: 'fond', label: 'Fichier importé' },
  { id: 'murs', label: 'Murs et cloisons' },
  { id: 'ouvertures', label: 'Portes et fenêtres' },
  { id: 'pieces', label: 'Pièces' },
  { id: 'mobilier', label: 'Mobilier' },
  { id: 'cotes', label: 'Cotations' },
  { id: 'textes', label: 'Textes' },
];

export const WALL_KINDS: Record<WallKind, { label: string; thickness: number }> = {
  mur: { label: 'Mur', thickness: 0.2 },
  cloison: { label: 'Cloison', thickness: 0.1 },
  muret: { label: 'Muret / garde-corps', thickness: 0.15 },
};

export const OPENING_KINDS: Record<OpeningKind, { label: string; width: number; door: boolean }> = {
  porte: { label: 'Porte', width: 0.9, door: true },
  porte_double: { label: 'Porte double', width: 1.4, door: true },
  coulissante: { label: 'Porte coulissante', width: 1.2, door: true },
  porte_garage: { label: 'Porte de garage', width: 2.5, door: true },
  fenetre: { label: 'Fenêtre', width: 1.2, door: false },
  baie: { label: 'Baie vitrée', width: 2.4, door: false },
};

export const ROOM_KINDS: Record<RoomKind, string> = {
  sejour: 'Séjour', salon: 'Salon', salle_manger: 'Salle à manger', cuisine: 'Cuisine', chambre: 'Chambre',
  sdb: 'Salle d’eau', wc: 'WC', bureau: 'Bureau', circulation: 'Dégagement', buanderie: 'Buanderie',
  magasin: 'Magasin', garage: 'Garage', terrasse: 'Terrasse', jardin: 'Jardin', autre: 'Pièce',
};

/** Devine le type d'une pièce d'après son nom (« Chambre 2 » → chambre). Modifiable ensuite. */
export function roomKindFromName(name: string): RoomKind {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const rules: [RegExp, RoomKind][] = [
    [/sejour|living/, 'sejour'], [/salon/, 'salon'], [/manger/, 'salle_manger'], [/cuisine|kitchen/, 'cuisine'],
    [/chambre|ch\.? ?\d|suite/, 'chambre'], [/bain|douche|s\.? ?d\.? ?[be]|sdb|sde/, 'sdb'], [/\bwc\b|toilette/, 'wc'],
    [/bureau/, 'bureau'], [/degagement|couloir|hall|circulation|entree|palier/, 'circulation'], [/buanderie/, 'buanderie'],
    [/magasin|stock|debarras|rangement|cellier/, 'magasin'], [/garage|parking/, 'garage'], [/terrasse|balcon|veranda|loggia/, 'terrasse'],
    [/jardin|cour/, 'jardin'],
  ];
  for (const [re, k] of rules) if (re.test(n)) return k;
  return 'autre';
}

export function emptyPlan(): PlanModel {
  return {
    v: 1, walls: [], openings: [], rooms: [], items: [], dims: [], notes: [],
    background: null, calibration: null, scaleVerified: true, wallHeight: null, dimUnit: 'cm',
    layers: Object.fromEntries(LAYERS.map((l) => [l.id, { visible: true, locked: false }])) as Record<LayerId, LayerState>,
  };
}

export const newId = (p: string) => uid(p);

// ------------------------------------------------------------------ lecture robuste
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const pt = (v: unknown): Pt | null =>
  Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1]] : null;
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

/** Relit un dessin enregistré (base de données) : valeurs absentes ou invalides écartées. */
export function normalizePlan(raw: unknown): PlanModel {
  const base = emptyPlan();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const walls: Wall[] = arr(r.walls).flatMap((w) => {
    const a = pt(w.a), b = pt(w.b);
    if (!a || !b || dist(a, b) < 1e-6) return [];
    const kind = (str(w.kind) in WALL_KINDS ? w.kind : 'mur') as WallKind;
    return [{ id: str(w.id) || newId('w'), a, b, thickness: Math.max(0.01, num(w.thickness, WALL_KINDS[kind].thickness)), kind }];
  });
  const wallIds = new Set(walls.map((w) => w.id));
  const openings: Opening[] = arr(r.openings).flatMap((o) => {
    if (!wallIds.has(str(o.wallId))) return [];
    const kind = (str(o.kind) in OPENING_KINDS ? o.kind : 'porte') as OpeningKind;
    return [{
      id: str(o.id) || newId('o'), wallId: str(o.wallId), pos: num(o.pos, 0), width: Math.max(0.1, num(o.width, OPENING_KINDS[kind].width)),
      height: typeof o.height === 'number' && o.height > 0 ? o.height : null, kind, side: o.side === -1 ? -1 : 1, flip: o.flip === true,
    }];
  });
  const rooms: Room[] = arr(r.rooms).flatMap((x) => {
    const points = (Array.isArray(x.points) ? x.points : []).map(pt).filter((p): p is Pt => !!p);
    if (points.length < 3) return [];
    const kind = (str(x.kind) in ROOM_KINDS ? x.kind : 'autre') as RoomKind;
    return [{ id: str(x.id) || newId('r'), name: str(x.name, ROOM_KINDS[kind]), kind, points, ...(x.fromImage === true ? { fromImage: true } : {}) }];
  });
  const items: Item[] = arr(r.items).flatMap((i) => {
    if (!str(i.type)) return [];
    return [{ id: str(i.id) || newId('i'), type: str(i.type), x: num(i.x, 0), y: num(i.y, 0), w: Math.max(0.05, num(i.w, 0.5)), d: Math.max(0.05, num(i.d, 0.5)), rot: num(i.rot, 0) }];
  });
  const dims: Dim[] = arr(r.dims).flatMap((d) => {
    const a = pt(d.a), b = pt(d.b);
    return a && b && dist(a, b) > 1e-6 ? [{ id: str(d.id) || newId('d'), a, b, offset: num(d.offset, 0.5) }] : [];
  });
  const notes: Note[] = arr(r.notes).flatMap((n) => {
    const at = pt(n.at);
    return at && str(n.text).trim() ? [{ id: str(n.id) || newId('n'), at, text: str(n.text), size: Math.max(0.05, num(n.size, 0.25)) }] : [];
  });
  let background: Background | null = null;
  if (r.background && typeof r.background === 'object') {
    const b = r.background as Record<string, unknown>;
    const widthPx = num(b.widthPx, 0), heightPx = num(b.heightPx, 0), mpp = num(b.mpp, 0);
    if (widthPx > 0 && heightPx > 0 && mpp > 0) {
      background = { kind: b.kind === 'pdf' ? 'pdf' : 'image', widthPx, heightPx, mpp, opacity: Math.min(1, Math.max(0.05, num(b.opacity, 0.6))), visible: b.visible !== false };
    }
  }
  let calibration: Calibration | null = null;
  if (r.calibration && typeof r.calibration === 'object') {
    const c = r.calibration as Record<string, unknown>;
    const a = pt(c.a), b = pt(c.b);
    if (a && b && num(c.length, 0) > 0) calibration = { a, b, length: num(c.length, 0), at: str(c.at) };
  }
  const layers = { ...base.layers };
  if (r.layers && typeof r.layers === 'object') {
    for (const l of LAYERS) {
      const s = (r.layers as Record<string, unknown>)[l.id] as Record<string, unknown> | undefined;
      if (s && typeof s === 'object') layers[l.id] = { visible: s.visible !== false, locked: s.locked === true };
    }
  }
  return {
    v: 1, walls, openings, rooms, items, dims, notes, background, calibration,
    // Avec un fond importé, l'échelle n'est vérifiée qu'après une calibration explicite.
    scaleVerified: background ? r.scaleVerified === true && !!calibration : r.scaleVerified !== false,
    wallHeight: typeof r.wallHeight === 'number' && r.wallHeight > 0 ? r.wallHeight : null,
    dimUnit: r.dimUnit === 'm' ? 'm' : 'cm',
    layers,
  };
}

// ------------------------------------------------------------------ géométrie
export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const mulp = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Surface d'un polygone (formule du lacet), toujours positive. */
export function polygonArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function signedArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += p[i][0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * p[i][1];
  return s / 2;
}

export function polygonPerimeter(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += dist(p[i], p[(i + 1) % p.length]);
  return s;
}

export function pointInPolygon(q: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface Box { minX: number; minY: number; maxX: number; maxY: number }
export function bboxOf(points: Pt[]): Box {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of points) {
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  }
  return b;
}

/** Point où écrire le nom d'une pièce : centre de gravité s'il est dans la pièce, sinon le
 *  point intérieur le plus éloigné des bords parmi une grille. */
export function labelPoint(p: Pt[]): Pt {
  const a = signedArea(p);
  if (Math.abs(a) > 1e-9) {
    let cx = 0, cy = 0;
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i];
      const [x2, y2] = p[(i + 1) % p.length];
      const f = x1 * y2 - x2 * y1;
      cx += (x1 + x2) * f;
      cy += (y1 + y2) * f;
    }
    const c: Pt = [cx / (6 * a), cy / (6 * a)];
    if (pointInPolygon(c, p) && edgeDistance(c, p) > 0.4) return c;
  }
  const b = bboxOf(p);
  let best: Pt = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  let bestD = -1;
  const n = 24;
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const q: Pt = [b.minX + ((b.maxX - b.minX) * i) / n, b.minY + ((b.maxY - b.minY) * j) / n];
      if (!pointInPolygon(q, p)) continue;
      const d = edgeDistance(q, p);
      if (d > bestD) { bestD = d; best = q; }
    }
  }
  return best;
}

export function segDistance(q: Pt, a: Pt, b: Pt): number {
  const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  if (l2 === 0) return dist(q, a);
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / l2));
  return dist(q, lerp(a, b, t));
}

/** Projection d'un point sur un segment : paramètre t (0..1) et distance. */
export function projectOnSegment(q: Pt, a: Pt, b: Pt): { t: number; d: number; p: Pt } {
  const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / l2));
  const p = lerp(a, b, t);
  return { t, d: dist(q, p), p };
}

function edgeDistance(q: Pt, p: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < p.length; i++) d = Math.min(d, segDistance(q, p[i], p[(i + 1) % p.length]));
  return d;
}

// ------------------------------------------------------------------ murs et ouvertures
export const wallLength = (w: Wall) => dist(w.a, w.b);
export function wallDir(w: Wall): Pt {
  const l = wallLength(w) || 1;
  return [(w.b[0] - w.a[0]) / l, (w.b[1] - w.a[1]) / l];
}
/** Normale « gauche » du mur orienté a→b (repère écran). */
export function wallNormal(w: Wall): Pt {
  const [dx, dy] = wallDir(w);
  return [dy, -dx];
}

/** Une extrémité de mur est prolongée de la demi-épaisseur si elle rejoint un autre mur
 *  (angle ou T) : les jonctions sont pleines, les extrémités libres restent à leur cote. */
export function wallEndExtensions(w: Wall, walls: Wall[], tol = 0.02): [number, number] {
  const touches = (p: Pt) => walls.some((o) => o.id !== w.id && segDistance(p, o.a, o.b) <= o.thickness / 2 + tol);
  return [touches(w.a) ? w.thickness / 2 : 0, touches(w.b) ? w.thickness / 2 : 0];
}

/** Intervalles pleins d'un mur (distances depuis « a »), ouvertures retirées. */
export function wallSolidSpans(w: Wall, openings: Opening[], ext: [number, number] = [0, 0]): [number, number][] {
  const L = wallLength(w);
  const holes = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => [Math.max(0, o.pos - o.width / 2), Math.min(L, o.pos + o.width / 2)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);
  const spans: [number, number][] = [];
  let cur = -ext[0];
  for (const [s, e] of holes) {
    if (s > cur + 1e-6) spans.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (L + ext[1] > cur + 1e-6) spans.push([cur, L + ext[1]]);
  return spans;
}

/** Rectangle (4 sommets) d'un tronçon de mur entre les distances s et e depuis « a ». */
export function wallSpanPolygon(w: Wall, s: number, e: number): Pt[] {
  const d = wallDir(w);
  const n = mulp(wallNormal(w), w.thickness / 2);
  const p1 = add(w.a, mulp(d, s));
  const p2 = add(w.a, mulp(d, e));
  return [add(p1, n), add(p2, n), sub(p2, n), sub(p1, n)];
}

export function openingCenter(o: Opening, w: Wall): Pt {
  return add(w.a, mulp(wallDir(w), o.pos));
}

/** Limite une ouverture à la longueur de son mur. */
export function clampOpening(o: Opening, w: Wall): Opening {
  const L = wallLength(w);
  const width = Math.min(o.width, Math.max(0.1, L));
  return { ...o, width, pos: Math.min(L - width / 2, Math.max(width / 2, o.pos)) };
}

// ------------------------------------------------------------------ mobilier
export function itemCorners(i: Item): Pt[] {
  const r = (i.rot * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return ([[-i.w / 2, -i.d / 2], [i.w / 2, -i.d / 2], [i.w / 2, i.d / 2], [-i.w / 2, i.d / 2]] as Pt[]).map(([x, y]) => [i.x + x * c - y * s, i.y + x * s + y * c]);
}

// ------------------------------------------------------------------ étendue
export function planBounds(m: PlanModel, includeBackground = false): Box | null {
  const pts: Pt[] = [];
  for (const w of m.walls) {
    const n = mulp(wallNormal(w), w.thickness / 2);
    pts.push(add(w.a, n), sub(w.a, n), add(w.b, n), sub(w.b, n));
  }
  for (const r of m.rooms) pts.push(...r.points);
  for (const i of m.items) pts.push(...itemCorners(i));
  for (const d of m.dims) pts.push(d.a, d.b);
  for (const n of m.notes) pts.push(n.at);
  if (includeBackground && m.background) pts.push([0, 0], [m.background.widthPx * m.background.mpp, m.background.heightPx * m.background.mpp]);
  return pts.length ? bboxOf(pts) : null;
}

// ------------------------------------------------------------------ calibration (§9.4)
/**
 * Calibration : deux points du dessin et la distance réelle entre eux. Tout le dessin et le
 * fond sont mis à l'échelle autour de l'origine ; les tailles réelles (épaisseurs, largeurs
 * d'ouvertures, meubles, textes) ne changent pas. L'échelle devient « vérifiée ».
 */
export function calibrate(m: PlanModel, a: Pt, b: Pt, realLength: number, at = new Date().toISOString()): PlanModel {
  const measured = dist(a, b);
  if (!(realLength > 0) || measured < 1e-9) throw new Error('Calibration impossible : deux points distincts et une distance réelle positive sont nécessaires.');
  const k = realLength / measured;
  const s = (p: Pt): Pt => [p[0] * k, p[1] * k];
  return {
    ...m,
    walls: m.walls.map((w) => ({ ...w, a: s(w.a), b: s(w.b) })),
    openings: m.openings.map((o) => ({ ...o, pos: o.pos * k })),
    rooms: m.rooms.map((r) => ({ ...r, points: r.points.map(s) })),
    items: m.items.map((i) => ({ ...i, x: i.x * k, y: i.y * k })),
    dims: m.dims.map((d) => ({ ...d, a: s(d.a), b: s(d.b) })),
    notes: m.notes.map((n) => ({ ...n, at: s(n.at) })),
    background: m.background ? { ...m.background, mpp: m.background.mpp * k } : null,
    calibration: { a: s(a), b: s(b), length: realLength, at },
    scaleVerified: true,
  };
}

/** Facteur d'échelle d'impression lisible (1/50, 1/100…) pour faire tenir une étendue. */
export const PRINT_SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
export function fitPrintScale(widthM: number, heightM: number, paperWmm: number, paperHmm: number): number {
  for (const s of PRINT_SCALES) if ((widthM * 1000) / s <= paperWmm && (heightM * 1000) / s <= paperHmm) return s;
  return PRINT_SCALES[PRINT_SCALES.length - 1];
}

// ------------------------------------------------------------------ libellés
export function formatLength(m: number, unit: 'cm' | 'm'): string {
  if (unit === 'cm') return String(Math.round(m * 100));
  return (Math.round(m * 100) / 100).toFixed(2).replace('.', ',');
}

export function formatArea(m2: number): string {
  return (Math.round(m2 * 100) / 100).toFixed(2).replace('.', ',') + ' m²';
}
