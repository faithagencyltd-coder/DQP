// Bibliothèque de mobilier et d'équipements vus de dessus (§10.3), dessinés en SVG à leur
// taille réelle, et proposition automatique d'aménagement par type de pièce. L'aménagement
// proposé est un point de départ : chaque meuble se déplace, tourne ou se supprime.

import {
  bboxOf, dist, itemCorners, type Item, labelPoint, newId, OPENING_KINDS, openingCenter, type PlanModel,
  pointInPolygon, type Pt, type Room, type RoomKind, wallDir, wallLength, wallNormal, wallSpanPolygon,
} from './model';

export interface Palette {
  wood: string;
  woodDark: string;
  fabric: string;
  fabricDark: string;
  cushion: string;
  linen: string;
  white: string;
  metal: string;
  plant: string;
  plantDark: string;
  glass: string;
  line: string;
  car: string;
  rug: string;
}

export type FurnitureCategory = 'chambre' | 'sejour' | 'cuisine' | 'sanitaire' | 'bureau' | 'exterieur' | 'structure';

export interface FurnitureDef {
  label: string;
  category: FurnitureCategory;
  w: number;
  d: number;
  /** Dessin centré sur (0, 0), dos vers le haut (y négatif). */
  draw: (w: number, d: number, p: Palette) => string;
  /** Dessiné sous les autres meubles (tapis). */
  under?: boolean;
}

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const rect = (x: number, y: number, w: number, h: number, fill: string, stroke = 'none', r = 0, sw = 0.01) =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(Math.max(0, w))}" height="${f(Math.max(0, h))}" rx="${f(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`;
const circle = (cx: number, cy: number, r: number, fill: string, stroke = 'none', sw = 0.01) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`;
const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, stroke = 'none', sw = 0.01) =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}"/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 0.01, extra = '') =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${f(sw)}" ${extra}/>`;

function chair(cx: number, cy: number, s: number, rot: number, p: Palette): string {
  return `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${rot})">${rect(-s / 2, -s / 2, s, s, p.fabric, p.line, 0.05, 0.008)}${rect(-s / 2, -s / 2, s, s * 0.22, p.fabricDark, 'none', 0.04)}</g>`;
}

function bed(w: number, d: number, p: Palette, pillows: number): string {
  const head = 0.08;
  let s = rect(-w / 2, -d / 2, w, d, p.woodDark, p.line, 0.03, 0.01);
  s += rect(-w / 2 + 0.03, -d / 2 + head, w - 0.06, d - head - 0.03, p.linen, p.line, 0.04, 0.006);
  const pw = (w - 0.12 - (pillows - 1) * 0.06) / pillows;
  for (let i = 0; i < pillows; i++) s += rect(-w / 2 + 0.06 + i * (pw + 0.06), -d / 2 + head + 0.05, pw, 0.3, p.white, p.line, 0.06, 0.006);
  // Couette repliée.
  s += rect(-w / 2 + 0.03, -d / 2 + head + 0.48, w - 0.06, d - head - 0.51, p.cushion, p.line, 0.04, 0.006);
  s += line(-w / 2 + 0.03, -d / 2 + head + 0.62, w / 2 - 0.03, -d / 2 + head + 0.62, p.line, 0.006, 'opacity="0.5"');
  return s;
}

function sofa(w: number, d: number, p: Palette): string {
  const arm = Math.min(0.2, w * 0.1), back = Math.min(0.22, d * 0.25);
  let s = rect(-w / 2, -d / 2, w, d, p.fabricDark, p.line, 0.08, 0.008);
  const seats = Math.max(1, Math.round((w - 2 * arm) / 0.65));
  const sw = (w - 2 * arm) / seats;
  for (let i = 0; i < seats; i++) s += rect(-w / 2 + arm + i * sw + 0.01, -d / 2 + back, sw - 0.02, d - back - 0.03, p.fabric, p.line, 0.06, 0.006);
  s += rect(-w / 2 + 0.25, -d / 2 + back + 0.05, 0.35, 0.2, p.cushion, 'none', 0.05);
  return s;
}

