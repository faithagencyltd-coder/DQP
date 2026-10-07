// Représentation neutre d'une feuille (Excel ou CSV) : DQP analyse une grille,
// pas un format. Chaque cellule garde sa valeur, sa formule et la valeur calculée
// enregistrée par le tableur.

export interface GridCell {
  ref: string;
  row: number;
  col: number;
  /** Valeur littérale (nombre / texte) ou résultat mémorisé d'une formule. */
  value: string | number | null;
  formula?: string;
  /** Erreur affichée par le tableur (#REF!…). */
  error?: string;
}

export interface Grid {
  sheet: string;
  rows: Map<number, Map<number, GridCell>>;
  maxRow: number;
  maxCol: number;
}

export function emptyGrid(sheet: string): Grid {
  return { sheet, rows: new Map(), maxRow: 0, maxCol: 0 };
}

export function setCell(grid: Grid, cell: GridCell): void {
  let r = grid.rows.get(cell.row);
  if (!r) {
    r = new Map();
    grid.rows.set(cell.row, r);
  }
  r.set(cell.col, cell);
  grid.maxRow = Math.max(grid.maxRow, cell.row);
  grid.maxCol = Math.max(grid.maxCol, cell.col);
}

export function getCell(grid: Grid, row: number, col: number): GridCell | undefined {
  return grid.rows.get(row)?.get(col);
}

export function cellByRef(grid: Grid, ref: string): GridCell | undefined {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return undefined;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return getCell(grid, Number(m[2]), col);
}

export function textOf(cell: GridCell | undefined): string {
  if (!cell || cell.value === null) return '';
  return typeof cell.value === 'string' ? cell.value.replace(/\s+/g, ' ').trim() : '';
}

export function numberOf(cell: GridCell | undefined): number | null {
  if (!cell || cell.value === null || cell.error) return null;
  if (typeof cell.value === 'number') return cell.value;
  const s = cell.value.replace(/[\s  ]/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

// ---------- CSV ----------

export function parseCsv(text: string, sheet = 'CSV'): Grid {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const grid = emptyGrid(sheet);
  let row = 1;
  let col = 1;
  let field = '';
  let quoted = false;
  let fieldWasQuoted = false;
  const push = () => {
    const raw = field;
    field = '';
    if (raw !== '' || fieldWasQuoted) {
      let value: string | number = raw;
      if (!fieldWasQuoted) {
        const n = raw.replace(/[\s  ]/g, '').replace(',', '.');
        if (/^-?\d+(\.\d+)?$/.test(n)) value = Number(n);
      }
      const ref = colName(col) + row;
      if (typeof value === 'string' && value.startsWith('=')) {
        setCell(grid, { ref, row, col, value: null, formula: value });
      } else {
        setCell(grid, { ref, row, col, value });
      }
    }
    fieldWasQuoted = false;
    col++;
  };
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"') { quoted = true; fieldWasQuoted = true; continue; }
    if (c === sep) { push(); continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      push();
      row++;
      col = 1;
      continue;
    }
    field += c;
  }
  if (field !== '' || col > 1) push();
  return grid;
}

export function colName(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
