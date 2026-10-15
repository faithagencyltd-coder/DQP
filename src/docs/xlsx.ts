// Exports Excel (§14.6) : mêmes montants que l'écran et le PDF (moteur partagé).
import ExcelJS from 'exceljs';
import { bpuFromDoc, computeDoc } from '../engine/dqe';
import { computeMetre, FORMULAS, lineOrigin, ORIGIN_LABEL, type MetreLine, type MetreRules } from '../engine/metre';
import { currency } from '../engine/money';
import type { Contact, MetreDoc, Organization, Project, Quote } from '../lib/types';
import { downloadBlob, safeFileName } from '../lib/download';

const NAVY = 'FF0F1F38';
const LIGHT = 'FFE6ECF5';

function moneyFmt(cur: string) {
  return currency(cur).decimals ? '#,##0.00' : '#,##0';
}

function head(ws: ExcelJS.Worksheet, org: Organization, title: string, info: [string, string][]) {
  ws.addRow([org.name]).font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.addRow([title]).font = { bold: true, size: 12 };
  for (const [k, v] of info) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { color: { argb: 'FF667085' } };
  }
  ws.addRow([]);
}

export async function buildQuoteXlsx(org: Organization, q: Quote, client?: Contact | null, project?: Project | null): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PLANORA BTP';
  wb.created = new Date();
  const cur = q.settings.currency;
  const fmt = moneyFmt(cur);
  const r = computeDoc(q.body, q.settings);
  const label = q.kind === 'devis' ? 'Devis' : q.kind === 'dqe' ? 'Détail quantitatif estimatif (DQE)' : 'Bordereau des prix unitaires (BPU)';
  const ws = wb.addWorksheet(q.kind.toUpperCase(), { views: [{ state: 'frozen', ySplit: 0 }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  head(ws, org, `${label} — ${q.title}`, [
    ['Référence', `${q.reference} (version ${q.version}${q.locked ? ', validée' : ''})`],
    ['Date', new Date(q.issue_date + 'T00:00:00').toLocaleDateString('fr-FR')],
    ['Client', client?.name ?? '—'],
    ['Projet', project ? `${project.reference} — ${project.name}` : '—'],
    ['Devise', currency(cur).label],
  ]);
  if (q.kind === 'bpu') {
    ws.columns = [{ width: 12 }, { width: 60 }, { width: 10 }, { width: 18 }, { width: 30 }];
    const h = ws.addRow(['Réf.', 'Désignation', 'Unité', 'Prix unitaire HT', 'Observations']);
    h.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; });
    for (const it of bpuFromDoc(q.body).items) {
      const row = ws.addRow([it.ref, it.designation + (it.description ? `\n${it.description}` : ''), it.unit, it.unitPrice, it.note ?? '']);
      row.getCell(4).numFmt = fmt;
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    }
    return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
  }
  ws.columns = [{ width: 8 }, { width: 11 }, { width: 58 }, { width: 8 }, { width: 12 }, { width: 15 }, { width: 18 }];
  const h = ws.addRow(['N°', 'Réf.', 'Désignation', 'Unité', 'Quantité', 'P.U. HT', 'Montant HT']);
  h.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; c.alignment = { horizontal: 'center' }; });
  q.body.lots.forEach((lot, li) => {
    const lr = ws.addRow([`${lot.code} — ${lot.name}`]);
    ws.mergeCells(lr.number, 1, lr.number, 7);
    lr.font = { bold: true, color: { argb: NAVY } };
    lr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    for (const l of lot.lines) {
      if (l.kind === 'titre') { ws.addRow(['', '', l.designation]).font = { italic: true, bold: true }; continue; }
      const res = r.lines.get(l.id)!;
      const row = ws.addRow([res.number, l.ref, l.designation + (l.description ? `\n${l.description}` : ''), l.unit, l.qty, l.unitPrice, res.amount ?? 'à compléter']);
      row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(5).numFmt = '#,##0.###';
      row.getCell(6).numFmt = fmt;
      row.getCell(7).numFmt = fmt;
      if (res.amount === null) row.getCell(7).font = { color: { argb: 'FFB45309' } };
    }
    const st = ws.addRow(['', '', `Sous-total ${lot.code}${r.lots[li].incomplete ? ` (${r.lots[li].incomplete} ligne(s) à compléter non comptée(s))` : ''}`, '', '', '', r.lots[li].subtotal]);
    st.font = { bold: true };
    st.getCell(7).numFmt = fmt;
  });
  ws.addRow([]);
  const tot = (labelText: string, v: number, strong = false) => {
    const row = ws.addRow(['', '', '', '', '', labelText, v]);
    row.getCell(7).numFmt = fmt;
    if (strong) row.font = { bold: true };
  };
  tot('Total HT', r.totalHT, !r.discount && !r.taxes.length);
  if (r.discount) { tot(`Remise ${q.settings.discountPct} %`, -r.discount); tot('Net HT', r.netHT, !r.taxes.length); }
  for (const tx of r.taxes) tot(`${tx.label} ${tx.rate} %`, tx.amount);
  if (r.taxes.length) tot('Total TTC', r.totalTTC, true);
  if (r.incomplete) ws.addRow(['', '', `Attention : ${r.incomplete} ligne(s) sans quantité ou sans prix ne sont pas comptées.`]).font = { color: { argb: 'FFB45309' }, bold: true };
  ws.addRow([]);
  ws.addRow(['', '', `Généré par PLANORA BTP le ${new Date().toLocaleString('fr-FR')}`]).font = { size: 8, color: { argb: 'FF98A2B3' } };
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export async function buildMetreXlsx(org: Organization, m: MetreDoc, lines: MetreLine[], rules: MetreRules, project?: Project | null): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PLANORA BTP';
  const ws = wb.addWorksheet('Métré');
  head(ws, org, `Métré — ${m.title}`, [['Référence', m.reference], ['Projet', project ? `${project.reference} — ${project.name}` : '—'], ['Arrondi', `${rules.decimals} décimale(s)`], ['Seuil de déduction des ouvertures', `${rules.openingThreshold} m²`]]);
  ws.columns = [{ width: 9 }, { width: 36 }, { width: 16 }, { width: 18 }, { width: 22 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 8 }, { width: 8 }, { width: 12 }, { width: 8 }, { width: 18 }, { width: 70 }, { width: 24 }, { width: 24 }];
  const h = ws.addRow(['Réf.', 'Désignation', 'Localisation', 'Lot', 'Formule', 'Longueur', 'Largeur', 'Hauteur', 'Nombre', 'Pertes %', 'Quantité', 'Unité', 'Origine de la quantité', 'Détail du calcul', 'Source', 'Observations']);
  h.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; });
  for (const l of lines) {
    const r = computeMetre(l, rules);
    ws.addRow([l.ref, l.designation, l.location, l.lot, FORMULAS[l.formula].label + (l.expression ? ` : ${l.expression}` : ''), l.L, l.l, l.H, l.N, l.lossPct ?? null, r.qty ?? 'à compléter', l.unit, ORIGIN_LABEL[lineOrigin(l)].label, r.steps.join(' ; '), l.source, l.notes]);
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function exportQuoteXlsx(org: Organization, q: Quote, client?: Contact | null, project?: Project | null) {
  downloadBlob(new Blob([await buildQuoteXlsx(org, q, client, project)], { type: XLSX }), `${safeFileName(`${q.reference}_v${q.version}_${q.title}`)}.xlsx`);
}

export async function exportMetreXlsx(org: Organization, m: MetreDoc, lines: MetreLine[], rules: MetreRules, project?: Project | null) {
  downloadBlob(new Blob([await buildMetreXlsx(org, m, lines, rules, project)], { type: XLSX }), `${safeFileName(`${m.reference}_${m.title}`)}.xlsx`);
}