function plant(w: number, d: number, p: Palette): string {
  const r = Math.min(w, d) / 2;
  let s = circle(0, 0, r * 0.45, p.woodDark, p.line, 0.006);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    s += `<ellipse cx="${f(Math.cos(a) * r * 0.5)}" cy="${f(Math.sin(a) * r * 0.5)}" rx="${f(r * 0.5)}" ry="${f(r * 0.17)}" transform="rotate(${f((a * 180) / Math.PI)} ${f(Math.cos(a) * r * 0.5)} ${f(Math.sin(a) * r * 0.5)})" fill="${i % 2 ? p.plant : p.plantDark}"/>`;
  }
  return s + circle(0, 0, r * 0.18, p.plantDark);
}

export const FURNITURE: Record<string, FurnitureDef> = {
  lit_double: { label: 'Lit double', category: 'chambre', w: 1.6, d: 2.0, draw: (w, d, p) => bed(w, d, p, 2) },
  lit_simple: { label: 'Lit simple', category: 'chambre', w: 0.9, d: 1.9, draw: (w, d, p) => bed(w, d, p, 1) },
  chevet: { label: 'Table de chevet', category: 'chambre', w: 0.45, d: 0.4, draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.wood, p.line, 0.03) + circle(0, 0.02, Math.min(w, d) * 0.22, p.white, p.line, 0.005) },
  armoire: {
    label: 'Armoire', category: 'chambre', w: 1.2, d: 0.6,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.wood, p.line, 0.02) + line(0, -d / 2, 0, d / 2, p.line, 0.008) + line(-w / 2 + 0.05, -d / 2 + d * 0.45, w / 2 - 0.05, -d / 2 + d * 0.45, p.line, 0.006, 'stroke-dasharray="0.04 0.03"'),
  },
  canape: { label: 'Canapé', category: 'sejour', w: 2.1, d: 0.9, draw: sofa },
  canape_angle: {
    label: 'Canapé d’angle', category: 'sejour', w: 2.5, d: 1.7,
    draw: (w, d, p) => {
      // Partie principale contre le dos, retour en équerre à droite.
      const depth = 0.9;
      const ret = `<g transform="translate(${f(w / 2 - depth / 2)} ${f(depth / 2 + (d - depth) / 2 - 0.01)})">${rect(-depth / 2, -(d - depth) / 2, depth, d - depth, p.fabricDark, p.line, 0.06, 0.008)}${rect(-depth / 2 + 0.03, -(d - depth) / 2 + 0.02, depth - 0.25, d - depth - 0.06, p.fabric, p.line, 0.05, 0.006)}</g>`;
      return `<g transform="translate(0 ${f(-d / 2 + depth / 2)})">${sofa(w, depth, p)}</g>` + ret;
    },
  },
  fauteuil: { label: 'Fauteuil', category: 'sejour', w: 0.85, d: 0.85, draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.fabricDark, p.line, 0.12, 0.008) + rect(-w / 2 + 0.14, -d / 2 + 0.2, w - 0.28, d - 0.26, p.fabric, p.line, 0.08, 0.006) },
  table_basse: { label: 'Table basse', category: 'sejour', w: 1.1, d: 0.6, draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.wood, p.line, 0.04) + rect(-0.25, -0.1, 0.24, 0.18, p.white, p.line, 0.02, 0.005) + `<g transform="translate(0.2 0)">${plant(0.22, 0.22, p)}</g>` },
  meuble_tv: { label: 'Meuble TV', category: 'sejour', w: 1.6, d: 0.45, draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.woodDark, p.line, 0.02) + rect(-w * 0.35, -d / 2 + 0.05, w * 0.7, 0.06, '#1b1b1b', 'none', 0.01) },
  tapis: { label: 'Tapis', category: 'sejour', w: 2.0, d: 1.4, under: true, draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.rug, 'none', 0.03) + rect(-w / 2 + 0.06, -d / 2 + 0.06, w - 0.12, d - 0.12, 'none', p.white, 0.02, 0.012) },
  table_4: {
    label: 'Table 4 places', category: 'sejour', w: 1.3, d: 1.7,
    draw: (w, d, p) => {
      const tw = w - 0.1, td = d - 0.9;
      return chair(-tw / 4, -td / 2 - 0.18, 0.42, 0, p) + chair(tw / 4, -td / 2 - 0.18, 0.42, 0, p) + chair(-tw / 4, td / 2 + 0.18, 0.42, 180, p) + chair(tw / 4, td / 2 + 0.18, 0.42, 180, p) +
        rect(-tw / 2, -td / 2, tw, td, p.wood, p.line, 0.03) + circle(0, 0, 0.09, p.plant, p.line, 0.005);
    },
  },
  table_6: {
    label: 'Table 6 places', category: 'sejour', w: 1.9, d: 1.75,
    draw: (w, d, p) => {
      const tw = w - 0.1, td = d - 0.85;
      let s = '';
      for (const x of [-tw / 3, 0, tw / 3]) s += chair(x, -td / 2 - 0.18, 0.42, 0, p) + chair(x, td / 2 + 0.18, 0.42, 180, p);
      return s + rect(-tw / 2, -td / 2, tw, td, p.wood, p.line, 0.03) + circle(0, 0, 0.1, p.plant, p.line, 0.005);
    },
  },
  cuisine_lineaire: {
    label: 'Plan de travail (évier, cuisson)', category: 'cuisine', w: 2.4, d: 0.6,
    draw: (w, d, p) => {
      let s = rect(-w / 2, -d / 2, w, d, p.white, p.line, 0.01, 0.01);
      s += rect(-w / 2, -d / 2, w, 0.04, p.woodDark);
      // Évier double bac.
      const sx = -w / 2 + Math.min(0.55, w * 0.25);
      s += rect(sx - 0.38, -d / 2 + 0.1, 0.36, 0.38, p.metal, p.line, 0.04, 0.006) + rect(sx + 0.02, -d / 2 + 0.1, 0.36, 0.38, p.metal, p.line, 0.04, 0.006);
      s += circle(sx, -d / 2 + 0.07, 0.025, p.line);
      // Plaque 4 feux.
      const hx = w / 2 - Math.min(0.55, w * 0.25);
      s += rect(hx - 0.3, -d / 2 + 0.08, 0.6, 0.46, '#26282b', p.line, 0.02, 0.006);
      for (const [x, y, r] of [[-0.14, -0.11, 0.08], [0.14, -0.11, 0.06], [-0.14, 0.11, 0.06], [0.14, 0.11, 0.08]]) s += circle(hx + x, y + 0.01, r, 'none', '#8a8f96', 0.01);
      return s;
    },
  },
  ilot: { label: 'Îlot central', category: 'cuisine', w: 1.6, d: 0.9, draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.white, p.line, 0.02) + rect(-w / 2 + 0.05, -d / 2 + 0.05, w - 0.1, d - 0.1, 'none', p.woodDark, 0.02, 0.01) },
  refrigerateur: { label: 'Réfrigérateur', category: 'cuisine', w: 0.7, d: 0.7, draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.metal, p.line, 0.02) + line(-w / 2 + 0.05, d / 2 - 0.06, w / 2 - 0.05, d / 2 - 0.06, p.line, 0.01) },
  lave_linge: { label: 'Lave-linge', category: 'cuisine', w: 0.6, d: 0.6, draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.white, p.line, 0.03) + circle(0, 0.03, Math.min(w, d) * 0.3, p.glass, p.line, 0.008) },
  wc: {
    label: 'WC', category: 'sanitaire', w: 0.4, d: 0.65,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, 0.18, p.white, p.line, 0.03) + ellipse(0, -d / 2 + 0.18 + (d - 0.18) / 2, w * 0.45, (d - 0.18) / 2, p.white, p.line) + ellipse(0, -d / 2 + 0.2 + (d - 0.18) / 2, w * 0.28, (d - 0.18) * 0.32, p.glass, p.line, 0.006),
  },
  lavabo: { label: 'Lavabo', category: 'sanitaire', w: 0.6, d: 0.45, draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.white, p.line, 0.04) + ellipse(0, 0.02, w * 0.32, d * 0.3, p.glass, p.line, 0.006) + circle(0, -d / 2 + 0.07, 0.02, p.metal, p.line, 0.004) },
  douche: {
    label: 'Douche', category: 'sanitaire', w: 0.9, d: 0.9,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.white, p.line, 0.02) + line(-w / 2 + 0.05, -d / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.05, p.line, 0.004, 'opacity="0.4"') + line(w / 2 - 0.05, -d / 2 + 0.05, -w / 2 + 0.05, d / 2 - 0.05, p.line, 0.004, 'opacity="0.4"') + circle(0, 0, 0.04, p.metal, p.line, 0.005) + line(-w / 2, d / 2, w / 2, d / 2, p.glass, 0.03),
  },
  baignoire: { label: 'Baignoire', category: 'sanitaire', w: 1.7, d: 0.75, draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, p.white, p.line, 0.06) + rect(-w / 2 + 0.07, -d / 2 + 0.07, w - 0.14, d - 0.14, p.glass, p.line, 0.25, 0.006) + circle(-w / 2 + 0.22, 0, 0.03, p.metal) },
  bureau: { label: 'Bureau et chaise', category: 'bureau', w: 1.4, d: 1.2, draw: (w, d, p) => chair(0, d / 2 - 0.3, 0.5, 180, p) + rect(-w / 2, -d / 2, w, 0.7, p.wood, p.line, 0.02) + rect(-0.25, -d / 2 + 0.08, 0.5, 0.06, '#1b1b1b') },
  chaise: { label: 'Chaise', category: 'bureau', w: 0.45, d: 0.45, draw: (w, _d, p) => chair(0, 0, w, 0, p) },
  voiture: {
    label: 'Voiture', category: 'exterieur', w: 1.8, d: 4.4,
    draw: (w, d, p) => {
      let s = rect(-w / 2, -d / 2, w, d, p.car, p.line, 0.35, 0.012);
      s += rect(-w / 2 + 0.15, -d / 2 + d * 0.27, w - 0.3, d * 0.16, p.glass, p.line, 0.12, 0.008);
      s += rect(-w / 2 + 0.18, -d / 2 + d * 0.45, w - 0.36, d * 0.24, p.car, p.line, 0.1, 0.006);
      s += rect(-w / 2 + 0.2, -d / 2 + d * 0.7, w - 0.4, d * 0.1, p.glass, p.line, 0.1, 0.008);
      // Roues (dépassant légèrement de la carrosserie).
      for (const x of [-1, 1]) for (const y of [-0.3, 0.3]) s = rect((x * w) / 2 - 0.06, y * d - 0.32, 0.12, 0.64, '#1b1b1b', 'none', 0.04) + s;
      return s;
    },
  },
  plante: { label: 'Plante', category: 'exterieur', w: 0.6, d: 0.6, draw: plant },
  arbre: { label: 'Arbre', category: 'exterieur', w: 2.4, d: 2.4, draw: plant },
  salon_jardin: {
    label: 'Salon de jardin', category: 'exterieur', w: 1.8, d: 1.8,
    draw: (_w, _d, p) => circle(0, 0, 0.45, p.wood, p.line, 0.01) + chair(0, -0.7, 0.45, 0, p) + chair(0, 0.7, 0.45, 180, p) + chair(-0.7, 0, 0.45, 270, p) + chair(0.7, 0, 0.45, 90, p),
  },
  escalier: {
    label: 'Escalier droit', category: 'structure', w: 1.0, d: 3.2,
    draw: (w, d, p) => {
      const steps = Math.max(3, Math.round(d / 0.27));
      let s = rect(-w / 2, -d / 2, w, d, p.wood, p.line, 0, 0.012);
      for (let i = 1; i < steps; i++) s += line(-w / 2, -d / 2 + (i * d) / steps, w / 2, -d / 2 + (i * d) / steps, p.line, 0.008);
      s += line(0, d / 2 - 0.15, 0, -d / 2 + 0.25, p.line, 0.012) + `<path d="M ${f(-0.08)} ${f(-d / 2 + 0.35)} L 0 ${f(-d / 2 + 0.2)} L ${f(0.08)} ${f(-d / 2 + 0.35)}" fill="none" stroke="${p.line}" stroke-width="0.012"/>`;
      return s;
    },
  },
};

