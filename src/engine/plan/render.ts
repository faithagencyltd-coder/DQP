// Rendu de présentation « fidèle » d'un plan (module Plans, rendu 2D) : un SVG calculé
// uniquement à partir du dessin (murs, ouvertures, pièces, mobilier, cotes). Aucune donnée
// n'est inventée : les noms, surfaces et cotes affichés sont ceux du dessin ; si l'échelle
// d'un fond importé n'est pas vérifiée, les valeurs sont marquées « ≈ » et le plan l'indique.
// Le même moteur produit l'image d'entrée du rendu IA (sans texte) et la surcouche des
// noms et cotes exacts posée ensuite sur l'image IA.

import { autoDimChains, wallsExtent } from './dims';
import { FURNITURE, type Palette } from './furniture';
import {
  add, bboxOf, type Box, formatArea, formatLength, itemCorners, labelPoint, mulp, type Opening, type PlanModel,
  pointInPolygon, polygonArea, type Pt, type Room, type RoomKind, sub, type Wall, wallDir, wallEndExtensions, wallLength, wallNormal,
  wallSolidSpans, wallSpanPolygon,
} from './model';

export type RenderStyle = 'moderne' | 'chaleureux' | 'luxe' | 'epure';
type FloorKind = 'parquet' | 'carrelage' | 'carrelage_fin' | 'beton' | 'dallage' | 'gazon' | 'uni';

interface FloorSpec { base: string; tones: string[]; joint: string }
export interface Theme {
  label: string;
  description: string;
  paper: string;
  wall: string;
  threshold: string;
  text: string;
  textMuted: string;
  dim: string;
  halo: string;
  floors: Record<FloorKind, FloorSpec>;
  palette: Palette;
  shadows: boolean;
}

