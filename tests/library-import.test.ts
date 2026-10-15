// Bibliothèque des travaux construite à partir d'un DQE Excel : classeur synthétique reproduisant
// les situations relevées sur les DQE réels (doublons, prix divergents, prix manquant, prix à 0,
// formule cassée), sans aucun fichier client dans le dépôt.
import ExcelJS from 'exceljs';
import { describe, expect, test } from 'vitest';
import { analyzeFile } from '../src/engine/dqp/import';
import { candidateToRow, planLibraryImport, tradeCategory, tradeCode } from '../src/engine/library-import';

async function fixture(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Feuil1');
  const set = (ref: string, v: ExcelJS.CellValue) => (ws.getCell(ref).value = v);
  const f = (ref: string, formula: string, result: ExcelJS.CellFormulaValue['result']) => (ws.getCell(ref).value = { formula, result } as ExcelJS.CellFormulaValue);
  const header = (row: number) => ['N°', 'DESIGNATION', 'UNITE', 'QUANTITE', 'PRIX UNITAIRE', 'MONTANT'].forEach((h, i) => (ws.getRow(row).getCell(i + 1).value = h));
  const line = (r: number, n: number, des: string, u: string, q: number | null, pu: number | null) => {
    set(`A${r}`, n); set(`B${r}`, des); set(`C${r}`, u);
    if (q !== null) set(`D${r}`, q);
    if (pu !== null) set(`E${r}`, pu);
    if (q !== null && pu !== null) f(`F${r}`, `D${r}*E${r}`, q * pu);
  };
  set('B2', 'DEVIS QUANTITATIF ET ESTIMATIF');
  set('B4', 'MACONNERIE - BETON');
  header(5);
  set('A6', 'A - FONDATIONS');
  line(7, 1, 'Béton de propreté', 'm3', 6, 60000);
  line(8, 2, 'Fouilles en rigole', 'm3', 20, 2500);
  line(9, 3, 'Construction de barraque', 'ff', 1, 0);
  set('A10', 'B - ELEVATION');
  line(11, 1, 'Béton de propreté', 'm3', 2, 60000);       // même prix → regroupé
  line(12, 2, 'Fouilles  en rigole', 'm3', 5, 3000);      // prix différent → signalé
  line(13, 3, 'Enduit ciment', 'm2', 100, null);          // sans prix
  line(14, 4, 'Enduit ciment', 'm2', 50, 2000);           // chiffré ailleurs → rattaché
  set('B15', 'TOTAL MACONNERIE - BETON'); f('F15', 'SUM(F7:F14)', 620000);
  set('B18', 'PEINTURE');
  header(19);
  line(20, 1, 'Peinture vinylique', 'm2', 300, 1500);
  set('B21', 'TOTAL PEINTURE'); f('F21', 'SUM(F20:F20)', 450000);
  set('B23', 'TOTAL BATIMENT PRINCIPAL'); f('F23', '#REF!+F21', { error: '#REF!' } as ExcelJS.CellErrorValue);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('bibliothèque des travaux depuis un DQE Excel', () => {
  test('corps d’état reconnus', () => {
    expect(tradeCode('MACONNERIE - BETON')).toBe('GO');
    expect(tradeCode('PLOMBERIE SANITAIRE')).toBe('PS');
    expect(tradeCode('ELECTRICITE')).toBe('EL');
    expect(tradeCategory('PEINTURE')).toBe('Peinture');
    expect(tradeCode('Lot spécial divers')).toBe('LSD');
  });

  test('désignations, unités et prix gardés ; anomalies signalées, rien corrigé', async () => {
    const { result } = await analyzeFile('DQE_test.xlsx', await fixture());
    const plan = planLibraryImport('DQE_test.xlsx', result);
    expect(plan.sheet).toBe('Feuil1');
    expect(plan.trades.map((t) => t.code)).toEqual(['GO', 'PT']);
    expect(plan.stats.lignes).toBe(8);

    const by = (d: string, price?: number | null) => plan.candidates.filter((c) => c.designation.replace(/\s+/g, ' ') === d && (price === undefined || c.price === price));
    // Même ouvrage, même prix : une seule entrée, deux cellules d'origine.
    const beton = by('Béton de propreté');
    expect(beton).toHaveLength(1);
    expect(beton[0].sources.map((s) => s.cell)).toEqual(['B7', 'B11']);
    expect(beton[0].flags).toContain('doublon_fusionne');
    expect(beton[0].category).toBe('Gros œuvre');
    // Prix différents : les deux prix sont gardés et signalés.
    const fouilles = by('Fouilles en rigole');
    expect(fouilles.map((c) => c.price).sort()).toEqual([2500, 3000]);
    for (const c of fouilles) expect(c.flags).toContain('prix_divergents');
    expect(plan.stats.prixDivergents).toBe(2);
    // Occurrence sans prix rattachée à l'ouvrage chiffré, avec une note.
    const enduit = by('Enduit ciment');
    expect(enduit).toHaveLength(1);
    expect(enduit[0].price).toBe(2000);
    expect(enduit[0].notes.join(' ')).toMatch(/sans prix.*B13/);
    // Prix à 0 signalé, pas corrigé.
    const barraque = by('Construction de barraque')[0];
    expect(barraque.price).toBe(0);
    expect(barraque.flags).toContain('prix_nul');
    // Codes par corps d'état.
    expect(plan.candidates.filter((c) => c.code.startsWith('GO-')).map((c) => c.code)).toEqual(['GO-001', 'GO-002', 'GO-003', 'GO-004', 'GO-005']);
    expect(plan.candidates.find((c) => c.designation === 'Peinture vinylique')!.code).toBe('PT-001');
    // Formule cassée du fichier relevée.
    expect(plan.fileAlerts.join(' ')).toMatch(/#REF!/);
  });

  test('ligne à insérer : à vérifier, traçable, sans invention', async () => {
    const { result } = await analyzeFile('DQE_test.xlsx', await fixture());
    const plan = planLibraryImport('DQE_test.xlsx', result);
    const c = plan.candidates.find((x) => x.designation === 'Béton de propreté')!;
    const row = candidateToRow(c, { orgId: 'o', currency: 'XOF', country: 'BJ', fileName: 'DQE_test.xlsx', sheet: 'Feuil1', importId: 'i', date: '2026-10-15' });
    expect(row).toMatchObject({ kind: 'article', code: 'GO-001', unit: 'm³', sale_price: 60000, purchase_price: null, validation_status: 'a_verifier', trade: 'MACONNERIE - BETON', import_id: 'i', price_date: '2026-10-15' });
    expect(row.source).toBe('DQE « DQE_test.xlsx », feuille Feuil1, cellule B7');
    expect(row.source_ref.sources).toHaveLength(2);
    const sansPrix = { ...c, price: null };
    expect(candidateToRow(sansPrix, { orgId: 'o', currency: 'XOF', country: null, fileName: 'f', sheet: null, importId: 'i', date: '2026-10-15' }).price_date).toBeNull();
  });

  test('bibliothèque existante : déjà présents désélectionnés, numérotation poursuivie', async () => {
    const { result } = await analyzeFile('DQE_test.xlsx', await fixture());
    const plan = planLibraryImport('DQE_test.xlsx', result, [
      { id: 'a', code: 'GO-012', designation: 'BETON DE PROPRETE', unit: 'm3', sale_price: 60000 },
      { id: 'b', code: 'PT-003', designation: 'Peinture vinylique', unit: 'm2', sale_price: 1800 },
      { id: 'c', code: 'GO-099', designation: 'Ancien', unit: 'u', sale_price: 1, archived_at: '2026-01-01' },
    ]);
    const beton = plan.candidates.find((c) => c.designation === 'Béton de propreté')!;
    expect(beton.flags).toContain('deja_en_bibliotheque');
    expect(beton.selected).toBe(false);
    const peinture = plan.candidates.find((c) => c.designation === 'Peinture vinylique')!;
    expect(peinture.flags).toContain('prix_different_en_bibliotheque');
    expect(peinture.code).toBe('PT-004');
    // Les codes, même archivés, ne sont jamais réutilisés.
    expect(beton.code).toBe('GO-100');
    expect(plan.stats.dejaPresents).toBe(2);
  });
});