export const FURNITURE_CATEGORIES: Record<FurnitureCategory, string> = {
  chambre: 'Chambre', sejour: 'Séjour et repas', cuisine: 'Cuisine et buanderie', sanitaire: 'Sanitaires', bureau: 'Bureau', exterieur: 'Extérieur et garage', structure: 'Structure',
};

export function newItem(type: string, x: number, y: number, rot = 0): Item {
  const def = FURNITURE[type];
  return { id: newId('i'), type, x, y, w: def?.w ?? 0.5, d: def?.d ?? 0.5, rot };
}

// ------------------------------------------------------------------ aménagement automatique
type Rect = { minX: number; minY: number; maxX: number; maxY: number };

function itemBox(i: Item): Rect {
  return bboxOf(itemCorners(i));
}
const overlaps = (a: Rect, b: Rect, gap = 0.02) => a.minX < b.maxX - gap && b.minX < a.maxX - gap && a.minY < b.maxY - gap && b.minY < a.maxY - gap;

/** Zones à garder libres devant les portes de la pièce (débattement). */
export function doorClearances(m: PlanModel, room: Room): Rect[] {
  const out: Rect[] = [];
  for (const o of m.openings) {
    // Seules les portes battantes ont un débattement (coulissante et garage : passage seul).
    if (!OPENING_KINDS[o.kind].door || o.kind === 'coulissante' || o.kind === 'porte_garage') continue;
    const w = m.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const c = openingCenter(o, w);
    const d = wallDir(w), n = wallNormal(w);
    const depth = Math.min(1.0, o.width) + w.thickness / 2;
    const pts: Pt[] = [];
    for (const s of [-1, 1]) for (const k of [-1, 1]) pts.push([c[0] + d[0] * (s * o.width) / 2 + n[0] * k * depth, c[1] + d[1] * (s * o.width) / 2 + n[1] * k * depth]);
    const near = pts.some((p) => pointInPolygon(p, room.points)) || pointInPolygon(c, room.points);
    if (near) out.push(bboxOf(pts));
  }
  return out;
}

