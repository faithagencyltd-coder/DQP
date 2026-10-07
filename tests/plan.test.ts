import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, test } from 'vitest';
import { computeProject } from '../src/core/dqe';
import { crossCheck, resolve } from '../src/core/elements/crosscheck';
import { acceptElement, correctElement, effectiveStatus, rejectElement } from '../src/core/elements/ops';
import { analysisReportHtml } from '../src/core/export/report';
import { analyzeFile, analyzePlanFile, applyImport, applyPlanImport, ImportError } from '../src/core/import';
import { migrateProject } from '../src/core/migrate';
import { normalizeLevel } from '../src/core/pdf/detect';
import { groupLines } from '../src/core/pdf/extract';
import { createProject, editLine } from '../src/core/project';
import { buildFixture } from './fixture';
import { buildPlanFixture } from './plan-fixture';

async function plan() {
  return analyzePlanFile('Plans_villa.pdf', await buildPlanFixture(), pdfjs);
}

describe('analyse d’un plan PDF', () => {
  test('pages : type, niveau, échelle, page scannée', async () => {
    const { plan: p } = await plan();
    const pages = p.analysis.pages!;
    expect(pages.map((x) => x.kind)).toEqual(['plan', 'coupe', 'autre']);
    expect(pages[0]).toMatchObject({ level: 'Rez-de-chaussée', scale: 100, scanned: false, dimensions: 3 });
    expect(pages[1].scale).toBe(50);
    expect(pages[2].scanned).toBe(true);
    expect(p.analysis.fileAlerts.find((a) => a.code === 'SCANNED')?.severity).toBe('error');
  });

  test('pièces et surfaces avec leur source et leur niveau de confiance', async () => {
    const { plan: p } = await plan();
    const rooms = Object.fromEntries(p.elements.filter((e) => e.kind === 'room').map((e) => [e.name, e]));
    expect(Object.keys(rooms).sort()).toEqual(['CHAMBRE 1', 'CUISINE', 'SDB', 'SEJOUR', 'TERRASSE', 'WC']);
    // Surface écrite sur la même ligne : confirmée.
    expect(rooms['CHAMBRE 1'].props.surface).toMatchObject({ value: 14.2, status: 'confirmed' });
    // Surface écrite en dessous : rattachée par proximité, à vérifier.
    expect(rooms.SEJOUR.props.surface).toMatchObject({ value: 32.5, status: 'to_verify' });
    expect(rooms.CUISINE.props.surface.value).toBe(9.8);
    // Pas de surface écrite : non déterminée, jamais inventée.
    expect(rooms.TERRASSE.props.surface).toMatchObject({ value: null, status: 'undetermined' });
    expect(rooms.SEJOUR.category).toBe('Séjour');
    expect(rooms.SDB.category).toBe('Salle de bain');
    expect(rooms.SEJOUR.level).toBe('Rez-de-chaussée');
    expect(rooms.SEJOUR.source).toMatchObject({ page: 1, text: 'SEJOUR' });
    expect(rooms.SEJOUR.source.bbox![0]).toBeCloseTo(240, 0);
  });

  test('menuiseries, équipements, surface totale et cartouche', async () => {
    const { plan: p } = await plan();
    const openings = p.elements.filter((e) => e.kind === 'opening');
    expect(openings.map((e) => e.props.code.value).sort()).toEqual(['F1', 'P1', 'P2', 'P3']);
    const p1 = openings.find((e) => e.props.code.value === 'P1')!;
    expect(p1).toMatchObject({ category: 'Porte', status: 'to_verify' });
    expect(p1.props.largeur.value).toBe(90);
    expect(openings.find((e) => e.props.code.value === 'P3')!.props.largeur).toMatchObject({ value: null, status: 'undetermined' });
    expect(p.elements.filter((e) => e.kind === 'equipment').map((e) => e.category).sort()).toEqual(['Douche', 'Lavabo', 'Évier']);
    expect(p.elements.find((e) => e.kind === 'surface_total')!.props.surface.value).toBe(62.8);
    const info = Object.fromEntries(p.analysis.detected.map((d) => [d.key, d.value]));
    expect(info).toMatchObject({ client: 'M. SENOU', architect: 'CABINET ABC', location: 'ABOMEY-CALAVI', date: 'FEVRIER 2026' });
    // La somme des pièces (62,80 m²) correspond à la surface habitable : pas d’alerte.
    expect(p.analysis.fileAlerts.some((a) => a.code === 'ROOM_SURFACES')).toBe(false);
  });

  test('refuse un faux PDF', async () => {
    await expect(analyzePlanFile('x.pdf', new TextEncoder().encode('bonjour'), pdfjs)).rejects.toBeInstanceOf(ImportError);
  });

  test('regroupement des morceaux de texte et niveaux', () => {
    const lines = groupLines([
      { str: 'CHAM', x: 10, y: 10, w: 20, h: 8, angle: 0 },
      { str: 'BRE', x: 30.5, y: 10, w: 15, h: 8, angle: 0 },
      { str: '2', x: 49, y: 10, w: 4, h: 8, angle: 0 },
      { str: '3.50', x: 200, y: 300, w: 20, h: 8, angle: 90 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['CHAMBRE 2', '3.50']);
    expect(normalizeLevel('PLAN DU 1ER ETAGE')).toBe('R+1');
    expect(normalizeLevel('Plan R + 2')).toBe('R+2');
    expect(normalizeLevel('PLAN DE MASSE')).toBeUndefined();
  });
});

describe('projet multi-fichiers', () => {
  async function both() {
    const x = await analyzeFile('DQE_TEST.xlsx', await buildFixture());
    const y = await plan();
    let p = applyImport(createProject('Villa'), x.file, x.result, 'replace');
    p = applyPlanImport(p, y.file, y.plan);
    return p;
  }

  test('croisement : différences détectées entre plan et DQE, arbitrées par l’utilisateur', async () => {
    let p = await both();
    expect(p.info.client).toBe('M. SENOU');
    const cmp = crossCheck(p, computeProject(p));
    const wc = cmp.find((c) => c.key === 'count:WC')!;
    expect(wc.values.map((v) => [v.source, v.value])).toEqual([['Plans_villa.pdf', 1], ['DQE', 3]]);
    expect(wc.differs).toBe(true);
    const lav = cmp.find((c) => c.key === 'count:Lavabo')!;
    expect(lav.differs).toBe(false);
    // Une source muette n'est pas comptée à 0 : pas de baignoire dans le plan ni dans le DQE.
    expect(cmp.some((c) => c.key === 'count:Baignoire')).toBe(false);
    expect(cmp.find((c) => c.key === 'surface:rooms-floor')?.indicative).toBe(true);
    // L'intitulé de projet diffère entre les fichiers.
    expect(cmp.find((c) => c.key === 'info:title')?.differs).toBe(true);

    p = resolve(p, wc, wc.values[0]);
    const again = crossCheck(p, computeProject(p)).find((c) => c.key === 'count:WC')!;
    expect(again.resolution).toMatchObject({ chosen: 'Plans_villa.pdf', value: 1 });
    // Appliquer le choix au DQE : modification tracée de la ligne.
    p = editLine(p, again.values[1].lineIds![0], 'quantity', '1');
    expect(crossCheck(p, computeProject(p)).find((c) => c.key === 'count:WC')!.differs).toBe(false);
  });

  test('validation des éléments : valider, corriger, rejeter', async () => {
    let p = await both();
    const sejour = p.elements.find((e) => e.name === 'SEJOUR')!;
    expect(effectiveStatus(sejour)).toBe('to_verify');
    p = acceptElement(p, sejour.id);
    expect(effectiveStatus(p.elements.find((e) => e.id === sejour.id)!)).toBe('confirmed');
    const terrasse = p.elements.find((e) => e.name === 'TERRASSE')!;
    p = correctElement(p, terrasse.id, 'surface', '18,5');
    const t = p.elements.find((e) => e.id === terrasse.id)!;
    expect(t.props.surface).toMatchObject({ value: 18.5, status: 'confirmed' });
    expect(t.edits[0]).toMatchObject({ prop: 'surface', before: null, after: 18.5 });
    const evier = p.elements.find((e) => e.category === 'Évier')!;
    p = rejectElement(p, evier.id);
    expect(effectiveStatus(p.elements.find((e) => e.id === evier.id)!)).toBe('rejected');
    expect(p.journal.map((j) => j.action)).toEqual(expect.arrayContaining(['Élément validé', 'Élément corrigé', 'Élément rejeté']));
    const html = analysisReportHtml(p, computeProject(p), [], 'test');
    expect(html).toContain('Plans analysés');
    expect(html).toContain('Croisement des fichiers');
  });

  test('un projet de la version précédente (schéma 1) s’ouvre sans perte', () => {
    const old = { ...createProject('Ancien'), schema: 1 } as Record<string, unknown>;
    delete old.elements;
    delete old.resolutions;
    const m = migrateProject(JSON.parse(JSON.stringify(old)));
    expect(m.schema).toBe(2);
    expect(m.elements).toEqual([]);
    expect(m.info.name).toBe('Ancien');
    expect(() => migrateProject({ ...m, schema: 99 })).toThrow(/plus récente/);
  });
});
