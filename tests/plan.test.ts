import { describe, expect, it } from 'vitest';
import { computeMetre } from '../src/engine/metre';
import { detectRoom, gridFor, rasterizeWalls, snapToWallFaces } from '../src/engine/plan/detect';
import { autoFurnish, FURNITURE } from '../src/engine/plan/furniture';
import { planToDxf, planToMetreLines } from '../src/engine/plan/exports';
import {
  bboxOf, calibrate, dist, emptyPlan, itemCorners, normalizePlan, type PlanModel, pointInPolygon, polygonArea, type Pt, type Wall,
} from '../src/engine/plan/model';
import { aiCanvasFor, renderOverlaySvg, renderPlanSvg } from '../src/engine/plan/render';

const wall = (id: string, a: Pt, b: Pt, thickness = 0.2): Wall => ({ id, a, b, thickness, kind: thickness < 0.15 ? 'cloison' : 'mur' });

/** Maison 10 m × 8 m (axes), cloison à x = 5 avec une porte. */
function house(): PlanModel {
  const m = emptyPlan();
  m.walls = [
    wall('n', [0, 0], [10, 0]), wall('e', [10, 0], [10, 8]), wall('s', [10, 8], [0, 8]), wall('o', [0, 8], [0, 0]),
    wall('c', [5, 0], [5, 8], 0.1),
  ];
  m.openings = [{ id: 'p1', wallId: 'c', pos: 4, width: 0.9, height: 2.1, kind: 'porte', side: 1, flip: false }];
  return m;
}

function detect(m: PlanModel, at: Pt) {
  const g = gridFor(-1, -1, 11, 9, 0.02);
  const r = detectRoom(rasterizeWalls(m, g), g, at);
  return { ...r, points: r.ok ? snapToWallFaces(r.points, m, 0.05) : [] };
}

describe('plans : géométrie et calibration', () => {
  it('surface d’un polygone et calibration sans modifier les tailles réelles', () => {
    expect(polygonArea([[0, 0], [4, 0], [4, 3], [0, 3]])).toBe(12);
    const m = house();
    m.items = [{ id: 'i', type: 'lit_double', x: 2, y: 2, w: 1.6, d: 2, rot: 0 }];
    // Le dessin a été fait à une échelle fausse : 10 « m » mesurés valent en réalité 12,5 m.
    const c = calibrate(m, [0, 0], [10, 0], 12.5);
    expect(dist(c.walls[0].a, c.walls[0].b)).toBeCloseTo(12.5, 9);
    expect(c.walls[0].thickness).toBe(0.2);
    expect(c.items[0]).toMatchObject({ x: 2.5, y: 2.5, w: 1.6, d: 2 });
    expect(c.openings[0].pos).toBeCloseTo(5, 9);
    expect(c.scaleVerified).toBe(true);
    expect(() => calibrate(m, [1, 1], [1, 1], 3)).toThrow(/deux points distincts/);
  });

  it('relecture robuste : un fond importé non calibré n’a pas d’échelle vérifiée', () => {
    const m = normalizePlan({ walls: [{ a: [0, 0], b: [0, 0] }, { a: [0, 0], b: [3, 0] }], background: { widthPx: 1000, heightPx: 800, mpp: 0.01 }, scaleVerified: true });
    expect(m.walls).toHaveLength(1);
    expect(m.scaleVerified).toBe(false);
    expect(normalizePlan({ walls: [] }).scaleVerified).toBe(true);
  });
});

describe('plans : détection d’une pièce par un clic', () => {
  it('retrouve la pièce exacte entre les faces intérieures des murs', () => {
    const r = detect(house(), [2, 4]);
    expect(r.ok).toBe(true);
    const b = bboxOf(r.points);
    expect(b).toEqual({ minX: 0.1, minY: 0.1, maxX: 4.95, maxY: 7.9 });
    expect(polygonArea(r.points)).toBeCloseTo(4.85 * 7.8, 6);
  });

  it('suit une pièce en L', () => {
    const m = house();
    m.walls.push(wall('l1', [5, 5], [8, 5], 0.1), wall('l2', [8, 5], [8, 8], 0.1));
    const r = detect(m, [6, 2]);
    expect(r.ok).toBe(true);
    expect(r.points).toHaveLength(6);
    expect(polygonArea(r.points)).toBeCloseTo(4.85 * 7.8 - 3.0 * 2.95, 6) // retrait jusqu'aux faces extérieures des cloisons;
  });

  it('refuse une zone ouverte et un clic sur un mur', () => {
    const m = house();
    m.walls = m.walls.filter((w) => w.id !== 'o');
    expect(detect(m, [2, 4]).message).toMatch(/pas fermée/);
    expect(detect(house(), [5, 4]).message).toMatch(/sur un mur/);
  });
});