function fits(i: Item, room: Room, obstacles: Rect[]): boolean {
  const corners = itemCorners(i);
  const inset = 0.01;
  for (const c of corners) {
    if (!pointInPolygon(c, room.points)) return false;
  }
  const b = itemBox(i);
  // Un sommet de la pièce à l'intérieur du meuble = le meuble déborde d'un angle rentrant.
  for (const p of room.points) if (p[0] > b.minX + inset && p[0] < b.maxX - inset && p[1] > b.minY + inset && p[1] < b.maxY - inset) return false;
  return !obstacles.some((o) => overlaps(b, o));
}

/** Cherche, autour d'un point visé, la position libre la plus proche (grille de 5 cm). */
function placeNear(type: string, target: Pt, rot: number, room: Room, obstacles: Rect[], size?: { w?: number; d?: number }, radius = 3): Item | null {
  const base = newItem(type, target[0], target[1], rot);
  if (size?.w) base.w = size.w;
  if (size?.d) base.d = size.d;
  const step = 0.05;
  const n = Math.ceil(radius / step);
  const cands: [number, number, number][] = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) cands.push([i * step, j * step, Math.hypot(i, j)]);
  cands.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
  for (const [dx, dy] of cands) {
    const it = { ...base, x: target[0] + dx, y: target[1] + dy };
    if (fits(it, room, obstacles)) return it;
  }
  return null;
}

