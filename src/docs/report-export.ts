// Exports des rapports (§21) : PDF (impression), Excel et CSV, avec la date de génération, la
// période, le projet et les limites des données.

import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toCsv } from '../engine/csv';
import { currency as currencyInfo, formatMoney, formatNumber } from '../engine/money';
import { periodLabel, rawCell, type Cell, type ColType, type Report } from '../engine/reports';
import type { Organization } from '../lib/types';
import { footer, header, lastY, LINE, loadLogo, M, MUTED, NAVY, pdfText } from './pdf';

const t = pdfText;

export function formatCell(v: Cell, type: ColType, cur: string): string {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'money') return formatMoney(Number(v), cur, false);
  if (type === 'number') return formatNumber(Number(v), 3);
  if (type === 'pct') return `${formatNumber(Number(v), 1)} %`;
  if (type === 'date') return String(v).slice(0, 10).split('-').reverse().join('/');
  return String(v);
}

const meta = (r: Report, at: Date): [string, string][] => [
  ['Généré le', at.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })],
  ['Période', periodLabel(r.period)],
  ['Projet', r.project ?? 'Tous les projets autorisés'],
];

export async function buildReportPdf(org: Organization, r: Report): Promise<jsPDF> {
  const wide = r.sections.some((s) => s.columns.length > 7);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: wide ? 'landscape' : 'portrait' });
  const at = new Date();
  const W = doc.internal.pageSize.getWidth();
  let y = header(doc, { org, logo: await loadLogo(org), generatedAt: at }, r.title.toUpperCase(), meta(r, at));
  if (r.facts.length) {
    const colW = (W - 2 * M) / Math.min(4, r.facts.length);
    r.facts.forEach(([k, v, type], i) => {
      const x = M + (i % 4) * colW;
      const yy = y + Math.floor(i / 4) * 13;
      doc.setFillColor(242, 245, 250).roundedRect(x, yy, colW - 3, 11, 1.2, 1.2, 'F');
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED).text(t(k), x + 2.5, yy + 4);
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...NAVY).text(t(formatCell(v, type, r.currency)), x + 2.5, yy + 9);
    });
    y += Math.ceil(r.facts.length / 4) * 13 + 3;
  }
  for (const s of r.sections) {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...NAVY).text(t(s.title), M, y + 2);
    const numeric = (type: ColType) => type === 'money' || type === 'number' || type === 'pct';
    autoTable(doc, {
      startY: y + 4, margin: { left: M, right: M, bottom: 20 },
      head: [s.columns.map((c) => t(c.label))],
      body: s.rows.length ? s.rows.map((row) => s.columns.map((c) => t(formatCell(row[c.key] ?? null, c.type, r.currency)))) : [[{ content: 'Aucune donnée sur la période.', colSpan: s.columns.length }]],
      foot: s.totals ? [s.columns.map((c) => t(s.totals![c.key] === undefined ? '' : typeof s.totals![c.key] === 'string' ? String(s.totals![c.key]) : formatCell(s.totals![c.key] ?? null, c.type, r.currency)))] : undefined,
      styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 1.3, lineColor: LINE, lineWidth: 0.1 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [230, 236, 245], textColor: NAVY, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(s.columns.map((c, i) => [i, numeric(c.type) ? { halign: 'right' as const } : {}])),
    });
    y = lastY(doc) + 8;
  }
  if (r.limits.length) {
    const lines = doc.setFont('helvetica', 'normal').setFontSize(8.5).splitTextToSize(t(r.limits.map((l) => `• ${l}`).join('\n')), W - 2 * M);
    if (y + 8 + lines.length * 4 > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = M + 4; }
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...NAVY).text('Limites des données', M, y);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED).text(lines, M, y + 4.5);
  }
  footer(doc, { org, generatedAt: at }, r.title);
  return doc;
}

export async function buildReportXlsx(org: Organization, r: Report): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PLANORA BTP';
  wb.created = new Date();
  const moneyFmt = currencyInfo(r.currency).decimals ? '#,##0.00' : '#,##0';
  const ws = wb.addWorksheet('Synthèse');
  ws.addRow([org.name]).font = { bold: true, size: 14, color: { argb: 'FF0F1F38' } };
  ws.addRow([r.title]).font = { bold: true, size: 12 };
  for (const [k, v] of meta(r, new Date())) ws.addRow([k, v]).getCell(1).font = { color: { argb: 'FF667085' } };
  ws.addRow(['Devise', currencyInfo(r.currency).label]).getCell(1).font = { color: { argb: 'FF667085' } };
  ws.addRow([]);
  for (const [k, v, type] of r.facts) {
    const row = ws.addRow([k, rawCell(v)]);
    if (type === 'money') row.getCell(2).numFmt = moneyFmt;
  }
  if (r.limits.length) {
    ws.addRow([]);
    ws.addRow(['Limites des données']).font = { bold: true };
    for (const l of r.limits) ws.addRow([l]);
  }
  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 28;
  r.sections.forEach((s, idx) => {
    const sh = wb.addWorksheet(`${idx + 1}. ${s.title}`.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
    const head = sh.addRow(s.columns.map((c) => c.label));
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1F38' } }; });
    for (const row of s.rows) sh.addRow(s.columns.map((c) => (c.type === 'date' && row[c.key] ? new Date(String(row[c.key]).slice(0, 10) + 'T00:00:00') : rawCell(row[c.key] ?? null))));
    if (s.totals) sh.addRow(s.columns.map((c) => rawCell(s.totals![c.key] ?? null))).font = { bold: true };
    s.columns.forEach((c, i) => {
      const col = sh.getColumn(i + 1);
      col.width = c.type === 'text' ? 28 : 16;
      if (c.type === 'money') col.numFmt = moneyFmt;
      if (c.type === 'number') col.numFmt = '#,##0.###';
      if (c.type === 'pct') col.numFmt = '0.0" %"';
      if (c.type === 'date') col.numFmt = 'dd/mm/yyyy';
    });
    sh.views = [{ state: 'frozen', ySplit: 1 }];
  });
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export function buildReportCsv(r: Report): string {
  const out: unknown[][] = [[r.title], ['Généré le', new Date().toISOString()], ['Période', periodLabel(r.period)], ['Projet', r.project ?? 'Tous'], ['Devise', r.currency], []];
  for (const [k, v] of r.facts) out.push([k, rawCell(v)]);
  for (const s of r.sections) {
    out.push([], [s.title], s.columns.map((c) => c.label));
    for (const row of s.rows) out.push(s.columns.map((c) => rawCell(row[c.key] ?? null)));
    if (s.totals) out.push(s.columns.map((c) => rawCell(s.totals![c.key] ?? null)));
  }
  if (r.limits.length) out.push([], ['Limites des données'], ...r.limits.map((l) => [l]));
  return toCsv(out);
}
