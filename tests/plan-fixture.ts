// Plan PDF synthétique proche d'un plan d'architecte : murs tracés, noms de pièces
// avec surfaces (sur la même ligne ou en dessous), cartouche, repères de menuiseries,
// cotes, une pièce sans surface, une page de coupe et une page scannée (image seule).

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// PNG 1×1 gris (page « scannée »).
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

export async function buildPlanFixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Plans villa');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // ---- Page 1 : plan du rez-de-chaussée (A3 paysage) ----
  const p1 = pdf.addPage([1190, 842]);
  const H = 842;
  const text = (page: typeof p1, s: string, x: number, yTop: number, size = 9, f = font) => page.drawText(s, { x, y: H - yTop - size, size, font: f });
  const wall = (x1: number, y1: number, x2: number, y2: number) => p1.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: 4, color: rgb(0, 0, 0) });
  // Murs extérieurs et cloisons
  wall(100, 100, 800, 100); wall(800, 100, 800, 600); wall(800, 600, 100, 600); wall(100, 600, 100, 100);
  wall(450, 100, 450, 600); wall(100, 350, 450, 350); wall(450, 300, 800, 300); wall(620, 300, 620, 600);
  text(p1, 'PLAN DU REZ-DE-CHAUSSEE', 300, 40, 18, bold);
  text(p1, 'SEJOUR', 240, 200, 10, bold);
  text(p1, '32,50 m²', 238, 214, 9);
  text(p1, 'CHAMBRE 1 14,20 m²', 520, 180, 10, bold);
  text(p1, 'CUISINE', 220, 450, 10, bold);
  text(p1, 'S = 9.80 m2', 216, 464, 9);
  text(p1, 'SDB', 520, 420, 10, bold);
  text(p1, '4,50 m²', 516, 434, 9);
  text(p1, 'WC', 690, 420, 10, bold);
  text(p1, '1,80 m²', 682, 434, 9);
  text(p1, 'TERRASSE', 380, 640, 10, bold);
  text(p1, 'LAVABO', 500, 470, 7);
  text(p1, 'DOUCHE', 560, 470, 7);
  text(p1, 'EVIER', 260, 500, 7);
  text(p1, 'P1 90x210', 300, 340, 7);
  text(p1, 'P2 80x210', 600, 290, 7);
  text(p1, 'P3', 690, 590, 7);
  text(p1, 'F1 120x120', 200, 95, 7);
  text(p1, '4.20', 270, 80, 7);
  text(p1, '3.50', 620, 80, 7);
  text(p1, '350', 60, 220, 7);
  // Cartouche
  p1.drawRectangle({ x: 860, y: H - 800, width: 300, height: 260, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  text(p1, 'PROJET : CONSTRUCTION D’UNE VILLA', 870, 555, 8, bold);
  text(p1, "MAITRE D'OUVRAGE : M. SENOU", 870, 575, 8);
  text(p1, 'ARCHITECTE : CABINET ABC', 870, 595, 8);
  text(p1, 'LIEU : ABOMEY-CALAVI', 870, 615, 8);
  text(p1, 'DATE : FEVRIER 2026', 870, 635, 8);
  text(p1, 'ECHELLE : 1/100', 870, 655, 8);
  text(p1, 'SURFACE HABITABLE : 62,80 m²', 870, 675, 8);

  // ---- Page 2 : coupe ----
  const p2 = pdf.addPage([1190, 842]);
  p2.drawText('COUPE A-A', { x: 400, y: H - 60, size: 18, font: bold });
  p2.drawText('ECHELLE : 1/50', { x: 870, y: H - 700, size: 8, font });
  p2.drawLine({ start: { x: 100, y: 200 }, end: { x: 900, y: 200 }, thickness: 3 });

  // ---- Page 3 : scan (image seule, aucun texte) ----
  const p3 = pdf.addPage([595, 842]);
  const img = await pdf.embedPng(PNG);
  p3.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });

  return await pdf.save();
}