export const THEMES: Record<RenderStyle, Theme> = {
  moderne: {
    label: 'Moderne', description: 'Chêne clair, carrelage gris perle, murs anthracite.',
    paper: '#ffffff', wall: '#24272b', threshold: '#d9d4cc', text: '#1d2125', textMuted: '#4b525a', dim: '#3c4248', halo: '#ffffff',
    floors: {
      parquet: { base: '#d8b98f', tones: ['#d4b285', '#dcc09a', '#cfac7f', '#e0c6a2', '#d6b68b'], joint: '#b8956a' },
      carrelage: { base: '#dedcd8', tones: ['#e2e0dc', '#d9d7d2', '#dfddd9', '#d6d4cf'], joint: '#bdbab4' },
      carrelage_fin: { base: '#e9eef0', tones: ['#edf1f3', '#e4eaec', '#eaeff1'], joint: '#c4ccd0' },
      beton: { base: '#c9c7c3', tones: ['#bdbbb7', '#d1cfcb', '#c4c2be'], joint: '#b3b1ad' },
      dallage: { base: '#cfc8bb', tones: ['#d5cec1', '#c8c1b4', '#d2cbbe', '#c4bdb0'], joint: '#a9a294' },
      gazon: { base: '#8fb36b', tones: ['#7fa55d', '#9cc078', '#86ab63'], joint: '#6f9550' },
      uni: { base: '#efeeec', tones: ['#efeeec'], joint: '#dcdad6' },
    },
    palette: {
      wood: '#b98d5f', woodDark: '#7b5a3c', fabric: '#c9c2b8', fabricDark: '#a79f94', cushion: '#e5ded3', linen: '#f4f1ec', white: '#fbfbfa',
      metal: '#c4c9ce', plant: '#5f8f4e', plantDark: '#3f6e34', glass: '#cfe3ec', line: '#5a5f66', car: '#d9dde1', rug: '#e9e2d6',
    },
    shadows: true,
  },
  chaleureux: {
    label: 'Chaleureux', description: 'Bois miel, terre cuite et tissus chauds.',
    paper: '#fffdf9', wall: '#3b2f28', threshold: '#d8c7b0', text: '#2d231d', textMuted: '#5c4b40', dim: '#4a3c33', halo: '#fffdf9',
    floors: {
      parquet: { base: '#c99a62', tones: ['#c4935a', '#d0a46e', '#bf8d55', '#d4aa75', '#c79860'], joint: '#a27645' },
      carrelage: { base: '#d9b99a', tones: ['#ddbfa1', '#d3b192', '#dabc9d', '#cfae8f'], joint: '#b8977a' },
      carrelage_fin: { base: '#efe6da', tones: ['#f2eadf', '#ebe1d4', '#efe6da'], joint: '#d2c4b2' },
      beton: { base: '#cbc3b8', tones: ['#c1b9ae', '#d3cbc0', '#c7bfb4'], joint: '#b4aca1' },
      dallage: { base: '#d3c2a8', tones: ['#d8c8ae', '#ccbba1', '#d6c5ab', '#c8b79d'], joint: '#a9987e' },
      gazon: { base: '#93ae64', tones: ['#87a358', '#a0ba70', '#8ba95e'], joint: '#738f4a' },
      uni: { base: '#f3ede4', tones: ['#f3ede4'], joint: '#e0d6c8' },
    },
    palette: {
      wood: '#a8743f', woodDark: '#6b4423', fabric: '#c79a72', fabricDark: '#a3764f', cushion: '#e8c9a4', linen: '#f6efe4', white: '#fcfaf6',
      metal: '#c6c1b9', plant: '#6b9150', plantDark: '#486f33', glass: '#d6e6ea', line: '#5e4b3f', car: '#b5452f', rug: '#d9b48c',
    },
    shadows: true,
  },
  luxe: {
    label: 'Prestige', description: 'Noyer foncé, marbre clair, murs noirs, contrastes forts.',
    paper: '#ffffff', wall: '#111111', threshold: '#cfcac2', text: '#111111', textMuted: '#3d3d3d', dim: '#262626', halo: '#ffffff',
    floors: {
      parquet: { base: '#7a5236', tones: ['#744d32', '#80583b', '#6d472d', '#865d40', '#7a5236'], joint: '#4f3420' },
      carrelage: { base: '#ecebe8', tones: ['#f0efec', '#e8e7e3', '#eeede9', '#e5e4e0'], joint: '#c9c5bd' },
      carrelage_fin: { base: '#f2f1ee', tones: ['#f5f4f1', '#eeede9', '#f2f1ee'], joint: '#cfcbc3' },
      beton: { base: '#a9a7a3', tones: ['#a1a09c', '#b1afab', '#a6a4a0'], joint: '#949290' },
      dallage: { base: '#bdb7ad', tones: ['#c3bdb3', '#b6b0a6', '#c0bab0', '#b2aca2'], joint: '#8f897f' },
      gazon: { base: '#7aa45a', tones: ['#6e9850', '#87b066', '#759f55'], joint: '#5e8642' },
      uni: { base: '#f4f3f1', tones: ['#f4f3f1'], joint: '#dedcd8' },
    },
    palette: {
      wood: '#4f3322', woodDark: '#2e1d13', fabric: '#d8d2c8', fabricDark: '#9a8f80', cushion: '#c6a76a', linen: '#f7f5f0', white: '#ffffff',
      metal: '#b8b2a6', plant: '#4f7f42', plantDark: '#2f5a27', glass: '#d3e3e8', line: '#3a3a3a', car: '#1f2326', rug: '#d9d3c7',
    },
    shadows: true,
  },
  epure: {
    label: 'Épuré', description: 'Noir et blanc, textures légères : idéal pour l’impression.',
    paper: '#ffffff', wall: '#000000', threshold: '#ffffff', text: '#000000', textMuted: '#333333', dim: '#000000', halo: '#ffffff',
    floors: {
      parquet: { base: '#ffffff', tones: ['#ffffff'], joint: '#cfcfcf' },
      carrelage: { base: '#ffffff', tones: ['#ffffff'], joint: '#c8c8c8' },
      carrelage_fin: { base: '#ffffff', tones: ['#ffffff'], joint: '#d0d0d0' },
      beton: { base: '#f4f4f4', tones: ['#f4f4f4'], joint: '#d6d6d6' },
      dallage: { base: '#f7f7f7', tones: ['#f7f7f7'], joint: '#c4c4c4' },
      gazon: { base: '#f1f5ee', tones: ['#f1f5ee'], joint: '#c9d3c2' },
      uni: { base: '#ffffff', tones: ['#ffffff'], joint: '#dddddd' },
    },
    palette: {
      wood: '#ffffff', woodDark: '#e6e6e6', fabric: '#ffffff', fabricDark: '#ededed', cushion: '#f5f5f5', linen: '#ffffff', white: '#ffffff',
      metal: '#f0f0f0', plant: '#e8e8e8', plantDark: '#cfcfcf', glass: '#f4f4f4', line: '#1a1a1a', car: '#ffffff', rug: '#f6f6f6',
    },
    shadows: false,
  },
};

const FLOOR_FOR: Record<RoomKind, FloorKind> = {
  sejour: 'parquet', salon: 'parquet', salle_manger: 'parquet', chambre: 'parquet', bureau: 'parquet', circulation: 'parquet',
  cuisine: 'carrelage', buanderie: 'carrelage', sdb: 'carrelage_fin', wc: 'carrelage_fin', magasin: 'beton', garage: 'beton',
  terrasse: 'dallage', jardin: 'gazon', autre: 'uni',
};

export interface TitleBlock {
  company?: string;
  project?: string;
  planName?: string;
  level?: string;
  reference?: string;
  date?: string;
}

export interface RenderOptions {
  style: RenderStyle;
  furniture: boolean;
  /** Noms des pièces. */
  labels: boolean;
  /** Surfaces sous les noms. */
  areas: boolean;
  /** Cotes automatiques (entraxes et hors tout). */
  autoDims: boolean;
  /** Cotes dessinées à la main. */
  manualDims: boolean;
  notes: boolean;
  /** Barre d'échelle graphique (reste juste quel que soit l'agrandissement). */
  scaleBar: boolean;
  title: TitleBlock | null;
  /** Largeur de l'image en pixels. */
  pixelWidth: number;
  /** Rendu sans aucun texte, pour servir d'entrée au rendu IA, au format imposé. */
  forAI?: { width: number; height: number };
}

