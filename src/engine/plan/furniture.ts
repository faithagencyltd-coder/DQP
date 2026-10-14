// Bibliothèque de mobilier et d'équipements vus de dessus (§10.3), dessinés en SVG à leur
// taille réelle, et proposition automatique d'aménagement par type de pièce. L'aménagement
// proposé est un point de départ : chaque meuble se déplace, tourne ou se supprime.

import {
  bboxOf, dist, itemCorners, type Item, labelPoint, newId, OPENING_KINDS, openingCenter, type PlanModel,
  pointInPolygon, type Pt, type Room, type RoomKind, wallDir, wallLength, wallNormal, wallSpanPolygon,
} from './model';

export interface Palette {
  /** Identifiant du style (sert à nommer les dégradés dans le SVG). */
  id: string;
  /** Rendu à plat, sans dégradés ni textures (style « Épuré », impression). */
  flat?: boolean;
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
  /** Couleurs d'accent : coussins, plaid, objets. */
  accent: string;
  accent2: string;
  stone: string;
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

// ------------------------------------------------------------------ outils de dessin
const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const rect = (x: number, y: number, w: number, h: number, fill: string, stroke = 'none', r = 0, sw = 0.01, extra = '') =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(Math.max(0, w))}" height="${f(Math.max(0, h))}" rx="${f(Math.min(r, Math.max(0, w) / 2, Math.max(0, h) / 2))}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}" ${extra}/>`;
const circle = (cx: number, cy: number, r: number, fill: string, stroke = 'none', sw = 0.01, extra = '') =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}" ${extra}/>`;
const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, stroke = 'none', sw = 0.01, extra = '') =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}" ${extra}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 0.01, extra = '') =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${f(sw)}" ${extra}/>`;
const path = (d: string, fill: string, stroke = 'none', sw = 0.01, extra = '') => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${f(sw)}" ${extra}/>`;
const g = (x: number, y: number, rot: number, body: string) => `<g transform="translate(${f(x)} ${f(y)})${rot ? ` rotate(${f(rot)})` : ''}">${body}</g>`;

type Key = Exclude<keyof Palette, 'id' | 'flat'>;
const GRAD_KEYS: Key[] = ['wood', 'woodDark', 'fabric', 'fabricDark', 'cushion', 'linen', 'white', 'metal', 'plant', 'plantDark', 'glass', 'car', 'rug', 'accent', 'accent2', 'stone'];

/** Volume doux (coussins, matelas, carrosserie) : centre éclairé, bords ombrés. */
const S = (p: Palette, k: Key) => (p.flat ? p[k] : `url(#s-${p.id}-${k})`);
/** Surface plane éclairée de biais (bois, métal, verre). */
const L = (p: Palette, k: Key) => (p.flat ? p[k] : `url(#l-${p.id}-${k})`);
/** Texture fine (veinage du bois, trame du tissu) ; rien en rendu à plat. */
const T = (p: Palette, kind: 'bois' | 'tissu' | 'pierre') => (p.flat ? '' : ` filter="url(#t-${kind})"`);
const stroke = (p: Palette) => (p.flat ? p.line : 'rgba(0,0,0,0.28)');

