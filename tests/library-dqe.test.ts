// DQE / BPU type construit à partir de la bibliothèque des travaux.
import { describe, expect, test } from 'vitest';
import { computeDoc, reviewPoints } from '../src/engine/dqe';
import { libraryToBody, libraryTrades, type LibraryDqeItem } from '../src/engine/library-dqe';

const it = (p: Partial<LibraryDqeItem> & Pick<LibraryDqeItem, 'id' | 'code' | 'designation'>): LibraryDqeItem => ({
  unit: 'u', kind: 'article', category: 'Autre', sale_price: null, currency: 'XOF', price_date: '2026-10-15', validation_status: 'valide', ...p,
});
const ref = (cell: string) => ({ sources: [{ cell }] });

const items: LibraryDqeItem[] = [
  it({ id: '1', code: 'EL-001', designation: 'Prise 2P+T', trade: 'ELECTRICITE', section: 'Rez-de-chaussée', sale_price: 3500, validation_status: 'a_verifier', source_ref: ref('B420') }),
  it({ id: '2', code: 'GO-002', designation: 'Fouilles en rigole', unit: 'm³', trade: 'MACONNERIE - BETON', section: 'A - Fondations', sale_price: 2500, source_ref: ref('B12') }),
  it({ id: '3', code: 'GO-001', designation: 'Béton de propreté', unit: 'm³', trade: 'MACONNERIE - BETON', section: 'A - Fondations', sale_price: 60000, source_ref: ref('B10') }),
  it({ id: '4', code: 'GO-003', designation: 'Enduit ciment', unit: 'm²', trade: 'MACONNERIE - BETON', section: 'B - Élévation', sale_price: null, source_ref: ref('B30') }),
  it({ id: '5', code: 'EL-002', designation: 'Point lumineux', trade: 'ELECTRICITE', section: 'Rez-de-chaussée', sale_price: 5000, source_ref: ref('B421') }),
  it({ id: '6', code: 'EL-003', designation: 'Ancien ouvrage', trade: 'ELECTRICITE', sale_price: 1, validation_status: 'rejete' }),
  it({ id: '7', code: 'EL-004', designation: 'Archivé', trade: 'ELECTRICITE', sale_price: 1, archived_at: '2026-01-01' }),
  it({ id: '8', code: 'PT-001', designation: 'Peinture importée', trade: 'PEINTURE', sale_price: 12, currency: 'EUR' }),
];

describe('DQE type depuis la bibliothèque', () => {
  test('corps d’état dans l’ordre du DQE d’origine, rejetés et archivés exclus', () => {
    expect(libraryTrades(items)).toEqual([
      { name: 'MACONNERIE - BETON', count: 3, toVerify: 0 },
      { name: 'ELECTRICITE', count: 2, toVerify: 1 },
      { name: 'PEINTURE', count: 1, toVerify: 0 },
    ]);
  });

  test('un lot par corps d’état, sections et ordre d’origine, quantités à saisir', () => {
    const { body, stats } = libraryToBody(items, { trades: ['ELECTRICITE', 'MACONNERIE - BETON'], includeToVerify: true, withSections: true, currency: 'XOF' });
    expect(body.lots.map((l) => [l.code, l.name])).toEqual([['LOT 01', 'MACONNERIE - BETON'], ['LOT 02', 'ELECTRICITE']]);
    expect(body.lots[0].lines.map((l) => (l.kind === 'titre' ? `# ${l.designation}` : l.ref))).toEqual(['# A - Fondations', 'GO-001', 'GO-002', '# B - Élévation', 'GO-003']);
    for (const l of body.lots.flatMap((x) => x.lines)) expect(l.qty).toBeNull();
    const prise = body.lots[1].lines.find((l) => l.ref === 'EL-001')!;
    expect(prise.unitPrice).toBe(3500);
    expect(prise.priceSource).toMatchObject({ kind: 'bibliotheque', id: '1', toVerify: true, label: 'EL-001 · 15/10/2026 · à vérifier' });
    expect(prise.note).toBe('Prix de bibliothèque « à vérifier »');
    expect(body.lots[0].lines.find((l) => l.ref === 'GO-003')!.unitPrice).toBeNull();
    expect(stats).toEqual({ ouvrages: 5, chiffres: 4, aVerifier: 1, sansPrix: 1, autreDevise: 0, ecartes: 0 });
    // Sans quantités, rien n'est compté : le total reste à 0 et toutes les lignes sont incomplètes.
    const r = computeDoc(body, { currency: 'XOF', taxes: [] });
    expect(r.totalHT).toBe(0);
    expect(r.incomplete).toBe(5);
    expect(reviewPoints(body)).toEqual({ estimated: 0, toVerify: 1 });
  });

  test('options : à vérifier écartés, sans sections, autre devise non reprise', () => {
    const { body, stats } = libraryToBody(items, { trades: [], includeToVerify: false, withSections: false, currency: 'XOF' });
    expect(body.lots.map((l) => l.name)).toEqual(['MACONNERIE - BETON', 'ELECTRICITE', 'PEINTURE']);
    expect(body.lots.flatMap((l) => l.lines).some((l) => l.kind === 'titre')).toBe(false);
    expect(body.lots[1].lines.map((l) => l.ref)).toEqual(['EL-002']);
    const peinture = body.lots[2].lines[0];
    expect(peinture.unitPrice).toBeNull();
    expect(peinture.note).toBe('Prix en EUR non repris');
    expect(stats).toMatchObject({ ouvrages: 5, ecartes: 1, autreDevise: 1 });
  });
});
