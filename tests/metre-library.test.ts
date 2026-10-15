// Métré relié à la bibliothèque des travaux : formule de l'ouvrage, origine des quantités,
// regroupement pour le DQE.
import { describe, expect, test } from 'vitest';
import { checkFormula, computeMetre, formulaForUnit, groupMetre, lineFromLibrary, lineOrigin, type MetreLine } from '../src/engine/metre';
import { planToMetreLines } from '../src/engine/plan/exports';
import { newLine, newLot, reviewPoints } from '../src/engine/dqe';

const item = { id: 'it1', code: 'GO-022', designation: 'Enduits verticaux dosé à 400kg/m3', unit: 'm2', trade: 'MACONNERIE - BETON', category: 'Gros œuvre', formula: null, metre_method: null };

describe('formules de la bibliothèque', () => {
  test('vérification des formules paramétrables', () => {
    expect(checkFormula('L × H × N')).toBeNull();
    expect(checkFormula('2 x (L + l) x H')).toBeNull();
    expect(checkFormula('L × E')).toMatch(/Variable\(s\) inconnue\(s\) : E/);
    expect(checkFormula('L × (H')).toMatch(/Parenthèse/);
    expect(checkFormula('  ')).toBe('Formule vide');
  });

  test('formule par défaut selon l’unité', () => {
    expect(formulaForUnit('m2')).toBe('surface');
    expect(formulaForUnit('m³')).toBe('volume');
    expect(formulaForUnit('ml')).toBe('longueur');
    expect(formulaForUnit('u')).toBe('unite');
    expect(formulaForUnit('ff')).toBe('forfait');
    expect(formulaForUnit('kg')).toBe('forfait');
  });
});

describe('ligne de métré depuis un ouvrage', () => {
  test('ouvrage sans formule : formule standard de l’unité, dimensions à saisir', () => {
    const l = lineFromLibrary(item, 'm1');
    expect(l).toMatchObject({ ref: 'GO-022', designation: item.designation, unit: 'm²', lot: 'MACONNERIE - BETON', formula: 'surface', L: null, l: null, itemId: 'it1', source: 'Bibliothèque GO-022' });
    // Rien n'est deviné : sans dimensions, la quantité n'est pas déterminée.
    expect(computeMetre(l).qty).toBeNull();
    expect(computeMetre({ ...l, L: 12.5, l: 3 }).qty).toBe(37.5);
    expect(lineOrigin(l)).toBe('calcule');
  });

  test('ouvrage avec formule : formule appliquée, méthode reprise en observation', () => {
    const l = lineFromLibrary({ ...item, formula: '2 × (L + l) × H', metre_method: 'ouvertures > 1 m² déduites à part' }, 'm2');
    expect(l.formula).toBe('libre');
    expect(l.expression).toBe('2 × (L + l) × H');
    expect(l.notes).toBe('Méthode : ouvertures > 1 m² déduites à part');
    const r = computeMetre({ ...l, L: 4, l: 3, H: 2.8 });
    expect(r.qty).toBe(39.2);
    expect(r.steps[0]).toContain('2 × (L + l) × H');
  });

  test('formule invalide : formule standard et signalement', () => {
    const l = lineFromLibrary({ ...item, formula: 'L × E' }, 'm3');
    expect(l.formula).toBe('surface');
    expect(l.notes).toMatch(/Formule de la bibliothèque inutilisable/);
  });
});

describe('origine des quantités', () => {
  const base: MetreLine = { id: 'a', ref: '', designation: 'Dalle', location: '', lot: 'GO', formula: 'surface', L: 5, l: 4, H: null, N: 1, openings: [], unit: 'm²', source: 'Saisie manuelle', notes: '' };

  test('origine déduite ou choisie', () => {
    expect(lineOrigin(base)).toBe('calcule');
    expect(lineOrigin({ ...base, formula: 'forfait' })).toBe('saisi');
    expect(lineOrigin({ ...base, source: 'Plan PL-0001 — pièce' })).toBe('reconnu');
    expect(lineOrigin({ ...base, origin: 'estime' })).toBe('estime');
  });

  test('lignes tirées d’un plan : « reconnues sur plan »', () => {
    const lines = planToMetreLines({ scaleVerified: true, rooms: [{ id: 'r', name: 'Séjour', points: [[0, 0], [5, 0], [5, 4], [0, 4]] }], walls: [], openings: [], wallHeight: 2.8 } as never, 'PL-0001');
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(lineOrigin(l)).toBe('reconnu');
  });

  test('regroupement : origines et ouvrage commun', () => {
    const g = groupMetre([
      { ...base, id: 'a', itemId: 'it1' },
      { ...base, id: 'b', itemId: 'it1', origin: 'estime', L: 2 },
      { ...base, id: 'c', designation: 'Chape', itemId: 'it2' },
      { ...base, id: 'd', designation: 'Chape', itemId: null },
    ]);
    const dalle = g.find((x) => x.designation === 'Dalle')!;
    expect(dalle.qty).toBe(28);
    expect(dalle.origins.sort()).toEqual(['calcule', 'estime']);
    expect(dalle.itemId).toBe('it1');
    // Ouvrages différents dans un même groupe : pas de prix repris automatiquement.
    expect(g.find((x) => x.designation === 'Chape')!.itemId).toBeNull();
  });
});

describe('points à revoir avant validation', () => {
  test('quantités estimées et prix « à vérifier » comptés', () => {
    const lot = newLot('Électricité', 0);
    lot.lines = [
      newLine({ designation: 'Prise', qty: 12, unitPrice: 3500, qtySource: { kind: 'metre', estimated: true }, priceSource: { kind: 'bibliotheque', toVerify: true } }),
      newLine({ designation: 'Point lumineux', qty: 20, unitPrice: 5000, qtySource: { kind: 'metre' }, priceSource: { kind: 'bibliotheque' } }),
      newLine({ kind: 'titre', designation: 'Sous-titre' }),
    ];
    expect(reviewPoints({ lots: [lot] })).toEqual({ estimated: 1, toVerify: 1 });
  });
});
