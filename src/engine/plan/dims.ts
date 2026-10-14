// Cotation automatique (§10.5) : chaînes de cotes calculées depuis la géométrie des murs,
// donc toujours cohérentes avec le dessin. Niveau 1 : entraxes des murs ; niveau 2 : hors tout.

import type { Box, PlanModel } from './model';

export type DimSide = 'haut' | 'bas' | 'gauche' | 'droite';
export interface DimChain {
  /** Façade le long de laquelle la chaîne est posée. */
  side: DimSide;
  /** 1 = entraxes des murs qui touchent la façade ; 2 = dimension hors tout. */
  level: number;
  /** Positions successives (m) le long de la façade (x pour haut/bas, y pour gauche/droite). */
  ticks: number[];
}

const ALIGN = 0.01;

/** Étendue des murs, faces extérieures comprises. */
export function wallsExtent(m: PlanModel): Box | null {
  if (!m.walls.length) return null;
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const w of m.walls) {
    const h = w.thickness / 2;
    b.minX = Math.min(b.minX, w.a[0] - h, w.b[0] - h);
    b.maxX = Math.max(b.maxX, w.a[0] + h, w.b[0] + h);
    b.minY = Math.min(b.minY, w.a[1] - h, w.b[1] - h);
    b.maxY = Math.max(b.maxY, w.a[1] + h, w.b[1] + h);
  }
  return b;
}

function dedupe(values: number[], tol = 0.03): number[] {
  const s = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

/**
 * Chaînes de cotes par façade : entraxes des murs perpendiculaires qui rejoignent la façade
 * (avec les murs d'angle), puis la dimension hors tout en haut et à gauche.
 */
export function autoDimChains(m: PlanModel): DimChain[] {
  const ext = wallsExtent(m);
  if (!ext) return [];
  const vertical = m.walls.filter((w) => Math.abs(w.a[0] - w.b[0]) <= ALIGN * Math.max(1, Math.abs(w.a[1] - w.b[1])));
  const horizontal = m.walls.filter((w) => Math.abs(w.a[1] - w.b[1]) <= ALIGN * Math.max(1, Math.abs(w.a[0] - w.b[0])));
  const reach = (v: number, edge: number, t: number) => Math.abs(v - edge) <= t + 0.05;
  const chains: DimChain[] = [];
  const sides: [DimSide, number[]][] = [
    ['haut', vertical.filter((w) => reach(Math.min(w.a[1], w.b[1]), ext.minY, w.thickness)).map((w) => (w.a[0] + w.b[0]) / 2)],
    ['bas', vertical.filter((w) => reach(Math.max(w.a[1], w.b[1]), ext.maxY, w.thickness)).map((w) => (w.a[0] + w.b[0]) / 2)],
    ['gauche', horizontal.filter((w) => reach(Math.min(w.a[0], w.b[0]), ext.minX, w.thickness)).map((w) => (w.a[1] + w.b[1]) / 2)],
    ['droite', horizontal.filter((w) => reach(Math.max(w.a[0], w.b[0]), ext.maxX, w.thickness)).map((w) => (w.a[1] + w.b[1]) / 2)],
  ];
  for (const [side, values] of sides) {
    const ticks = dedupe(values);
    if (ticks.length >= 2) chains.push({ side, level: 1, ticks });
  }
  chains.push({ side: 'haut', level: 2, ticks: [ext.minX, ext.maxX] });
  chains.push({ side: 'gauche', level: 2, ticks: [ext.minY, ext.maxY] });
  return chains;
}
