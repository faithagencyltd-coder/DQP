// Bibliothèque de prix ⇄ Excel (§14) : mêmes colonnes que l'écran, historique inclus.

import ExcelJS from 'exceljs';
import { newId, normalizeText, normalizeUnit, nowIso } from '../format';
import { CATEGORY_LABEL } from '../prices';
import type { PriceItem } from '../types';

const HEAD = ['Code', 'Désignation', 'Catégorie', 'Unité', 'Prix', 'Fournisseur', 'Localisation', 'Mise à jour', 'Observation', 'Historique'];

export async function pricesToXlsx(items: PriceItem[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DQP';
  const ws = wb.addWorksheet('Bibliothèque de prix', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [10, 48, 16, 8, 14, 22, 18, 12, 30, 40].map((width) => ({ width }));
  const h = ws.addRow(HEAD);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }));
  for (const i of items) {
    const r = ws.addRow([
      i.code, i.designation, CATEGORY_LABEL[i.category], i.unit, i.price, i.supplier, i.location,
      new Date(i.updatedAt), i.observation ?? '',
      (i.history ?? []).map((x) => `${x.at.slice(0, 10)} : ${x.price}`).join(' ; '),
    ]);
    r.getCell(5).numFmt = '#,##0.##';
    r.getCell(8).numFmt = 'dd/mm/yyyy';
  }
  ws.autoFilter = { from: 'A1', to: 'J1' };
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

export async function pricesFromXlsx(bytes: Uint8Array): Promise<PriceItem[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const head = new Map<string, number>();
  ws.getRow(1).eachCell((c, col) => head.set(normalizeText(String(c.value ?? '')), col));
  const col = (...names: string[]) => names.map((n) => head.get(n)).find((x) => x !== undefined);
  const cDes = col('designation', 'libelle');
  const cPrice = col('prix', 'pu', 'prix unitaire');
  if (!cDes || !cPrice) return [];
  const cats = new Map(Object.entries(CATEGORY_LABEL).map(([k, v]) => [normalizeText(v), k as PriceItem['category']]));
  const text = (row: ExcelJS.Row, c?: number) => (c ? String(row.getCell(c).text ?? '').trim() : '');
  const out: PriceItem[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const des = text(row, cDes);
    const raw = row.getCell(cPrice).value;
    const price = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[\s ]/g, '').replace(',', '.'));
    if (!des || !Number.isFinite(price)) return;
    out.push({
      id: newId('pr'),
      code: text(row, col('code')),
      designation: des,
      unit: normalizeUnit(text(row, col('unite', 'unites'))),
      price,
      supplier: text(row, col('fournisseur')),
      category: cats.get(normalizeText(text(row, col('categorie')))) ?? 'materiau',
      location: text(row, col('localisation', 'lieu')),
      observation: text(row, col('observation', 'observations')),
      updatedAt: nowIso(),
      source: 'Import Excel',
    });
  });
  return out;
}
