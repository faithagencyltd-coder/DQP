// Unités de métré (§11.2, §18.4). Une conversion n'est proposée que si son facteur est
// exact et universel : sac, carton, journée… n'ont PAS de conversion implicite.

export type UnitKind = 'longueur' | 'surface' | 'volume' | 'unite' | 'poids' | 'temps' | 'forfait' | 'contenant' | 'liquide';

export interface UnitDef {
  code: string;
  label: string;
  kind: UnitKind;
}

export const UNITS: UnitDef[] = [
  { code: 'ml', label: 'mètre linéaire', kind: 'longueur' },
  { code: 'm', label: 'mètre', kind: 'longueur' },
  { code: 'cm', label: 'centimètre', kind: 'longueur' },
  { code: 'mm', label: 'millimètre', kind: 'longueur' },
  { code: 'm²', label: 'mètre carré', kind: 'surface' },
  { code: 'm³', label: 'mètre cube', kind: 'volume' },
  { code: 'u', label: 'unité', kind: 'unite' },
  { code: 'pce', label: 'pièce', kind: 'unite' },
  { code: 'ens', label: 'ensemble', kind: 'forfait' },
  { code: 'ff', label: 'forfait', kind: 'forfait' },
  { code: 'kg', label: 'kilogramme', kind: 'poids' },
  { code: 't', label: 'tonne', kind: 'poids' },
  { code: 'h', label: 'heure', kind: 'temps' },
  { code: 'j', label: 'journée', kind: 'temps' },
  { code: 'sac', label: 'sac', kind: 'contenant' },
  { code: 'carton', label: 'carton', kind: 'contenant' },
  { code: 'l', label: 'litre', kind: 'liquide' },
  { code: 'voyage', label: 'voyage (camion)', kind: 'contenant' },
];

const ALIASES: Record<string, string> = {
  m2: 'm²', 'm^2': 'm²', mc: 'm²', m3: 'm³', 'm^3': 'm³', ml: 'ml', 'm.l': 'ml', lm: 'ml',
  u: 'u', un: 'u', unite: 'u', unité: 'u', nb: 'u', pc: 'pce', pce: 'pce', pièce: 'pce', piece: 'pce',
  ens: 'ens', ensemble: 'ens', ff: 'ff', fft: 'ff', forfait: 'ff', kg: 'kg', t: 't', tonne: 't',
  h: 'h', heure: 'h', j: 'j', jour: 'j', journée: 'j', sac: 'sac', sacs: 'sac', l: 'l', litre: 'l',
};

export function normalizeUnit(u: string): string {
  const k = u.trim().toLowerCase().replace(/\s+/g, '');
  return ALIASES[k] ?? u.trim();
}

export function unitDef(code: string): UnitDef | undefined {
  return UNITS.find((u) => u.code === normalizeUnit(code));
}

/** Facteurs exacts vers l'unité de base de la famille. */
const FACTORS: Record<string, [string, number]> = {
  m: ['m', 1], ml: ['m', 1], cm: ['m', 0.01], mm: ['m', 0.001],
  kg: ['kg', 1], t: ['kg', 1000],
};

/** Convertit si (et seulement si) le facteur est connu ; sinon null. */
export function convert(value: number, from: string, to: string): number | null {
  const a = FACTORS[normalizeUnit(from)];
  const b = FACTORS[normalizeUnit(to)];
  if (normalizeUnit(from) === normalizeUnit(to)) return value;
  if (!a || !b || a[0] !== b[0]) return null;
  return (value * a[1]) / b[1];
}