function hex(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
/** Éclaircit (k > 0) ou assombrit (k < 0) une couleur. */
export function shade(c: string, k: number): string {
  const rgb = hex(c);
  if (!rgb) return c;
  const t = k > 0 ? 255 : 0;
  const a = Math.abs(k);
  return '#' + rgb.map((v) => Math.round(v + (t - v) * a).toString(16).padStart(2, '0')).join('');
}

/** Dégradés et textures utilisés par le mobilier d'un style (à placer dans <defs>). */
export function paletteDefs(p: Palette): string {
  if (p.flat) return '';
  let s = '';
  for (const k of GRAD_KEYS) {
    const c = p[k];
    s += `<radialGradient id="s-${p.id}-${k}" cx="0.45" cy="0.4" r="0.75"><stop offset="0" stop-color="${shade(c, 0.22)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.22)}"/></radialGradient>`;
    s += `<linearGradient id="l-${p.id}-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(c, 0.14)}"/><stop offset="0.6" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.12)}"/></linearGradient>`;
  }
  return s;
}

/** Textures fines communes à tous les styles (filtres SVG, unités en mètres). */
export function textureDefs(): string {
  const mul = (id: string, freq: string, lo: number, oct = 3, kind = 'fractalNoise') =>
    `<filter id="${id}" x="0" y="0" width="1" height="1" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="${kind}" baseFrequency="${freq}" numOctaves="${oct}" seed="7" result="n"/>` +
    `<feColorMatrix in="n" type="matrix" values="${1 - lo} 0 0 0 ${lo}  ${1 - lo} 0 0 0 ${lo}  ${1 - lo} 0 0 0 ${lo}  0 0 0 0 1" result="m"/>` +
    `<feBlend in="SourceGraphic" in2="m" mode="multiply" result="b"/><feComposite in="b" in2="SourceAlpha" operator="in"/></filter>`;
  return mul('t-bois', '2 45', 0.8) + mul('t-tissu', '60 60', 0.88, 2) + mul('t-pierre', '9 9', 0.84, 4);
}

// ------------------------------------------------------------------ éléments réutilisés
/** Chaise vue de dessus : assise rembourrée, dossier, pieds visibles. */
function chair(cx: number, cy: number, s: number, rot: number, p: Palette): string {
  const back = s * 0.2;
  return g(cx, cy, rot,
    rect(-s / 2 + 0.02, -s / 2 + 0.02, s - 0.04, s - 0.02, 'rgba(0,0,0,0.12)', 'none', 0.06) +
    rect(-s / 2, -s / 2 + back * 0.6, s, s - back * 0.6, S(p, 'fabric'), stroke(p), 0.07, 0.006, T(p, 'tissu')) +
    rect(-s / 2, -s / 2, s, back, L(p, 'woodDark'), stroke(p), 0.04, 0.006));
}

function pillow(x: number, y: number, w: number, h: number, fill: string, p: Palette): string {
  // Coussin bombé : coins pincés, pli central.
  const r = Math.min(w, h) * 0.35;
  return rect(x, y, w, h, fill, stroke(p), r, 0.005, T(p, 'tissu')) +
    (p.flat ? '' : path(`M ${f(x + w * 0.2)} ${f(y + h * 0.55)} Q ${f(x + w / 2)} ${f(y + h * 0.4)} ${f(x + w * 0.8)} ${f(y + h * 0.55)}`, 'none', 'rgba(0,0,0,0.12)', 0.008));
}

function bed(w: number, d: number, p: Palette, pillows: number): string {
  const head = 0.1;
  let s = rect(-w / 2, -d / 2, w, d, L(p, 'woodDark'), stroke(p), 0.03, 0.01, T(p, 'bois'));
  // Tête de lit capitonnée.
  s += rect(-w / 2 + 0.01, -d / 2, w - 0.02, head, S(p, 'fabricDark'), stroke(p), 0.04, 0.006, T(p, 'tissu'));
  // Matelas et drap.
  s += rect(-w / 2 + 0.04, -d / 2 + head, w - 0.08, d - head - 0.04, S(p, 'linen'), stroke(p), 0.05, 0.006);
  const pw = (w - 0.16 - (pillows - 1) * 0.05) / pillows;
  for (let i = 0; i < pillows; i++) s += pillow(-w / 2 + 0.08 + i * (pw + 0.05), -d / 2 + head + 0.05, pw, 0.32, S(p, 'white'), p);
  // Couette avec revers et plis.
  const top = -d / 2 + head + 0.46;
  s += path(`M ${f(-w / 2 + 0.03)} ${f(top)} L ${f(w / 2 - 0.03)} ${f(top)} L ${f(w / 2 - 0.02)} ${f(d / 2 - 0.03)} Q ${f(0)} ${f(d / 2 + 0.01)} ${f(-w / 2 + 0.02)} ${f(d / 2 - 0.03)} Z`, S(p, 'cushion'), stroke(p), 0.006, T(p, 'tissu'));
  s += rect(-w / 2 + 0.03, top, w - 0.06, 0.16, S(p, 'white'), stroke(p), 0.03, 0.005);
  if (!p.flat) {
    for (const k of [0.3, 0.55, 0.78]) s += path(`M ${f(-w / 2 + 0.1)} ${f(top + 0.2 + (d - head - 0.5) * k)} Q ${f(-w * 0.1)} ${f(top + 0.24 + (d - head - 0.5) * k)} ${f(w / 2 - 0.15)} ${f(top + 0.18 + (d - head - 0.5) * k)}`, 'none', 'rgba(0,0,0,0.08)', 0.012);
  }
  // Plaid au pied du lit.
  s += rect(-w / 2 + 0.02, d / 2 - 0.42, w - 0.04, 0.3, S(p, 'accent'), stroke(p), 0.03, 0.005, T(p, 'tissu'));
  if (!p.flat) s += line(-w / 2 + 0.02, d / 2 - 0.15, w / 2 - 0.02, d / 2 - 0.15, 'rgba(255,255,255,0.45)', 0.012);
  return s;
}

function sofa(w: number, d: number, p: Palette): string {
  const arm = Math.min(0.2, w * 0.1), back = Math.min(0.24, d * 0.27);
  let s = rect(-w / 2, -d / 2, w, d, S(p, 'fabricDark'), stroke(p), 0.1, 0.008, T(p, 'tissu'));
  // Dossier en coussins.
  const seats = Math.max(1, Math.round((w - 2 * arm) / 0.68));
  const sw = (w - 2 * arm) / seats;
  for (let i = 0; i < seats; i++) s += rect(-w / 2 + arm + i * sw + 0.01, -d / 2 + 0.02, sw - 0.02, back - 0.02, S(p, 'fabricDark'), stroke(p), 0.07, 0.005, T(p, 'tissu'));
  for (let i = 0; i < seats; i++) s += rect(-w / 2 + arm + i * sw + 0.012, -d / 2 + back, sw - 0.024, d - back - 0.04, S(p, 'fabric'), stroke(p), 0.07, 0.006, T(p, 'tissu'));
  // Accoudoirs.
  s += rect(-w / 2, -d / 2 + 0.04, arm, d - 0.06, S(p, 'fabricDark'), stroke(p), 0.08, 0.006, T(p, 'tissu'));
  s += rect(w / 2 - arm, -d / 2 + 0.04, arm, d - 0.06, S(p, 'fabricDark'), stroke(p), 0.08, 0.006, T(p, 'tissu'));
  // Coussins décoratifs posés en biais.
  s += g(-w / 2 + arm + 0.22, -d / 2 + back + 0.14, -14, pillow(-0.17, -0.12, 0.34, 0.24, S(p, 'accent'), p));
  s += g(w / 2 - arm - 0.22, -d / 2 + back + 0.14, 12, pillow(-0.17, -0.12, 0.34, 0.24, S(p, 'accent2'), p));
  return s;
}

/** Plante en pot vue de dessus : feuilles pointues superposées, en éventail. */
function plant(w: number, d: number, p: Palette): string {
  const r = Math.min(w, d) / 2;
  let s = circle(0, 0, r * 0.42, L(p, 'stone'), stroke(p), 0.006) + circle(0, 0, r * 0.34, '#3b2a1e');
  const leaf = (a: number, len: number, wid: number, fill: string) => {
    const rad = (a * Math.PI) / 180;
    const tip: [number, number] = [Math.cos(rad) * len, Math.sin(rad) * len];
    const nx = -Math.sin(rad) * wid, ny = Math.cos(rad) * wid;
    const mid: [number, number] = [tip[0] * 0.5, tip[1] * 0.5];
    return path(`M 0 0 Q ${f(mid[0] + nx)} ${f(mid[1] + ny)} ${f(tip[0])} ${f(tip[1])} Q ${f(mid[0] - nx)} ${f(mid[1] - ny)} 0 0 Z`, fill, 'rgba(0,0,0,0.18)', 0.004) +
      (p.flat ? '' : line(0, 0, tip[0] * 0.92, tip[1] * 0.92, 'rgba(255,255,255,0.25)', 0.005));
  };
  for (let i = 0; i < 11; i++) s += leaf(i * 33 + 8, r * (0.85 + (i % 3) * 0.06), r * 0.16, L(p, 'plantDark'));
  for (let i = 0; i < 9; i++) s += leaf(i * 40 + 25, r * (0.7 + (i % 2) * 0.08), r * 0.14, L(p, 'plant'));
  return s;
}

function tree(w: number, d: number, p: Palette): string {
  const r = Math.min(w, d) / 2;
  let s = circle(0.05 * r, 0.08 * r, r * 0.98, 'rgba(0,0,0,0.18)');
  const blobs = 9;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2;
    s += circle(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.5, S(p, i % 2 ? 'plant' : 'plantDark'), 'none', 0, T(p, 'tissu'));
  }
  return s + circle(0, 0, r * 0.55, S(p, 'plant'), 'none', 0, T(p, 'tissu'));
}

