// Tracés vectoriels d'une page PDF (§9 phase 3) : segments en coordonnées de page affichée
// (points, origine en haut à gauche) avec leur épaisseur de trait. Sert à l'aimantation
// des outils de mesure et à la proposition de murs. Aucune interprétation ici.

import type { PdfJsLib } from './extract';

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Épaisseur du trait en points de page (après transformation). */
  width: number;
}

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export interface OperatorList {
  fnArray: number[];
  argsArray: unknown[];
}

/**
 * Lit la liste d'opérations d'une page : chemins (moveTo, lineTo, rectangle, closePath),
 * transformations (cm, save/restore) et épaisseurs de trait. Les courbes sont ignorées.
 * `viewport` = matrice page → affichage à l'échelle 1.
 */
export function segmentsFromOperatorList(ol: OperatorList, OPS: PdfJsLib['OPS'], viewport: M, max = 40000): Segment[] {
  const out: Segment[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  let lineWidth = 1;
  const stack: { ctm: M; lineWidth: number }[] = [];
  let pending: [number, number, number, number][] = [];
  const O = OPS as unknown as Record<string, number>;

  const flush = (stroked: boolean) => {
    if (stroked) {
      const full = mul(viewport, ctm);
      const scale = Math.sqrt(Math.abs(full[0] * full[3] - full[1] * full[2])) || 1;
      for (const [x1, y1, x2, y2] of pending) {
        if (out.length >= max) break;
        const a = apply(full, x1, y1);
        const b = apply(full, x2, y2);
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) continue;
        out.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], width: Math.max(0.1, lineWidth * scale) });
      }
    }
    pending = [];
  };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i] as unknown[];
    switch (fn) {
      case O.save: stack.push({ ctm, lineWidth }); break;
      case O.restore: { const s = stack.pop(); if (s) { ctm = s.ctm; lineWidth = s.lineWidth; } break; }
      case O.transform: ctm = mul(ctm, args as unknown as M); break;
      case O.setLineWidth: lineWidth = (args[0] as number) || 1; break;
      case O.constructPath: {
        const ops = args[0] as number[];
        const coords = args[1] as number[];
        let k = 0;
        let cx = 0, cy = 0, sx = 0, sy = 0;
        for (const op of ops) {
          if (op === O.moveTo) { cx = sx = coords[k++]; cy = sy = coords[k++]; }
          else if (op === O.lineTo) { const x = coords[k++], y = coords[k++]; pending.push([cx, cy, x, y]); cx = x; cy = y; }
          else if (op === O.rectangle) {
            const x = coords[k++], y = coords[k++], w = coords[k++], h = coords[k++];
            pending.push([x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]);
            cx = sx = x; cy = sy = y;
          } else if (op === O.curveTo) { k += 6; cx = coords[k - 2]; cy = coords[k - 1]; }
          else if (op === O.curveTo2 || op === O.curveTo3) { k += 4; cx = coords[k - 2]; cy = coords[k - 1]; }
          else if (op === O.closePath) { if (cx !== sx || cy !== sy) pending.push([cx, cy, sx, sy]); cx = sx; cy = sy; }
        }
        break;
      }
      case O.stroke: case O.closeStroke: case O.fillStroke: case O.eoFillStroke: case O.closeFillStroke: case O.closeEOFillStroke:
        flush(true);
        break;
      case O.fill: case O.eoFill: case O.endPath:
        flush(false);
        break;
    }
  }
  return out;
}

/** Points d'accroche : extrémités des segments (dédoublonnées sur une grille de 0,5 pt). */
export function snapPoints(segments: Segment[]): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const s of segments)
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]] as [number, number][]) {
      const k = `${Math.round(x * 2)},${Math.round(y * 2)}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push([x, y]);
      }
    }
  return out;
}

/**
 * Proposition de murs : traits nettement plus épais que la moyenne de la page
 * (les murs sont dessinés en traits forts sur la plupart des plans d'architecte).
 * Retourne les segments retenus et le seuil d'épaisseur utilisé — à vérifier.
 */
export function wallCandidates(segments: Segment[]): { walls: Segment[]; threshold: number } {
  if (!segments.length) return { walls: [], threshold: 0 };
  const widths = segments.map((s) => s.width).sort((a, b) => a - b);
  // Référence « trait fin » : premier quartile des épaisseurs (cotes, hachures, textes…).
  const fine = widths[Math.floor(widths.length / 4)];
  const max = widths[widths.length - 1];
  // Seuil : au moins 2× le trait fin et au moins 60 % du trait le plus épais.
  const threshold = Math.max(fine * 2, max * 0.6);
  // Toutes les épaisseurs se ressemblent : impossible de distinguer les murs.
  if (max < fine * 2) return { walls: [], threshold };
  const walls = segments.filter((s) => s.width >= threshold && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 4);
  return { walls: mergeCollinear(walls), threshold };
}

/** Fusionne les segments colinéaires qui se recouvrent (évite de compter deux fois un mur). */
export function mergeCollinear(segs: Segment[]): Segment[] {
  const horiz: Segment[] = [];
  const vert: Segment[] = [];
  const other: Segment[] = [];
  for (const s of segs) {
    if (Math.abs(s.y1 - s.y2) < 0.5) horiz.push(s.x1 <= s.x2 ? s : { ...s, x1: s.x2, x2: s.x1 });
    else if (Math.abs(s.x1 - s.x2) < 0.5) vert.push(s.y1 <= s.y2 ? s : { ...s, y1: s.y2, y2: s.y1 });
    else other.push(s);
  }
  const merge = (list: Segment[], key: 'y1' | 'x1', a: 'x1' | 'y1', b: 'x2' | 'y2') => {
    const groups = new Map<number, Segment[]>();
    for (const s of list) {
      const k = Math.round(s[key] * 2) / 2;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(s);
    }
    const out: Segment[] = [];
    for (const g of groups.values()) {
      g.sort((p, q) => p[a] - q[a]);
      let cur = { ...g[0] };
      for (const s of g.slice(1)) {
        if (s[a] <= cur[b] + 0.5) {
          cur[b] = Math.max(cur[b], s[b]);
          cur.width = Math.max(cur.width, s.width);
        } else {
          out.push(cur);
          cur = { ...s };
        }
      }
      out.push(cur);
    }
    return out;
  };
  return [...merge(horiz, 'y1', 'x1', 'x2'), ...merge(vert, 'x1', 'y1', 'y2'), ...other];
}

export async function pageSegments(page: { getOperatorList(): Promise<OperatorList>; getViewport(o: { scale: number }): { transform: number[] } }, OPS: PdfJsLib['OPS']): Promise<Segment[]> {
  const ol = await page.getOperatorList();
  return segmentsFromOperatorList(ol, OPS, page.getViewport({ scale: 1 }).transform as M);
}