export const DEFAULT_RENDER: RenderOptions = {
  style: 'moderne', furniture: true, labels: true, areas: true, autoDims: true, manualDims: true, notes: true, scaleBar: true, title: null, pixelWidth: 2400,
};

/** Cadre de l'image : coin haut-gauche en mètres, pixels par mètre, taille en pixels. */
export interface Frame {
  x0: number;
  y0: number;
  pxPerM: number;
  width: number;
  height: number;
}

export interface RenderResult {
  svg: string;
  frame: Frame;
  /** Avertissements à afficher (échelle non vérifiée, plan vide…). */
  warnings: string[];
}

// ------------------------------------------------------------------ utilitaires SVG
const n = (v: number) => (Math.round(v * 10000) / 10000).toString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const poly = (pts: Pt[]) => pts.map((p) => `${n(p[0])},${n(p[1])}`).join(' ');
const FONT = "Inter, 'Segoe UI', Roboto, Arial, sans-serif";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ textures de sol
function floorPattern(id: string, kind: FloorKind, spec: FloorSpec, rotate: boolean): string {
  const r = rng(hash(id));
  const pick = () => spec.tones[Math.floor(r() * spec.tones.length)];
  const tr = rotate ? ' patternTransform="rotate(90)"' : '';
  let body = '';
  let w = 1, h = 1;
  if (kind === 'parquet') {
    const plank = 0.16, rows = 6;
    w = 2.4; h = plank * rows;
    for (let row = 0; row < rows; row++) {
      let x = -r() * 1.2;
      while (x < w) {
        const len = 0.8 + r() * 0.7;
        const x1 = Math.max(0, x), x2 = Math.min(w, x + len);
        if (x2 > x1) {
          body += `<rect x="${n(x1)}" y="${n(row * plank)}" width="${n(x2 - x1)}" height="${n(plank)}" fill="${pick()}" stroke="${spec.joint}" stroke-width="0.004"/>`;
          // Veinage discret.
          const gy = row * plank + plank * (0.3 + r() * 0.4);
          body += `<line x1="${n(x1 + 0.05)}" y1="${n(gy)}" x2="${n(x2 - 0.05)}" y2="${n(gy + (r() - 0.5) * 0.02)}" stroke="${spec.joint}" stroke-width="0.003" opacity="0.35"/>`;
        }
        x += len;
      }
    }
  } else if (kind === 'carrelage' || kind === 'carrelage_fin' || kind === 'dallage') {
    const t = kind === 'carrelage' ? 0.6 : kind === 'carrelage_fin' ? 0.3 : 0.5;
    const grout = kind === 'dallage' ? 0.012 : 0.006;
    w = t * 2; h = t * 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      body += `<rect x="${n(i * t)}" y="${n(j * t)}" width="${n(t)}" height="${n(t)}" fill="${pick()}" stroke="${spec.joint}" stroke-width="${grout}"/>`;
    }
    if (kind === 'carrelage') body += `<rect x="0" y="0" width="${n(w)}" height="${n(h)}" fill="url(#sheen)" opacity="0.5"/>`;
  } else if (kind === 'beton' || kind === 'gazon') {
    w = 1; h = 1;
    body += `<rect x="0" y="0" width="1" height="1" fill="${spec.base}"/>`;
    const count = kind === 'gazon' ? 260 : 140;
    for (let i = 0; i < count; i++) {
      const x = r(), y = r();
      if (kind === 'gazon') body += `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + (r() - 0.5) * 0.03)}" y2="${n(y - 0.03 - r() * 0.02)}" stroke="${pick()}" stroke-width="0.008" stroke-linecap="round"/>`;
      else body += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.003 + r() * 0.006)}" fill="${pick()}" opacity="0.7"/>`;
    }
  } else {
    body = `<rect x="0" y="0" width="1" height="1" fill="${spec.base}"/>`;
  }
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${n(w)}" height="${n(h)}"${tr}>${body}</pattern>`;
}

