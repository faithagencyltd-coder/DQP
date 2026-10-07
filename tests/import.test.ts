import { describe, expect, test } from 'vitest';
import { computeProject } from '../src/core/dqe';
import { analyzeFile, applyImport, ImportError } from '../src/core/import';
import { createProject } from '../src/core/project';
import { buildFixture } from './fixture';

async function importFixture() {
  const bytes = await buildFixture();
  const { file, result } = await analyzeFile('DQE_TEST.xlsx', bytes);
  const project = applyImport(createProject('Test'), file, result, 'replace');
  return { file, result, project, calc: computeProject(project) };
}

describe('import d’un DQE Excel', () => {
  test('reconnaît les lots, sections et lignes', async () => {
    const { project, result } = await importFixture();
    expect(project.lots.map((l) => l.name)).toEqual(['MACONNERIE - BETON', 'PLOMBERIE - SANITAIRE']);
    expect(project.lots.map((l) => l.code)).toEqual(['LOT 01', 'LOT 02']);
    const lot1 = project.lots[0];
    expect(lot1.sections.map((s) => [s.path.join(' › '), s.title])).toEqual([
      ['', 'I - INSTALLATION'],
      ['II - REZ-DE-CHAUSSEE', 'F - ELEVATION'],
      ['AMENAGEMENTS EXTERIEURS', 'H - CLÔTURES'],
    ]);
    const lot2 = project.lots[1];
    expect(lot2.sections[0].path).toEqual(['BATIMENT PRINCIPAL', 'I - REZ-DE-CHAUSSEE']);
    expect(lot2.sections[0].title).toBe('B - APPAREILLAGE');
    expect(result.analysis.stats.lines).toBe(10);
  });

  test('états de confiance : confirmé, à vérifier, non déterminé', async () => {
    const { project } = await importFixture();
    const lines = project.lots.flatMap((l) => l.sections.flatMap((s) => s.lines));
    const by = (d: string) => lines.find((l) => l.designation.startsWith(d))!;
    expect(by('Implantation').quantity).toMatchObject({ value: 100, status: 'confirmed', source: { cell: 'D14' } });
    expect(by('Implantation').unit).toBe('m²');
    expect(by('Béton armé pour escalier').quantity).toMatchObject({ value: null, status: 'undetermined' });
    expect(by('Béton armé pour escalier').unitPrice).toMatchObject({ value: null, status: 'undetermined' });
    expect(by('Lavabo visiteur').unitPrice).toMatchObject({ value: 0, status: 'to_verify' });
    expect(by('Evier').quantity).toMatchObject({ value: 0, status: 'to_verify' });
  });

  test('une quantité calculée à partir d’une autre ligne reste liée', async () => {
    const { project, calc } = await importFixture();
    const lines = project.lots[0].sections[1].lines;
    const murs = lines[0];
    const enduits = lines[2];
    expect(enduits.quantity.expression).toBe(`({L:${murs.id}}*2.2)`);
    expect(calc.lines.get(enduits.id)!.quantity).toBeCloseTo(220);
    expect(enduits.quantity.source?.formula).toBe('=(D19*2.2)');
  });

  test('détecte les anomalies réelles du fichier', async () => {
    const { result } = await importFixture();
    const codes = result.analysis.fileAlerts.map((a) => a.code);
    expect(codes).toContain('TOTAL_EXCLUDES_LINES');
    expect(codes).toContain('BROKEN_FORMULA');
    expect(codes).toContain('SUSPICIOUS_FORMULA');
    expect(codes).toContain('AMOUNT_WORDS');
    expect(codes).toContain('GRAND_TOTAL_EXCLUDES_LINES');
    expect(codes).toContain('TITLE_CONFLICT');
    const excl = result.analysis.fileAlerts.find((a) => a.code === 'TOTAL_EXCLUDES_LINES')!;
    expect(excl.message).toContain('I - INSTALLATION');
    expect(excl.message).toContain('240');
    const broken = result.analysis.fileAlerts.find((a) => a.code === 'BROKEN_FORMULA')!;
    expect(broken.source?.cell).toBe('F62');
    const words = result.analysis.fileAlerts.find((a) => a.code === 'AMOUNT_WORDS')!;
    expect(words.message).toContain('1 284 00');
  });

  test('totaux : DQP compte toutes les lignes, le fichier est comparé', async () => {
    const { project, calc, result } = await importFixture();
    expect(project.lots[0].sourceTotal?.value).toBe(1284000);
    expect(calc.lots.get(project.lots[0].id)!.amount).toBe(240000 + 650000 + 484000 + 150000);
    expect(calc.lots.get(project.lots[1].id)!.amount).toBe(192000);
    expect(result.analysis.sourceGrandTotal?.value).toBe(1476000);
    expect(calc.totalHT - 1476000).toBe(240000);
  });

  test('informations du projet et type détectés avec leur source', async () => {
    const { result, project } = await importFixture();
    const d = Object.fromEntries(result.analysis.detected.map((x) => [x.key, x]));
    expect(d.country.value).toBe('REPUBLIQUE DU BENIN');
    expect(d.date.value).toBe('FEVRIER 2026');
    expect(d.phase.value).toBe('PHASE 2 : EXECUTION');
    expect(d.projectType.value).toBe('Villa / Immeuble résidentiel');
    expect(d.projectType.status).toBe('to_verify');
    expect(d.location.value).toBe("ZOPAH COMMUNE D'ABOMEY-CALAVI");
    expect(project.info.projectTypeStatus).toBe('to_verify');
  });

  test('refuse un faux .xlsx et les formats non pris en charge, sans rien inventer', async () => {
    await expect(analyzeFile('plan.xlsx', new TextEncoder().encode('pas un classeur'))).rejects.toBeInstanceOf(ImportError);
    await expect(analyzeFile('plan.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]))).rejects.toThrow(/phase 2/i);
    await expect(analyzeFile('plan.dwg', new Uint8Array([1, 2, 3]))).rejects.toThrow(/licence/i);
  });
});

describe('import CSV', () => {
  test('séparateur point-virgule et décimales à virgule', async () => {
    const csv = 'N°;Désignation;Unité;Quantité;Prix unitaire;Montant\n;A - TERRASSEMENT;;;;\n1;Fouilles en rigole;m3;101,71;2000;\n2;"Remblai; provenant des fouilles";m3;122,28;1000;\n';
    const { file, result } = await analyzeFile('dqe.csv', new TextEncoder().encode(csv));
    const project = applyImport(createProject('CSV'), file, result, 'replace');
    const lines = project.lots[0].sections[0].lines;
    expect(project.lots[0].sections[0].title).toBe('A - TERRASSEMENT');
    expect(lines.map((l) => l.quantity.value)).toEqual([101.71, 122.28]);
    expect(lines[1].designation).toBe('Remblai; provenant des fouilles');
    expect(computeProject(project).totalHT).toBe(Math.round(101.71 * 2000) + Math.round(122.28 * 1000));
  });
});
