import { describe, expect, test } from 'vitest';
import { applyBpu, bpuFromDoc, computeDoc, newLine, type DocBody } from '../src/engine/dqe';
import { computeBreakdown, DEFAULT_BREAKDOWN } from '../src/engine/debourse';
import { evaluate } from '../src/engine/expr';
import { computeMetre, groupMetre, type MetreLine } from '../src/engine/metre';
import { amountInWords, formatMoney, parseNumber, roundMoney, roundTo } from '../src/engine/money';
import { convert } from '../src/engine/units';
import { parseCsv, toCsv } from '../src/engine/csv';
import { findDuplicates } from '../src/engine/dedupe';

const ml = (p: Partial<MetreLine>): MetreLine => ({
  id: 'x', ref: '', designation: 'Test', location: '', lot: 'Gros œuvre', formula: 'surface',
  L: null, l: null, H: null, N: 1, openings: [], unit: 'm²', source: '', notes: '', ...p,
});

describe('arrondis et nombres', () => {
  test('arrondi sans erreur binaire', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(-1.5, 0)).toBe(-2);
    expect(roundMoney(1234.5, 'XOF')).toBe(1235);
    expect(roundMoney(1234.555, 'EUR')).toBe(1234.56);
  });
  test('lecture des nombres saisis en français', () => {
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('1.234.567')).toBe(1234567);
    expect(parseNumber('12,5 %')).toBe(12.5);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
  test('montants et lettres', () => {
    expect(formatMoney(1250000, 'XOF')).toBe('1 250 000 FCFA');
    expect(amountInWords(1250000)).toBe('Un million deux cent cinquante mille francs CFA');
    expect(amountInWords(80)).toBe('Quatre-vingts francs CFA');
    expect(amountInWords(71)).toBe('Soixante et onze francs CFA');
    expect(amountInWords(200000)).toBe('Deux cent mille francs CFA');
  });
  test('conversions seulement si le facteur est connu', () => {
    expect(convert(2.5, 't', 'kg')).toBe(2500);
    expect(convert(250, 'cm', 'm')).toBe(2.5);
    expect(convert(1, 'sac', 'kg')).toBeNull();
    expect(convert(1, 'j', 'h')).toBeNull();
  });
});

describe('métrés (§11, §33.3)', () => {
  test('surface 5 × 4 = 20 m² avant déduction', () => {
    expect(computeMetre(ml({ L: 5, l: 4 })).qty).toBe(20);
  });
  test('volume, périmètre, longueur, unité', () => {
    expect(computeMetre(ml({ formula: 'volume', L: 10, l: 0.2, H: 0.3, unit: 'm³' })).qty).toBe(0.6);
    expect(computeMetre(ml({ formula: 'perimetre', L: 5, l: 4, unit: 'ml' })).qty).toBe(18);
    expect(computeMetre(ml({ formula: 'longueur', L: 3.25, N: 4, unit: 'ml' })).qty).toBe(13);
    expect(computeMetre(ml({ formula: 'unite', N: 7, unit: 'u' })).qty).toBe(7);
  });
  test('mur net = brute − ouvertures, seuil de déduction', () => {
    const line = ml({ formula: 'mur', L: 8, H: 3, openings: [{ label: 'Porte', width: 0.9, height: 2.1, count: 2 }, { label: 'Ventilation', width: 0.2, height: 0.2, count: 4 }] });
    // Sans seuil : 24 − 3,78 − 0,16 = 20,06
    expect(computeMetre(line, { decimals: 2, openingThreshold: 0 }).qty).toBe(20.06);
    // Seuil 0,5 m² : la ventilation (0,04 m²) n'est pas déduite → 24 − 3,78 = 20,22
    const r = computeMetre(line, { decimals: 2, openingThreshold: 0.5 });
    expect(r.qty).toBe(20.22);
    expect(r.steps.join('\n')).toMatch(/non déduite/);
  });
  test('dimension manquante : quantité non déterminée, jamais devinée', () => {
    const r = computeMetre(ml({ L: 5, l: null }));
    expect(r.qty).toBeNull();
    expect(r.missing).toEqual(['largeur']);
  });
  test('pertes et arrondi visibles', () => {
    const r = computeMetre(ml({ L: 5, l: 4, lossPct: 5 }));
    expect(r.qty).toBe(21);
    expect(r.steps.some((s) => s.includes('Pertes'))).toBe(true);
  });
  test('formule libre', () => {
    expect(computeMetre(ml({ formula: 'libre', expression: '(L + 2) x l', L: 3, l: 2 })).qty).toBe(10);
    expect(computeMetre(ml({ formula: 'libre', expression: 'L × H', L: 3 })).qty).toBeNull();
    expect(evaluate('2 × (5 + 4)', {})).toBe(18);
    expect(() => evaluate('2 ** 3', {})).toThrow();
    expect(() => evaluate('alert(1)', {})).toThrow();
  });
  test('regroupement pour le DQE', () => {
    const g = groupMetre([
      ml({ id: 'a', designation: 'Enduit', L: 5, l: 3 }),
      ml({ id: 'b', designation: 'enduit ', L: 2, l: 2 }),
      ml({ id: 'c', designation: 'Carrelage', L: 4, l: null }),
    ]);
    expect(g.find((x) => x.designation === 'Enduit')!.qty).toBe(19);
    expect(g.find((x) => x.designation === 'Carrelage')!.qty).toBeNull();
  });
});