// ------------------------------------------------------------------ ouvertures
export function openingSvg(o: Opening, w: Wall, t: Theme): string {
  const d = wallDir(w), nrm = wallNormal(w);
  const s = Math.max(0, o.pos - o.width / 2), e = s + o.width;
  const gap = wallSpanPolygon(w, s, e);
  const p1 = add(w.a, mulp(d, s)), p2 = add(w.a, mulp(d, e));
  const line = t.palette.line;
  let out = `<polygon points="${poly(gap)}" fill="${t.threshold}"/>`;
  const side = mulp(nrm, o.side);
  const half = w.thickness / 2;
  if (o.kind === 'fenetre' || o.kind === 'baie') {
    out += `<polygon points="${poly(gap)}" fill="${t.palette.white}" stroke="${t.wall}" stroke-width="0.012"/>`;
    const k = o.kind === 'baie' ? [-0.18, 0, 0.18] : [-0.12, 0.12];
    for (const f of k) {
      const off = mulp(nrm, half * f * 2);
      out += `<line x1="${n(p1[0] + off[0])}" y1="${n(p1[1] + off[1])}" x2="${n(p2[0] + off[0])}" y2="${n(p2[1] + off[1])}" stroke="${t.palette.glass === '#f4f4f4' ? '#555' : '#7fa9bd'}" stroke-width="0.018"/>`;
    }
    return out;
  }
  if (o.kind === 'coulissante') {
    const off = mulp(nrm, half * 0.35);
    const mid = add(p1, mulp(d, o.width / 2));
    out += `<line x1="${n(p1[0] + off[0])}" y1="${n(p1[1] + off[1])}" x2="${n(mid[0] + off[0] + d[0] * 0.05)}" y2="${n(mid[1] + off[1] + d[1] * 0.05)}" stroke="${line}" stroke-width="0.03"/>`;
    out += `<line x1="${n(mid[0] - off[0] - d[0] * 0.05)}" y1="${n(mid[1] - off[1] - d[1] * 0.05)}" x2="${n(p2[0] - off[0])}" y2="${n(p2[1] - off[1])}" stroke="${line}" stroke-width="0.03"/>`;
    return out;
  }
  if (o.kind === 'porte_garage') {
    out += `<line x1="${n(p1[0])}" y1="${n(p1[1])}" x2="${n(p2[0])}" y2="${n(p2[1])}" stroke="${line}" stroke-width="0.02" stroke-dasharray="0.12 0.08"/>`;
    return out;
  }
  // Portes battantes : vantail et arc de débattement.
  const leaves: { hinge: Pt; to: Pt; len: number }[] = [];
  if (o.kind === 'porte_double') {
    leaves.push({ hinge: p1, to: add(p1, mulp(d, o.width / 2)), len: o.width / 2 }, { hinge: p2, to: sub(p2, mulp(d, o.width / 2)), len: o.width / 2 });
  } else {
    const hinge = o.flip ? p2 : p1;
    const to = o.flip ? p1 : p2;
    leaves.push({ hinge, to, len: o.width });
  }
  for (const l of leaves) {
    const face = add(l.hinge, mulp(side, half));
    const tip = add(face, mulp(side, l.len));
    const closed = add(l.to, mulp(side, half));
    const sweep = sweepFlag(sub(tip, face), sub(closed, face));
    out += `<path d="M ${n(tip[0])} ${n(tip[1])} A ${n(l.len)} ${n(l.len)} 0 0 ${sweep} ${n(closed[0])} ${n(closed[1])}" fill="none" stroke="${line}" stroke-width="0.008" stroke-dasharray="0.05 0.03"/>`;
    const lp = [face, tip, add(tip, mulp(sub(l.to, l.hinge), 0.04 / l.len)), add(face, mulp(sub(l.to, l.hinge), 0.04 / l.len))];
    out += `<polygon points="${poly(lp)}" fill="${t.palette.woodDark}" stroke="${line}" stroke-width="0.006"/>`;
  }
  return out;
}

function sweepFlag(from: Pt, to: Pt): 0 | 1 {
  // Sens de l'arc du vantail ouvert vers la position fermée (repère écran, y vers le bas).
  return from[0] * to[1] - from[1] * to[0] > 0 ? 1 : 0;
}

// ------------------------------------------------------------------ cotes
function dimSvg(a: Pt, b: Pt, offset: number, label: string, size: number, color: string, halo: string, ext = true): string {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-6) return '';
  const d: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const nrm: Pt = [d[1], -d[0]];
  const A = add(a, mulp(nrm, offset)), B = add(b, mulp(nrm, offset));
  const sw = size * 0.07;
  let s = '';
  if (ext) {
    const gapIn = Math.sign(offset) * Math.min(Math.abs(offset), size * 0.4);
    for (const [p, q] of [[a, A], [b, B]] as [Pt, Pt][]) {
      const from = add(p, mulp(nrm, gapIn * 0.3));
      const to = add(q, mulp(nrm, Math.sign(offset || 1) * size * 0.35));
      s += `<line x1="${n(from[0])}" y1="${n(from[1])}" x2="${n(to[0])}" y2="${n(to[1])}" stroke="${color}" stroke-width="${n(sw * 0.7)}" opacity="0.8"/>`;
    }
  }
  s += `<line x1="${n(A[0])}" y1="${n(A[1])}" x2="${n(B[0])}" y2="${n(B[1])}" stroke="${color}" stroke-width="${n(sw)}"/>`;
  // Traits obliques (convention architecturale).
  const tk = size * 0.35;
  const diag: Pt = [(d[0] + nrm[0]) * 0.7071, (d[1] + nrm[1]) * 0.7071];
  for (const p of [A, B]) s += `<line x1="${n(p[0] - diag[0] * tk)}" y1="${n(p[1] - diag[1] * tk)}" x2="${n(p[0] + diag[0] * tk)}" y2="${n(p[1] + diag[1] * tk)}" stroke="${color}" stroke-width="${n(sw * 1.6)}"/>`;
  let ang = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  // Texte lisible depuis le bas ou la droite du plan (convention de dessin).
  if (ang > 89.99) ang -= 180;
  if (ang <= -90.01) ang += 180;
  const mid = add(mulp(add(A, B), 0.5), mulp(nrm, size * 0.25 * Math.sign(offset || 1)));
  // Le texte est posé du côté extérieur de la ligne de cote.
  s += `<text x="${n(mid[0])}" y="${n(mid[1])}" transform="rotate(${n(ang)} ${n(mid[0])} ${n(mid[1])})" font-family="${FONT}" font-size="${n(size)}" fill="${color}" text-anchor="middle" dominant-baseline="${Math.sign(offset || 1) > 0 ? 'auto' : 'hanging'}" paint-order="stroke" stroke="${halo}" stroke-width="${n(size * 0.18)}">${esc(label)}</text>`;
  return s;
}

