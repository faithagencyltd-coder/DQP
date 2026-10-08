import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, test } from 'vitest';
import { computeProject, findLine } from '../src/core/dqe';
import { analyzeFile, analyzePlanFile, applyImport, applyPlanImport } from '../src/core/import';
import { addMeasurement, calibrate, computeMeasure, deleteMeasurement, linkMeasureToLine, MM_PER_PT_PAPER, polygonArea, scaleConflict, scaleFor, updateMeasurement } from '../src/core/metre/measure';
import { pageSegments, snapPoints, wallCandidates } from '../src/core/pdf/vectors';
import { createProject } from '../src/core/project';
import { buildFixture } from './fixture';
import { buildPlanFixture } from './plan-fixture';

async function setup() {
  const x = await analyzeFile('DQE.xlsx', await buildFixture());
  const y = await analyzePlanFile('Plan.pdf', await buildPlanFixture(), pdfjs);
  let p = applyImport(createProject('Villa'), x.file, x.result, 'replace');
  p = applyPlanImport(p, y.file, y.plan);
  return { p, fileId: y.file.id };
}

describe('tracés vectoriels', () => {
  test('segments, épaisseurs et proposition de murs', async () => {
    const doc = await pdfjs.getDocument({ data: await buildPlanFixture() }).promise;
    const page = await doc.getPage(1);
    const segs = await pageSegments(page, pdfjs.OPS);
    // 8 murs tracés en trait de 4 pt, plus le cadre du cartouche en 1 pt.
    expect(segs.filter((s) => s.width >= 3.9)).toHaveLength(8);
    const top = segs.find((s) => Math.abs(s.y1 - 100) < 0.01 && Math.abs(s.y2 - 100) < 0.01)!;
    expect([top.x1, top.x2].sort((a, b) => a - b)).toEqual([100, 800]);
    const { walls, threshold } = wallCandidates(segs);
    expect(threshold).toBeGreaterThan(1);
    expect(walls).toHaveLength(8);
    const total = walls.reduce((t, s) => t + Math.hypot(s.x2 - s.x1, s.y2 - s.y1), 0);
    expect(total).toBeCloseTo(700 * 2 + 500 * 2 + 500 + 350 + 350 + 300, 0);
    expect(snapPoints(segs).length).toBeGreaterThan(8);
  });
});

