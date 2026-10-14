// Exports d'un plan dans le navigateur : image PNG et PDF à l'échelle (rendu fidèle),
// composition d'un rendu IA avec les noms et cotes exacts et la mention obligatoire.

import { jsPDF } from 'jspdf';
import { fitPrintScale, type PlanModel } from '../engine/plan/model';
import { renderPlanSvg, type Frame, type RenderOptions } from '../engine/plan/render';
import type { Organization } from '../lib/types';
import { loadLogo, pdfText } from './pdf';

export const AI_NOTICE = 'Illustration générée par IA — non contractuelle. Seules les cotes du plan technique font foi.';

function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Rendu SVG impossible')); };
    img.src = url;
  });
}

function urlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
  });
}

const toBlob = (c: HTMLCanvasElement, type = 'image/png', q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image impossible'))), type, q));

export async function svgToPng(svg: string, width: number, height: number, type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Blob> {
  const img = await svgImage(svg);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return toBlob(c, type, type === 'image/jpeg' ? 0.9 : undefined);
}

/** Rendu IA + surcouche (noms, surfaces, cotes du dessin) + bandeau de mention. */
export async function composeAiImage(imageUrl: string, overlaySvg: string | null, frame: Frame | null): Promise<Blob> {
  const img = await urlImage(imageUrl);
  const W = img.naturalWidth, H = img.naturalHeight;
  const band = Math.max(28, Math.round(W * 0.026));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H + band;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, W, H);
  if (overlaySvg && frame) {
    const ov = await svgImage(overlaySvg);
    ctx.drawImage(ov, 0, 0, W, H);
  }
  ctx.fillStyle = '#0f1f38';
  ctx.fillRect(0, H, W, band);
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(band * 0.45)}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(AI_NOTICE, band * 0.5, H + band / 2);
  ctx.textAlign = 'right';
  ctx.fillText('PLANORA BTP', W - band * 0.5, H + band / 2);
  return toBlob(c);
}

export type Paper = 'A4' | 'A3';
const PAPER: Record<Paper, [number, number]> = { A4: [297, 210], A3: [420, 297] };

export interface PlanPdfMeta {
  planName: string;
  level: string;
  reference: string;
  project?: string;
}

/**
 * PDF à l'échelle : le plan (sans cartouche) est posé à une échelle normalisée (1/50, 1/100…)
 * choisie pour tenir dans la feuille, puis un cartouche vectoriel est ajouté. L'échelle n'est
 * annoncée que si elle a été vérifiée.
 */
export async function buildPlanPdf(m: PlanModel, opts: Omit<RenderOptions, 'title' | 'pixelWidth'>, meta: PlanPdfMeta, org: Organization, paper: Paper = 'A3'): Promise<jsPDF> {
  const probe = renderPlanSvg(m, { ...opts, title: null, scaleBar: true, pixelWidth: 1000 });
  const wM = probe.frame.width / probe.frame.pxPerM, hM = probe.frame.height / probe.frame.pxPerM;
  const landscape = wM >= hM;
  const [pw, ph] = landscape ? PAPER[paper] : [PAPER[paper][1], PAPER[paper][0]];
  const margin = 10, cartouche = 28;
  const availW = pw - 2 * margin, availH = ph - 2 * margin - cartouche;
  const scale = fitPrintScale(wM, hM, availW, availH);
  const imgW = (wM * 1000) / scale, imgH = (hM * 1000) / scale;
  // Image à 200 points par pouce environ.
  const px = Math.min(6000, Math.round((imgW / 25.4) * 200));
  const r = renderPlanSvg(m, { ...opts, title: null, scaleBar: true, pixelWidth: px });
  // JPEG haute qualité : un PDF léger, facile à envoyer par WhatsApp ou e-mail.
  const png = await svgToPng(r.svg, r.frame.width, r.frame.height, 'image/jpeg');
  const dataUrl = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(png); });
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: paper.toLowerCase() });
  doc.addImage(dataUrl, 'JPEG', margin + (availW - imgW) / 2, margin + (availH - imgH) / 2, imgW, imgH);
  // Cartouche.
  const y = ph - margin - cartouche + 4;
  doc.setDrawColor(15, 31, 56).setLineWidth(0.4).rect(margin, y, pw - 2 * margin, cartouche - 4);
  const logo = await loadLogo(org);
  let x = margin + 3;
  if (logo) {
    doc.addImage(logo.data, logo.format, x, y + 3, 18, 18, undefined, 'FAST');
    x += 22;
  }
  const t = pdfText;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(15, 31, 56).text(t(org.name), x, y + 7);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(102, 112, 133);
  doc.text(t([org.city, org.phone, org.email].filter(Boolean).join(' · ')), x, y + 12);
  if (meta.project) doc.text(t(`Projet : ${meta.project}`), x, y + 17);
  const cx = pw / 2 - 10;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(15, 31, 56).text(t([meta.planName, meta.level].filter(Boolean).join(' — ')), cx, y + 7);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(102, 112, 133);
  doc.text(t(`Référence : ${meta.reference}`), cx, y + 12);
  doc.text(t(m.scaleVerified ? `Échelle 1/${scale} — impression ${paper} à 100 %, sans ajustement` : 'Échelle non vérifiée : cotes et surfaces indicatives'), cx, y + 17);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(102, 112, 133);
  doc.text(t(`Édité le ${new Date().toLocaleDateString('fr-FR')}`), pw - margin - 3, y + 7, { align: 'right' });
  doc.text(t('Plan de présentation — PLANORA BTP'), pw - margin - 3, y + 12, { align: 'right' });
  if (m.walls.length) doc.text(t(`Cotes en ${m.dimUnit === 'cm' ? 'cm' : 'm'} : entraxes et hors tout`), pw - margin - 3, y + 17, { align: 'right' });
  doc.setProperties({ title: `${meta.reference} ${meta.planName}`, creator: 'PLANORA BTP' });
  return doc;
}