describe('plans : aménagement proposé', () => {
  it('meuble une chambre sans déborder ni bloquer la porte', () => {
    const m = house();
    const room = { id: 'r', name: 'Chambre 1', kind: 'chambre' as const, points: detect(m, [2, 4]).points };
    m.rooms = [room];
    const items = autoFurnish(m, room);
    expect(items.map((i) => i.type)).toContain('lit_double');
    expect(items.map((i) => i.type)).toContain('armoire');
    for (const i of items) for (const c of itemCorners(i)) expect(pointInPolygon(c, room.points)).toBe(true);
    // Débattement de la porte (x ≈ 5, y 3,55 → 4,45) laissé libre.
    for (const i of items) {
      const b = bboxOf(itemCorners(i));
      expect(b.maxX > 4.0 && b.minY < 4.45 && b.maxY > 3.55).toBe(false);
    }
  });

  it('chaque type de meuble a une taille et un dessin', () => {
    for (const [k, d] of Object.entries(FURNITURE)) {
      expect(d.w, k).toBeGreaterThan(0);
      expect(d.draw(d.w, d.d, { wood: 'a', woodDark: 'a', fabric: 'a', fabricDark: 'a', cushion: 'a', linen: 'a', white: 'a', metal: 'a', plant: 'a', plantDark: 'a', glass: 'a', line: 'a', car: 'a', rug: 'a' })).toMatch(/^</);
    }
  });
});

describe('plans : rendu fidèle', () => {
  const m = house();
  m.rooms = [
    { id: 'r1', name: 'Séjour', kind: 'sejour', points: detect(m, [2, 4]).points },
    { id: 'r2', name: 'Chambre', kind: 'chambre', points: detect(m, [7, 4]).points },
  ];

  it('affiche les noms, surfaces et cotes calculés depuis le dessin', () => {
    const r = renderPlanSvg(m, { style: 'moderne', title: { planName: 'RDC', company: 'BTP Awa' } });
    expect(r.svg).toContain('>Séjour<');
    expect(r.svg).toContain('37,83 m²');
    expect(r.svg).toContain('>500<'); // entraxe des murs
    expect(r.svg).toContain('>1020<'); // hors tout, faces extérieures
    expect(r.svg).not.toContain('≈');
    expect(r.warnings).toHaveLength(0);
    expect(r.frame.width).toBe(2400);
  });

  it('signale une échelle non vérifiée sur le plan lui-même', () => {
    const u = { ...m, background: { kind: 'image' as const, widthPx: 100, heightPx: 100, mpp: 0.1, opacity: 0.5, visible: true }, scaleVerified: false };
    const r = renderPlanSvg(u, { title: { planName: 'RDC' } });
    expect(r.svg).toContain('≈ 37,83 m²');
    expect(r.svg).toContain('Échelle non vérifiée');
    expect(r.warnings[0]).toMatch(/Échelle non vérifiée/);
  });

  it('image d’entrée IA sans aucun texte, au format demandé, et surcouche exacte', () => {
    const size = aiCanvasFor(m);
    expect(size).toEqual({ width: 1536, height: 1024 });
    const r = renderPlanSvg(m, { forAI: size, style: 'luxe' });
    expect(r.svg).not.toContain('<text');
    expect(r.frame.width).toBe(1536);
    expect(r.frame.height).toBe(1024);
    const overlay = renderOverlaySvg(m, r.frame, { style: 'luxe' });
    expect(overlay).toContain('>Chambre<');
    expect(overlay).toContain('>1020<');
    expect(overlay).toContain(`viewBox="${r.svg.match(/viewBox="([^"]+)"/)![1]}"`);
  });
});

describe('plans : métré et DXF', () => {
  it('produit des lignes de métré vérifiables', () => {
    const m = house();
    m.rooms = [{ id: 'r1', name: 'Séjour', kind: 'sejour', points: detect(m, [2, 4]).points }];
    const lines = planToMetreLines(m, 'PLN-2026-0001');
    const sol = lines.find((l) => l.designation === 'Revêtement de sol')!;
    expect(computeMetre(sol).qty).toBe(37.83);
    const mur = lines.find((l) => l.location === 'Mur 5')!;
    expect(mur.openings).toEqual([{ label: 'Porte 90', width: 0.9, height: 2.1, count: 1 }]);
    expect(computeMetre(mur).qty).toBeNull(); // hauteur des murs non renseignée
    expect(computeMetre({ ...mur, H: 2.8 }).qty).toBe(20.51); // 8 × 2,8 − 0,9 × 2,1
    expect(() => planToMetreLines({ ...m, scaleVerified: false }, 'X')).toThrow(/Échelle non vérifiée/);
  });

  it('exporte un DXF lisible (calques, entités, fin de fichier)', () => {
    const dxf = planToDxf(house());
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('\nMURS\n');
    expect(dxf.match(/\nPOLYLINE\n/g)!.length).toBe(6); // 4 murs + cloison coupée par la porte
    expect(dxf.trim().endsWith('EOF')).toBe(true);
  });
});
