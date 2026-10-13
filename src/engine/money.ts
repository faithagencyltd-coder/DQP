// Règles d'arrondi et de présentation des montants, centralisées (cahier des charges §30.2).
// Tous les écrans, PDF et exports passent par ces fonctions.

export interface CurrencyInfo {
  code: string;
  label: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  XOF: { code: 'XOF', label: 'Franc CFA (UEMOA)', symbol: 'FCFA', decimals: 0 },
  XAF: { code: 'XAF', label: 'Franc CFA (CEMAC)', symbol: 'FCFA', decimals: 0 },
  EUR: { code: 'EUR', label: 'Euro', symbol: '€', decimals: 2 },
  USD: { code: 'USD', label: 'Dollar américain', symbol: '$', decimals: 2 },
  GHS: { code: 'GHS', label: 'Cedi ghanéen', symbol: 'GH₵', decimals: 2 },
  NGN: { code: 'NGN', label: 'Naira nigérian', symbol: '₦', decimals: 2 },
};

export function currency(code: string | null | undefined): CurrencyInfo {
  return CURRENCIES[code ?? 'XOF'] ?? { code: code ?? 'XOF', label: code ?? 'XOF', symbol: code ?? '', decimals: 2 };
}

/** Arrondi « au plus proche, demi vers l'extérieur », sans les erreurs binaires (1,005 → 1,01). */
export function roundTo(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** decimals;
  const scaled = Math.abs(value) * f;
  const r = Math.round(Number((scaled).toPrecision(15)));
  return (Math.sign(value) * r) / f || 0;
}

export function roundMoney(value: number, currencyCode = 'XOF'): number {
  return roundTo(value, currency(currencyCode).decimals);
}

const NBSP = ' ';

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 1234567.5 → « 1 234 567,50 » (séparateurs français). */
export function formatNumber(value: number | null | undefined, decimals = 2, trim = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const r = roundTo(value, decimals);
  const neg = r < 0;
  let [i, d = ''] = Math.abs(r).toFixed(decimals).split('.');
  if (trim) d = d.replace(/0+$/, '');
  return (neg ? '-' : '') + group(i) + (d ? ',' + d : '');
}

export function formatMoney(value: number | null | undefined, currencyCode = 'XOF', withSymbol = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const c = currency(currencyCode);
  const s = formatNumber(value, c.decimals, false);
  return withSymbol ? `${s}${NBSP}${c.symbol}` : s;
}

/** Lecture d'un nombre saisi en français : « 1 234,5 », « 1234.5 », « 12,5 % ». */
export function parseNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = input.trim().replace(/[\s  ]/g, '').replace(/%$/, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------------ montant en lettres
const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function below100(n: number): string {
  if (n <= 16) return UNITS[n];
  if (n < 20) return 'dix-' + UNITS[n - 10];
  if (n < 70) {
    const t = Math.floor(n / 10), u = n % 10;
    return TENS[t] + (u === 0 ? '' : u === 1 ? ' et un' : '-' + UNITS[u]);
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : 'soixante-' + below100(n - 60);
  if (n === 80) return 'quatre-vingts';
  return 'quatre-vingt-' + below100(n - 80);
}

function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  if (h === 0) return below100(r);
  const head = h === 1 ? 'cent' : UNITS[h] + (r === 0 ? ' cents' : ' cent');
  return r === 0 ? head : head + ' ' + below100(r);
}

/** 1 250 000 → « un million deux cent cinquante mille ». Entiers positifs. */
export function numberToFrenchWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'zéro';
  const parts: string[] = [];
  const scales: [number, string, string][] = [[1e9, 'milliard', 'milliards'], [1e6, 'million', 'millions']];
  for (const [s, one, many] of scales) {
    const q = Math.floor(n / s);
    if (q) {
      parts.push(below1000(q) + ' ' + (q > 1 ? many : one));
      n %= s;
    }
  }
  const th = Math.floor(n / 1000);
  if (th) {
    parts.push(th === 1 ? 'mille' : below1000(th).replace(/cents$/, 'cent') + ' mille');
    n %= 1000;
  }
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}

export function amountInWords(value: number, currencyCode = 'XOF'): string {
  const words = numberToFrenchWords(roundMoney(value, currencyCode));
  const unit = currencyCode === 'XOF' || currencyCode === 'XAF' ? 'francs CFA' : currency(currencyCode).label;
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${unit}`;
}