function car(w: number, d: number, p: Palette): string {
  const x0 = -w / 2, y0 = -d / 2;
  // Carrosserie : avant arrondi (en haut), arrière plus droit.
  const shell = `M ${f(x0 + w * 0.18)} ${f(y0)} Q ${f(0)} ${f(y0 - 0.04)} ${f(-x0 - w * 0.18)} ${f(y0)} Q ${f(-x0)} ${f(y0 + 0.08)} ${f(-x0)} ${f(y0 + d * 0.22)} L ${f(-x0)} ${f(-y0 - d * 0.1)} Q ${f(-x0)} ${f(-y0)} ${f(-x0 - w * 0.2)} ${f(-y0)} L ${f(x0 + w * 0.2)} ${f(-y0)} Q ${f(x0)} ${f(-y0)} ${f(x0)} ${f(-y0 - d * 0.1)} L ${f(x0)} ${f(y0 + d * 0.22)} Q ${f(x0)} ${f(y0 + 0.08)} ${f(x0 + w * 0.18)} ${f(y0)} Z`;
  let s = '';
  // Roues qui dépassent légèrement.
  for (const sx of [-1, 1]) for (const yy of [y0 + d * 0.2, -y0 - d * 0.22]) s += rect(sx * w / 2 - 0.07, yy - 0.3, 0.14, 0.6, '#151515', 'none', 0.05);
  s += path(shell, S(p, 'car'), 'rgba(0,0,0,0.45)', 0.012);
  // Capot : nervures.
  if (!p.flat) {
    s += path(`M ${f(-w * 0.22)} ${f(y0 + 0.12)} Q ${f(-w * 0.18)} ${f(y0 + d * 0.15)} ${f(-w * 0.2)} ${f(y0 + d * 0.27)}`, 'none', 'rgba(0,0,0,0.15)', 0.01);
    s += path(`M ${f(w * 0.22)} ${f(y0 + 0.12)} Q ${f(w * 0.18)} ${f(y0 + d * 0.15)} ${f(w * 0.2)} ${f(y0 + d * 0.27)}`, 'none', 'rgba(0,0,0,0.15)', 0.01);
  }
  // Pare-brise, toit, lunette arrière.
  const glass = p.flat ? p.glass : 'url(#car-glass)';
  s += path(`M ${f(-w * 0.4)} ${f(y0 + d * 0.31)} Q ${f(0)} ${f(y0 + d * 0.27)} ${f(w * 0.4)} ${f(y0 + d * 0.31)} L ${f(w * 0.36)} ${f(y0 + d * 0.43)} L ${f(-w * 0.36)} ${f(y0 + d * 0.43)} Z`, glass, 'rgba(0,0,0,0.5)', 0.008);
  s += rect(-w * 0.36, y0 + d * 0.43, w * 0.72, d * 0.24, S(p, 'car'), 'rgba(0,0,0,0.3)', 0.08, 0.008);
  s += path(`M ${f(-w * 0.36)} ${f(y0 + d * 0.67)} L ${f(w * 0.36)} ${f(y0 + d * 0.67)} L ${f(w * 0.38)} ${f(y0 + d * 0.77)} Q ${f(0)} ${f(y0 + d * 0.8)} ${f(-w * 0.38)} ${f(y0 + d * 0.77)} Z`, glass, 'rgba(0,0,0,0.5)', 0.008);
  // Vitres latérales.
  for (const sx of [-1, 1]) {
    s += path(`M ${f(sx * w * 0.4)} ${f(y0 + d * 0.33)} L ${f(sx * w * 0.44)} ${f(y0 + d * 0.45)} L ${f(sx * w * 0.44)} ${f(y0 + d * 0.66)} L ${f(sx * w * 0.38)} ${f(y0 + d * 0.75)} L ${f(sx * w * 0.37)} ${f(y0 + d * 0.43)} Z`, glass, 'rgba(0,0,0,0.4)', 0.006);
    // Rétroviseurs.
    s += ellipse(sx * (w / 2 + 0.05), y0 + d * 0.33, 0.07, 0.045, S(p, 'car'), 'rgba(0,0,0,0.4)', 0.006);
  }
  // Phares et feux.
  for (const sx of [-1, 1]) {
    s += path(`M ${f(sx * w * 0.42)} ${f(y0 + 0.07)} Q ${f(sx * w * 0.3)} ${f(y0 + 0.01)} ${f(sx * w * 0.2)} ${f(y0 + 0.02)} L ${f(sx * w * 0.22)} ${f(y0 + 0.07)} Z`, '#f4f6f8', 'rgba(0,0,0,0.3)', 0.005);
    s += rect(sx > 0 ? w * 0.22 : -w * 0.42, -y0 - 0.06, w * 0.2, 0.045, '#b3261e', 'none', 0.015);
  }
  if (!p.flat) s += rect(-w * 0.04, y0 + d * 0.46, w * 0.08, d * 0.18, 'rgba(255,255,255,0.18)', 'none', 0.03);
  return s;
}

