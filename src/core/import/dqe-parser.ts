// Analyse d'une feuille de DQE (Excel ou CSV) → lots, sections, lignes, informations
// de projet et alertes. Conçu à partir de la structure réelle du fichier de référence
// DQE_PM_SENOU.xlsx (§15) mais sans dépendre de ses positions de colonnes :
// DQP repère les lignes d'en-tête (N°, Désignation, Unité, Quantité, PU, Montant).

import { amountInWords, formatMoney, formatNumber, newId, normalizeText, normalizeUnit, nowIso, numberToFrenchWords } from '../format';
import { evaluate, FormulaError, hasBrokenReference, referencedCells } from '../formula';
import { ENGINE_VERSION, renumberLots } from '../project';
import type { Alert, AnalysisResult, Confidence, DetectedInfo, DqeLine, DqeSection, Lot, SourceFile, SourceRef, TrackedNumber } from '../types';
import { cellByRef, getCell, numberOf, textOf, type Grid, type GridCell, colName } from './grid';
import { detectProjectType } from './detect';

interface Columns {
  num?: number;
  designation: number;
  unit?: number;
  quantity?: number;
  price?: number;
  amount?: number;
}

export interface ImportResult {
  lots: Lot[];
  analysis: AnalysisResult;
}

// Ordre important : « prix total » est un montant, pas un prix unitaire.
const HEADER_KEYS: [keyof Columns, RegExp][] = [
  ['num', /^(n|no|n°|numero|num|code|item|art|article)$/],
  ['designation', /^(designation|designations|libelle|description|ouvrages?|intitule)\b/],
  ['unit', /^(u|unites?|unit)\b/],
  ['quantity', /^(quantites?|qte|qty|quant)\b/],
  ['amount', /^(montants?|prix total|total)\b/],
  ['price', /^(prix unitaire|pu|p u|prix)\b/],
];

function headerColumns(grid: Grid, row: number): Columns | null {
  const r = grid.rows.get(row);
  if (!r) return null;
  const found: Partial<Columns> = {};
  for (const cell of r.values()) {
    const raw = textOf(cell);
    if (!raw) continue;
    const t = raw.trim() === 'N°' ? 'n' : normalizeText(raw).replace(/\s+/g, ' ');
    const hit = HEADER_KEYS.find(([, re]) => re.test(t));
    if (hit && found[hit[0]] === undefined) found[hit[0]] = cell.col;
  }
  if (found.designation === undefined) return null;
  const others = ['unit', 'quantity', 'price', 'amount'].filter((k) => found[k as keyof Columns] !== undefined);
  return others.length >= 2 ? (found as Columns) : null;
}

