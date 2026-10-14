// Documents PDF professionnels (§14.5, §30) : en-tête de l'entreprise, client, projet,
// référence, version, tableau par lots avec sous-totaux, totaux, montant en lettres,
// conditions, zone de signature, pied de page numéroté.
// Les montants viennent du moteur partagé (src/engine) : identiques à l'écran et à l'Excel.

import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { amountInWords, formatMoney, formatNumber } from '../engine/money';
import { bpuFromDoc, computeDoc } from '../engine/dqe';
import { computeMetre, FORMULAS } from '../engine/metre';
import { COUNTRIES, CLIENT_TYPES } from '../lib/labels';
import type { Contact, MetreDoc, Organization, Project, Quote } from '../lib/types';

export const NAVY: [number, number, number] = [15, 31, 56];
export const SIGNAL: [number, number, number] = [242, 106, 27];
export const MUTED: [number, number, number] = [102, 112, 133];
export const LINE: [number, number, number] = [227, 232, 239];
export const M = 14; // marge (mm)

/** Le PDF utilise l'encodage WinAnsi : on remplace les rares caractères hors de cet alphabet. */
export function pdfText(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/−/g, '-')
    .replace(/≤/g, '<=').replace(/≥/g, '>=')
    .replace(/→/g, '->')
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/g, '?');
}

export interface PdfContext {
  org: Organization;
  logo?: { data: string; format: 'PNG' | 'JPEG' } | null;
  client?: Contact | null;
  project?: Project | null;
  generatedAt?: Date;
}

const t = pdfText;
export const money = (v: number | null | undefined, cur: string) => t(formatMoney(v, cur, false));

export function header(doc: jsPDF, ctx: PdfContext, title: string, meta: [string, string][]) {
  const W = doc.internal.pageSize.getWidth();
  let y = M;
  // Bandeau de l'entreprise (logo ou nom)
  if (ctx.logo) {
    try { doc.addImage(ctx.logo.data, ctx.logo.format, M, y, 28, 18, undefined, 'FAST'); } catch { /* logo illisible : ignoré */ }
  }
  const x0 = ctx.logo ? M + 32 : M;
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...NAVY).text(t(ctx.org.name), x0, y + 5);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
  const coords = [
    ctx.org.legal_name && ctx.org.legal_name !== ctx.org.name ? ctx.org.legal_name : null,
    [ctx.org.address, ctx.org.city, COUNTRIES[ctx.org.country]].filter(Boolean).join(', ') || null,
    [ctx.org.phone, ctx.org.email].filter(Boolean).join(' · ') || null,
    (ctx.org.legal_ids ?? []).filter((x) => x.value).map((x) => `${x.label} : ${x.value}`).join(' · ') || null,
  ].filter(Boolean) as string[];
  coords.forEach((c, i) => doc.text(t(c), x0, y + 10 + i * 3.8));
  // Titre et références à droite
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...NAVY).text(t(title), W - M, y + 6, { align: 'right' });
  doc.setFontSize(8.5).setFont('helvetica', 'normal').setTextColor(...MUTED);
  meta.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'normal').text(t(k), W - M - 32, y + 12 + i * 4.2, { align: 'right' });
    doc.setFont('helvetica', 'bold').setTextColor(...NAVY).text(t(v), W - M, y + 12 + i * 4.2, { align: 'right' }).setTextColor(...MUTED);
  });
  y += Math.max(12 + coords.length * 3.8, 12 + meta.length * 4.2) + 3;
  doc.setDrawColor(...SIGNAL).setLineWidth(0.8).line(M, y, W - M, y);
  return y + 5;
}

export function partyBlocks(doc: jsPDF, ctx: PdfContext, y: number) {
  const W = doc.internal.pageSize.getWidth();
  const half = (W - 2 * M - 6) / 2;
  const box = (x: number, label: string, lines: string[]) => {
    doc.setFillColor(242, 245, 250).roundedRect(x, y, half, 6 + Math.max(lines.length, 1) * 4.2 + 2, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...MUTED).text(t(label.toUpperCase()), x + 3, y + 4.5);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...NAVY);
    (lines.length ? lines : ['—']).forEach((l, i) => doc.setFont('helvetica', i === 0 ? 'bold' : 'normal').text(t(l), x + 3, y + 9.5 + i * 4.2, { maxWidth: half - 6 }));
    return 6 + Math.max(lines.length, 1) * 4.2 + 2;
  };
  const c = ctx.client;
  const h1 = box(M, 'Client', c ? [c.name, c.contact_person ? `À l’attention de ${c.contact_person}` : '', [c.address, c.city, c.country && COUNTRIES[c.country]].filter(Boolean).join(', '), [c.phone, c.email].filter(Boolean).join(' · '), c.client_type ? CLIENT_TYPES[c.client_type] ?? '' : ''].filter(Boolean) : []);
  const p = ctx.project;
  const h2 = box(M + half + 6, 'Projet', p ? [p.name, `Réf. ${p.reference}`, [p.location, p.city].filter(Boolean).join(', ')].filter(Boolean) : []);
  return y + Math.max(h1, h2) + 6;
}