function shower(w: number, d: number, p: Palette): string {
  let s = rect(-w / 2, -d / 2, w, d, S(p, 'white'), stroke(p), 0.03, 0.008);
  s += rect(-w / 2 + 0.05, -d / 2 + 0.05, w - 0.1, d - 0.1, S(p, 'glass'), 'rgba(0,0,0,0.15)', 0.02, 0.005);
  for (let i = 1; i < 6; i++) s += line(-w / 2 + 0.05 + ((w - 0.1) * i) / 6, -d / 2 + 0.05, -w / 2 + 0.05 + ((w - 0.1) * i) / 6, d / 2 - 0.05, 'rgba(0,0,0,0.05)', 0.004);
  s += circle(0, 0, 0.045, L(p, 'metal'), 'rgba(0,0,0,0.4)', 0.005);
  s += circle(-w / 2 + 0.12, -d / 2 + 0.12, 0.06, L(p, 'metal'), 'rgba(0,0,0,0.3)', 0.005);
  return s + line(-w / 2, d / 2, w / 2, d / 2, 'rgba(120,170,190,0.8)', 0.025);
}

export const FURNITURE: Record<string, FurnitureDef> = {
  lit_double: { label: 'Lit double', category: 'chambre', w: 1.6, d: 2.0, draw: (w, d, p) => bed(w, d, p, 2) },
  lit_simple: { label: 'Lit simple', category: 'chambre', w: 0.9, d: 1.9, draw: (w, d, p) => bed(w, d, p, 1) },
  chevet: {
    label: 'Table de chevet', category: 'chambre', w: 0.45, d: 0.4,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, L(p, 'wood'), stroke(p), 0.03, 0.006, T(p, 'bois')) +
      circle(0, 0, Math.min(w, d) * 0.24, S(p, 'linen'), stroke(p), 0.005) + circle(0, 0, Math.min(w, d) * 0.08, '#fff6d8'),
  },
  armoire: {
    label: 'Armoire', category: 'chambre', w: 1.2, d: 0.6,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, L(p, 'wood'), stroke(p), 0.02, 0.008, T(p, 'bois')) +
      line(0, -d / 2 + 0.02, 0, d / 2 - 0.02, 'rgba(0,0,0,0.35)', 0.008) +
      rect(-0.06, d / 2 - 0.08, 0.035, 0.05, L(p, 'metal'), 'none', 0.01) + rect(0.025, d / 2 - 0.08, 0.035, 0.05, L(p, 'metal'), 'none', 0.01),
  },
  canape: { label: 'Canapé', category: 'sejour', w: 2.1, d: 0.9, draw: sofa },
  canape_angle: {
    label: 'Canapé d’angle', category: 'sejour', w: 2.5, d: 1.7,
    draw: (w, d, p) => {
      const depth = 0.9;
      // Retour en équerre, accolé sous l'extrémité droite de la partie principale.
      const ret = g(w / 2 - depth / 2, -d / 2 + depth + (d - depth) / 2 - 0.025, 0,
        rect(-depth / 2, -(d - depth) / 2 - 0.05, depth, d - depth + 0.05, S(p, 'fabricDark'), stroke(p), 0.08, 0.006, T(p, 'tissu')) +
        rect(-depth / 2 + 0.03, -(d - depth) / 2, depth - 0.25, d - depth - 0.05, S(p, 'fabric'), stroke(p), 0.07, 0.006, T(p, 'tissu')));
      return ret + g(0, -d / 2 + depth / 2, 0, sofa(w, depth, p));
    },
  },
  fauteuil: {
    label: 'Fauteuil', category: 'sejour', w: 0.85, d: 0.85,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, S(p, 'fabricDark'), stroke(p), 0.16, 0.008, T(p, 'tissu')) +
      rect(-w / 2 + 0.14, -d / 2 + 0.2, w - 0.28, d - 0.26, S(p, 'fabric'), stroke(p), 0.1, 0.006, T(p, 'tissu')) +
      g(0, -d / 2 + 0.28, -8, pillow(-0.15, -0.09, 0.3, 0.18, S(p, 'accent'), p)),
  },
  table_basse: {
    label: 'Table basse', category: 'sejour', w: 1.1, d: 0.6,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, L(p, 'wood'), stroke(p), 0.04, 0.006, T(p, 'bois')) +
      rect(-w * 0.32, -d * 0.18, w * 0.22, d * 0.32, S(p, 'white'), stroke(p), 0.01, 0.004) +
      line(-w * 0.3, -d * 0.1, -w * 0.12, -d * 0.1, 'rgba(0,0,0,0.25)', 0.004) +
      g(w * 0.22, 0, 0, plant(0.24, 0.24, p)),
  },
  meuble_tv: {
    label: 'Meuble TV', category: 'sejour', w: 1.6, d: 0.45,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, L(p, 'woodDark'), stroke(p), 0.02, 0.006, T(p, 'bois')) +
      rect(-w * 0.36, -d / 2 + 0.03, w * 0.72, 0.07, p.flat ? '#222' : 'url(#tv-screen)', 'none', 0.01) +
      rect(-0.1, -d / 2 + 0.1, 0.2, 0.08, '#1d1d1d', 'none', 0.01) +
      circle(w * 0.38, d * 0.1, 0.06, S(p, 'stone'), stroke(p), 0.004),
  },
  tapis: {
    label: 'Tapis', category: 'sejour', w: 2.0, d: 1.4, under: true,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, S(p, 'rug'), 'none', 0.02, 0, T(p, 'tissu')) +
      rect(-w / 2 + 0.08, -d / 2 + 0.08, w - 0.16, d - 0.16, 'none', shade(p.rug, -0.2), 0.01, 0.018) +
      rect(-w / 2 + 0.14, -d / 2 + 0.14, w - 0.28, d - 0.28, 'none', shade(p.rug, -0.12), 0.01, 0.006),
  },
  table_4: {
    label: 'Table 4 places', category: 'sejour', w: 1.3, d: 1.7,
    draw: (w, d, p) => {
      const tw = w - 0.1, td = d - 0.9;
      let s = chair(-tw / 4, -td / 2 - 0.16, 0.44, 0, p) + chair(tw / 4, -td / 2 - 0.16, 0.44, 0, p) + chair(-tw / 4, td / 2 + 0.16, 0.44, 180, p) + chair(tw / 4, td / 2 + 0.16, 0.44, 180, p);
      s += rect(-tw / 2, -td / 2, tw, td, L(p, 'wood'), stroke(p), 0.03, 0.006, T(p, 'bois'));
      for (const [x, y] of [[-tw / 4, -td / 2 + 0.17], [tw / 4, -td / 2 + 0.17], [-tw / 4, td / 2 - 0.17], [tw / 4, td / 2 - 0.17]]) s += circle(x, y, 0.11, S(p, 'white'), stroke(p), 0.004) + circle(x, y, 0.07, 'none', 'rgba(0,0,0,0.1)', 0.004);
      return s + g(0, 0, 0, plant(0.22, 0.22, p));
    },
  },
  table_6: {
    label: 'Table 6 places', category: 'sejour', w: 1.9, d: 1.75,
    draw: (w, d, p) => {
      const tw = w - 0.1, td = d - 0.85;
      let s = '';
      for (const x of [-tw / 3, 0, tw / 3]) s += chair(x, -td / 2 - 0.16, 0.44, 0, p) + chair(x, td / 2 + 0.16, 0.44, 180, p);
      s += rect(-tw / 2, -td / 2, tw, td, L(p, 'wood'), stroke(p), 0.03, 0.006, T(p, 'bois'));
      for (const x of [-tw / 3, 0, tw / 3]) for (const y of [-td / 2 + 0.17, td / 2 - 0.17]) s += circle(x, y, 0.11, S(p, 'white'), stroke(p), 0.004) + circle(x, y, 0.07, 'none', 'rgba(0,0,0,0.1)', 0.004);
      return s + g(0, 0, 0, plant(0.24, 0.24, p));
    },
  },
  cuisine_lineaire: {
    label: 'Plan de travail (évier, cuisson)', category: 'cuisine', w: 2.4, d: 0.6,
    draw: (w, d, p) => {
      let s = rect(-w / 2, -d / 2, w, d, L(p, 'stone'), stroke(p), 0.01, 0.008, T(p, 'pierre'));
      s += rect(-w / 2, -d / 2, w, 0.035, L(p, 'woodDark'));
      // Évier inox double bac et robinet.
      const sx = -w / 2 + Math.min(0.55, w * 0.25);
      s += rect(sx - 0.4, -d / 2 + 0.09, 0.8, 0.42, L(p, 'metal'), 'rgba(0,0,0,0.35)', 0.04, 0.006);
      s += rect(sx - 0.37, -d / 2 + 0.12, 0.35, 0.36, S(p, 'metal'), 'rgba(0,0,0,0.3)', 0.04, 0.005) + rect(sx + 0.02, -d / 2 + 0.12, 0.35, 0.36, S(p, 'metal'), 'rgba(0,0,0,0.3)', 0.04, 0.005);
      s += circle(sx - 0.19, -d / 2 + 0.3, 0.02, '#555') + circle(sx + 0.2, -d / 2 + 0.3, 0.02, '#555');
      s += circle(sx, -d / 2 + 0.065, 0.025, L(p, 'metal'), 'rgba(0,0,0,0.4)', 0.004) + line(sx, -d / 2 + 0.065, sx, -d / 2 + 0.2, '#9aa0a6', 0.018, 'stroke-linecap="round"');
      // Plaque vitrocéramique 4 foyers.
      const hx = w / 2 - Math.min(0.55, w * 0.25);
      s += rect(hx - 0.3, -d / 2 + 0.07, 0.6, 0.48, p.flat ? '#2b2b2b' : 'url(#hob)', 'rgba(0,0,0,0.6)', 0.02, 0.006);
      for (const [x, y, r] of [[-0.14, -0.11, 0.09], [0.14, -0.11, 0.07], [-0.14, 0.11, 0.07], [0.14, 0.11, 0.09]]) s += circle(hx + x, y + 0.01, r, 'none', 'rgba(255,255,255,0.35)', 0.006) + circle(hx + x, y + 0.01, r * 0.6, 'none', 'rgba(255,255,255,0.15)', 0.004);
      // Planche à découper.
      if (w > 1.8) s += rect(-0.15, -d / 2 + 0.15, 0.3, 0.22, L(p, 'wood'), stroke(p), 0.02, 0.004, T(p, 'bois'));
      return s;
    },
  },
  ilot: {
    label: 'Îlot central', category: 'cuisine', w: 1.6, d: 0.9,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, L(p, 'stone'), stroke(p), 0.02, 0.008, T(p, 'pierre')) +
      rect(-w / 2 + 0.05, -d / 2 + 0.05, w - 0.1, d - 0.1, 'none', 'rgba(0,0,0,0.08)', 0.01, 0.006) +
      circle(-w * 0.25, 0, 0.12, S(p, 'white'), stroke(p), 0.004) + g(w * 0.25, 0, 0, plant(0.22, 0.22, p)),
  },
  refrigerateur: {
    label: 'Réfrigérateur', category: 'cuisine', w: 0.7, d: 0.7,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, L(p, 'metal'), 'rgba(0,0,0,0.4)', 0.03, 0.008) +
      rect(-w / 2 + 0.04, -d / 2 + 0.04, w - 0.08, d - 0.12, S(p, 'metal'), 'none', 0.02) +
      line(-w / 2 + 0.06, d / 2 - 0.05, w / 2 - 0.06, d / 2 - 0.05, '#7c8288', 0.018, 'stroke-linecap="round"'),
  },
  lave_linge: {
    label: 'Lave-linge', category: 'cuisine', w: 0.6, d: 0.6,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, S(p, 'white'), stroke(p), 0.03, 0.008) +
      circle(0, 0.03, Math.min(w, d) * 0.3, L(p, 'metal'), 'rgba(0,0,0,0.35)', 0.008) + circle(0, 0.03, Math.min(w, d) * 0.22, S(p, 'glass'), 'rgba(0,0,0,0.25)', 0.005),
  },
  wc: {
    label: 'WC', category: 'sanitaire', w: 0.4, d: 0.65,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, 0.19, S(p, 'white'), stroke(p), 0.04, 0.006) +
      rect(-0.04, -d / 2 + 0.06, 0.08, 0.05, L(p, 'metal'), 'none', 0.015) +
      ellipse(0, -d / 2 + 0.19 + (d - 0.19) / 2, w * 0.46, (d - 0.19) / 2, S(p, 'white'), stroke(p), 0.006) +
      ellipse(0, -d / 2 + 0.21 + (d - 0.19) / 2, w * 0.3, (d - 0.19) * 0.32, S(p, 'glass'), 'rgba(0,0,0,0.2)', 0.005),
  },
  lavabo: {
    label: 'Lavabo', category: 'sanitaire', w: 0.6, d: 0.45,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, L(p, 'stone'), stroke(p), 0.04, 0.006, T(p, 'pierre')) +
      ellipse(0, 0.03, w * 0.33, d * 0.31, S(p, 'white'), 'rgba(0,0,0,0.25)', 0.006) + circle(0, 0.05, 0.015, '#777') +
      line(0, -d / 2 + 0.05, 0, -d / 2 + 0.14, '#9aa0a6', 0.02, 'stroke-linecap="round"'),
  },
  douche: { label: 'Douche', category: 'sanitaire', w: 0.9, d: 0.9, draw: shower },
  baignoire: {
    label: 'Baignoire', category: 'sanitaire', w: 1.7, d: 0.75,
    draw: (w, d, p) => rect(-w / 2, -d / 2, w, d, S(p, 'white'), stroke(p), 0.07, 0.008) +
      rect(-w / 2 + 0.08, -d / 2 + 0.08, w - 0.16, d - 0.16, S(p, 'glass'), 'rgba(0,0,0,0.2)', 0.28, 0.006) +
      circle(-w / 2 + 0.24, 0, 0.025, '#777') + line(-w / 2 + 0.04, 0, -w / 2 + 0.12, 0, '#9aa0a6', 0.022, 'stroke-linecap="round"'),
  },
  bureau: {
    label: 'Bureau et chaise', category: 'bureau', w: 1.4, d: 1.2,
    draw: (w, d, p) => g(0, d / 2 - 0.3, 180, rect(-0.27, -0.27, 0.54, 0.54, S(p, 'fabricDark'), stroke(p), 0.2, 0.006) + rect(-0.22, -0.27, 0.44, 0.12, S(p, 'fabric'), 'none', 0.06)) +
      rect(-w / 2, -d / 2, w, 0.7, L(p, 'wood'), stroke(p), 0.02, 0.006, T(p, 'bois')) +
      rect(-0.28, -d / 2 + 0.06, 0.56, 0.05, '#1b1b1b', 'none', 0.01) + rect(-0.22, -d / 2 + 0.3, 0.44, 0.14, '#cfd3d6', stroke(p), 0.01, 0.004) +
      circle(w / 2 - 0.2, -d / 2 + 0.18, 0.06, S(p, 'accent'), stroke(p), 0.004),
  },
  chaise: { label: 'Chaise', category: 'bureau', w: 0.45, d: 0.45, draw: (w, _d, p) => chair(0, 0, w, 0, p) },
  voiture: { label: 'Voiture', category: 'exterieur', w: 1.8, d: 4.4, draw: car },
  plante: { label: 'Plante', category: 'exterieur', w: 0.6, d: 0.6, draw: plant },
  arbre: { label: 'Arbre', category: 'exterieur', w: 2.4, d: 2.4, draw: tree },
  salon_jardin: {
    label: 'Salon de jardin', category: 'exterieur', w: 1.8, d: 1.8,
    draw: (_w, _d, p) => chair(0, -0.68, 0.48, 0, p) + chair(0, 0.68, 0.48, 180, p) + chair(-0.68, 0, 0.48, 270, p) + chair(0.68, 0, 0.48, 90, p) +
      circle(0, 0, 0.45, L(p, 'wood'), stroke(p), 0.008, T(p, 'bois')) + g(0, 0, 0, plant(0.24, 0.24, p)),
  },
  escalier: {
    label: 'Escalier droit', category: 'structure', w: 1.0, d: 3.2,
    draw: (w, d, p) => {
      const steps = Math.max(3, Math.round(d / 0.27));
      let s = rect(-w / 2, -d / 2, w, d, L(p, 'wood'), stroke(p), 0, 0.012, T(p, 'bois'));
      for (let i = 1; i < steps; i++) {
        const y = -d / 2 + (i * d) / steps;
        s += line(-w / 2, y, w / 2, y, 'rgba(0,0,0,0.45)', 0.01) + (p.flat ? '' : line(-w / 2, y + 0.012, w / 2, y + 0.012, 'rgba(255,255,255,0.25)', 0.008));
      }
      s += line(0, d / 2 - 0.15, 0, -d / 2 + 0.25, p.line, 0.012) + path(`M ${f(-0.08)} ${f(-d / 2 + 0.35)} L 0 ${f(-d / 2 + 0.2)} L ${f(0.08)} ${f(-d / 2 + 0.35)}`, 'none', p.line, 0.012);
      return s;
    },
  },
};

/** Dégradés spéciaux (verre de voiture, écran, plaque de cuisson). */
export function specialDefs(): string {
  return `<linearGradient id="car-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fa3b3"/><stop offset="0.35" stop-color="#4a5d6c"/><stop offset="0.5" stop-color="#7d93a4"/><stop offset="0.65" stop-color="#3d4f5d"/><stop offset="1" stop-color="#2a3742"/></linearGradient>` +
    `<linearGradient id="tv-screen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#111"/><stop offset="0.5" stop-color="#333"/><stop offset="1" stop-color="#0d0d0d"/></linearGradient>` +
    `<linearGradient id="hob" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3d40"/><stop offset="0.5" stop-color="#1c1e20"/><stop offset="1" stop-color="#2a2c2e"/></linearGradient>`;
}

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
