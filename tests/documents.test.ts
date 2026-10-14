// Cohérence des montants entre le moteur, le PDF et l'Excel (§30.2, §33.3).
import ExcelJS from 'exceljs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, test } from 'vitest';
import { buildMetrePdf, buildQuotePdf, pdfText } from '../src/docs/pdf';
import { buildQuoteXlsx } from '../src/docs/xlsx';
import { computeDoc, newLine } from '../src/engine/dqe';
import { formatMoney } from '../src/engine/money';
import type { MetreDoc, Organization, Quote } from '../src/lib/types';

const org = {
  id: 'o', name: 'Bâtir Plus', legal_name: 'BÂTIR PLUS SARL', country: 'BJ', currency: 'XOF', city: 'Cotonou', address: 'Lot 12, Fidjrossè',
  phone: '+229 01 97 00 00 00', email: 'contact@batirplus.bj', website: null, logo_path: null,
  legal_ids: [{ label: 'IFU', value: '3201900000000' }, { label: 'RCCM', value: 'RB/COT/19 B 0000' }], bank_details: 'BOA Bénin — BJ00 0000',
  default_taxes: [{ label: 'TVA', rate: 18 }], quote_validity_days: 30, payment_terms: '40 % à la commande, solde à la réception', quote_footer: 'Merci de votre confiance',
  metre_rules: { decimals: 2, openingThreshold: 0 }, pricing_method: { method: 'additive', indirectPct: 15, marginPct: 10, marginBase: 'cout', coefficient: 1.3, lossPct: 0 },
  plan_id: 'pro', plan_status: 'actif', plan_period: 'mois', plan_ends_at: '2030-01-01', suspended_reason: null, created_at: '2026-01-01',
} as Organization;

const quote: Quote = {
  id: 'q', org_id: 'o', kind: 'devis', reference: 'DEV-2026-0007', title: 'Construction d’une villa R+1', project_id: null, client_id: null,
  source_kind: 'manuel', source_id: null, status: 'brouillon', issue_date: '2026-10-13', valid_until: '2026-11-12', version: 2, locked: false,
  body: { lots: [
    { id: 'L1', code: 'LOT 01', name: 'Gros œuvre', lines: [
      newLine({ id: 'a', ref: 'GO-01', designation: 'Béton armé dosé à 350 kg/m³', unit: 'm³', qty: 12.5, unitPrice: 85000 }),
      newLine({ id: 'b', ref: 'GO-02', designation: 'Maçonnerie d’agglos de 15', unit: 'm²', qty: 120.35, unitPrice: 7500.5 }),
    ] },
    { id: 'L2', code: 'LOT 02', name: 'Peinture', lines: [newLine({ id: 'c', ref: 'PE-01', designation: 'Peinture vinylique', unit: 'm²', qty: 300, unitPrice: null })] },
  ] },
  settings: { currency: 'XOF', taxes: [{ label: 'TVA', rate: 18 }], discountPct: 5 },
  payment_terms: '40 % à la commande', execution_delay: '3 mois', notes: null, total_ht: null, total_ttc: null, incomplete_lines: 0,
  decision_at: null, decision_note: null, archived_at: null, validated_at: null, created_at: '', updated_at: '',
};

async function pdfTextOf(buf: ArrayBuffer) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out += c.items.map((x) => ('str' in x ? x.str : '')).join(' ') + '\n';
  }
  return out.replace(/\s+/g, ' ');
}

describe('documents chiffrés', () => {
  const r = computeDoc(quote.body, quote.settings);
  test('le PDF du devis reprend exactement les montants du moteur', async () => {
    const pdf = buildQuotePdf(quote, { org, client: { name: 'M. Hounkpè', city: 'Abomey-Calavi', country: 'BJ', kind: 'client' } as never, generatedAt: new Date('2026-10-13T10:00:00') });
    const text = await pdfTextOf(pdf.output('arraybuffer'));
    const m = (v: number) => pdfText(formatMoney(v, 'XOF', false));
    expect(text).toContain('DEVIS');
    expect(text).toContain('DEV-2026-0007');
    expect(text).toContain('IFU : 3201900000000');
    expect(text).toContain('M. Hounkpè');
    expect(text).toContain(m(1062500));                // ligne 1.1
    expect(text).toContain(m(r.lots[0].subtotal));     // sous-total lot 01
    expect(text).toContain(m(r.totalHT));
    expect(text).toContain(m(r.discount));
    expect(text).toContain(m(r.taxes[0].amount));
    expect(text).toContain(m(r.totalTTC));
    expect(text).toContain('à compléter');             // ligne sans prix signalée
    expect(text).toContain('1 ligne(s) sans quantité ou sans prix');
    expect(text).toContain('Bon pour accord');
    expect(text).toMatch(/Page 1 \/ 1/);
    expect(text).toContain('PLANORA BTP');
  });
  test('l’Excel du devis reprend exactement les montants du moteur', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildQuoteXlsx(org, quote));
    const ws = wb.worksheets[0];
    const find = (label: string) => {
      let v: unknown = null;
      ws.eachRow((row) => { if (row.getCell(6).value === label) v = row.getCell(7).value; });
      return v;
    };
    expect(find('Total HT')).toBe(r.totalHT);
    expect(find('Net HT')).toBe(r.netHT);
    expect(find('TVA 18 %')).toBe(r.taxes[0].amount);
    expect(find('Total TTC')).toBe(r.totalTTC);
  });
  test('PDF du métré avec le détail des calculs', async () => {
    const m = { id: 'm', reference: 'MET-2026-0001', title: 'Métré villa', status: 'travail', rules: { decimals: 2, openingThreshold: 0 },
      lines: [{ id: '1', ref: 'A1', designation: 'Dalle séjour', location: 'Séjour', lot: 'Gros œuvre', formula: 'surface', L: 5, l: 4, H: null, N: 1, openings: [], unit: 'm²', source: 'Plan RDC', notes: '' },
        { id: '2', ref: 'A2', designation: 'Semelles', location: '', lot: 'Fondations', formula: 'volume', L: 32.4, l: 0.6, H: null, N: 1, openings: [], unit: 'm³', source: '', notes: '' }] } as unknown as MetreDoc;
    const text = await pdfTextOf(buildMetrePdf(m, { org }).output('arraybuffer'));
    expect(text).toContain('MET-2026-0001');
    expect(text).toContain('Surface = 5 × 4 × 1 = 20');
    expect(text).toContain('à compléter');
    expect(text).toContain('hauteur');
  });
});
