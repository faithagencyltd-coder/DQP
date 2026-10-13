// Extraction brute d'un PDF avec pdf.js : texte positionné, nature de chaque page
// (vectorielle ou scannée). Aucune interprétation ici : seulement ce qui est écrit.
// pdf.js est injecté pour fonctionner aussi bien dans l'application que dans les tests.

import type * as PdfJs from 'pdfjs-dist';

export type PdfJsLib = Pick<typeof PdfJs, 'getDocument' | 'OPS'>;

export interface PdfText {
  str: string;
  /** Coin haut-gauche, en points, repère de la page affichée (origine en haut à gauche). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Angle du texte en degrés (0 = horizontal). */
  angle: number;
}

export interface PdfPageRaw {
  number: number;
  width: number;
  height: number;
  texts: PdfText[];
  vectorOps: number;
  images: number;
}

export interface PdfRaw {
  pages: PdfPageRaw[];
  meta: { title?: string; author?: string; creator?: string; producer?: string };
}

export async function extractPdf(bytes: Uint8Array, pdfjs: PdfJsLib, onPage?: (n: number, total: number, texts: number) => void): Promise<PdfRaw> {
  // pdf.js transfère le tampon : on lui donne une copie.
  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const meta = ((await doc.getMetadata().catch(() => null))?.info ?? {}) as Record<string, string>;
    const pages: PdfPageRaw[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const texts: PdfText[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const [a, b, , , e, f] = it.transform as number[];
        const size = Math.hypot(a, b) || it.height || 1;
        const angle = Math.round((Math.atan2(b, a) * 180) / Math.PI);
        const [x, yBase] = vp.convertToViewportPoint(e, f) as [number, number];
        const h = it.height || size;
        texts.push({ str: it.str, x, y: yBase - h, w: it.width, h, angle });
      }
      const ops = await page.getOperatorList();
      let vectorOps = 0;
      let images = 0;
      const O = pdfjs.OPS;
      for (const fn of ops.fnArray) {
        if (fn === O.constructPath || fn === O.stroke || fn === O.fill || fn === O.eoFill) vectorOps++;
        else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageMaskXObject) images++;
      }
      pages.push({ number: n, width: vp.width, height: vp.height, texts, vectorOps, images });
      page.cleanup();
      onPage?.(n, doc.numPages, texts.length);
      // Laisse respirer l'interface entre deux pages.
      await new Promise((r) => setTimeout(r, 0));
    }
    return {
      pages,
      meta: { title: meta.Title || undefined, author: meta.Author || undefined, creator: meta.Creator || undefined, producer: meta.Producer || undefined },
    };
  } finally {
    await doc.destroy();
  }
}

export interface TextLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

/**
 * Regroupe les morceaux de texte en lignes. Les logiciels de DAO écrivent souvent
 * chaque mot (voire chaque lettre) séparément : on fusionne les morceaux alignés et proches.
 */
export function groupLines(texts: PdfText[]): TextLine[] {
  const byAngle = new Map<number, PdfText[]>();
  for (const t of texts) {
    const a = ((Math.round(t.angle / 90) * 90) % 360 + 360) % 360;
    if (!byAngle.has(a)) byAngle.set(a, []);
    byAngle.get(a)!.push(t);
  }
  const lines: TextLine[] = [];
  for (const [angle, group] of byAngle) {
    if (angle !== 0) {
      // Textes verticaux (souvent des cotes) : gardés tels quels.
      for (const t of group) lines.push({ text: t.str.trim(), x: t.x, y: t.y, w: Math.max(t.w, t.h), h: t.h, angle });
      continue;
    }
    const sorted = [...group].sort((p, q) => p.y - q.y || p.x - q.x);
    const rows: PdfText[][] = [];
    for (const t of sorted) {
      const row = rows.find((r) => Math.abs(r[0].y + r[0].h / 2 - (t.y + t.h / 2)) < Math.max(r[0].h, t.h) * 0.5);
      if (row) row.push(t);
      else rows.push([t]);
    }
    for (const row of rows) {
      row.sort((p, q) => p.x - q.x);
      let cur: TextLine | null = null;
      for (const t of row) {
        const gap = cur ? t.x - (cur.x + cur.w) : Infinity;
        if (cur && gap < Math.max(cur.h, t.h) * 1.2) {
          const sep = gap > Math.max(cur.h, t.h) * 0.15 && !cur.text.endsWith(' ') && !t.str.startsWith(' ') ? ' ' : '';
          cur.text += sep + t.str;
          const right = Math.max(cur.x + cur.w, t.x + t.w);
          const top = Math.min(cur.y, t.y);
          const bottom = Math.max(cur.y + cur.h, t.y + t.h);
          cur.w = right - cur.x;
          cur.y = top;
          cur.h = bottom - top;
        } else {
          if (cur) lines.push(cur);
          cur = { text: t.str, x: t.x, y: t.y, w: t.w, h: t.h, angle: 0 };
        }
      }
      if (cur) lines.push(cur);
    }
  }
  for (const l of lines) l.text = l.text.replace(/\s+/g, ' ').trim();
  return lines.filter((l) => l.text);
}