export function footer(doc: jsPDF, ctx: PdfContext, label: string) {
  const n = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const at = (ctx.generatedAt ?? new Date()).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(M, H - 14, W - M, H - 14);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    const extra = [ctx.org.quote_footer, ctx.org.bank_details ? `Banque : ${ctx.org.bank_details.replace(/\n/g, ' · ')}` : null].filter(Boolean).join(' — ');
    if (extra) doc.text(t(extra), M, H - 10, { maxWidth: W - 2 * M - 30 });
    doc.text(t(`${label} · généré par PLANORA BTP le ${at}`), M, H - 6);
    doc.text(t(`Page ${i} / ${n}`), W - M, H - 6, { align: 'right' });
  }
}

export function ensureSpace(doc: jsPDF, y: number, need: number) {
  const H = doc.internal.pageSize.getHeight();
  if (y + need > H - 20) {
    doc.addPage();
    return M + 4;
  }
  return y;
}

export const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

// ------------------------------------------------------------------ DQE et devis
export function buildQuotePdf(q: Quote, ctx: PdfContext): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cur = q.settings.currency;
  const isDevis = q.kind === 'devis';
  const r = computeDoc(q.body, isDevis ? q.settings : { ...q.settings, taxes: q.settings.taxes ?? [] });
  const title = isDevis ? 'DEVIS' : q.kind === 'dqe' ? 'DÉTAIL QUANTITATIF ESTIMATIF' : 'BORDEREAU DES PRIX';
  let y = header(doc, ctx, title.length > 12 ? (q.kind === 'dqe' ? 'DQE' : 'BPU') : title, [
    ['Référence', q.reference], ['Version', `v${q.version}${q.locked ? ' (validée)' : ''}`], ['Date', new Date(q.issue_date + 'T00:00:00').toLocaleDateString('fr-FR')],
    ...(isDevis && q.valid_until ? [['Valable jusqu’au', new Date(q.valid_until + 'T00:00:00').toLocaleDateString('fr-FR')] as [string, string]] : []),
  ]);
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...NAVY).text(t(q.title), M, y);
  if (!isDevis) doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED).text(t(title), M, y + 4.5);
  y += isDevis ? 5 : 9;
  y = partyBlocks(doc, ctx, y);

  if (q.kind === 'bpu') {
    const { items } = bpuFromDoc(q.body);
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [['Réf.', 'Désignation', 'Unité', 'Prix unitaire HT', 'Observations']],
      body: items.map((i) => [t(i.ref), t(i.designation + (i.description ? `\n${i.description}` : '')), t(i.unit), i.unitPrice === null ? 'à compléter' : money(i.unitPrice, cur), t(i.note ?? '')]),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.1, textColor: [27, 36, 51] },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 15, halign: 'center' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 38 } },
    });
    y = lastY(doc) + 6;
    y = conditions(doc, q, y, cur, false);
    footer(doc, ctx, `${q.reference} v${q.version}`);
    return doc;
  }

  const body: RowInput[] = [];
  q.body.lots.forEach((lot, li) => {
    body.push([{ content: t(`${lot.code} — ${lot.name}`.toUpperCase()), colSpan: 7, styles: { fillColor: [230, 236, 245], fontStyle: 'bold', textColor: NAVY } }]);
    for (const l of lot.lines) {
      if (l.kind === 'titre') {
        body.push([{ content: t(l.designation), colSpan: 7, styles: { fontStyle: 'bolditalic', textColor: NAVY } }]);
        continue;
      }
      const lr = r.lines.get(l.id)!;
      body.push([
        lr.number, t(l.ref), t(l.designation + (l.description ? `\n${l.description}` : '')), t(l.unit),
        l.qty === null ? 'à compléter' : t(formatNumber(l.qty, 3)),
        l.unitPrice === null ? 'à compléter' : money(l.unitPrice, cur),
        lr.amount === null ? { content: 'à compléter', styles: { textColor: [180, 83, 9] } } : money(lr.amount, cur),
      ]);
    }
    const lotR = r.lots[li];
    body.push([{ content: t(`Sous-total ${lot.code}${lotR.incomplete ? ` (${lotR.incomplete} ligne(s) à compléter non comptée(s))` : ''}`), colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } }, { content: money(lotR.subtotal, cur), styles: { fontStyle: 'bold' } }]);
  });
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 20 },
    head: [['N°', 'Réf.', 'Désignation', 'Unité', 'Quantité', 'P.U. HT', 'Montant HT']],
    body,
    styles: { font: 'helvetica', fontSize: 8.3, cellPadding: 1.6, lineColor: LINE, lineWidth: 0.1, textColor: [27, 36, 51], valign: 'middle' },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 15 }, 3: { cellWidth: 12, halign: 'center' }, 4: { cellWidth: 19, halign: 'right' }, 5: { cellWidth: 25, halign: 'right' }, 6: { cellWidth: 28, halign: 'right' } },
  });
  y = lastY(doc) + 4;

  // Totaux
  const W = doc.internal.pageSize.getWidth();
  const rows: [string, string, boolean?][] = [['Total HT', money(r.totalHT, cur)]];
  if (r.discount) rows.push([`Remise ${formatNumber(q.settings.discountPct ?? 0, 2)} %`, '- ' + money(r.discount, cur)], ['Net HT', money(r.netHT, cur)]);
  for (const tx of r.taxes) rows.push([`${tx.label} ${formatNumber(tx.rate, 2)} %`, money(tx.amount, cur)]);
  if (r.taxes.length) rows.push(['Total TTC', money(r.totalTTC, cur), true]);
  else rows[rows.length - 1][2] = true;
  y = ensureSpace(doc, y, rows.length * 6 + 14);
  rows.forEach(([k, v, strong], i) => {
    const yy = y + i * 6;
    if (strong) doc.setFillColor(...NAVY).rect(W - M - 80, yy - 4.2, 80, 6, 'F');
    doc.setFont('helvetica', strong ? 'bold' : 'normal').setFontSize(strong ? 10 : 9).setTextColor(strong ? 255 : 27, strong ? 255 : 36, strong ? 255 : 51);
    doc.text(t(k), W - M - 78, yy);
    doc.text(t(`${v} ${cur === 'XOF' || cur === 'XAF' ? 'FCFA' : cur}`), W - M - 2, yy, { align: 'right' });
  });
  y += rows.length * 6 + 2;
  const final = r.taxes.length ? r.totalTTC : r.netHT;
  doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(...MUTED)
    .text(t(`Arrêté le présent ${isDevis ? 'devis' : 'document'} à la somme de : ${amountInWords(final, cur)} ${r.taxes.length ? 'TTC' : 'HT'}.`), M, y + 3, { maxWidth: W - 2 * M });
  y += 9;
  if (r.incomplete) {
    doc.setFont('helvetica', 'bold').setTextColor(180, 83, 9).text(t(`Attention : ${r.incomplete} ligne(s) sans quantité ou sans prix ne sont pas comptées dans les totaux.`), M, y);
    y += 6;
  }
  y = conditions(doc, q, y, cur, isDevis);
  footer(doc, ctx, `${q.reference} v${q.version}`);
  return doc;
}

