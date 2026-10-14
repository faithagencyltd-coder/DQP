// Détection d'une pièce par un clic (aide au dessin, §10 et §12) : la zone fermée autour du
// point cliqué est remplie sur une grille fine, puis son contour est simplifié en polygone.
// Les obstacles sont les murs tracés et, si demandé, les traits sombres du fichier importé.
// Le résultat est une proposition : l'utilisateur la voit, la nomme et peut la corriger.

import { bboxOf, type PlanModel, type Pt, segDistance } from './model';

export interface Grid {
  /** Coin haut-gauche de la grille (m). */
  minX: number;
  minY: number;
  /** Taille d'une cellule (m). */
  res: number;
  w: number;
  h: number;
}

export function gridFor(minX: number, minY: number, maxX: number, maxY: number, res: number, maxCells = 4_000_000): Grid {
  let r = res;
  while (((maxX - minX) / r) * ((maxY - minY) / r) > maxCells) r *= 1.5;
  return { minX, minY, res: r, w: Math.max(1, Math.ceil((maxX - minX) / r)), h: Math.max(1, Math.ceil((maxY - minY) / r)) };
}

/** Murs dessinés en obstacles (les ouvertures sont considérées fermées pour isoler la pièce). */
export function rasterizeWalls(m: PlanModel, g: Grid, out = new Uint8Array(g.w * g.h)): Uint8Array {
  for (const wall of m.walls) {
    // Demi-épaisseur exacte (au moins une cellule pour qu'un mur fin ne laisse pas fuir).
    const half = Math.max(wall.thickness / 2, g.res * 0.75);
    const b = bboxOf([wall.a, wall.b]);
    const x0 = Math.max(0, Math.floor((b.minX - half - g.minX) / g.res));
    const x1 = Math.min(g.w - 1, Math.ceil((b.maxX + half - g.minX) / g.res));
    const y0 = Math.max(0, Math.floor((b.minY - half - g.minY) / g.res));
    const y1 = Math.min(g.h - 1, Math.ceil((b.maxY + half - g.minY) / g.res));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c: Pt = [g.minX + (x + 0.5) * g.res, g.minY + (y + 0.5) * g.res];
        if (segDistance(c, wall.a, wall.b) <= half) out[y * g.w + x] = 1;
      }
    }
  }
  return out;
}

/** Pixels sombres d'une image (RGBA déjà rééchantillonnée sur la grille) en obstacles. */
export function darkPixels(rgba: Uint8ClampedArray | Uint8Array, g: Grid, threshold = 140, out = new Uint8Array(g.w * g.h)): Uint8Array {
  for (let i = 0; i < g.w * g.h; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 40) continue;
    const lum = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    if (lum < threshold) out[i] = 1;
  }
  return out;
}

/** Épaissit les obstacles d'une cellule (referme les petits trous des traits scannés). */
export function dilate(src: Uint8Array, g: Grid, radius = 1): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!src[y * g.w + x]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= g.h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < g.w) out[yy * g.w + xx] = 1;
        }
      }
    }
  }
  return out;
}

export interface FillResult {
  mask: Uint8Array;
  count: number;
  /** La zone touche le bord : elle n'est pas fermée. */
  open: boolean;
}

export function floodFill(barrier: Uint8Array, g: Grid, sx: number, sy: number): FillResult {
  const mask = new Uint8Array(g.w * g.h);
  if (sx < 0 || sy < 0 || sx >= g.w || sy >= g.h || barrier[sy * g.w + sx]) return { mask, count: 0, open: false };
  const stack = new Int32Array(g.w * g.h);
  let top = 0;
  stack[top++] = sy * g.w + sx;
  mask[sy * g.w + sx] = 1;
  let count = 0;
  let open = false;
  while (top > 0) {
    const i = stack[--top];
    count++;
    const x = i % g.w, y = (i - x) / g.w;
    if (x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1) open = true;
    const nb = [x > 0 ? i - 1 : -1, x < g.w - 1 ? i + 1 : -1, y > 0 ? i - g.w : -1, y < g.h - 1 ? i + g.w : -1];
    for (const j of nb) {
      if (j >= 0 && !mask[j] && !barrier[j]) {
        mask[j] = 1;
        stack[top++] = j;
      }
    }
  }
  return { mask, count, open };
}

