// Sorties d'un plan : lignes de métré (§11.6) et fichier DXF (§10.6).
// Les quantités viennent du dessin ; une donnée absente (hauteur des murs, hauteur d'une
// ouverture) reste vide et la ligne de métré l'indique « à compléter ».

import { uid } from '../ids';
import type { MetreLine } from '../metre';
import { FURNITURE } from './furniture';
import {
  formatArea, itemCorners, OPENING_KINDS, openingCenter, type PlanModel, polygonArea, polygonPerimeter, type Pt, ROOM_KINDS,
  WALL_KINDS, wallDir, wallLength, wallNormal, wallSolidSpans, wallSpanPolygon, wallEndExtensions, add, mulp,
} from './model';

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function rectDims(points: Pt[]): { L: number; l: number } | null {
  if (points.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = points[i], b = points[(i + 1) % 4];
    if (Math.abs(a[0] - b[0]) > 1e-6 && Math.abs(a[1] - b[1]) > 1e-6) return null;
  }
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return { L: r3(Math.max(...xs) - Math.min(...xs)), l: r3(Math.max(...ys) - Math.min(...ys)) };
}

/**
 * Lignes de métré tirées du plan : sols et périmètres des pièces, surfaces nettes des murs.
 * Refusé tant que l'échelle n'est pas vérifiée (§9.4).
 */
export function planToMetreLines(m: PlanModel, planRef: string): MetreLine[] {
  if (!m.scaleVerified) throw new Error('Échelle non vérifiée : calibrez le plan avant d’en tirer des quantités.');
  const out: MetreLine[] = [];
  const src = (what: string) => `Plan ${planRef} — ${what}`;
  for (const r of m.rooms) {
    const rect = rectDims(r.points);
    const area = polygonArea(r.points);
    const per = polygonPerimeter(r.points);
    out.push(rect
      ? { id: uid('m'), ref: '', designation: 'Revêtement de sol', location: r.name, lot: '', formula: 'surface', L: rect.L, l: rect.l, H: null, N: 1, openings: [], unit: 'm²', origin: 'reconnu', source: src('pièce rectangulaire mesurée sur le dessin'), notes: '' }
      : { id: uid('m'), ref: '', designation: 'Revêtement de sol', location: r.name, lot: '', formula: 'forfait', qty: r3(area), L: null, l: null, H: null, N: null, openings: [], unit: 'm²', origin: 'reconnu', source: src(`surface du polygone de ${r.points.length} sommets = ${formatArea(area)}`), notes: '' });
    out.push(rect
      ? { id: uid('m'), ref: '', designation: 'Plinthes (périmètre de la pièce)', location: r.name, lot: '', formula: 'perimetre', L: rect.L, l: rect.l, H: null, N: 1, openings: [], unit: 'ml', origin: 'reconnu', source: src('périmètre de la pièce'), notes: 'Ouvertures non déduites' }
      : { id: uid('m'), ref: '', designation: 'Plinthes (périmètre de la pièce)', location: r.name, lot: '', formula: 'forfait', qty: r3(per), L: null, l: null, H: null, N: null, openings: [], unit: 'ml', origin: 'reconnu', source: src(`périmètre du polygone = ${r3(per)} m`), notes: 'Ouvertures non déduites' });
  }
  m.walls.forEach((w, i) => {
    const ops = m.openings.filter((o) => o.wallId === w.id);
    out.push({
      id: uid('m'), ref: '', designation: `${WALL_KINDS[w.kind].label} ép. ${Math.round(w.thickness * 100)} cm`, location: `Mur ${i + 1}`, lot: '',
      formula: 'mur', L: r3(wallLength(w)), l: null, H: m.wallHeight, N: 1,
      openings: ops.map((o) => ({ label: `${OPENING_KINDS[o.kind].label} ${Math.round(o.width * 100)}`, width: r3(o.width), height: o.height, count: 1 })),
      unit: 'm²', origin: 'reconnu', source: src('longueur d’axe du mur'), notes: m.wallHeight === null ? 'Hauteur à renseigner dans le plan ou ici' : '',
    });
  });
  return out;
}

// ------------------------------------------------------------------ DXF (AutoCAD R12, mètres)
function dxfNum(v: number) {
  return (Math.round(v * 10000) / 10000).toString();
}