type Side = 'haut' | 'bas' | 'gauche' | 'droite';
/** Rotation qui place le dos de l'objet contre le côté donné. */
const SIDE_ROT: Record<Side, number> = { haut: 0, droite: 90, bas: 180, gauche: 270 };

function sideTarget(b: Rect, side: Side, depth: number, along = 0.5): Pt {
  const gap = 0.02;
  switch (side) {
    case 'haut': return [b.minX + (b.maxX - b.minX) * along, b.minY + depth / 2 + gap];
    case 'bas': return [b.minX + (b.maxX - b.minX) * along, b.maxY - depth / 2 - gap];
    case 'gauche': return [b.minX + depth / 2 + gap, b.minY + (b.maxY - b.minY) * along];
    case 'droite': return [b.maxX - depth / 2 - gap, b.minY + (b.maxY - b.minY) * along];
  }
}

const opposite: Record<Side, Side> = { haut: 'bas', bas: 'haut', gauche: 'droite', droite: 'gauche' };

/** Côtés de la pièce, du plus long au plus court, ceux sans porte d'abord. */
function sidesByPreference(b: Rect, clear: Rect[]): Side[] {
  const len: Record<Side, number> = { haut: b.maxX - b.minX, bas: b.maxX - b.minX, gauche: b.maxY - b.minY, droite: b.maxY - b.minY };
  const doorOn = (s: Side) => clear.some((c) => {
    const t = 0.3;
    if (s === 'haut') return c.minY < b.minY + t;
    if (s === 'bas') return c.maxY > b.maxY - t;
    if (s === 'gauche') return c.minX < b.minX + t;
    return c.maxX > b.maxX - t;
  });
  return (['haut', 'droite', 'bas', 'gauche'] as Side[]).sort((x, y) => Number(doorOn(x)) - Number(doorOn(y)) || len[y] - len[x]);
}