// ------------------------------------------------------------------ rendu
interface Layout {
  content: Box;
  base: number;
}

function layout(m: PlanModel, o: RenderOptions): Layout | null {
  const pts: Pt[] = [];
  for (const w of m.walls) {
    const nr = mulp(wallNormal(w), w.thickness / 2);
    pts.push(add(w.a, nr), sub(w.a, nr), add(w.b, nr), sub(w.b, nr));
  }
  for (const r of m.rooms) pts.push(...r.points);
  if (o.furniture) for (const i of m.items) pts.push(...itemCorners(i));
  if (o.manualDims) for (const d of m.dims) pts.push(d.a, d.b);
  if (o.notes) for (const t of m.notes) pts.push(t.at);
  if (!pts.length) return null;
  const content = bboxOf(pts);
  const S = Math.max(content.maxX - content.minX, content.maxY - content.minY, 1);
  return { content, base: Math.min(0.45, Math.max(0.12, S / 55)) };
}

/** Emplacement du nom d'une pièce : loin des murs et, si possible, hors des meubles. */
function labelSpot(r: Room, m: PlanModel, withFurniture: boolean, size: number): Pt {
  const def = labelPoint(r.points);
  if (!withFurniture) return def;
  const boxes = m.items.filter((i) => pointInPolygon([i.x, i.y], r.points)).map((i) => bboxOf(itemCorners(i)));
  if (!boxes.length) return def;
  const w = size * 3.2, h = size * 1.2;
  const clearOf = (p: Pt) => !boxes.some((b) => p[0] + w > b.minX && p[0] - w < b.maxX && p[1] + h > b.minY && p[1] - h < b.maxY);
  if (clearOf(def)) return def;
  const bb = bboxOf(r.points);
  let best: Pt = def, bestScore = -Infinity;
  const N = 30;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const p: Pt = [bb.minX + ((bb.maxX - bb.minX) * i) / N, bb.minY + ((bb.maxY - bb.minY) * j) / N];
    if (!pointInPolygon(p, r.points) || !clearOf(p)) continue;
    const corners: Pt[] = [[p[0] - w, p[1] - h], [p[0] + w, p[1] - h], [p[0] + w, p[1] + h], [p[0] - w, p[1] + h]];
    if (!corners.every((c) => pointInPolygon(c, r.points))) continue;
    const score = -Math.hypot(p[0] - def[0], p[1] - def[1]);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

function roomLabel(r: Room, m: PlanModel, o: RenderOptions, t: Theme, base: number): string {
  const area = polygonArea(r.points);
  const b = bboxOf(r.points);
  const fit = Math.min(b.maxX - b.minX, b.maxY - b.minY);
  const size = Math.min(base * 1.25, Math.max(base * 0.6, fit / 7));
  const [x, y] = labelSpot(r, m, o.furniture && m.layers.mobilier.visible, size);
  const approx = m.scaleVerified ? '' : '≈ ';
  let s = '';
  const haloW = n(size * 0.22);
  if (o.labels) s += `<text x="${n(x)}" y="${n(o.areas ? y - size * 0.15 : y + size * 0.35)}" font-family="${FONT}" font-size="${n(size)}" font-weight="600" fill="${t.text}" text-anchor="middle" paint-order="stroke" stroke="${t.halo}" stroke-width="${haloW}" stroke-opacity="0.85">${esc(r.name)}</text>`;
  if (o.areas) s += `<text x="${n(x)}" y="${n(o.labels ? y + size * 0.95 : y + size * 0.35)}" font-family="${FONT}" font-size="${n(size * 0.78)}" fill="${t.textMuted}" text-anchor="middle" paint-order="stroke" stroke="${t.halo}" stroke-width="${haloW}" stroke-opacity="0.85">${approx}${esc(formatArea(area))}</text>`;
  return s;
}

function dimsLayer(m: PlanModel, o: RenderOptions, t: Theme, base: number, content: Box): string {
  let s = '';
  const size = base * 0.85;
  const unit = m.dimUnit;
  const fmt = (v: number) => (m.scaleVerified ? '' : '≈') + formatLength(v, unit);
  if (o.autoDims) {
    const ext = wallsExtent(m);
    if (ext) {
      for (const c of autoDimChains(m)) {
        const gap = base * 2.2 * c.level + base * 0.8;
        for (let i = 0; i < c.ticks.length - 1; i++) {
          const v0 = c.ticks[i], v1 = c.ticks[i + 1];
          // Chaînes posées au-delà de tout le contenu (terrasses, mobilier extérieur).
          if (c.side === 'haut' || c.side === 'bas') {
            const top = c.side === 'haut';
            const edge = top ? ext.minY : ext.maxY;
            const y = top ? Math.min(ext.minY, content.minY) - gap : Math.max(ext.maxY, content.maxY) + gap;
            const dir = top ? -1 : 1;
            s += dimSvg([v1, y], [v0, y], 0, fmt(v1 - v0), size, t.dim, t.halo, false);
            s += extLine([v0, edge + dir * base * 0.4], [v0, y + dir * size * 0.3], t.dim, size) + extLine([v1, edge + dir * base * 0.4], [v1, y + dir * size * 0.3], t.dim, size);
          } else {
            const left = c.side === 'gauche';
            const edge = left ? ext.minX : ext.maxX;
            const x = left ? Math.min(ext.minX, content.minX) - gap : Math.max(ext.maxX, content.maxX) + gap;
            const dir = left ? -1 : 1;
            s += dimSvg([x, v0], [x, v1], 0, fmt(v1 - v0), size, t.dim, t.halo, false);
            s += extLine([edge + dir * base * 0.4, v0], [x + dir * size * 0.3, v0], t.dim, size) + extLine([edge + dir * base * 0.4, v1], [x + dir * size * 0.3, v1], t.dim, size);
          }
        }
      }
    }
  }
  if (o.manualDims) for (const d of m.dims) s += dimSvg(d.a, d.b, d.offset, fmt(Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1])), size, t.dim, t.halo);
  return s;
}