/** Fichier DXF texte : calques MURS, OUVERTURES, PIECES, MOBILIER, COTES, TEXTES. Axe y inversé. */
export function planToDxf(m: PlanModel): string {
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), typeof v === 'number' ? dxfNum(v) : v);
  const Y = (y: number) => -y;
  const lineE = (layer: string, a: Pt, b: Pt) => {
    g(0, 'LINE'); g(8, layer); g(10, a[0]); g(20, Y(a[1])); g(30, 0); g(11, b[0]); g(21, Y(b[1])); g(31, 0);
  };
  const polyE = (layer: string, pts: Pt[], closed = true) => {
    g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, closed ? 1 : 0);
    for (const p of pts) { g(0, 'VERTEX'); g(8, layer); g(10, p[0]); g(20, Y(p[1])); g(30, 0); }
    g(0, 'SEQEND'); g(8, layer);
  };
  const textE = (layer: string, at: Pt, h: number, s: string, center = false) => {
    g(0, 'TEXT'); g(8, layer); g(10, at[0]); g(20, Y(at[1])); g(30, 0); g(40, h); g(1, s.replace(/\n/g, ' '));
    if (center) { g(72, 1); g(11, at[0]); g(21, Y(at[1])); g(31, 0); }
  };
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 6); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, 6);
  for (const [name, color] of [['MURS', 7], ['OUVERTURES', 4], ['PIECES', 3], ['MOBILIER', 8], ['COTES', 1], ['TEXTES', 5]] as [string, number][]) {
    g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const w of m.walls) {
    for (const [s, e] of wallSolidSpans(w, m.openings, wallEndExtensions(w, m.walls))) polyE('MURS', wallSpanPolygon(w, s, e));
  }
  for (const o of m.openings) {
    const w = m.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const d = wallDir(w), nr = wallNormal(w);
    const c = openingCenter(o, w);
    const p1 = add(c, mulp(d, -o.width / 2)), p2 = add(c, mulp(d, o.width / 2));
    if (OPENING_KINDS[o.kind].door && o.kind !== 'coulissante' && o.kind !== 'porte_garage') {
      const hinge = o.flip ? p2 : p1;
      const leafLen = o.kind === 'porte_double' ? o.width / 2 : o.width;
      const face = add(hinge, mulp(nr, (o.side * w.thickness) / 2));
      lineE('OUVERTURES', face, add(face, mulp(nr, o.side * leafLen)));
    } else {
      for (const k of [-0.25, 0.25]) lineE('OUVERTURES', add(p1, mulp(nr, w.thickness * k)), add(p2, mulp(nr, w.thickness * k)));
    }
  }
  for (const r of m.rooms) {
    polyE('PIECES', r.points);
    const cx = r.points.reduce((s, p) => s + p[0], 0) / r.points.length, cy = r.points.reduce((s, p) => s + p[1], 0) / r.points.length;
    textE('PIECES', [cx, cy], 0.2, r.name || ROOM_KINDS[r.kind], true);
    textE('PIECES', [cx, cy + 0.3], 0.15, formatArea(polygonArea(r.points)), true);
  }
  for (const i of m.items) {
    polyE('MOBILIER', itemCorners(i));
    textE('MOBILIER', [i.x, i.y], 0.1, FURNITURE[i.type]?.label ?? i.type, true);
  }
  for (const d of m.dims) {
    const len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
    const dir: Pt = [(d.b[0] - d.a[0]) / len, (d.b[1] - d.a[1]) / len];
    const nr: Pt = [dir[1], -dir[0]];
    const A = add(d.a, mulp(nr, d.offset)), B = add(d.b, mulp(nr, d.offset));
    lineE('COTES', d.a, A); lineE('COTES', d.b, B); lineE('COTES', A, B);
    textE('COTES', add(mulp(add(A, B), 0.5), mulp(nr, 0.1)), 0.15, m.dimUnit === 'cm' ? String(Math.round(len * 100)) : r3(len).toString(), true);
  }
  for (const t of m.notes) textE('TEXTES', t.at, t.size, t.text);
  g(0, 'ENDSEC'); g(0, 'EOF');
  return out.join('\n') + '\n';
}