/**
 * Contour extérieur d'une zone remplie : arêtes entre cellules pleines et vides, chaînées en
 * boucles ; on garde la plus grande (les îlots intérieurs, textes ou mobilier, sont ignorés).
 * Sommets en coordonnées de grille (coins des cellules).
 */
export function outerContour(mask: Uint8Array, g: Grid): Pt[] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h && mask[y * g.w + x] === 1;
  // Arêtes orientées (zone à droite… sens horaire à l'écran), indexées par leur origine.
  const next = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (g.w + 1) + x;
  const push = (x1: number, y1: number, x2: number, y2: number) => {
    const k = key(x1, y1);
    const l = next.get(k);
    const v = key(x2, y2);
    if (l) l.push(v); else next.set(k, [v]);
  };
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) push(x, y, x + 1, y);
      if (!at(x + 1, y)) push(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) push(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) push(x, y + 1, x, y);
    }
  }
  const W = g.w + 1;
  const loops: Pt[][] = [];
  for (const start of [...next.keys()]) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const loop: Pt[] = [];
      let cur = start;
      let prevDir: Pt | null = null;
      for (let guard = 0; guard < 4 * g.w * g.h + 8; guard++) {
        const outs = next.get(cur);
        if (!outs || outs.length === 0) break;
        const cx = cur % W, cy = (cur - cx) / W;
        // Aux sommets ambigus (deux arêtes sortantes), tourner à droite garde les cellules
        // reliées par un coin dans des boucles distinctes.
        let idx = 0;
        if (outs.length > 1 && prevDir) {
          const right: Pt = [-prevDir[1], prevDir[0]];
          const j = outs.findIndex((v) => {
            const vx = v % W, vy = (v - vx) / W;
            return vx - cx === right[0] && vy - cy === right[1];
          });
          if (j >= 0) idx = j;
        }
        const nxt = outs.splice(idx, 1)[0];
        loop.push([cx, cy]);
        const nx = nxt % W, ny = (nxt - nx) / W;
        prevDir = [nx - cx, ny - cy];
        cur = nxt;
        if (cur === start) break;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  let best: Pt[] = [];
  let bestA = 0;
  for (const l of loops) {
    let a = 0;
    for (let i = 0; i < l.length; i++) a += l[i][0] * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * l[i][1];
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = l; }
  }
  return removeCollinear(best);
}

function removeCollinear(p: Pt[]): Pt[] {
  if (p.length < 4) return p;
  const out: Pt[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > 1e-9) out.push(b);
  }
  return out;
}

/** Simplification de Douglas-Peucker sur un polygone fermé. */
export function simplifyPolygon(p: Pt[], tol: number): Pt[] {
  if (p.length <= 4) return p;
  // Point de départ : le sommet le plus éloigné du premier, pour couper la boucle en deux.
  let far = 0, fd = -1;
  for (let i = 1; i < p.length; i++) {
    const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const dp = (pts: Pt[]): Pt[] => {
    if (pts.length <= 2) return pts;
    let idx = -1, md = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = segDistance(pts[i], pts[0], pts[pts.length - 1]);
      if (d > md) { md = d; idx = i; }
    }
    if (md <= tol) return [pts[0], pts[pts.length - 1]];
    const l = dp(pts.slice(0, idx + 1));
    const r = dp(pts.slice(idx));
    return [...l.slice(0, -1), ...r];
  };
  const a = dp(p.slice(0, far + 1));
  const b = dp([...p.slice(far), p[0]]);
  return removeCollinear([...a.slice(0, -1), ...b.slice(0, -1)]);
}