const extLine = (a: Pt, b: Pt, color: string, size: number) =>
  `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${color}" stroke-width="${n(size * 0.05)}" opacity="0.7"/>`;

function dimsMargin(m: PlanModel, o: RenderOptions, base: number): number {
  if (!o.autoDims || !m.walls.length) return base * 1.5;
  return base * 2.2 * 2 + base * 2.2;
}

/** Contenu du plan (sans cadre) : sols, ombres, murs, ouvertures, mobilier. */
function planBody(m: PlanModel, o: RenderOptions, t: Theme, defs: string[]): string {
  const vis = m.layers;
  let s = '';
  // Sols.
  const floors: string[] = [];
  if (vis.pieces.visible) {
    for (const r of m.rooms) {
      const kind = FLOOR_FOR[r.kind];
      const b = bboxOf(r.points);
      const rotate = kind === 'parquet' && b.maxY - b.minY > b.maxX - b.minX;
      const pid = `f-${o.style}-${kind}-${rotate ? 'v' : 'h'}`;
      if (!defs.some((d) => d.includes(`id="${pid}"`))) defs.push(floorPattern(pid, kind, t.floors[kind], rotate));
      floors.push(`<polygon points="${poly(r.points)}" fill="url(#${pid})"/>`);
    }
  }
  // Ombre portée du bâtiment (effet « maquette » des plans de présentation).
  if (t.shadows && (m.rooms.length || m.walls.length)) {
    const shapes = [
      ...m.rooms.map((r) => `<polygon points="${poly(r.points)}"/>`),
      ...m.walls.map((w) => `<polygon points="${poly(wallSpanPolygon(w, -w.thickness / 2, wallLength(w) + w.thickness / 2))}"/>`),
    ].join('');
    s += `<g filter="url(#ground)" fill="#000" opacity="0.22" transform="translate(0.18 0.26)">${shapes}</g>`;
  }
  s += `<g>${floors.join('')}</g>`;
  if (t.shadows && vis.pieces.visible) {
    // Ombre intérieure le long des murs (lumière zénithale douce).
    s += `<g filter="url(#inner)" opacity="0.35">${m.walls.map((w) => `<polygon points="${poly(wallSpanPolygon(w, 0, wallLength(w)))}" fill="#000"/>`).join('')}</g>`;
  }
  // Mobilier : tapis d'abord, puis le reste avec une ombre douce.
  if (o.furniture && vis.mobilier.visible) {
    const draw = (under: boolean) => m.items.map((i) => {
      const def = FURNITURE[i.type];
      if (!def || !!def.under !== under) return '';
      return `<g transform="translate(${n(i.x)} ${n(i.y)}) rotate(${n(i.rot)})">${def.draw(i.w, i.d, t.palette)}</g>`;
    }).join('');
    s += `<g>${draw(true)}</g>`;
    s += `<g${t.shadows ? ' filter="url(#drop)"' : ''}>${draw(false)}</g>`;
  }
  // Murs, puis ouvertures découpées dedans.
  if (vis.murs.visible) {
    const walls = m.walls.map((w) => {
      const ext = wallEndExtensions(w, m.walls);
      return wallSolidSpans(w, vis.ouvertures.visible ? m.openings : [], ext).map(([a, b]) => `<polygon points="${poly(wallSpanPolygon(w, a, b))}"/>`).join('');
    }).join('');
    s += `<g fill="${t.wall}" stroke="${t.wall}" stroke-width="0.004"${t.shadows ? ' filter="url(#wallshadow)"' : ''}>${walls}</g>`;
    if (vis.ouvertures.visible) {
      for (const op of m.openings) {
        const w = m.walls.find((x) => x.id === op.wallId);
        if (w) s += openingSvg(op, w, t);
      }
    }
  }
  return s;
}