describe('DQE, BPU, devis (§14, §15)', () => {
  const body: DocBody = {
    lots: [
      { id: 'L1', code: 'LOT 01', name: 'Gros œuvre', lines: [
        newLine({ id: 'a', ref: 'GO-01', designation: 'Béton', unit: 'm³', qty: 12.5, unitPrice: 85000 }),
        newLine({ id: 't', kind: 'titre', designation: 'Élévations' }),
        newLine({ id: 'b', ref: 'GO-02', designation: 'Agglos de 15', unit: 'm²', qty: 120.35, unitPrice: 7500.5 }),
      ] },
      { id: 'L2', code: 'LOT 02', name: 'Peinture', lines: [
        newLine({ id: 'c', ref: 'PE-01', designation: 'Peinture', unit: 'm²', qty: 300, unitPrice: null }),
      ] },
    ],
  };
  test('montant = arrondi(quantité × PU), totaux, TVA 18 %', () => {
    const r = computeDoc(body, { currency: 'XOF', taxes: [{ label: 'TVA', rate: 18 }] });
    expect(r.lines.get('a')!.amount).toBe(1062500);
    expect(r.lines.get('b')!.amount).toBe(902685); // 120,35 × 7 500,5 = 902 685,1… → 902 685
    expect(r.lines.get('a')!.number).toBe('1.1');
    expect(r.lines.get('b')!.number).toBe('1.2');
    expect(r.lots[0].subtotal).toBe(1965185);
    expect(r.lines.get('c')!.amount).toBeNull();
    expect(r.lines.get('c')!.missing).toEqual(['prix unitaire']);
    expect(r.incomplete).toBe(1);
    expect(r.totalHT).toBe(1965185);
    expect(r.taxes[0].amount).toBe(353733); // 1 965 185 × 18 % = 353 733,3
    expect(r.totalTTC).toBe(2318918);
  });
  test('remise appliquée avant taxes', () => {
    const r = computeDoc(body, { currency: 'XOF', discountPct: 5, taxes: [{ label: 'TVA', rate: 18 }] });
    expect(r.discount).toBe(98259);
    expect(r.netHT).toBe(1866926);
    expect(r.totalTTC).toBe(1866926 + 336047);
  });
  test('BPU tiré du DQE puis réappliqué', () => {
    const { items } = bpuFromDoc(body);
    expect(items).toHaveLength(3);
    const priced = items.map((i) => (i.ref === 'PE-01' ? { ...i, unitPrice: 1500 } : i));
    const res = applyBpu(body, priced);
    expect(res.applied).toBe(3);
    expect(computeDoc(res.body, { currency: 'XOF', taxes: [] }).totalHT).toBe(1965185 + 450000);
  });
});

describe('déboursé sec (§14.4)', () => {
  const b = {
    ...DEFAULT_BREAKDOWN,
    baseQty: 1,
    components: [
      { kind: 'materiau' as const, designation: 'Ciment', unit: 'sac', qty: 7, unitCost: 5000 },
      { kind: 'materiau' as const, designation: 'Sable', unit: 'm³', qty: 0.5, unitCost: 12000 },
      { kind: 'main_oeuvre' as const, designation: 'Maçon', unit: 'j', qty: 1, unitCost: 10000 },
    ],
    lossPct: 5, indirectPct: 10, marginPct: 15, marginBase: 'cout' as const,
  };
  test('méthode additive', () => {
    const r = computeBreakdown(b);
    expect(r.ds).toBe(51000);
    expect(r.losses).toBe(2050); // 41 000 × 5 %
    expect(r.indirect).toBe(5305); // 53 050 × 10 %
    expect(r.costPrice).toBe(58355);
    expect(r.salePrice).toBe(67108); // 58 355 × 1,15 = 67 108,25
  });
  test('marge sur prix de vente et coefficient', () => {
    expect(computeBreakdown({ ...b, marginBase: 'vente' }).salePrice).toBe(68653); // 58 355 / 0,85
    expect(computeBreakdown({ ...b, method: 'coefficient', coefficient: 1.35 }).salePrice).toBe(68850);
  });
  test('composant incomplet : pas de prix de vente', () => {
    const r = computeBreakdown({ ...b, components: [...b.components, { kind: 'transport', designation: 'Camion', unit: 'voyage', qty: 1, unitCost: null }] });
    expect(r.salePrice).toBeNull();
    expect(r.missing).toEqual(['Camion']);
  });
});

describe('CSV et doublons', () => {
  test('aller-retour CSV avec ; et guillemets', () => {
    const csv = toCsv([['Nom', 'Note'], ['ETS "Bâtir"', 'a;b\nc']]);
    expect(parseCsv(csv)).toEqual([['Nom', 'Note'], ['ETS "Bâtir"', 'a;b\nc']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  test('doublons par nom, téléphone ou e-mail', () => {
    const list = [{ id: '1', name: 'SARL Kouassi BTP', phone: '+225 07 01 02 03 04', email: 'x@y.ci' }];
    expect(findDuplicates({ name: 'Kouassi BTP' }, list)[0].reasons).toEqual(['même nom']);
    expect(findDuplicates({ name: 'Autre', phone: '0701020304' }, list)[0].reasons).toEqual(['même téléphone']);
    expect(findDuplicates({ name: 'Autre', email: 'X@Y.CI' }, list)).toHaveLength(1);
    expect(findDuplicates({ name: 'Autre' }, list)).toHaveLength(0);
  });
});
