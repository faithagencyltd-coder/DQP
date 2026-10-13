// Lecture et écriture CSV (import de contacts et de prix, exports). Séparateur détecté
// (« ; » d'Excel français ou « , »), guillemets doublés, BOM UTF-8.

export function detectSeparator(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const count = (c: string) => first.split(c).length - 1;
  return count(';') >= count(',') && count(';') >= count('\t') ? ';' : count('\t') > count(',') ? '\t' : ',';
}

export function parseCsv(text: string, sep = detectSeparator(text)): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const esc = (v: unknown, sep: string) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: unknown[][], sep = ';'): string {
  return '﻿' + rows.map((r) => r.map((v) => esc(v, sep)).join(sep)).join('\r\n');
}

/** Associe les colonnes d'un CSV à des champs, à partir des en-têtes (sans accents ni casse). */
export function mapHeaders<T extends string>(headers: string[], fields: Record<T, string[]>): Partial<Record<T, number>> {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const out: Partial<Record<T, number>> = {};
  const hs = headers.map(norm);
  for (const [field, names] of Object.entries(fields) as [T, string[]][]) {
    const idx = hs.findIndex((h) => names.some((n) => h === norm(n)));
    if (idx >= 0) out[field] = idx;
  }
  return out;
}