function filtersDefs(): string {
  return `<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.06"/></linearGradient>
<filter id="ground" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.22"/></filter>
<filter id="inner" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0.09"/></filter>
<filter id="drop" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0.03" dy="0.05" stdDeviation="0.04" flood-color="#000" flood-opacity="0.28"/></filter>
<filter id="wallshadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0.035" dy="0.05" stdDeviation="0.035" flood-color="#000" flood-opacity="0.35"/></filter>`;
}

function scaleBarSvg(x: number, y: number, base: number, t: Theme): string {
  const total = base > 0.3 ? 10 : base > 0.18 ? 5 : 2;
  const h = base * 0.35;
  let s = '';
  const steps = total === 10 ? [0, 2, 4, 6, 8, 10] : total === 5 ? [0, 1, 2, 3, 4, 5] : [0, 0.5, 1, 1.5, 2];
  for (let i = 0; i < steps.length - 1; i++) {
    s += `<rect x="${n(x + steps[i])}" y="${n(y)}" width="${n(steps[i + 1] - steps[i])}" height="${n(h)}" fill="${i % 2 ? t.paper : t.text}" stroke="${t.text}" stroke-width="${n(base * 0.04)}"/>`;
  }
  for (const v of [steps[0], steps[steps.length - 1]]) s += `<text x="${n(x + v)}" y="${n(y + h + base * 0.85)}" font-family="${FONT}" font-size="${n(base * 0.7)}" fill="${t.text}" text-anchor="middle">${String(v).replace('.', ',')}${v === steps[steps.length - 1] ? ' m' : ''}</text>`;
  return s;
}

function titleSvg(x: number, y: number, w: number, base: number, tb: TitleBlock, m: PlanModel, t: Theme): { svg: string; height: number } {
  const h = base * 4.2;
  const lines: string[] = [];
  const main = [tb.planName, tb.level].filter(Boolean).join(' — ');
  let s = `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + w)}" y2="${n(y)}" stroke="${t.text}" stroke-width="${n(base * 0.06)}"/>`;
  s += `<text x="${n(x)}" y="${n(y + base * 1.5)}" font-family="${FONT}" font-size="${n(base * 1.05)}" font-weight="700" fill="${t.text}">${esc(main || 'Plan')}</text>`;
  const sub = [tb.project, tb.reference].filter(Boolean).join(' · ');
  if (sub) lines.push(sub);
  lines.push(m.scaleVerified ? 'Plan de présentation — dimensions issues du dessin' : 'Échelle non vérifiée : cotes et surfaces indicatives (≈)');
  if (m.walls.length) lines.push(`Cotes en ${m.dimUnit === 'cm' ? 'centimètres' : 'mètres'} : entraxes des murs et dimensions hors tout`);
  lines.forEach((l, i) => {
    s += `<text x="${n(x)}" y="${n(y + base * (2.55 + i * 0.85))}" font-family="${FONT}" font-size="${n(base * 0.62)}" fill="${t.textMuted}">${esc(l)}</text>`;
  });
  const right = [tb.company, tb.date].filter(Boolean) as string[];
  right.forEach((l, i) => {
    s += `<text x="${n(x + w)}" y="${n(y + base * (1.5 + i * 0.95))}" font-family="${FONT}" font-size="${n(i === 0 ? base * 0.8 : base * 0.62)}" font-weight="${i === 0 ? 700 : 400}" fill="${i === 0 ? t.text : t.textMuted}" text-anchor="end">${esc(l)}</text>`;
  });
  s += `<text x="${n(x + w)}" y="${n(y + h - base * 0.2)}" font-family="${FONT}" font-size="${n(base * 0.5)}" fill="${t.textMuted}" text-anchor="end">Réalisé avec PLANORA BTP</text>`;
  return { svg: s, height: h + base * 0.4 * lines.length };
}