function conditions(doc: jsPDF, q: Quote, y: number, _cur: string, signature: boolean) {
  const W = doc.internal.pageSize.getWidth();
  const items: [string, string][] = [];
  if (q.payment_terms) items.push(['Conditions de paiement', q.payment_terms]);
  if (q.execution_delay) items.push(['Délai d’exécution', q.execution_delay]);
  if (q.notes) items.push(['Observations', q.notes]);
  for (const [k, v] of items) {
    const lines = doc.setFontSize(8.5).splitTextToSize(t(v), W - 2 * M);
    y = ensureSpace(doc, y, 6 + lines.length * 4);
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...NAVY).text(t(k), M, y);
    doc.setFont('helvetica', 'normal').setTextColor(27, 36, 51).text(lines, M, y + 4.2);
    y += 6 + lines.length * 4;
  }
  if (signature) {
    y = ensureSpace(doc, y + 2, 36);
    const half = (W - 2 * M - 8) / 2;
    for (const [i, label] of ['Pour l’entreprise', 'Bon pour accord — le client (date, nom, signature)'].entries()) {
      const x = M + i * (half + 8);
      doc.setDrawColor(...LINE).setLineWidth(0.3).roundedRect(x, y, half, 30, 1.5, 1.5);
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTED).text(t(label), x + 3, y + 5);
    }
    y += 34;
  }
  return y;
}

