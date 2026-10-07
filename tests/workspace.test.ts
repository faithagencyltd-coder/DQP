import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, test } from 'vitest';
import { computeProject } from '../src/core/dqe';
import { pricesFromXlsx, pricesToXlsx } from '../src/core/export/prices-xlsx';
import { analyzeFile, analyzePlanFile, applyImport, applyPlanImport, type ImportProgress } from '../src/core/import';
import { confidence, knownSurface, progressSummary, projectSteps } from '../src/core/progress';
import { mainQuantities } from '../src/core/quantities';
import { createProject, editLine, journal } from '../src/core/project';
import { buildFixture } from './fixture';
import { buildPlanFixture } from './plan-fixture';

describe('avancement réel du projet', () => {
  test('projet vide : seule l’étape Import est à faire', () => {
    const p = createProject('Vide');
    const steps = projectSteps(p, computeProject(p));
    expect(steps[0]).toMatchObject({ id: 'import', state: 'current' });
    expect(steps.slice(1).every((s) => s.state === 'unavailable')).toBe(true);
    expect(progressSummary(steps)).toMatchObject({ done: 0, total: 8, current: 'Import' });
  });

  test('après import : étapes terminées et à vérifier selon les données', async () => {
    const x = await analyzeFile('DQE.xlsx', await buildFixture());
    let p = applyImport(createProject('Villa'), x.file, x.result, 'replace');
    const steps = Object.fromEntries(projectSteps(p, computeProject(p)).map((s) => [s.id, s.state]));
    expect(steps).toMatchObject({ import: 'done', analyse: 'done', verification: 'verify', dqe: 'done', estimation: 'verify', export: 'todo' });
    p = journal(p, 'Export DQE Excel', 'x.xlsx');
    expect(projectSteps(p, computeProject(p)).find((s) => s.id === 'export')!.state).toBe('done');
  });

  test('confiance globale et surface connue (jamais estimée)', async () => {
    const x = await analyzeFile('DQE.xlsx', await buildFixture());
    let p = applyImport(createProject('Villa'), x.file, x.result, 'replace');
    expect(knownSurface(p)).toBeNull();
    const c = confidence(p, computeProject(p));
    expect(c.total).toBe(10);
    expect(c.confirmed + c.to_verify + c.undetermined).toBe(10);
    const y = await analyzePlanFile('Plan.pdf', await buildPlanFixture(), pdfjs);
    p = applyPlanImport(p, y.file, y.plan);
    expect(knownSurface(p)).toMatchObject({ value: 62.8 });
    expect(confidence(p, computeProject(p)).total).toBeGreaterThan(10);
  });
});

describe('quantités principales et historique', () => {
  test('regroupement par nature d’ouvrage depuis les lignes réelles', async () => {
    const x = await analyzeFile('DQE.xlsx', await buildFixture());
    const p = applyImport(createProject('Villa'), x.file, x.result, 'replace');
    const q = Object.fromEntries(mainQuantities(p, computeProject(p)).map((m) => [m.id, m]));
    expect(q.maconnerie.value).toBe(100);
    expect(q.enduits.value).toBeCloseTo(220);
    // Béton d'escalier sans quantité : compté comme manquant, pas comme 0.
    expect(q.beton).toMatchObject({ value: 0, missing: 1, status: 'undetermined' });
    expect(q.sanitaire.value).toBe(3 + 1 + 4 * 0 + 0);
  });

  test('le journal garde le montant après chaque action', async () => {
    const x = await analyzeFile('DQE.xlsx', await buildFixture());
    let p = applyImport(createProject('Villa'), x.file, x.result, 'replace');
    expect(p.journal[0].total).toBe(0);
    const before = p.journal.at(-1)!.total!;
    const line = p.lots[0].sections[2].lines[0];
    p = editLine(p, line.id, 'quantity', '20');
    expect(p.journal.at(-1)!.total).toBe(before + 10 * 15000);
  });
});

describe('progression des analyses', () => {
  test('étapes réelles pour un DQE et pour un plan', async () => {
    const ev: ImportProgress[] = [];
    await analyzeFile('DQE.xlsx', await buildFixture(), (e) => ev.push(e));
    expect(ev.map((e) => e.step)).toEqual(['read', 'extract', 'detect', 'verify', 'done']);
    expect(ev.find((e) => e.step === 'detect')!.count).toBe(10);
    const ev2: ImportProgress[] = [];
    await analyzePlanFile('Plan.pdf', await buildPlanFixture(), pdfjs, (e) => ev2.push(e));
    expect(ev2.filter((e) => e.step === 'extract').map((e) => `${e.done}/${e.total}`)).toEqual(['1/3', '2/3', '3/3']);
    expect(ev2.at(-1)!.step).toBe('done');
  });
});

describe('bibliothèque de prix en Excel', () => {
  test('aller-retour avec observation', async () => {
    const items = [{ id: 'a', code: 'M001', designation: 'Ciment 50 kg', unit: 'u', price: 4500, supplier: 'Quincaillerie', category: 'materiau' as const, location: 'Cotonou', updatedAt: new Date().toISOString(), observation: 'Prix de mars', history: [{ price: 4300, at: '2026-01-10T00:00:00Z' }] }];
    const back = await pricesFromXlsx(await pricesToXlsx(items));
    expect(back[0]).toMatchObject({ code: 'M001', designation: 'Ciment 50 kg', price: 4500, category: 'materiau', location: 'Cotonou', observation: 'Prix de mars' });
  });
});