const PREFIX = /^\s*([IVXLC]+|[A-Z]|\d+(?:\.\d+)*)\s*[-–.)]\s*/;
const LEVEL = /\b(rez de chaussee|rdc|r \+ ?\d+|r\+\d+|\d+ ?(er|e|eme) etage|etage|etages|sous sol|niveau|mezzanine|combles?)\b/;
const ZONE = /^(batiment|batiments|amenagements?|bloc|annexe|annexes|corps|lot|villa|logement|residence|parties communes)\b/;
const MONTHS = /^(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+\d{4}$/;

function headingKind(text: string): 'zone' | 'level' | 'sub' {
  const n = normalizeText(text.replace(PREFIX, ''));
  if (ZONE.test(n)) return 'zone';
  if (LEVEL.test(n)) return 'level';
  return 'sub';
}

function src(file: SourceFile, grid: Grid, cell: GridCell | undefined, ref?: string): SourceRef {
  return {
    fileId: file.id,
    fileName: file.name,
    sheet: grid.sheet,
    cell: cell?.ref ?? ref,
    formula: cell?.formula,
  };
}

/** Évaluation récursive des formules du fichier (avec repli sur la valeur mémorisée). */
function gridEvaluator(grid: Grid) {
  const memo = new Map<string, number | null>();
  const stack = new Set<string>();
  function value(ref: string): number | null {
    if (memo.has(ref)) return memo.get(ref)!;
    const cell = cellByRef(grid, ref);
    if (!cell) return null;
    if (!cell.formula) return numberOf(cell);
    if (stack.has(ref)) throw new FormulaError(`Référence circulaire en ${ref}`);
    stack.add(ref);
    try {
      const v = evaluate(cell.formula, { cell: value });
      memo.set(ref, v);
      return v;
    } finally {
      stack.delete(ref);
    }
  }
  return value;
}

interface LineRow {
  row: number;
  line: DqeLine;
  lotIndex: number;
  sectionTitle: string;
}

export function parseDqeGrid(grid: Grid, file: SourceFile): ImportResult {
  const alerts: Alert[] = [];
  const detected: DetectedInfo[] = [];
  const alert = (severity: Alert['severity'], code: string, message: string, extra: Partial<Alert> = {}) =>
    alerts.push({ id: newId('a'), severity, code, message, ...extra });
  const evalCell = gridEvaluator(grid);

  // 1. Lignes d'en-tête.
  const headers: { row: number; cols: Columns }[] = [];
  for (let row = 1; row <= grid.maxRow; row++) {
    const cols = headerColumns(grid, row);
    if (cols) headers.push({ row, cols });
  }

  // 2. Repères globaux : récapitulatif général, intitulés de projet, métadonnées.
  let recapGeneralRow = Infinity;
  const titles: { text: string; cell: GridCell }[] = [];
  for (let row = 1; row <= grid.maxRow; row++) {
    const r = grid.rows.get(row);
    if (!r) continue;
    for (const cell of r.values()) {
      const t = textOf(cell);
      if (!t) continue;
      const n = normalizeText(t);
      if (/^recapitulatif general/.test(n) && recapGeneralRow === Infinity) recapGeneralRow = row;
      else if (/^pr[o0]jet\b/.test(n)) titles.push({ text: t.replace(/^PR0JET/i, 'PROJET'), cell });
      else if (/^republique\b/.test(n)) detected.push({ key: 'country', value: t, status: 'confirmed', source: src(file, grid, cell) });
      else if (MONTHS.test(n)) detected.push({ key: 'date', value: t, status: 'confirmed', source: src(file, grid, cell) });
      else if (/^phase\b/.test(n)) detected.push({ key: 'phase', value: t.replace(/\s+:\s+/, ' : '), status: 'confirmed', source: src(file, grid, cell) });
    }
  }

  // Intitulés de projet : on les garde tous ; s'ils divergent, DQP le signale (§27).
  const distinctTitles = [...new Map(titles.map((t) => [normalizeText(t.text), t])).values()];
  for (const t of distinctTitles) {
    detected.push({
      key: 'title',
      value: t.text,
      status: distinctTitles.length > 1 ? 'to_verify' : 'confirmed',
      source: src(file, grid, t.cell),
    });
    const loc = /\bA\s+([A-Z' -]*COMMUNE.+)$/i.exec(t.text);
    if (loc) detected.push({ key: 'location', value: loc[1].trim(), status: distinctTitles.length > 1 ? 'to_verify' : 'confirmed', source: src(file, grid, t.cell) });
  }
  if (distinctTitles.length > 1) {
    alert(
      'warning',
      'TITLE_CONFLICT',
      `Différence détectée : le fichier contient ${distinctTitles.length} intitulés de projet différents — ` +
        distinctTitles.map((t) => `« ${t.text} » (${t.cell.ref})`).join(' et ') +
        '. Choisissez l’intitulé et le type de projet à conserver.',
    );
  }
  const typeGuesses = distinctTitles.map((t) => ({ t, guess: detectProjectType(t.text) })).filter((g) => g.guess);
  const distinctTypes = [...new Set(typeGuesses.map((g) => g.guess!.type))];
  if (distinctTypes.length > 0) {
    detected.push({
      key: 'projectType',
      value: distinctTypes.join(' / '),
      status: 'to_verify',
      source: src(file, grid, typeGuesses[0].t.cell),
      note:
        'Type déduit de l’intitulé (' + typeGuesses.map((g) => `« ${g.guess!.keyword} »`).join(', ') + ')' +
        (distinctTypes.length > 1 ? ' — intitulés contradictoires' : ''),
    });
  }

  // 3. Lots et lignes.
  const lots: Lot[] = [];
  const lineRows: LineRow[] = [];
  const totalRows: { row: number; lotIndex: number; label: string; cell: GridCell }[] = [];
  const wordsRows: { row: number; lotIndex: number; text: string; cell: GridCell }[] = [];
  let formulaCount = 0;

  headers.forEach((h, hi) => {
    const nextHeader = headers[hi + 1]?.row ?? grid.maxRow + 1;
    const blockEnd = Math.min(nextHeader, recapGeneralRow);
    const cols = h.cols;
    const lotName = findLotName(grid, h.row, cols) || `Lot ${hi + 1}`;
    const lot: Lot = { id: newId('lot'), code: '', name: lotName, sections: [] };
    const lotIndex = lots.length;
    lots.push(lot);

    let zone = '';
    let level = '';
    let sub = '';
    let current: DqeSection | null = null;
    let linesStopped = false;

    for (let row = h.row + 1; row < blockEnd; row++) {
      const r = grid.rows.get(row);
      if (!r) continue;
      const texts = [...r.values()].filter((c) => textOf(c)).sort((a, b) => a.col - b.col);
      const firstText = texts[0] ? textOf(texts[0]) : '';
      const nFirst = normalizeText(firstText);

      if (/^total\b/.test(nFirst)) {
        const valueCell = rightmostValueCell(grid, row, cols);
        if (valueCell) totalRows.push({ row, lotIndex, label: firstText, cell: valueCell });
        continue;
      }
      if (/^arrete/.test(nFirst)) {
        linesStopped = true;
        const next = grid.rows.get(row + 1);
        const wc = next && [...next.values()].find((c) => /franc|fcfa/i.test(textOf(c)));
        if (wc) wordsRows.push({ row: row + 1, lotIndex, text: textOf(wc), cell: wc });
        continue;
      }
      if (/^recapitulatif/.test(nFirst) || /^pr[o0]jet\b/.test(nFirst)) {
        linesStopped = true;
        continue;
      }
      if (linesStopped) continue;

      const desCell = getCell(grid, row, cols.designation);
      const designation = textOf(desCell);
      const unitCell = cols.unit ? getCell(grid, row, cols.unit) : undefined;
      const unit = textOf(unitCell) || (unitCell && typeof unitCell.value === 'number' ? String(unitCell.value) : '');
      const qCell = cols.quantity ? getCell(grid, row, cols.quantity) : undefined;
      const pCell = cols.price ? getCell(grid, row, cols.price) : undefined;
      const aCell = cols.amount ? getCell(grid, row, cols.amount) : undefined;
      const numCell = cols.num ? getCell(grid, row, cols.num) : undefined;
      const hasValues = [qCell, pCell].some((c) => c && (numberOf(c) !== null || c.formula));

      if (designation && (unit || hasValues)) {
        if (!current) {
          current = makeSection(zone, level, sub, file, grid, desCell);
          lot.sections.push(current);
        }
        const line: DqeLine = {
          id: newId('l'),
          number: numCell ? String(numCell.value ?? '').trim() : '',
          designation,
          unit: unit ? normalizeUnit(unit) : '',
          quantity: { value: null, status: 'undetermined', origin: 'import' },
          unitPrice: { value: null, status: 'undetermined', origin: 'import' },
          coefficient: 1,
          lossPercent: 0,
          observation: '',
          source: src(file, grid, desCell),
          sourceAmount: aCell ? (aCell.error ? null : numberOf(aCell)) : undefined,
          edits: [],
        };
        current.lines.push(line);
        lineRows.push({ row, line, lotIndex, sectionTitle: current.title });
        for (const c of [qCell, pCell, aCell]) if (c?.formula) formulaCount++;
        continue;
      }

      // Ligne de titre (zone, niveau ou sous-partie).
      const headingText = designation || firstText;
      if (headingText) {
        const kind = headingKind(headingText);
        if (kind === 'zone') { zone = headingText; level = ''; sub = ''; }
        else if (kind === 'level') { level = headingText; sub = ''; }
        else sub = headingText;
        current = null;
      }
    }
  });

  // 4. Valeurs des lignes (quantité, prix) avec traçabilité ; les formules qui
  //    pointent vers la quantité d'une autre ligne deviennent des quantités liées.
  const lineByRow = new Map(lineRows.map((lr) => [lr.row, lr]));
  const lineColsByLot = headers.map((h) => h.cols);
  for (const lr of lineRows) {
    const cols = lineColsByLot[lr.lotIndex];
    const qCell = cols.quantity ? getCell(grid, lr.row, cols.quantity) : undefined;
    const pCell = cols.price ? getCell(grid, lr.row, cols.price) : undefined;
    lr.line.quantity = readValue(qCell, 'quantity', lr, cols, file, grid, evalCell, lineByRow, alert);
    lr.line.unitPrice = readValue(pCell, 'unitPrice', lr, cols, file, grid, evalCell, lineByRow, alert);

    // Contrôle de la formule de montant du fichier.
    const aCell = cols.amount ? getCell(grid, lr.row, cols.amount) : undefined;
    if (aCell?.formula && !hasBrokenReference(aCell.formula)) {
      const refs = referencedCells(aCell.formula).map((r) => r.replace(/\d+$/, ''));
      const q = cols.quantity ? colName(cols.quantity) : '';
      const p = cols.price ? colName(cols.price) : '';
      const usesOwnRow = referencedCells(aCell.formula).every((r) => Number(r.replace(/^[A-Z]+/, '')) === lr.row);
      if (!usesOwnRow || !refs.includes(q) || !refs.includes(p)) {
        alert('warning', 'AMOUNT_FORMULA', `Le montant de « ${lr.line.designation} » (${aCell.ref}) n’est pas calculé comme Quantité × PU de la même ligne : ${aCell.formula}`, {
          lineId: lr.line.id,
          source: src(file, grid, aCell),
        });
      }
    }
  }

  // 5. Formules cassées dans le fichier (#REF!…).
  let brokenFormulas = 0;
  for (const r of grid.rows.values())
    for (const cell of r.values()) {
      if ((cell.formula && hasBrokenReference(cell.formula)) || cell.error) {
        brokenFormulas++;
        const label = textOf(getCell(grid, cell.row, 2)) || textOf(getCell(grid, cell.row, 1)) || `ligne ${cell.row}`;
        alert(
          'error',
          'BROKEN_FORMULA',
          `Formule cassée dans le fichier en ${cell.ref} (« ${label} ») : ${cell.formula ?? ''}` +
            `${cell.error ? ` — le fichier affiche ${cell.error}` : ''}. DQP recalcule ce total à partir des lignes.`,
          { source: src(file, grid, cell) },
        );
      }
    }

  // 6. Contrôle croisé des totaux : quelles lignes chaque total du fichier compte-t-il réellement ?
  const amountRefOf = (lr: LineRow) => {
    const c = lineColsByLot[lr.lotIndex].amount;
    return c ? colName(c) + lr.row : '';
  };
  const lineByAmountRef = new Map(lineRows.map((lr) => [amountRefOf(lr), lr]));
  const coverage = coverageFn(grid, lineByAmountRef);
  const fileAmount = (lr: LineRow) => {
    const q = lr.line.quantity.value;
    const p = lr.line.unitPrice.value;
    return q !== null && p !== null ? q * p : 0;
  };

  lots.forEach((lot, li) => {
    const rows = totalRows.filter((t) => t.lotIndex === li);
    const last = rows[rows.length - 1];
    if (!last) return;
    const shown = last.cell.error ? null : numberOf(last.cell) ?? (last.cell.formula ? safe(() => evalCell(last.cell.ref)) : null);
    lot.sourceTotal = { value: shown, source: src(file, grid, last.cell) };
    if (!last.cell.formula) return;
    const cov = coverage(last.cell.ref);
    const lotLines = lineRows.filter((lr) => lr.lotIndex === li);
    const missing = lotLines.filter((lr) => !cov.counts.has(lr.row) && fileAmount(lr) !== 0);
    const doubled = lotLines.filter((lr) => (cov.counts.get(lr.row) ?? 0) > 1);
    if (missing.length) {
      const bySection = groupBy(missing, (m) => m.sectionTitle);
      const total = missing.reduce((s, m) => s + fileAmount(m), 0);
      alert(
        'error',
        'TOTAL_EXCLUDES_LINES',
        `Le total du lot « ${lot.name} » dans le fichier (${last.cell.ref} = ${formatMoney(shown)}) n’inclut pas ` +
          [...bySection].map(([title, ls]) => `la partie « ${title} » (${ls.length} ligne${ls.length > 1 ? 's' : ''} chiffrée${ls.length > 1 ? 's' : ''}, ${formatMoney(ls.reduce((s, m) => s + fileAmount(m), 0))})`).join(', ') +
          `. Écart : ${formatMoney(total)}. DQP compte toutes les lignes du lot.`,
        { lotId: lot.id, source: src(file, grid, last.cell) },
      );
    }
    if (doubled.length) {
      alert('error', 'TOTAL_DOUBLE_COUNT', `Le total du lot « ${lot.name} » (${last.cell.ref}) compte plusieurs fois : ${doubled.map((d) => `« ${d.line.designation} »`).join(', ')}.`, {
        lotId: lot.id,
        source: src(file, grid, last.cell),
      });
    }
    if (cov.broken.length) {
      alert('warning', 'TOTAL_THROUGH_BROKEN', `Le total du lot « ${lot.name} » (${last.cell.ref}) passe par des cellules contenant des références cassées (${cov.broken.join(', ')}).`, {
        lotId: lot.id,
      });
    }
  });

  // Montants en lettres (« ARRÊTÉ LE PRÉSENT DEVIS À LA SOMME DE … »).
  for (const w of wordsRows) {
    const lot = lots[w.lotIndex];
    const total = lot.sourceTotal?.value;
    if (total == null) continue;
    const digits = /\(([\d\s  .]+)\)/.exec(w.text)?.[1];
    const inDigits = digits ? Number(digits.replace(/[^\d]/g, '')) : null;
    const expectedWords = normalizeText(numberToFrenchWords(total));
    const wordsOk = normalizeText(w.text).startsWith(expectedWords);
    if (inDigits !== null && inDigits !== Math.round(total)) {
      alert('warning', 'AMOUNT_WORDS', `Montant en chiffres incorrect dans la phrase d’arrêté du lot « ${lot.name} » (${w.cell.ref}) : « ${digits!.trim()} » au lieu de ${formatNumber(Math.round(total), 0)}.`, {
        lotId: lot.id,
        source: src(file, grid, w.cell),
      });
    }
    if (!wordsOk) {
      alert('warning', 'AMOUNT_WORDS', `Montant en lettres du lot « ${lot.name} » (${w.cell.ref}) différent du total du fichier. Attendu : « ${amountInWords(total)} ».`, {
        lotId: lot.id,
        source: src(file, grid, w.cell),
      });
    }
  }

  // 7. Total général annoncé.
  let sourceGrandTotal: AnalysisResult['sourceGrandTotal'];
  if (recapGeneralRow !== Infinity) {
    for (let row = recapGeneralRow; row <= grid.maxRow; row++) {
      const r = grid.rows.get(row);
      if (!r) continue;
      const t = [...r.values()].map(textOf).find(Boolean) ?? '';
      if (/^total\b/.test(normalizeText(t))) {
        const vc = [...r.values()].filter((c) => numberOf(c) !== null || c.formula).sort((a, b) => b.col - a.col)[0];
        if (vc) {
          sourceGrandTotal = { value: vc.error ? null : numberOf(vc), source: src(file, grid, vc) };
          if (vc.formula) {
            const cov = coverage(vc.ref);
            const missing = lineRows.filter((lr) => !cov.counts.has(lr.row) && fileAmount(lr) !== 0);
            if (missing.length) {
              const amount = missing.reduce((s, m) => s + fileAmount(m), 0);
              const byLot = groupBy(missing, (m) => lots[m.lotIndex].name);
              alert(
                'error',
                'GRAND_TOTAL_EXCLUDES_LINES',
                `Le total général du fichier (${vc.ref} = ${formatMoney(sourceGrandTotal.value)}) ne compte pas ${missing.length} ligne(s) chiffrée(s) pour ${formatMoney(amount)} : ` +
                  [...byLot].map(([name, ls]) => `${name} (${ls.length})`).join(', ') + '.',
                { source: src(file, grid, vc) },
              );
            }
          }
        }
      }
    }
  }

  // 8. Numérotation et unités.
  lots.forEach((lot) => {
    const counts = new Map<string, number>();
    for (const s of lot.sections) for (const l of s.lines) if (l.number) counts.set(l.number, (counts.get(l.number) ?? 0) + 1);
    const dup = [...counts].filter(([, n]) => n > 1);
    if (dup.length) {
      alert('info', 'NUMBERING', `Numérotation non unique dans le lot « ${lot.name} » : ` + dup.map(([n, c]) => `N° ${n} utilisé ${c} fois`).join(', ') + '. À l’export, DQP numérote ce lot automatiquement (1.1, 1.2…).', { lotId: lot.id });
    }
  });
  const rawUnits = new Map<string, Set<string>>();
  for (const lr of lineRows) {
    const cols = lineColsByLot[lr.lotIndex];
    const raw = cols.unit ? textOf(getCell(grid, lr.row, cols.unit)) : '';
    if (!raw) continue;
    const norm = normalizeUnit(raw);
    if (!rawUnits.has(norm)) rawUnits.set(norm, new Set());
    rawUnits.get(norm)!.add(raw.trim());
  }
  const harmonised = [...rawUnits].filter(([norm, raws]) => raws.size > 1 || ![...raws].includes(norm));
  if (harmonised.length) {
    alert('info', 'UNITS', 'Unités harmonisées : ' + harmonised.map(([norm, raws]) => `${[...raws].join(', ')} → ${norm}`).join(' ; ') + '.');
  }

  if (headers.length === 0) {
    alert('error', 'NO_HEADER', 'Aucune ligne d’en-tête de DQE trouvée (colonnes attendues : Désignation, Unité, Quantité, Prix unitaire, Montant).');
  }

  renumberLots(lots);
  const sections = lots.reduce((s, l) => s + l.sections.length, 0);
  const analysis: AnalysisResult = {
    id: newId('an'),
    fileId: file.id,
    fileName: file.name,
    analyzedAt: nowIso(),
    engineVersion: ENGINE_VERSION,
    detected,
    fileAlerts: alerts,
    stats: { lots: lots.length, sections, lines: lineRows.length, formulas: formulaCount, brokenFormulas },
    sourceGrandTotal,
  };
  return { lots, analysis };
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(it);
  }
  return m;
}

function makeSection(zone: string, level: string, sub: string, file: SourceFile, grid: Grid, cell?: GridCell): DqeSection {
  const parts = [zone, level, sub].filter(Boolean);
  const title = parts.pop() ?? 'Général';
  return { id: newId('s'), title, path: parts, lines: [], source: src(file, grid, cell) };
}

function findLotName(grid: Grid, headerRow: number, cols: Columns): string {
  for (let row = headerRow - 1; row >= Math.max(1, headerRow - 4); row--) {
    const r = grid.rows.get(row);
    if (!r) continue;
    const texts = [...r.values()].map(textOf).filter(Boolean);
    const name = texts.find((t) => !/devis\s+quantitatif|^dqe$/i.test(t));
    if (name) return name;
  }
  void cols;
  return '';
}

function rightmostValueCell(grid: Grid, row: number, cols: Columns): GridCell | undefined {
  const r = grid.rows.get(row);
  if (!r) return undefined;
  const minCol = cols.quantity ?? cols.designation + 1;
  return [...r.values()]
    .filter((c) => c.col >= minCol && (numberOf(c) !== null || c.formula || c.error))
    .sort((a, b) => b.col - a.col)[0];
}

/** Lignes (par numéro de rangée) comptées par une cellule de total, en suivant ses formules. */
function coverageFn(grid: Grid, lineByAmountRef: Map<string, LineRow>) {
  return (startRef: string) => {
    const counts = new Map<number, number>();
    const broken: string[] = [];
    const visit = (ref: string, depth: number, mult: number) => {
      if (depth > 50) return;
      const lr = lineByAmountRef.get(ref);
      if (lr) {
        counts.set(lr.row, (counts.get(lr.row) ?? 0) + mult);
        return;
      }
      const cell = cellByRef(grid, ref);
      if (!cell?.formula) return;
      if (hasBrokenReference(cell.formula)) broken.push(ref);
      for (const r of referencedCells(cell.formula)) visit(r, depth + 1, mult);
    };
    visit(startRef, 0, 1);
    return { counts, broken };
  };
}

function readValue(
  cell: GridCell | undefined,
  field: 'quantity' | 'unitPrice',
  lr: LineRow,
  cols: Columns,
  file: SourceFile,
  grid: Grid,
  evalCell: (ref: string) => number | null,
  lineByRow: Map<number, LineRow>,
  alert: (severity: Alert['severity'], code: string, message: string, extra?: Partial<Alert>) => void,
): TrackedNumber {
  const label = field === 'quantity' ? 'Quantité' : 'Prix unitaire';
  const source = cell ? src(file, grid, cell) : undefined;
  const base = { origin: 'import' as const, source };
  if (!cell || (cell.value === null && !cell.formula && !cell.error)) {
    return { ...base, value: null, status: 'undetermined', note: `${label} absent(e) du fichier` };
  }
  if (cell.formula) {
    if (hasBrokenReference(cell.formula) || cell.error) {
      return { ...base, value: null, status: 'undetermined', note: `Formule cassée dans le fichier : ${cell.formula}` };
    }
    const refs = referencedCells(cell.formula);
    const qCol = cols.quantity ? colName(cols.quantity) : '';
    const linked =
      refs.length > 0 &&
      refs.every((r) => {
        const m = /^([A-Z]+)(\d+)$/.exec(r);
        return !!m && m[1] === qCol && lineByRow.has(Number(m[2])) && Number(m[2]) !== lr.row;
      });
    let value: number | null = null;
    try {
      value = evalCell(cell.ref);
    } catch (e) {
      return { ...base, value: null, status: 'undetermined', note: `Formule non évaluable (${(e as Error).message}) : ${cell.formula}` };
    }
    if (value !== null && Object.is(value, -0)) value = 0;
    if (field === 'quantity' && linked) {
      const expression = cell.formula
        .replace(/^=/, '')
        .replace(/\$?([A-Z]+)\$?(\d+)/g, (_, _col: string, r: string) => `{L:${lineByRow.get(Number(r))!.line.id}}`);
      return { ...base, value, status: 'confirmed', expression, note: `Quantité calculée par le fichier : ${cell.formula}` };
    }
    const ownRowOtherField = refs.some((r) => Number(r.replace(/^[A-Z]+/, '')) === lr.row);
    if (ownRowOtherField) {
      alert('warning', 'SUSPICIOUS_FORMULA', `${label} de « ${lr.line.designation} » (${cell.ref}) calculé(e) à partir de la même ligne : ${cell.formula} → ${formatNumber(value)}. Valeur à vérifier.`, {
        lineId: lr.line.id,
        source,
      });
      return { ...base, value, status: 'to_verify', note: `Formule suspecte dans le fichier : ${cell.formula}` };
    }
    return { ...base, value, status: 'confirmed', note: `Calculé(e) par la formule du fichier : ${cell.formula}` };
  }
  const value = numberOf(cell);
  if (value === null) {
    return { ...base, value: null, status: 'undetermined', note: `Valeur non numérique dans le fichier : « ${textOf(cell)} »` };
  }
  let status: Confidence = 'confirmed';
  let note: string | undefined;
  if (value === 0) {
    status = 'to_verify';
    note = `${label} égal(e) à 0 dans le fichier`;
  } else if (value < 0) {
    status = 'to_verify';
    note = `${label} négatif(ve) dans le fichier`;
  }
  return { ...base, value, status, note };
}