// ------------------------------------------------------------------ métré
export function buildMetrePdf(m: MetreDoc, ctx: PdfContext): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  let y = header(doc, ctx, 'MÉTRÉ', [['Référence', m.reference], ['Statut', m.status === 'approuve' ? 'Approuvé' : m.status === 'verifie' ? 'Vérifié' : 'Document de travail'], ['Date', new Date().toLocaleDateString('fr-FR')]]);
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...NAVY).text(t(m.title), M, y);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED)
    .text(t(`${ctx.project ? `Projet ${ctx.project.reference} — ${ctx.project.name} · ` : ''}Arrondi : ${m.rules.decimals} décimale(s) · Seuil de déduction des ouvertures : ${formatNumber(m.rules.openingThreshold, 2)} m²`), M, y + 4.5);
  y += 9;
  const body: RowInput[] = m.lines.map((l) => {
    const r = computeMetre(l, m.rules);
    return [t(l.ref), t(l.designation), t(l.location), t(l.lot), t(FORMULAS[l.formula].label + (l.formula === 'libre' && l.expression ? ` : ${l.expression}` : '')),
      l.L === null ? '' : t(formatNumber(l.L, 3)), l.l === null ? '' : t(formatNumber(l.l, 3)), l.H === null ? '' : t(formatNumber(l.H, 3)), l.N === null ? '' : t(formatNumber(l.N, 3)),
      r.qty === null ? { content: 'à compléter', styles: { textColor: [180, 83, 9] } } : t(formatNumber(r.qty, m.rules.decimals, false)), t(l.unit), t([r.steps.join(' ; '), l.source, l.notes].filter(Boolean).join(' — '))];
  });
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 20 },
    head: [['Réf.', 'Désignation', 'Localisation', 'Lot', 'Formule', 'Long.', 'Larg.', 'Haut.', 'Nb', 'Quantité', 'Unité', 'Détail du calcul, source, observations']],
    body,
    styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 1.4, lineColor: LINE, lineWidth: 0.1, textColor: [27, 36, 51] },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 12 }, 5: { halign: 'right', cellWidth: 13 }, 6: { halign: 'right', cellWidth: 13 }, 7: { halign: 'right', cellWidth: 13 }, 8: { halign: 'right', cellWidth: 10 }, 9: { halign: 'right', cellWidth: 18, fontStyle: 'bold' }, 10: { cellWidth: 11 }, 11: { cellWidth: 78 } },
  });
  footer(doc, ctx, m.reference);
  return doc;
}

// ------------------------------------------------------------------ dans le navigateur
export async function loadLogo(org: Organization): Promise<PdfContext['logo']> {
  if (!org.logo_path) return null;
  try {
    const { supabase } = await import('../lib/supabase');
    const { data } = await supabase.storage.from('documents').download(org.logo_path);
    if (!data) return null;
    const buf = new Uint8Array(await data.arrayBuffer());
    const format = buf[0] === 0x89 ? 'PNG' : buf[0] === 0xff ? 'JPEG' : null;
    if (!format) return null;
    let bin = '';
    buf.forEach((b) => (bin += String.fromCharCode(b)));
    return { data: `data:image/${format.toLowerCase()};base64,${btoa(bin)}`, format };
  } catch {
    return null;
  }
}

const fileName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_');

export async function quotePdf(org: Organization, q: Quote, client?: Contact | null, project?: Project | null) {
  const doc = buildQuotePdf(q, { org, client, project, logo: await loadLogo(org) });
  doc.save(fileName(`${q.reference}_v${q.version}_${q.title}`).slice(0, 90) + '.pdf');
}

export async function metrePdf(org: Organization, m: MetreDoc, project?: Project | null) {
  const doc = buildMetrePdf(m, { org, project, logo: await loadLogo(org) });
  doc.save(fileName(`${m.reference}_${m.title}`).slice(0, 90) + '.pdf');
}