/**
 * Propose un aménagement pour une pièce selon son type et ses dimensions. Ne renvoie que des
 * meubles qui tiennent dans la pièce sans chevaucher les autres ni le débattement des portes.
 */
export function autoFurnish(m: PlanModel, room: Room): Item[] {
  const b = bboxOf(room.points);
  const W = b.maxX - b.minX, H = b.maxY - b.minY;
  const clear = doorClearances(m, room);
  const existing = m.items.filter((i) => pointInPolygon([i.x, i.y], room.points)).map(itemBox);
  // Murs isolés à l'intérieur de la pièce (refends, amorces) : à contourner aussi.
  const walls = m.walls.map((w) => bboxOf(wallSpanPolygon(w, 0, wallLength(w))));
  const obstacles: Rect[] = [...clear, ...existing, ...walls];
  const out: Item[] = [];
  const put = (it: Item | null) => {
    if (it) { out.push(it); obstacles.push(itemBox(it)); }
    return it;
  };
  const sides = sidesByPreference(b, clear);
  const area = Math.abs(W * H);
  const kind: RoomKind = room.kind;
  const try1 = (type: string, side: Side, along = 0.5, size?: { w?: number; d?: number }, radius = 1.2) => {
    const def = FURNITURE[type];
    const depth = size?.d ?? def.d;
    return put(placeNear(type, sideTarget(b, side, depth, along), SIDE_ROT[side], room, obstacles, size, radius));
  };
  const firstFit = (type: string, alongs = [0.5], size?: { w?: number; d?: number }) => {
    for (const s of sides) for (const a of alongs) {
      const it = try1(type, s, a, size);
      if (it) return { it, side: s };
    }
    return null;
  };
  const center = labelPoint(room.points);

  if (kind === 'chambre') {
    const double = Math.min(W, H) >= 2.7;
    const placed = firstFit(double ? 'lit_double' : 'lit_simple') ?? (double ? firstFit('lit_simple') : null);
    if (placed) {
      const bed = placed.it;
      const side = placed.side;
      const horizontal = side === 'haut' || side === 'bas';
      for (const s of [-1, 1]) {
        const off = bed.w / 2 + FURNITURE.chevet.w / 2 + 0.03;
        const t: Pt = horizontal ? [bed.x + s * off, sideTarget(b, side, FURNITURE.chevet.d)[1]] : [sideTarget(b, side, FURNITURE.chevet.d)[0], bed.y + s * off];
        put(placeNear('chevet', t, SIDE_ROT[side], room, obstacles, undefined, 0.15));
      }
      for (const s of sides.filter((x) => x !== side)) {
        if (try1('armoire', s, 0.15, undefined, 0.6) || try1('armoire', s, 0.85, undefined, 0.6)) break;
      }
    }
  } else if (kind === 'salon' || kind === 'sejour') {
    const sofaType = area >= 20 && Math.min(W, H) >= 3.4 ? 'canape_angle' : 'canape';
    const placed = firstFit(sofaType, [0.5, 0.35, 0.65]) ?? (sofaType === 'canape_angle' ? firstFit('canape', [0.5, 0.35, 0.65]) : null);
    if (placed) {
      const s = placed.it;
      const side = placed.side;
      const inward: Pt = side === 'haut' ? [0, 1] : side === 'bas' ? [0, -1] : side === 'gauche' ? [1, 0] : [-1, 0];
      const reach = (side === 'haut' || side === 'bas' ? s.d : s.d) / 2 + 0.45 + FURNITURE.table_basse.d / 2;
      const tPt: Pt = [s.x + inward[0] * reach, s.y + inward[1] * reach];
      put(placeNear('tapis', tPt, SIDE_ROT[side], room, [], undefined, 0.3));
      put(placeNear('table_basse', tPt, SIDE_ROT[side], room, obstacles, undefined, 0.4));
      try1('meuble_tv', opposite[side], 0.5, undefined, 1.0);
      if (kind === 'sejour' && area >= 24) {
        // Coin repas dans la partie restante de la pièce.
        const farFromSofa: Pt = [b.minX + W / 2 - inward[0] * 0, b.minY + H / 2];
        const target: Pt = side === 'haut' || side === 'bas' ? [b.minX + W * 0.78, farFromSofa[1]] : [farFromSofa[0], b.minY + H * 0.78];
        put(placeNear('table_6', target, 0, room, obstacles, undefined, 2.5)) ?? put(placeNear('table_4', target, 0, room, obstacles, undefined, 2.5));
      }
    }
    for (const c of [[0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]] as Pt[]) {
      if (put(placeNear('plante', [b.minX + W * c[0], b.minY + H * c[1]], 0, room, obstacles, undefined, 0.5))) break;
    }
  } else if (kind === 'salle_manger') {
    put(placeNear('table_6', center, W >= H ? 0 : 90, room, obstacles, undefined, 1)) ?? put(placeNear('table_4', center, W >= H ? 0 : 90, room, obstacles, undefined, 1));
    for (const c of [[0.08, 0.08], [0.92, 0.92]] as Pt[]) put(placeNear('plante', [b.minX + W * c[0], b.minY + H * c[1]], 0, room, obstacles, undefined, 0.4));
  } else if (kind === 'cuisine') {
    for (const s of sides) {
      const len = s === 'haut' || s === 'bas' ? W : H;
      const run = Math.min(3.2, len - 0.75);
      if (run < 1.4) continue;
      const it = try1('cuisine_lineaire', s, 0.5, { w: run }, 0.6);
      if (it) {
        const horizontal = s === 'haut' || s === 'bas';
        const end: Pt = horizontal ? [it.x + run / 2 + 0.37, it.y] : [it.x, it.y + run / 2 + 0.37];
        put(placeNear('refrigerateur', end, SIDE_ROT[s], room, obstacles, undefined, 0.3));
        break;
      }
    }
    if (area >= 10) put(placeNear('table_4', center, W >= H ? 90 : 0, room, obstacles, undefined, 1.2));
  } else if (kind === 'sdb') {
    const bath = Math.max(W, H) >= 1.75 && area >= 4.5;
    if (bath) {
      for (const s of sides) if (try1('baignoire', s, 0.5, undefined, 1.0)) break;
    } else {
      for (const s of sides) if (try1('douche', s, 0.2, undefined, 0.5) || try1('douche', s, 0.8, undefined, 0.5)) break;
    }
    for (const s of sides) if (try1('lavabo', s, 0.5, undefined, 0.9)) break;
    for (const s of sides) if (try1('wc', s, 0.3, undefined, 0.9) || try1('wc', s, 0.7, undefined, 0.9)) break;
  } else if (kind === 'wc') {
    for (const s of sides) if (try1('wc', s, 0.5, undefined, 0.6)) break;
    if (area >= 1.6) for (const s of sides) if (try1('lavabo', s, 0.5, { w: 0.45, d: 0.35 }, 0.6)) break;
  } else if (kind === 'bureau') {
    for (const s of sides) if (try1('bureau', s, 0.5, undefined, 1)) break;
    for (const s of sides) if (try1('armoire', s, 0.85, { w: 1.0, d: 0.45 }, 0.6)) break;
  } else if (kind === 'garage') {
    const rot = H >= W ? 0 : 90;
    put(placeNear('voiture', center, rot, room, obstacles, undefined, 1.5));
  } else if (kind === 'buanderie') {
    for (const s of sides) if (try1('lave_linge', s, 0.3, undefined, 0.6)) break;
  } else if (kind === 'terrasse') {
    if (area >= 9) put(placeNear('salon_jardin', center, 0, room, obstacles, undefined, 1.5));
    for (const c of [[0.06, 0.06], [0.94, 0.94], [0.94, 0.06], [0.06, 0.94]] as Pt[]) put(placeNear('plante', [b.minX + W * c[0], b.minY + H * c[1]], 0, room, obstacles, undefined, 0.3));
  } else if (kind === 'jardin') {
    for (const c of [[0.2, 0.2], [0.8, 0.8]] as Pt[]) put(placeNear('arbre', [b.minX + W * c[0], b.minY + H * c[1]], 0, room, obstacles, undefined, 1));
  }
  return out;
}

/** Les meubles d'une pièce (centre dans la pièce). */
export function itemsInRoom(m: PlanModel, room: Room): Item[] {
  return m.items.filter((i) => pointInPolygon([i.x, i.y], room.points));
}

export const itemDistance = (i: Item, p: Pt) => dist([i.x, i.y], p);