describe('mesures sur plan', () => {
  test('sans échelle étalonnée : échelle lue (à vérifier) puis étalonnage (confirmé)', async () => {
    let { p, fileId } = await setup();
    const s1 = scaleFor(p, fileId, 1)!;
    expect(s1.status).toBe('to_verify');
    expect(s1.mmPerPt).toBeCloseTo(MM_PER_PT_PAPER * 100);
    // Étalonnage : 700 pt sur le plan = 24,69 m réels.
    p = calibrate(p, fileId, 1, [100, 100], [800, 100], 24.69);
    const s2 = scaleFor(p, fileId, 1)!;
    expect(s2.status).toBe('confirmed');
    expect(s2.mmPerPt).toBeCloseTo((24.69 * 1000) / 700);
    expect(scaleFor(p, fileId, 3)).toBeNull();
    expect(scaleConflict(p, fileId, 1)).toBeNull();
    // Étalonnage sur une mauvaise cote : contradiction avec l'échelle écrite signalée.
    p = calibrate(p, fileId, 1, [100, 100], [800, 100], 12);
    expect(scaleConflict(p, fileId, 1)).toEqual({ written: 100, calibrated: 49 });
    expect(scaleFor(p, fileId, 1)!.status).toBe('to_verify');
  });

  test('longueur, surface, comptage, et mur = longueur × hauteur − ouvertures', async () => {
    let { p, fileId } = await setup();
    // Échelle d'étalonnage arrondie (1 pt = 0,1 m) : l'échelle écrite est retirée pour ne pas la contredire.
    for (const a of p.analyses) for (const pg of a.pages ?? []) delete pg.scale;
    p = calibrate(p, fileId, 1, [0, 0], [100, 0], 10); // 1 pt = 0,1 m
    const base = { fileId, fileName: 'Plan.pdf', page: 1, deductions: [], origin: 'manual' as const };
    let r = addMeasurement(p, { ...base, kind: 'length', label: 'Plinthe', points: [[0, 0], [30, 0], [30, 40]] });
    p = r.project;
    expect(computeMeasure(p, p.measurements[0])).toMatchObject({ value: 7, unit: 'ml', status: 'confirmed' });
    r = addMeasurement(p, { ...base, kind: 'area', label: 'Séjour', points: [[0, 0], [50, 0], [50, 40], [0, 40]] });
    p = r.project;
    expect(computeMeasure(p, p.measurements[1]).value).toBeCloseTo(20);
    expect(polygonArea([[0, 0], [2, 0], [2, 2], [0, 2]])).toBe(4);
    r = addMeasurement(p, { ...base, kind: 'count', label: 'Prises', points: [[1, 1], [2, 2], [3, 3]] });
    p = r.project;
    expect(computeMeasure(p, p.measurements[2])).toMatchObject({ value: 3, unit: 'u' });
    // Mur 8,20 m × 3,00 m − porte 0,90 × 2,10 et fenêtre 1,20 × 1,20.
    r = addMeasurement(p, { ...base, kind: 'wall', label: 'Mur salon', points: [[0, 0], [82, 0]], height: null });
    p = r.project;
    const wallId = r.id;
    expect(computeMeasure(p, p.measurements[3])).toMatchObject({ value: null, status: 'undetermined' });
    p = updateMeasurement(p, wallId, { height: 3, deductions: [{ label: 'P1', width: 0.9, height: 2.1, count: 1 }, { label: 'F1', width: 1.2, height: 1.2, count: 1 }] });
    const w = computeMeasure(p, p.measurements[3]);
    expect(w.value).toBeCloseTo(24.6 - 1.89 - 1.44);
    expect(w.steps.join(' | ')).toMatch(/Surface brute = 8,2 × 3 = 24,6 m² \| Ouvertures déduites = 1 × 0,9 × 2,1 \+ 1 × 1,2 × 1,2 = 3,33 m² \| Surface nette = 24,6 − 3,33 = 21,27 m²/);
  });

  test('une ligne de DQE liée à une mesure suit ses corrections, avec traçabilité', async () => {
    let { p, fileId } = await setup();
    p = calibrate(p, fileId, 1, [0, 0], [100, 0], 10);
    const r = addMeasurement(p, { fileId, fileName: 'Plan.pdf', page: 1, deductions: [], origin: 'manual', kind: 'wall', label: 'Murs RDC', points: [[0, 0], [100, 0]], height: 3 });
    p = r.project;
    const murs = p.lots[0].sections[1].lines[0];
    const enduits = p.lots[0].sections[1].lines[2];
    p = linkMeasureToLine(p, murs.id, r.id);
    let c = computeProject(p);
    expect(c.lines.get(murs.id)!.quantity).toBeCloseTo(30);
    // La quantité liée (enduits = murs × 2,2) suit à son tour.
    expect(c.lines.get(enduits.id)!.quantity).toBeCloseTo(66);
    expect(c.lines.get(murs.id)!.steps.join(' ')).toMatch(/Mesure « Murs RDC » \(Plan\.pdf, page 1\)/);
    expect(findLine(p, murs.id)!.line.quantity.source).toMatchObject({ fileName: 'Plan.pdf', page: 1 });
    p = updateMeasurement(p, r.id, { height: 2.8 });
    c = computeProject(p);
    expect(c.lines.get(murs.id)!.quantity).toBeCloseTo(28);
    // Supprimer la mesure fige la ligne à sa dernière valeur, à vérifier.
    p = deleteMeasurement(p, r.id);
    const l = findLine(p, murs.id)!.line;
    expect(l.quantity).toMatchObject({ value: 28, status: 'to_verify' });
    expect(l.quantity.expression).toBeUndefined();
  });

  test('mesure sur une planche sans échelle : non déterminée', async () => {
    let { p, fileId } = await setup();
    const r = addMeasurement(p, { fileId, fileName: 'Plan.pdf', page: 3, deductions: [], origin: 'manual', kind: 'length', label: 'x', points: [[0, 0], [10, 0]] });
    p = r.project;
    expect(computeMeasure(p, p.measurements[0])).toMatchObject({ value: null, status: 'undetermined' });
  });
});
