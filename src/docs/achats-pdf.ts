// Bon de commande fournisseur (§18.2) : en-tête de l'entreprise, fournisseur, lignes, total HT,
// livraison et zone de signature.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatNumber } from '../engine/money';
import { roundMoney } from '../engine/money';
import type { Contact, Organization, Project, PurchaseOrder, Warehouse } from '../lib/types';
import { ensureSpace, footer, header, lastY, LINE, loadLogo, M, money, MUTED, NAVY, pdfText } from './pdf';

const t = pdfText;

export function buildOrderPdf(o: PurchaseOrder, ctx: { org: Organization; logo?: { data: string; format: 'PNG' | 'JPEG' } | null; supplier?: Contact | null; project?: Project | null; warehouse?: Warehouse | null }): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const d = (s: string | null) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : '—');
  let y = header(doc, { org: ctx.org, logo: ctx.logo }, 'BON DE COMMANDE', [['Numéro', o.reference], ['Date', d(o.order_date)], ['Livraison souhaitée', d(o.expected_date)]]);
  const s = ctx.supplier;
  const half = (W - 2 * M - 6) / 2;
  const box = (x: number, label: string, lines: string[]) => {
    doc.setFillColor(242, 245, 250).roundedRect(x, y, half, 6 + Math.max(1, lines.length) * 4.2 + 2, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...MUTED).text(t(label.toUpperCase()), x + 3, y + 4.5);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...NAVY);
    (lines.length ? lines : ['—']).forEach((l, i) => doc.setFont('helvetica', i === 0 ? 'bold' : 'normal').text(t(l), x + 3, y + 9.5 + i * 4.2, { maxWidth: half - 6 }));
    return 6 + Math.max(1, lines.length) * 4.2 + 2;
  };
  const h1 = box(M, 'Fournisseur', s ? [s.name, s.contact_person ?? '', [s.address, s.city].filter(Boolean).join(', '), [s.phone, s.email].filter(Boolean).join(' · ')].filter(Boolean) : []);
  const h2 = box(M + half + 6, 'Livraison', [ctx.project ? `Chantier ${ctx.project.reference} — ${ctx.project.name}` : '', ctx.project?.location ?? '', ctx.warehouse ? `Dépôt : ${ctx.warehouse.name}` : ''].filter(Boolean));
  y += Math.max(h1, h2) + 6;
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 20 },
    head: [['N°', 'Désignation', 'Unité', 'Quantité', 'P.U. HT', 'Montant HT']],
    body: o.lines.map((l, i) => [String(i + 1), t(l.designation), t(l.unit), t(formatNumber(l.qty ?? 0, 3)), l.unit_price === null ? '—' : money(l.unit_price, o.currency), money(roundMoney((l.qty ?? 0) * (l.unit_price ?? 0), o.currency), o.currency)]),
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, lineColor: LINE, lineWidth: 0.1 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 10 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 20, halign: 'right' }, 4: { cellWidth: 26, halign: 'right' }, 5: { cellWidth: 30, halign: 'right' } },
  });
  y = lastY(doc) + 4;
  const unit = o.currency === 'XOF' || o.currency === 'XAF' ? 'FCFA' : o.currency;
  doc.setFillColor(...NAVY).rect(W - M - 80, y, 80, 7, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(255).text('Total HT', W - M - 78, y + 5).text(t(`${money(o.total_ht, o.currency)} ${unit}`), W - M - 2, y + 5, { align: 'right' });
  y += 13;
  if (o.notes) {
    const lines = doc.setFontSize(8.5).splitTextToSize(t(o.notes), W - 2 * M);
    y = ensureSpace(doc, y, 8 + lines.length * 4);
    doc.setFont('helvetica', 'bold').setTextColor(...NAVY).text('Observations', M, y);
    doc.setFont('helvetica', 'normal').setTextColor(27, 36, 51).text(lines, M, y + 4.2);
    y += 8 + lines.length * 4;
  }
  y = ensureSpace(doc, y + 2, 34);
  for (const [i, label] of ['Pour l’entreprise (bon pour commande)', 'Le fournisseur (accusé de réception)'].entries()) {
    const x = M + i * (half + 6);
    doc.setDrawColor(...LINE).setLineWidth(0.3).roundedRect(x, y, half, 28, 1.5, 1.5);
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTED).text(t(label), x + 3, y + 5);
  }
  footer(doc, { org: ctx.org }, o.reference);
  return doc;
}

export async function orderPdf(org: Organization, o: PurchaseOrder, ctx: { supplier?: Contact | null; project?: Project | null; warehouse?: Warehouse | null }) {
  buildOrderPdf(o, { org, logo: await loadLogo(org), ...ctx }).save(`${o.reference}.pdf`);
}
