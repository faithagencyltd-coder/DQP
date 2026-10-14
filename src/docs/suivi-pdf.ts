// Rapport journalier de chantier (§19.3) et liste des réserves (procès-verbal de levée) en PDF,
// avec les photos réelles du chantier et l'état de validation.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { workforceTotal } from '../engine/planning';
import { REPORT_STATUS, RESERVE_STATUS, fmtDate, fmtDateTime } from '../lib/labels';
import type { DailyReport, Organization, Photo, Project, Reserve } from '../lib/types';
import { ensureSpace, footer, header, lastY, LINE, loadLogo, M, MUTED, NAVY, pdfText } from './pdf';

const t = pdfText;
type Ctx = { org: Organization; logo?: { data: string; format: 'PNG' | 'JPEG' } | null; project: Project; photos: Map<string, string>; people?: Map<string, string> };

const imageSize = (src: string) => new Promise<{ w: number; h: number }>((resolve) => {
  const img = new Image();
  img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
  img.onerror = () => resolve({ w: 4, h: 3 });
  img.src = src;
});

function section(doc: jsPDF, y: number, title: string, body: string | null | undefined): number {
  const W = doc.internal.pageSize.getWidth();
  const lines = doc.setFont('helvetica', 'normal').setFontSize(9).splitTextToSize(t(body?.trim() || '—'), W - 2 * M);
  y = ensureSpace(doc, y, 8 + Math.min(lines.length, 6) * 4.2);
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...NAVY).text(t(title), M, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(body?.trim() ? 27 : 150, body?.trim() ? 36 : 150, body?.trim() ? 51 : 150);
  let yy = y + 4.5;
  for (const l of lines) { yy = ensureSpace(doc, yy, 4.5); doc.text(l, M, yy); yy += 4.2; }
  return yy + 2.5;
}

async function photoGrid(doc: jsPDF, y: number, photos: Photo[], urls: Map<string, string>): Promise<number> {
  if (!photos.length) return y;
  const W = doc.internal.pageSize.getWidth();
  const colW = (W - 2 * M - 6) / 2;
  y = ensureSpace(doc, y, 12);
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...NAVY).text(t(`Photos (${photos.length})`), M, y);
  y += 3;
  for (let i = 0; i < photos.length; i += 2) {
    const pair = photos.slice(i, i + 2);
    const sizes = await Promise.all(pair.map((p) => (urls.get(p.path) ? imageSize(urls.get(p.path)!) : Promise.resolve({ w: 4, h: 3 }))));
    const h = Math.min(70, Math.max(...sizes.map((s) => (colW * s.h) / s.w)));
    y = ensureSpace(doc, y, h + 10);
    pair.forEach((p, j) => {
      const x = M + j * (colW + 6);
      const src = urls.get(p.path);
      const s = sizes[j];
      const k = Math.min(colW / s.w, h / s.h);
      if (src) {
        try { doc.addImage(src, 'JPEG', x, y, s.w * k, s.h * k, undefined, 'FAST'); } catch { doc.setTextColor(...MUTED).setFontSize(8).text('Photo illisible', x + 2, y + 6); }
      } else doc.setDrawColor(...LINE).rect(x, y, colW, h).setTextColor(...MUTED).setFontSize(8).text('Photo indisponible', x + 2, y + 6);
      if (p.caption) doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED).text(t(p.caption), x, y + h + 4, { maxWidth: colW });
    });
    y += h + 8;
  }
  return y;
}

