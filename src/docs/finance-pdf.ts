// PDF des factures, factures d'acompte, de situation, finales et avoirs (§16, §30) :
// mêmes en-têtes et totaux que les devis, avec échéance, paiements reçus et reste à payer.

import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import { computeDoc } from '../engine/dqe';
import { INVOICE_KIND_LABEL } from '../engine/finance';
import { amountInWords, formatNumber } from '../engine/money';
import { PAYMENT_METHODS } from '../lib/labels';
import type { Invoice, Organization, Payment } from '../lib/types';
import { ensureSpace, footer, header, lastY, LINE, loadLogo, M, money, MUTED, NAVY, partyBlocks, pdfText, type PdfContext } from './pdf';

const t = pdfText;
const d = (s: string | null) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : '—');

export function buildInvoicePdf(inv: Invoice, payments: Payment[], ctx: PdfContext, creditForRef?: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cur = inv.settings.currency;
  const r = computeDoc(inv.body, inv.settings);
  const W = doc.internal.pageSize.getWidth();
  const title = inv.kind === 'avoir' ? 'AVOIR' : 'FACTURE';
  let y = header(doc, ctx, title, [
    ['Numéro', inv.reference ?? 'BROUILLON'],
    ['Date', d(inv.issue_date)],
    ...(inv.kind !== 'avoir' ? [['Échéance', d(inv.due_date)] as [string, string]] : []),
    ...(creditForRef ? [['Sur facture', creditForRef] as [string, string]] : []),
  ]);
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...NAVY).text(t(inv.title), M, y);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED).text(t(INVOICE_KIND_LABEL[inv.kind]), M, y + 4.5);
  y += 9;
  if (inv.status === 'brouillon') {
    doc.setFont('helvetica', 'bold').setFontSize(60).setTextColor(235, 238, 243).text('BROUILLON', W / 2, 160, { align: 'center', angle: 30 });
  }
  y = partyBlocks(doc, ctx, y);

  const body: RowInput[] = [];
  inv.body.lots.forEach((lot, li) => {
    if (inv.body.lots.length > 1) body.push([{ content: t(`${lot.code} — ${lot.name}`.toUpperCase()), colSpan: 6, styles: { fillColor: [230, 236, 245], fontStyle: 'bold', textColor: NAVY } }]);
    for (const l of lot.lines) {
      if (l.kind === 'titre') { body.push([{ content: t(l.designation), colSpan: 6, styles: { fontStyle: 'bolditalic', textColor: NAVY } }]); continue; }
      const lr = r.lines.get(l.id)!;
      body.push([lr.number, t(l.designation + (l.note ? `\n${l.note}` : '')), t(l.unit), l.qty === null ? 'à compléter' : t(formatNumber(l.qty, 3)),
        l.unitPrice === null ? 'à compléter' : money(l.unitPrice, cur), lr.amount === null ? 'à compléter' : money(lr.amount, cur)]);
    }
    if (inv.body.lots.length > 1) body.push([{ content: t(`Sous-total ${lot.code}`), colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } }, { content: money(r.lots[li].subtotal, cur), styles: { fontStyle: 'bold' } }]);
  });
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 20 },
    head: [['N°', 'Désignation', 'Unité', 'Quantité', 'P.U. HT', 'Montant HT']],
    body,
    styles: { font: 'helvetica', fontSize: 8.3, cellPadding: 1.6, lineColor: LINE, lineWidth: 0.1, textColor: [27, 36, 51], valign: 'middle' },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 11 }, 2: { cellWidth: 13, halign: 'center' }, 3: { cellWidth: 19, halign: 'right' }, 4: { cellWidth: 27, halign: 'right' }, 5: { cellWidth: 30, halign: 'right' } },
  });
  y = lastY(doc) + 4;
  const unit = cur === 'XOF' || cur === 'XAF' ? 'FCFA' : cur;
  const rows: [string, string, boolean?][] = [['Total HT', money(r.totalHT, cur)]];
  if (r.discount) rows.push([`Remise ${formatNumber(inv.settings.discountPct ?? 0, 2)} %`, '- ' + money(r.discount, cur)], ['Net HT', money(r.netHT, cur)]);
  for (const tx of r.taxes) rows.push([`${tx.label} ${formatNumber(tx.rate, 2)} %`, money(tx.amount, cur)]);
  rows.push([r.taxes.length ? 'Total TTC' : 'Total', money(r.totalTTC, cur), true]);
  if (inv.kind !== 'avoir' && inv.status !== 'brouillon') {
    rows.push(['Déjà réglé', money(inv.amount_paid, cur)]);
    rows.push(['Reste à payer', money(Math.max(0, inv.total_ttc - inv.amount_paid), cur), true]);
  }
  y = ensureSpace(doc, y, rows.length * 6 + 16);
  rows.forEach(([k, v, strong], i) => {
    const yy = y + i * 6;
    if (strong) doc.setFillColor(...NAVY).rect(W - M - 80, yy - 4.2, 80, 6, 'F');
    doc.setFont('helvetica', strong ? 'bold' : 'normal').setFontSize(strong ? 10 : 9).setTextColor(strong ? 255 : 27, strong ? 255 : 36, strong ? 255 : 51);
    doc.text(t(k), W - M - 78, yy);
    doc.text(t(`${v} ${unit}`), W - M - 2, yy, { align: 'right' });
  });
  y += rows.length * 6 + 2;
  doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(...MUTED)
    .text(t(`Arrêté${inv.kind === 'avoir' ? ' le présent avoir' : 'e la présente facture'} à la somme de : ${amountInWords(Math.abs(r.totalTTC), cur)} ${r.taxes.length ? 'TTC' : ''}.`), M, y + 3, { maxWidth: W - 2 * M });
  y += 10;

  if (payments.length) {
    y = ensureSpace(doc, y, 20 + payments.length * 6);
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...NAVY).text('Règlements enregistrés', M, y);
    autoTable(doc, {
      startY: y + 2, margin: { left: M, right: M, bottom: 20 },
      head: [['Date', 'Mode', 'Référence', 'Montant']],
      body: payments.map((p) => [d(p.paid_on), t(PAYMENT_METHODS[p.method] ?? p.method), t(p.reference ?? ''), money(p.amount, cur)]),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, lineColor: LINE, lineWidth: 0.1 },
      headStyles: { fillColor: [230, 236, 245], textColor: NAVY, fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' } },
    });
    y = lastY(doc) + 5;
  }
  const items: [string, string][] = [];
  if (inv.payment_terms) items.push(['Conditions de paiement', inv.payment_terms]);
  if (ctx.org.bank_details) items.push(['Coordonnées bancaires', ctx.org.bank_details]);
  for (const [k, v] of items) {
    const lines = doc.setFontSize(8.5).splitTextToSize(t(v), W - 2 * M);
    y = ensureSpace(doc, y, 6 + lines.length * 4);
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...NAVY).text(t(k), M, y);
    doc.setFont('helvetica', 'normal').setTextColor(27, 36, 51).text(lines, M, y + 4.2);
    y += 6 + lines.length * 4;
  }
  footer(doc, ctx, inv.reference ?? 'Brouillon de facture');
  return doc;
}

export async function invoicePdf(org: Organization, inv: Invoice, payments: Payment[], ctx: Omit<PdfContext, 'org' | 'logo'>, creditForRef?: string | null) {
  const doc = buildInvoicePdf(inv, payments, { ...ctx, org, logo: await loadLogo(org) }, creditForRef);
  doc.save(`${(inv.reference ?? 'BROUILLON').replace(/[^A-Za-z0-9-]/g, '_')}_${inv.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60)}.pdf`);
}
