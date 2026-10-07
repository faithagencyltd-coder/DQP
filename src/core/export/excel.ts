// Export du DQE vers Excel (§38) : formules vivantes (Montant = Qté × PU, sous-totaux,
// récapitulatif), montant en lettres, et une feuille de traçabilité (§37).

import ExcelJS from 'exceljs';
import type { ProjectResult } from '../dqe';
import { exportNumbers, groupSections } from '../dqe';
import { amountInWords, formatNumber } from '../format';
import { referencedLines } from '../formula';
import { FIELD_LABEL } from '../project';
import type { Alert, Confidence, Project } from '../types';

const STATUS_LABEL: Record<Confidence, string> = {
  confirmed: 'Confirmé',
  to_verify: 'À vérifier',
  undetermined: 'Non déterminé',
};

const DARK = 'FF1F3A5F';
const LIGHT = 'FFE8EEF5';
const WARN = 'FFFFF4D6';
const BAD = 'FFFDE2E1';

export async function exportDqeExcel(project: Project, result: ProjectResult, alerts: Alert[], appVersion: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `DQP ${appVersion}`;
  wb.created = new Date();
  const cur = project.settings.currency;

  // Le récapitulatif est créé en premier pour être la première feuille du classeur.
  const rc = wb.addWorksheet('Récapitulatif', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });

  // ---------- Feuille DQE ----------
  const ws = wb.addWorksheet('DQE', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: `&L${project.info.name}&CDQE — page &P / &N&RDQP ${appVersion}` },
    views: [{ state: 'frozen', ySplit: 0 }],
  });
  ws.columns = [
    { key: 'num', width: 7 },
    { key: 'des', width: 58 },
    { key: 'unit', width: 8 },
    { key: 'qty', width: 12 },
    { key: 'pu', width: 13 },
    { key: 'amount', width: 17 },
  ];

  const title = (text: string, size = 14) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, 6);
    row.getCell(1).font = { bold: true, size };
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    return row;
  };
  title(project.info.name.toUpperCase(), 15);
  if (project.info.location) title(project.info.location, 11);
  title('DEVIS QUANTITATIF ET ESTIMATIF', 13);
  const meta = [project.info.phase, project.info.date].filter(Boolean).join(' — ');
  if (meta) title(meta, 10);
  ws.addRow([]);

  const lotTotalCell = new Map<string, string>();
  const qtyCellOfLine = new Map<string, string>();
  const pendingLinks: { cell: ExcelJS.Cell; lineId: string }[] = [];
  const byId = new Map(project.lots.flatMap((l) => l.sections.flatMap((s) => s.lines)).map((l) => [l.id, l]));
  const numbers = exportNumbers(project);

  for (const lot of project.lots) {
    const lotRow = ws.addRow([`${lot.code} — ${lot.name.toUpperCase()}`]);
    ws.mergeCells(lotRow.number, 1, lotRow.number, 6);
    lotRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    lotRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
    const head = ws.addRow(['N°', 'DÉSIGNATION', 'UNITÉ', 'QUANTITÉ', `PRIX UNITAIRE (${cur})`, `MONTANT (${cur})`]);
    head.eachCell((c) => {
      c.font = { bold: true, size: 9 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = border();
    });

    const sectionTotals: string[] = [];
    for (const group of groupSections(lot)) {
      if (group.path.length) {
        const r = ws.addRow(['', group.path.join(' › ').toUpperCase()]);
        r.getCell(2).font = { bold: true, underline: true };
      }
      for (const section of group.sections) {
        const st = ws.addRow(['', section.title]);
        st.getCell(2).font = { bold: true, italic: true };
        const first = ws.rowCount + 1;
        for (const line of section.lines) {
          const lr = result.lines.get(line.id)!;
          const row = ws.addRow([numbers.get(line.id), line.designation, line.unit, null, line.unitPrice.value, null]);
          const qCell = row.getCell(4);
          qtyCellOfLine.set(line.id, `D${row.number}`);
          const hasAdjust = line.coefficient !== 1 || line.lossPercent !== 0;
          if (line.quantity.expression && !hasAdjust && lr.quantity !== null) {
            pendingLinks.push({ cell: qCell, lineId: line.id });
            qCell.value = lr.quantity;
          } else if (lr.quantity !== null && hasAdjust) {
            qCell.value = {
              formula: `${round(lr.quantity)}*${line.coefficient}*(1+${line.lossPercent}/100)`,
              result: lr.retained ?? undefined,
            };
          } else {
            qCell.value = lr.quantity;
          }
          row.getCell(6).value = { formula: `D${row.number}*E${row.number}`, result: lr.amount ?? 0 };
          row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
          row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
          row.getCell(3).alignment = { horizontal: 'center', vertical: 'top' };
          qCell.numFmt = '#,##0.00';
          row.getCell(5).numFmt = '#,##0';
          row.getCell(6).numFmt = '#,##0';
          row.eachCell({ includeEmpty: true }, (c) => (c.border = border()));
          markStatus(qCell, lr.quantityStatus, line.quantity.note);
          markStatus(row.getCell(5), line.unitPrice.status, line.unitPrice.note);
          const edits = line.edits.filter((e) => e.field === 'quantity' || e.field === 'unitPrice');
          if (edits.length) {
            const last = edits[edits.length - 1];
            const target = last.field === 'quantity' ? qCell : row.getCell(5);
            target.note = `Modifié manuellement le ${last.at.slice(0, 10)} (${FIELD_LABEL[last.field]} : ${last.before ?? '—'} → ${last.after ?? '—'})`;
            target.font = { color: { argb: 'FF1D4ED8' } };
          }
        }
        const last = ws.rowCount;
        const sub = ws.addRow(['', `Sous-total ${section.title}`, '', '', '', section.lines.length ? { formula: `SUM(F${first}:F${last})`, result: result.sections.get(section.id)?.amount ?? 0 } : 0]);
        sub.getCell(2).font = { bold: true, italic: true };
        sub.getCell(6).font = { bold: true };
        sub.getCell(6).numFmt = '#,##0';
        sectionTotals.push(`F${sub.number}`);
      }
    }
    const lt = result.lots.get(lot.id)!;
    const totalRow = ws.addRow(['', `TOTAL ${lot.code} — ${lot.name.toUpperCase()}`, '', '', '', { formula: sectionTotals.length ? sectionTotals.join('+') : '0', result: lt.amount }]);
    totalRow.eachCell({ includeEmpty: true }, (c) => {
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
      c.border = border();
    });
    totalRow.getCell(6).numFmt = '#,##0';
    lotTotalCell.set(lot.id, `F${totalRow.number}`);
    const words = ws.addRow(['', `Arrêté le présent lot à la somme de : ${amountInWords(lt.amount)}`]);
    ws.mergeCells(words.number, 2, words.number, 6);
    words.getCell(2).font = { italic: true, size: 9 };
    words.getCell(2).alignment = { wrapText: true };
    words.height = 28;
    ws.addRow([]);
  }

  // Quantités liées : formule Excel vivante vers la quantité de la ligne référencée.
  for (const { cell, lineId } of pendingLinks) {
    const line = byId.get(lineId)!;
    const expr = line.quantity.expression!;
    const refs = referencedLines(expr);
    if (refs.every((id) => qtyCellOfLine.has(id))) {
      const formula = expr.replace(/\{L:([^}]+)\}/g, (_, id: string) => qtyCellOfLine.get(id)!);
      cell.value = { formula, result: result.lines.get(lineId)?.quantity ?? 0 };
    }
  }

  // ---------- Récapitulatif ----------
  rc.columns = [{ width: 10 }, { width: 55 }, { width: 22 }];
  const rt = rc.addRow([project.info.name.toUpperCase()]);
  rc.mergeCells(rt.number, 1, rt.number, 3);
  rt.getCell(1).font = { bold: true, size: 14 };
  rt.getCell(1).alignment = { horizontal: 'center' };
  const rs = rc.addRow(['RÉCAPITULATIF GÉNÉRAL']);
  rc.mergeCells(rs.number, 1, rs.number, 3);
  rs.getCell(1).font = { bold: true, size: 12 };
  rs.getCell(1).alignment = { horizontal: 'center' };
  rc.addRow([]);
  const rh = rc.addRow(['N°', 'DÉSIGNATION', `MONTANT (${cur})`]);
  rh.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    c.border = border();
  });
  const firstLot = rc.rowCount + 1;
  project.lots.forEach((lot, i) => {
    const r = rc.addRow([i + 1, `${lot.code} — ${lot.name}`, { formula: `DQE!${lotTotalCell.get(lot.id)}`, result: result.lots.get(lot.id)!.amount }]);
    r.getCell(3).numFmt = '#,##0';
    r.eachCell((c) => (c.border = border()));
  });
  const lastLot = rc.rowCount;
  const ht = rc.addRow(['', 'TOTAL HORS TAXES', { formula: project.lots.length ? `SUM(C${firstLot}:C${lastLot})` : '0', result: result.totalHT }]);
  ht.font = { bold: true };
  ht.getCell(3).numFmt = '#,##0';
  let finalRow = ht;
  if (project.settings.vatRate > 0) {
    const vat = rc.addRow(['', `TVA ${formatNumber(project.settings.vatRate)} %`, { formula: `ROUND(C${ht.number}*${project.settings.vatRate}/100,0)`, result: result.vat }]);
    vat.getCell(3).numFmt = '#,##0';
    finalRow = rc.addRow(['', 'TOTAL TOUTES TAXES COMPRISES', { formula: `C${ht.number}+C${vat.number}`, result: result.totalTTC }]);
    finalRow.font = { bold: true };
    finalRow.getCell(3).numFmt = '#,##0';
  }
  finalRow.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }));
  rc.addRow([]);
  const w = rc.addRow([`Arrêté le présent devis à la somme de : ${amountInWords(project.settings.vatRate > 0 ? result.totalTTC : result.totalHT)}${project.settings.vatRate > 0 ? ' TTC' : ' HT'}.`]);
  rc.mergeCells(w.number, 1, w.number, 3);
  w.getCell(1).alignment = { wrapText: true };
  w.height = 34;
  if (result.incomplete > 0) {
    const n = rc.addRow([`Attention : ${result.incomplete} ligne(s) sans quantité ou sans prix ne sont pas chiffrées dans ce total.`]);
    rc.mergeCells(n.number, 1, n.number, 3);
    n.getCell(1).font = { italic: true, color: { argb: 'FFB45309' } };
  }

  // ---------- Traçabilité ----------
  const tr = wb.addWorksheet('Traçabilité');
  tr.columns = [
    { header: 'Lot', width: 26 },
    { header: 'Section', width: 26 },
    { header: 'Désignation', width: 45 },
    { header: 'Unité', width: 7 },
    { header: 'Quantité', width: 12 },
    { header: 'État quantité', width: 14 },
    { header: 'Source quantité', width: 28 },
    { header: 'Prix unitaire', width: 12 },
    { header: 'État prix', width: 14 },
    { header: 'Source prix', width: 28 },
    { header: 'Calcul', width: 60 },
    { header: 'Modifications manuelles', width: 50 },
  ];
  tr.getRow(1).font = { bold: true };
  for (const lot of project.lots)
    for (const s of lot.sections)
      for (const l of s.lines) {
        const r = result.lines.get(l.id)!;
        const srcText = (n: typeof l.quantity) =>
          [n.source ? `${n.source.fileName}${n.source.sheet ? ' / ' + n.source.sheet : ''}${n.source.cell ? ' !' + n.source.cell : ''}` : n.origin === 'manual' ? 'Saisie manuelle' : n.origin === 'library' ? 'Bibliothèque de prix' : '', n.note ?? '']
            .filter(Boolean)
            .join(' — ');
        tr.addRow([
          `${lot.code} ${lot.name}`,
          [...s.path, s.title].join(' › '),
          l.designation,
          l.unit,
          r.retained,
          STATUS_LABEL[r.quantityStatus],
          srcText(l.quantity),
          l.unitPrice.value,
          STATUS_LABEL[l.unitPrice.status],
          srcText(l.unitPrice),
          r.steps.join(' | '),
          l.edits.map((e) => `${e.at.slice(0, 16).replace('T', ' ')} ${FIELD_LABEL[e.field]} : ${e.before ?? '—'} → ${e.after ?? '—'}`).join('\n'),
        ]);
      }
  tr.views = [{ state: 'frozen', ySplit: 1 }];
  tr.autoFilter = { from: 'A1', to: 'L1' };

  // ---------- Contrôles ----------
  if (alerts.length) {
    const al = wb.addWorksheet('Contrôles');
    al.columns = [{ header: 'Gravité', width: 14 }, { header: 'Message', width: 120 }, { header: 'Source', width: 30 }];
    al.getRow(1).font = { bold: true };
    for (const a of alerts) {
      al.addRow([a.severity === 'error' ? 'Erreur' : a.severity === 'warning' ? 'À vérifier' : 'Information', a.message, a.source ? `${a.source.fileName}${a.source.cell ? ' !' + a.source.cell : ''}` : '']);
    }
    al.getColumn(2).alignment = { wrapText: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function border(): Partial<ExcelJS.Borders> {
  const thin = { style: 'thin' as const, color: { argb: 'FFB8C2CC' } };
  return { top: thin, left: thin, bottom: thin, right: thin };
}

function markStatus(cell: ExcelJS.Cell, status: Confidence, note?: string) {
  if (status === 'confirmed') return;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: status === 'undetermined' ? BAD : WARN } };
  cell.note = `${STATUS_LABEL[status]}${note ? ' — ' + note : ''}`;
}
