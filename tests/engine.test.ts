import { describe, expect, test } from 'vitest';
import { checkProject } from '../src/core/checks';
import { computeProject, findLine } from '../src/core/dqe';
import { exportDqeExcel } from '../src/core/export/excel';
import { analysisReportHtml, dqeHtml } from '../src/core/export/report';
import { amountInWords, formatNumber, numberToFrenchWords, parseNumberFr } from '../src/core/format';
import { evaluate, referencedCells } from '../src/core/formula';
import { analyzeFile, applyImport } from '../src/core/import';
import { findMatches, itemsFromProject, pricesFromCsv, pricesToCsv } from '../src/core/prices';
import {
  addLine, addLot, applyPrice, createProject, deleteLine, editLine, mergeLots, moveLot, renameLot, splitLot, unlinkQuantity, validateValue,
} from '../src/core/project';
import { detectElements } from '../src/core/classify';
import { buildFixture } from './fixture';

async function sample() {
  const { file, result } = await analyzeFile('DQE_TEST.xlsx', await buildFixture());
  return applyImport(createProject('Villa test'), file, result, 'replace');
}
const lineBy = (p: Awaited<ReturnType<typeof sample>>, d: string) =>
  p.lots.flatMap((l) => l.sections.flatMap((s) => s.lines)).find((l) => l.designation.startsWith(d))!;

describe('formules', () => {
  test('évaluation', () => {
    const cells: Record<string, number> = { D130: 656.51, E366: 0, A1: 2, A2: 3, A3: 5 };
    const r = { cell: (ref: string) => cells[ref] ?? null };
    expect(evaluate('=(D130*2.2)', r)).toBeCloseTo(1444.322);
    expect(evaluate('=---E366', r)).toBe(-0);
    expect(evaluate('=SUM(A1:A3)*2-1', r)).toBe(19);
    expect(evaluate('=2^3+ROUND(2.345;2)', r)).toBeCloseTo(10.35);
    expect(() => evaluate('=#REF!+F382+#REF!', r)).toThrow(/cassée/);
    expect(referencedCells('=SUM(F99:F101)+$E$5')).toEqual(['F99', 'F100', 'F101', 'E5']);
  });
});

describe('format', () => {
  test('montant en lettres', () => {
    expect(numberToFrenchWords(14413664)).toBe('quatorze millions quatre cent treize mille six cent soixante-quatre');
    expect(numberToFrenchWords(6510801)).toBe('six millions cinq cent dix mille huit cent un');
    expect(numberToFrenchWords(80)).toBe('quatre-vingts');
    expect(numberToFrenchWords(71)).toBe('soixante et onze');
    expect(numberToFrenchWords(200)).toBe('deux cents');
    expect(numberToFrenchWords(200000)).toBe('deux cent mille');
    expect(numberToFrenchWords(1000)).toBe('mille');
    expect(numberToFrenchWords(1000000)).toBe('un million');
    expect(amountInWords(39446065)).toMatch(/^Trente-neuf millions quatre cent quarante-six mille soixante-cinq \(39 446 065\) francs CFA$/);
  });
  test('nombres à la française', () => {
    expect(formatNumber(3825000, 0)).toBe('3 825 000');
    expect(formatNumber(42.56)).toBe('42,56');
    expect(parseNumberFr('1 234,5')).toBe(1234.5);
    expect(parseNumberFr('abc')).toBeNull();
  });
});

