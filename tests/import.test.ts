// Import d'un DQE Excel : on réutilise le classeur synthétique du dépôt DQP (branche dqp-desktop)
// recréé ici à l'identique avec ExcelJS.
import ExcelJS from 'exceljs';
import { describe, expect, test } from 'vitest';
import { importDqeFile } from '../src/engine/import-dqe';
import { computeDoc } from '../src/engine/dqe';

async function fixture(): Promise<Uint8Array> {
  // Structure des DQE réels : intitulé du lot au-dessus de chaque tableau, en-tête répété.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DQE');
  const set = (ref: string, v: ExcelJS.CellValue) => (ws.getCell(ref).value = v);
  const f = (ref: string, formula: string, result: number) => (ws.getCell(ref).value = { formula, result } as ExcelJS.CellFormulaValue);
  const header = (row: number) => ['N°', 'DESIGNATION', 'UNITE', 'QUANTITE', 'PRIX UNITAIRE', 'MONTANT'].forEach((h, i) => (ws.getRow(row).getCell(i + 1).value = h));
  set('B2', 'DEVIS QUANTITATIF ET ESTIMATIF');
  set('B4', 'MACONNERIE - BETON');
  header(5);
  set('A6', 'I - INSTALLATION');
  set('A7', 1); set('B7', 'Installation de chantier'); set('C7', 'ff'); set('D7', 1); set('E7', 250000); f('F7', 'D7*E7', 250000);
  set('A8', 2); set('B8', 'Implantation'); set('C8', 'm2'); set('D8', 188.02); set('E8', 400); f('F8', 'D8*E8', 75208);
  set('A9', 'II - FONDATIONS');
  set('A10', 3); set('B10', 'Béton de propreté'); set('C10', 'm3'); set('D10', 6.05); set('E10', 20000); f('F10', 'D10*E10', 121000);
  set('A11', 4); set('B11', 'Fouilles en rigole'); set('C11', 'm3'); set('E11', 2000);
  set('B12', 'TOTAL MACONNERIE - BETON'); f('F12', 'SUM(F7:F11)', 446208);
  set('B15', 'PEINTURE');
  header(16);
  set('A17', 5); set('B17', 'Peinture vinylique'); set('C17', 'm2'); set('D17', 300);
  set('B18', 'TOTAL PEINTURE'); f('F18', 'SUM(F17:F17)', 0);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('import de DQE Excel', () => {
  test('lots, sous-parties, lignes, valeurs absentes signalées', async () => {
    const r = await importDqeFile('DQE_villa.xlsx', await fixture());
    expect(r.lots).toBe(2);
    expect(r.lines).toBe(5);
    expect(r.missingQty).toBe(1);
    expect(r.missingPrice).toBe(1);
    const all = r.body.lots.flatMap((l) => l.lines);
    expect(all.some((l) => l.kind === 'titre' && /FONDATIONS/i.test(l.designation))).toBe(true);
    const total = computeDoc(r.body, { currency: 'XOF', taxes: [] });
    expect(total.totalHT).toBe(250000 + 75208 + 121000);
    expect(total.incomplete).toBe(2);
  });
});
