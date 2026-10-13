// Formatage des nombres et montants (usage francophone : 3 825 000 ; 42,56).

const NBSP = ' ';

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  let [int, dec] = fixed.split('.');
  if (dec) dec = dec.replace(/0+$/, '');
  const out = groupThousands(int) + (dec ? ',' + dec : '');
  return negative ? '-' + out : out;
}

export function formatMoney(value: number | null | undefined, currency = 'FCFA'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${formatNumber(Math.round(value), 0)} ${currency}`.trim();
}

/** Lecture d'un nombre saisi à la française (« 1 234,5 », « 1234.5 »). */
export function parseNumberFr(input: string): number | null {
  const s = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (s === '' || s === '-') return null;
  if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function below100(n: number): string {
  if (n <= 16) return UNITS[n];
  if (n < 20) return 'dix-' + UNITS[n - 10];
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return TENS[t];
    if (u === 1) return TENS[t] + ' et un';
    return TENS[t] + '-' + UNITS[u];
  }
  if (n < 80) {
    const u = n - 60;
    if (u === 11) return 'soixante et onze';
    return 'soixante-' + below100(u);
  }
  const u = n - 80;
  if (u === 0) return 'quatre-vingts';
  return 'quatre-vingt-' + below100(u);
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let out = '';
  if (h === 1) out = 'cent';
  else if (h > 1) out = UNITS[h] + (r === 0 ? ' cents' : ' cent');
  if (r > 0) out += (out ? ' ' : '') + below100(r);
  return out;
}

/** Nombre entier en toutes lettres (orthographe traditionnelle). */
export function numberToFrenchWords(value: number): string {
  let n = Math.round(Math.abs(value));
  if (n === 0) return 'zéro';
  const parts: string[] = [];
  const scales: [number, string, string][] = [
    [1e9, 'milliard', 'milliards'],
    [1e6, 'million', 'millions'],
  ];
  for (const [size, one, many] of scales) {
    const q = Math.floor(n / size);
    if (q > 0) {
      parts.push(`${below1000Big(q)} ${q > 1 ? many : one}`);
      n %= size;
    }
  }
  const thousands = Math.floor(n / 1000);
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : `${below1000(thousands).replace(/cents$/, 'cent')} mille`);
    n %= 1000;
  }
  if (n > 0) parts.push(below1000(n));
  const words = parts.join(' ');
  return value < 0 ? 'moins ' + words : words;
}

function below1000Big(n: number): string {
  // Pour les milliards au-delà de 999 (cas extrême) on retombe sur la règle générale.
  return n < 1000 ? below1000(n) : numberToFrenchWords(n);
}

/** « Quatorze millions … (14 413 664) FRANCS CFA » */
export function amountInWords(value: number, currencyWords = 'francs CFA'): string {
  const words = numberToFrenchWords(value);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} (${formatNumber(Math.round(value), 0)}) ${currencyWords}`;
}

/** Normalisation pour comparaisons (accents, casse, ponctuation). */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/gi, 'oe')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

/** Normalisation des unités usuelles du BTP. */
export function normalizeUnit(unit: string): string {
  const u = unit.trim();
  const key = u.toLowerCase().replace(/\s+/g, '').replace(/\.$/, '');
  const map: Record<string, string> = {
    m2: 'm²', 'm²': 'm²', mc: 'm²', m3: 'm³', 'm³': 'm³', ml: 'ml', m: 'm',
    u: 'u', un: 'u', unite: 'u', 'unité': 'u', ens: 'ens', ensemble: 'ens',
    ff: 'ff', forfait: 'ff', fft: 'ff', kg: 'kg', t: 't', l: 'l', h: 'h', j: 'j',
  };
  return map[key] ?? u;
}

let counter = 0;
export function newId(prefix = ''): string {
  counter = (counter + 1) % 1e6;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