describe('moteur DQE', () => {
  test('montant = quantité retenue × PU, avec coefficient et perte', async () => {
    let p = await sample();
    const id = lineBy(p, 'Mur de clôture').id;
    p = editLine(p, id, 'coefficient', '1,1');
    p = editLine(p, id, 'lossPercent', '5');
    const r = computeProject(p).lines.get(id)!;
    expect(r.retained).toBeCloseTo(10 * 1.1 * 1.05);
    expect(r.amount).toBe(Math.round(10 * 1.1 * 1.05 * 15000));
    expect(r.steps.join(' ')).toMatch(/perte/);
  });

  test('une correction manuelle est tracée et recalcule les quantités liées', async () => {
    let p = await sample();
    const murs = lineBy(p, 'Murs en élévation');
    const enduits = lineBy(p, 'Enduits verticaux');
    p = editLine(p, murs.id, 'quantity', '110');
    const line = findLine(p, murs.id)!.line;
    expect(line.quantity).toMatchObject({ value: 110, origin: 'manual', status: 'confirmed' });
    expect(line.edits).toHaveLength(1);
    expect(line.edits[0]).toMatchObject({ field: 'quantity', before: 100, after: 110 });
    expect(computeProject(p).lines.get(enduits.id)!.quantity).toBeCloseTo(242);
    expect(p.journal.at(-1)!.action).toBe('Ligne modifiée');
    // Saisir la même valeur ne crée pas de fausse modification.
    expect(editLine(p, murs.id, 'quantity', '110')).toBe(p);
  });

  test('détacher ou supprimer la ligne référencée fige la quantité liée', async () => {
    let p = await sample();
    const murs = lineBy(p, 'Murs en élévation');
    const enduits = lineBy(p, 'Enduits verticaux');
    const q1 = unlinkQuantity(p, enduits.id, 220);
    expect(findLine(q1, enduits.id)!.line.quantity.expression).toBeUndefined();
    p = deleteLine(p, murs.id);
    const e = findLine(p, enduits.id)!.line;
    expect(e.quantity.expression).toBeUndefined();
    expect(e.quantity.status).toBe('to_verify');
    expect(computeProject(p).lines.get(enduits.id)!.quantity).toBeCloseTo(220);
  });

  test('valider une valeur « à vérifier »', async () => {
    let p = await sample();
    const id = lineBy(p, 'Lavabo visiteur').id;
    p = validateValue(p, id, 'unitPrice');
    expect(findLine(p, id)!.line.unitPrice.status).toBe('confirmed');
  });

  test('lots : créer, renommer, déplacer, fusionner, subdiviser', async () => {
    let p = await sample();
    const total = computeProject(p).totalHT;
    p = addLot(p, 'Électricité');
    expect(p.lots.map((l) => l.code)).toEqual(['LOT 01', 'LOT 02', 'LOT 03']);
    p = renameLot(p, p.lots[2].id, 'ÉLECTRICITÉ');
    p = moveLot(p, p.lots[2].id, -1);
    expect(p.lots[1].name).toBe('ÉLECTRICITÉ');
    const lot1 = p.lots[0];
    p = splitLot(p, lot1.id, [lot1.sections[0].id], 'INSTALLATION DE CHANTIER');
    expect(p.lots[1].name).toBe('INSTALLATION DE CHANTIER');
    expect(computeProject(p).totalHT).toBe(total);
    p = mergeLots(p, p.lots[1].id, p.lots[0].id);
    expect(p.lots[0].sections[p.lots[0].sections.length - 1].path[0]).toBe('INSTALLATION DE CHANTIER');
    expect(computeProject(p).totalHT).toBe(total);
    const r = addLine(p, p.lots[0].sections[0].id);
    expect(findLine(r.project, r.lineId)!.line.quantity.status).toBe('undetermined');
  });

  test('contrôles d’incohérences', async () => {
    const p = await sample();
    const codes = checkProject(p, computeProject(p)).map((a) => a.code);
    expect(codes).toContain('NO_QUANTITY');
    expect(codes).toContain('NO_PRICE');
    expect(codes).toContain('ZERO_PRICE');
    expect(codes).toContain('QTY_TO_VERIFY');
  });

  test('éléments détectés à partir des désignations', async () => {
    const p = await sample();
    const els = detectElements(p, computeProject(p));
    const wc = els.find((e) => e.element === 'WC')!;
    expect(wc.quantity).toBe(3);
    expect(els.find((e) => e.element === 'Lavabos / vasques')!.quantity).toBe(1);
    expect(els.find((e) => e.element === 'Murs (maçonnerie)' && e.unit === 'm²')!.quantity).toBe(100);
  });
});

describe('bibliothèque de prix', () => {
  test('prix du projet, correspondances et application tracée', async () => {
    let p = await sample();
    const items = itemsFromProject(p, []);
    expect(items.some((i) => i.designation === 'WC principal' && i.price === 60000)).toBe(true);
    expect(items.some((i) => i.price === 0)).toBe(false);
    const target = lineBy(p, 'Béton armé pour escalier');
    const item = { ...items[0], id: 'x', designation: 'Béton armé dosé à 350 kg/m3 pour escalier', unit: 'm³', price: 95000 };
    const m = findMatches(target, [item]);
    expect(m[0].score).toBeGreaterThan(0.4);
    p = applyPrice(p, target.id, item);
    const l = findLine(p, target.id)!.line;
    expect(l.unitPrice).toMatchObject({ value: 95000, origin: 'library', status: 'confirmed' });
    expect(l.priceItemId).toBe('x');
  });

  test('CSV aller-retour', () => {
    const items = pricesFromCsv('Code;Désignation;Unité;Prix;Fournisseur;Catégorie\nM001;Ciment 50 kg;u;4 500;Quincaillerie;Matériau\n');
    expect(items[0]).toMatchObject({ code: 'M001', designation: 'Ciment 50 kg', price: 4500, category: 'materiau' });
    const back = pricesFromCsv(pricesToCsv(items));
    expect(back[0]).toMatchObject({ code: 'M001', price: 4500, supplier: 'Quincaillerie' });
  });
});

describe('exports', () => {
  test('l’export Excel se réimporte avec les mêmes totaux', async () => {
    const p = await sample();
    const r = computeProject(p);
    const bytes = await exportDqeExcel(p, r, [], 'test');
    const again = await analyzeFile('export.xlsx', bytes);
    const p2 = applyImport(createProject('Réimport'), again.file, again.result, 'replace');
    const r2 = computeProject(p2);
    expect(r2.totalHT).toBe(r.totalHT);
    expect(p2.lots.map((l) => r2.lots.get(l.id)!.amount)).toEqual(p.lots.map((l) => r.lots.get(l.id)!.amount));
    // La quantité liée reste une formule Excel vivante.
    const enduits = p2.lots[0].sections.flatMap((s) => s.lines).find((l) => l.designation.startsWith('Enduits'))!;
    expect(enduits.quantity.expression).toBeDefined();
    // Les totaux de lots exportés comptent toutes les lignes : plus d'écart.
    expect(again.result.analysis.fileAlerts.filter((a) => a.code === 'TOTAL_EXCLUDES_LINES')).toHaveLength(0);
  });

  test('documents PDF (HTML) : DQE et rapport', async () => {
    const p = await sample();
    const r = computeProject(p);
    const html = dqeHtml(p, r, 'test');
    expect(html).toContain('DEVIS QUANTITATIF ET ESTIMATIF');
    expect(html).toContain('RÉCAPITULATIF GÉNÉRAL');
    const report = analysisReportHtml(p, r, checkProject(p, r), 'test');
    expect(report).toContain('RAPPORT D’ANALYSE DU PROJET');
    expect(report).toContain('DQE_TEST.xlsx');
    expect(report).not.toContain('<script');
  });
});