/** Rendu complet (présentation) ou image d'entrée du rendu IA (`forAI`). */
export function renderPlanSvg(m: PlanModel, opts: Partial<RenderOptions> = {}): RenderResult {
  const o = { ...DEFAULT_RENDER, ...opts };
  const t = THEMES[o.style];
  const warnings: string[] = [];
  if (!m.scaleVerified) warnings.push('Échelle non vérifiée : les cotes et surfaces sont indicatives. Calibrez le plan pour les rendre exactes.');
  const lay = layout(m, o);
  if (!lay) {
    warnings.push('Le plan est vide : dessinez au moins des murs ou une pièce.');
    const frame = { x0: 0, y0: 0, pxPerM: 100, width: 400, height: 300 };
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 4 3"><rect width="4" height="3" fill="${t.paper}"/></svg>`, frame, warnings };
  }
  const { content, base } = lay;
  const defs: string[] = [filtersDefs()];
  const body = planBody(m, o, t, defs);

  let x0: number, y0: number, wM: number, hM: number;
  let extras = '';
  const ai = o.forAI;
  if (ai) {
    // Cadre imposé par le service IA : plan centré, marges blanches, aucune inscription.
    // Marge assez large pour y poser ensuite les cotes exactes (surcouche).
    const margin = dimsMargin(m, o, base) + base * 1.5;
    const cw = content.maxX - content.minX + 2 * margin, ch = content.maxY - content.minY + 2 * margin;
    const ratio = ai.width / ai.height;
    wM = Math.max(cw, ch * ratio);
    hM = wM / ratio;
    x0 = (content.minX + content.maxX) / 2 - wM / 2;
    y0 = (content.minY + content.maxY) / 2 - hM / 2;
  } else {
    const dm = dimsMargin(m, o, base);
    const pad = base * 1.5;
    x0 = content.minX - dm - pad;
    y0 = content.minY - dm - pad;
    // Chaînes des façades bas et droite : un seul niveau.
    const dm1 = o.autoDims && m.walls.length ? base * 2.2 + base * 1.6 : 0;
    const right = content.maxX + pad + Math.max(dm1, o.manualDims && m.dims.length ? base * 1.5 : 0);
    let bottom = content.maxY + pad + Math.max(dm1, o.manualDims && m.dims.length ? base * 1.5 : 0);
    wM = right - x0;
    if (o.labels || o.areas) {
      extras += `<g>${(m.layers.pieces.visible ? m.rooms : []).map((r) => roomLabel(r, m, o, t, base)).join('')}</g>`;
    }
    if (m.layers.cotes.visible) extras += `<g>${dimsLayer(m, o, t, base, content)}</g>`;
    if (o.notes && m.layers.textes.visible) {
      extras += m.notes.map((nt) => `<text x="${n(nt.at[0])}" y="${n(nt.at[1])}" font-family="${FONT}" font-size="${n(nt.size)}" fill="${t.text}" paint-order="stroke" stroke="${t.halo}" stroke-width="${n(nt.size * 0.2)}">${esc(nt.text)}</text>`).join('');
    }
    if (o.scaleBar) {
      extras += scaleBarSvg(x0 + pad, bottom + base * 0.6, base, t);
      bottom += base * 2.4;
    }
    if (o.title) {
      const tb = titleSvg(x0 + pad, bottom + base * 0.6, wM - 2 * pad, base, o.title, m, t);
      extras += tb.svg;
      bottom += tb.height + base * 1.2;
    }
    hM = bottom - y0;
  }
  const pxPerM = (ai ? ai.width : o.pixelWidth) / wM;
  const W = ai ? ai.width : Math.round(wM * pxPerM);
  const H = ai ? ai.height : Math.round(hM * pxPerM);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${n(x0)} ${n(y0)} ${n(wM)} ${n(hM)}">` +
    `<defs>${defs.join('')}</defs><rect x="${n(x0)}" y="${n(y0)}" width="${n(wM)}" height="${n(hM)}" fill="${ai ? '#ffffff' : t.paper}"/>${body}${extras}</svg>`;
  return { svg, frame: { x0, y0, pxPerM, width: W, height: H }, warnings };
}

/**
 * Surcouche posée sur une image (rendu IA) : noms, surfaces et cotes exacts du dessin, dans
 * le même cadre que l'image d'entrée. Le fond reste transparent.
 */
export function renderOverlaySvg(m: PlanModel, frame: Frame, opts: Partial<RenderOptions> = {}): string {
  const o = { ...DEFAULT_RENDER, ...opts };
  const t = THEMES[o.style];
  const lay = layout(m, o);
  if (!lay) return '';
  const base = lay.base;
  const wM = frame.width / frame.pxPerM, hM = frame.height / frame.pxPerM;
  let s = '';
  if (o.labels || o.areas) s += m.rooms.map((r) => roomLabel(r, m, o, { ...t, halo: '#ffffff' }, base)).join('');
  if (m.layers.cotes.visible) s += dimsLayer(m, o, t, base, lay.content);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="${n(frame.x0)} ${n(frame.y0)} ${n(wM)} ${n(hM)}">${s}</svg>`;
}

/** Format d'image demandé au service IA selon les proportions du plan. */
export function aiCanvasFor(m: PlanModel): { width: number; height: number } {
  const b = wallsExtent(m) ?? (m.rooms.length ? bboxOf(m.rooms.flatMap((r) => r.points)) : null);
  if (!b) return { width: 1024, height: 1024 };
  // Format disponible dont les proportions sont les plus proches de celles du plan.
  const r = (b.maxX - b.minX) / Math.max(0.01, b.maxY - b.minY);
  const sizes = [{ width: 1536, height: 1024 }, { width: 1024, height: 1024 }, { width: 1024, height: 1536 }];
  return sizes.reduce((best, s) => (Math.abs(Math.log(r / (s.width / s.height))) < Math.abs(Math.log(r / (best.width / best.height))) ? s : best));
}