/** Redresse les arêtes presque horizontales ou verticales (écart < tolérance en degrés). */
export function orthogonalize(p: Pt[], tolDeg = 4): Pt[] {
  const out = p.map((q) => [q[0], q[1]] as Pt);
  const tol = Math.tan((tolDeg * Math.PI) / 180);
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dy) <= Math.abs(dx) * tol) {
      const y = (a[1] + b[1]) / 2;
      a[1] = y; b[1] = y;
    } else if (Math.abs(dx) <= Math.abs(dy) * tol) {
      const x = (a[0] + b[0]) / 2;
      a[0] = x; b[0] = x;
    }
  }
  return removeCollinear(out);
}

export interface DetectResult {
  ok: boolean;
  points: Pt[];
  message: string;
}

/**
 * Détecte la pièce contenant le point `at` (m) à partir d'une grille d'obstacles.
 * Refuse une zone ouverte (qui touche le bord) ou minuscule.
 */
export function detectRoom(barrier: Uint8Array, g: Grid, at: Pt): DetectResult {
  const sx = Math.floor((at[0] - g.minX) / g.res), sy = Math.floor((at[1] - g.minY) / g.res);
  if (sx < 0 || sy < 0 || sx >= g.w || sy >= g.h) return { ok: false, points: [], message: 'Cliquez à l’intérieur du plan.' };
  if (barrier[sy * g.w + sx]) return { ok: false, points: [], message: 'Le point cliqué est sur un mur ou un trait : cliquez au milieu de la pièce.' };
  const fill = floodFill(barrier, g, sx, sy);
  if (fill.open) return { ok: false, points: [], message: 'Cette zone n’est pas fermée (un mur manque ou une ouverture laisse passer) : complétez les murs ou dessinez la pièce point par point.' };
  if (fill.count * g.res * g.res < 0.5) return { ok: false, points: [], message: 'Zone trop petite pour être une pièce.' };
  const contour = outerContour(fill.mask, g);
  const simplified = orthogonalize(simplifyPolygon(contour, 1.5));
  const points = simplified.map(([x, y]) => [round3(g.minX + x * g.res), round3(g.minY + y * g.res)] as Pt);
  if (points.length < 3) return { ok: false, points: [], message: 'Contour introuvable.' };
  return { ok: true, points, message: '' };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Recale les arêtes horizontales et verticales d'un contour détecté sur la face du mur dessiné
 * la plus proche (à moins de `tol` m) : la surface devient celle des murs, pas celle de la grille.
 */
export function snapToWallFaces(points: Pt[], m: PlanModel, tol: number): Pt[] {
  const out = points.map((p) => [p[0], p[1]] as Pt);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const a = out[i], b = out[(i + 1) % n];
    const horizontal = Math.abs(a[1] - b[1]) < 1e-9, vertical = Math.abs(a[0] - b[0]) < 1e-9;
    if (!horizontal && !vertical) continue;
    let best: number | null = null, bestD = tol;
    for (const w of m.walls) {
      const wh = Math.abs(w.a[1] - w.b[1]) < 1e-6, wv = Math.abs(w.a[0] - w.b[0]) < 1e-6;
      if (horizontal && wh) {
        const lo = Math.min(w.a[0], w.b[0]) - w.thickness, hi = Math.max(w.a[0], w.b[0]) + w.thickness;
        if (Math.max(a[0], b[0]) < lo || Math.min(a[0], b[0]) > hi) continue;
        for (const f of [w.a[1] - w.thickness / 2, w.a[1] + w.thickness / 2]) {
          const d = Math.abs(f - a[1]);
          if (d < bestD) { bestD = d; best = f; }
        }
      } else if (vertical && wv) {
        const lo = Math.min(w.a[1], w.b[1]) - w.thickness, hi = Math.max(w.a[1], w.b[1]) + w.thickness;
        if (Math.max(a[1], b[1]) < lo || Math.min(a[1], b[1]) > hi) continue;
        for (const f of [w.a[0] - w.thickness / 2, w.a[0] + w.thickness / 2]) {
          const d = Math.abs(f - a[0]);
          if (d < bestD) { bestD = d; best = f; }
        }
      }
    }
    if (best === null) continue;
    if (horizontal) { a[1] = best; b[1] = best; } else { a[0] = best; b[0] = best; }
  }
  return out.map(([x, y]) => [round3(x), round3(y)] as Pt);
}