export async function buildDailyReportPdf(r: DailyReport, ctx: Ctx): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = header(doc, ctx, 'RAPPORT JOURNALIER', [['Référence', r.reference], ['Date', fmtDate(r.report_date)], ['Statut', REPORT_STATUS[r.status].label]]);
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...NAVY).text(t(`Chantier ${ctx.project.reference} — ${ctx.project.name}`), M, y);
  if (ctx.project.location) doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED).text(t(ctx.project.location), M, y + 4.5);
  y += 10;
  y = section(doc, y, 'Conditions observées (météo, accès, terrain)', [r.weather, r.conditions].filter(Boolean).join(' — '));
  y = section(doc, y, 'Travaux exécutés', r.work_done);
  if (r.workforce.length) {
    y = ensureSpace(doc, y, 20);
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...NAVY).text(t(`Effectifs présents : ${workforceTotal(r.workforce)}`), M, y);
    autoTable(doc, {
      startY: y + 2, margin: { left: M, right: M, bottom: 20 }, tableWidth: 110,
      head: [['Fonction', 'Nombre']], body: r.workforce.map((w) => [t(w.role), String(w.count)]),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.4, lineColor: LINE, lineWidth: 0.1 }, headStyles: { fillColor: NAVY, textColor: 255 },
      columnStyles: { 1: { halign: 'right', cellWidth: 24 } },
    });
    y = lastY(doc) + 5;
  } else y = section(doc, y, 'Effectifs présents', null);
  y = section(doc, y, 'Matériaux utilisés', r.materials);
  y = section(doc, y, 'Matériels mobilisés', r.equipment);
  y = section(doc, y, 'Incidents', r.incidents);
  y = section(doc, y, 'Retards', r.delays);
  y = section(doc, y, 'Observations', r.observations);
  y = await photoGrid(doc, y, r.photos, ctx.photos);
  y = ensureSpace(doc, y + 2, 26);
  const W = doc.internal.pageSize.getWidth();
  const half = (W - 2 * M - 6) / 2;
  const name = (id: string | null) => (id && ctx.people?.get(id)) || '—';
  const blocks: [string, string[]][] = [
    ['Établi et soumis', r.submitted_at ? [`Par ${name(r.submitted_by)}`, `le ${fmtDateTime(r.submitted_at)}`] : ['Non soumis']],
    ['Validation', r.validated_at ? [`Par ${name(r.validated_by)}`, `le ${fmtDateTime(r.validated_at)}`, r.validation_note ?? ''] : ['Non validé']],
  ];
  blocks.forEach(([label, lines], i) => {
    const x = M + i * (half + 6);
    doc.setDrawColor(...LINE).setLineWidth(0.3).roundedRect(x, y, half, 22, 1.5, 1.5);
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTED).text(t(label), x + 3, y + 5);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...NAVY);
    lines.filter(Boolean).forEach((l, k) => doc.text(t(l), x + 3, y + 10.5 + k * 4.2, { maxWidth: half - 6 }));
  });
  footer(doc, ctx, r.reference);
  return doc;
}

export async function dailyReportPdf(org: Organization, r: DailyReport, ctx: Omit<Ctx, 'org' | 'logo'>) {
  (await buildDailyReportPdf(r, { org, logo: await loadLogo(org), ...ctx })).save(`${r.reference}_${r.report_date}.pdf`);
}

export async function buildReservesPdf(list: Reserve[], ctx: Ctx): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const open = list.filter((r) => r.status === 'ouverte' || r.status === 'en_cours').length;
  let y = header(doc, ctx, 'LISTE DES RÉSERVES', [['Chantier', ctx.project.reference], ['Édition', new Date().toLocaleDateString('fr-FR')], ['Non levées', String(open)]]);
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...NAVY).text(t(ctx.project.name), M, y);
  y += 4;
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 20 },
    head: [['Réf.', 'Réserve', 'Localisation', 'Intervenant', 'Échéance', 'Statut', 'Levée le']],
    body: list.map((r) => [r.reference, t(r.title + (r.description ? `\n${r.description}` : '')), t(r.location ?? '—'), t(r.assignee_label ?? '—'), fmtDate(r.due_date), t(RESERVE_STATUS[r.status].label), r.lifted_on ? fmtDate(r.lifted_on) : '—']),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, lineColor: LINE, lineWidth: 0.1 }, headStyles: { fillColor: NAVY, textColor: 255 },
    columnStyles: { 0: { cellWidth: 24 }, 4: { cellWidth: 20 }, 5: { cellWidth: 24 }, 6: { cellWidth: 18 } },
  });
  y = lastY(doc) + 6;
  for (const r of list.filter((x) => x.photos.length)) {
    y = ensureSpace(doc, y, 14);
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...NAVY).text(t(`${r.reference} — ${r.title}`), M, y);
    y = await photoGrid(doc, y + 3, r.photos, ctx.photos);
  }
  footer(doc, ctx, `Réserves ${ctx.project.reference}`);
  return doc;
}

export async function reservesPdf(org: Organization, list: Reserve[], ctx: Omit<Ctx, 'org' | 'logo'>) {
  (await buildReservesPdf(list, { org, logo: await loadLogo(org), ...ctx })).save(`reserves_${ctx.project.reference}.pdf`);
}
