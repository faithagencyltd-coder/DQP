// Fichiers des plans dans le navigateur : fond importé (PDF rendu en image, ou image),
// points d'accroche des tracés vectoriels d'un PDF, échantillonnage du fond pour la
// détection des pièces. Les fichiers restent privés : ils sont téléchargés avec la session.

import type { Grid } from '../engine/plan/detect';
import type { Background, Pt } from '../engine/plan/model';
import { supabase } from './supabase';
import { errorMessage } from './errors';

/** Un PDF est rendu à 2 pixels par point : la taille du fond est toujours la même. */
export const PDF_PX_PER_PT = 2;
/** Échelle provisoire d'un PDF (1/100) et d'une image (1 px = 1 cm), à vérifier par calibration. */
export const DEFAULT_MPP_PDF = (0.0254 / 72) * 100 / PDF_PX_PER_PT;
export const DEFAULT_MPP_IMAGE = 0.01;

export interface LoadedBackground {
  url: string;
  kind: 'pdf' | 'image';
  widthPx: number;
  heightPx: number;
  pages: number;
  /** Extrémités des traits vectoriels (pixels du fond), pour l'accroche. */
  snap: Pt[];
}

async function pdfjs() {
  const lib = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return lib;
}

export async function downloadPrivate(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('documents').download(path);
  if (error || !data) throw new Error(errorMessage(error ?? 'Fichier introuvable'));
  return data;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
  });
}

/** Rend une page de PDF ou décode une image ; renvoie une URL locale (blob). */
export async function loadBackground(blob: Blob, mime: string, page = 1): Promise<LoadedBackground> {
  if (mime === 'application/pdf') {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, verbosity: 0 }).promise;
    try {
      const n = Math.min(Math.max(1, page), doc.numPages);
      const p = await doc.getPage(n);
      const vp = p.getViewport({ scale: PDF_PX_PER_PT });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      const out = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Rendu impossible'))), 'image/png'));
      let snap: Pt[] = [];
      try {
        const { pageSegments, snapPoints } = await import('../engine/dqp/pdf/vectors');
        const segs = await pageSegments(p as never, lib.OPS);
        snap = snapPoints(segs).slice(0, 20000).map(([x, y]) => [x * PDF_PX_PER_PT, y * PDF_PX_PER_PT]);
      } catch {
        snap = [];
      }
      return { url: URL.createObjectURL(out), kind: 'pdf', widthPx: canvas.width, heightPx: canvas.height, pages: doc.numPages, snap };
    } finally {
      void doc.destroy();
    }
  }
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);
  return { url, kind: 'image', widthPx: img.naturalWidth, heightPx: img.naturalHeight, pages: 1, snap: [] };
}

/** Pixels du fond rééchantillonnés sur la grille de détection (RGBA). */
export async function sampleBackground(url: string, bg: Background, g: Grid): Promise<Uint8ClampedArray> {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = g.w;
  canvas.height = g.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, (0 - g.minX) / g.res, (0 - g.minY) / g.res, (bg.widthPx * bg.mpp) / g.res, (bg.heightPx * bg.mpp) / g.res);
  return ctx.getImageData(0, 0, g.w, g.h).data;
}

/** Image d'entrée du rendu IA à partir du fichier importé : centrée sur fond blanc, au format demandé. */
export async function fitImage(url: string, width: number, height: number): Promise<Blob> {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  const k = Math.min(width / img.naturalWidth, height / img.naturalHeight) * 0.96;
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Image impossible'))), 'image/png'));
}
