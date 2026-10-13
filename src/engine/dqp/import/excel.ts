// Lecture d'un classeur Excel (.xlsx) vers des grilles DQP, avec ExcelJS.
// Les formules sont conservées (traçabilité) en plus de la valeur mémorisée.

import ExcelJS from 'exceljs';
import { emptyGrid, setCell, type Grid } from './grid';

type RawValue = ExcelJS.CellValue;

function plain(value: RawValue): { value: string | number | null; error?: string } {
  if (value === null || value === undefined) return { value: null };
  if (typeof value === 'number' || typeof value === 'string') return { value };
  if (typeof value === 'boolean') return { value: value ? 'VRAI' : 'FAUX' };
  if (value instanceof Date) return { value: value.toISOString().slice(0, 10) };
  if (typeof value === 'object') {
    if ('error' in value && value.error) return { value: null, error: String(value.error) };
    if ('richText' in value && Array.isArray(value.richText)) {
      return { value: value.richText.map((r) => r.text).join('') };
    }
    if ('text' in value && typeof value.text === 'string') return { value: value.text };
    if ('result' in value) return plain(value.result as RawValue);
  }
  return { value: null };
}

export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<Grid[]> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS accepte un Buffer (Node) ou un ArrayBuffer (navigateur).
  await wb.xlsx.load(data as ArrayBuffer);
  const grids: Grid[] = [];
  // Feuilles annexes produites par DQP lui-même : ce ne sont pas des DQE à réimporter.
  const fromDqp = (wb.creator ?? '').startsWith('DQP');
  wb.eachSheet((ws) => {
    if (fromDqp && ['Traçabilité', 'Contrôles'].includes(ws.name)) return;
    const grid = emptyGrid(ws.name);
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        // Cellules fusionnées : seule la cellule maîtresse porte la valeur.
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) return;
        let formula: string | undefined;
        if (cell.type === ExcelJS.ValueType.Formula) {
          const f = cell.formula;
          if (f) formula = '=' + f;
        }
        const { value, error } = plain(cell.value);
        if (value === null && !formula && !error) return;
        setCell(grid, { ref: cell.address, row: rowNumber, col: colNumber, value, formula, error });
      });
    });
    grids.push(grid);
  });
  return grids;
}
