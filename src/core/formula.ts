// Petit évaluateur déterministe de formules de tableur (sous-ensemble utile au DQE) :
// nombres, références (A1, $A$1, Feuil1!A1), plages dans SUM/SOMME, + - * / ^, parenthèses.
// Utilisé pour relire les formules d'un fichier importé et pour les quantités liées.

export type Token =
  | { t: 'num'; v: number }
  | { t: 'ref'; v: string }
  | { t: 'range'; from: string; to: string }
  | { t: 'line'; v: string }
  | { t: 'fn'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'sep' }
  | { t: 'err'; v: string };

export class FormulaError extends Error {}

const REF = /^(?:'[^']+'!|[A-Za-z0-9_]+!)?\$?([A-Za-z]{1,3})\$?(\d+)/;

export function tokenize(formula: string): Token[] {
  const src = formula.trim().replace(/^=/, '');
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if (c === '#') {
      const m = /^#[A-Z/0-9]+[!?]?/.exec(src.slice(i));
      const v = m ? m[0] : '#ERR';
      out.push({ t: 'err', v });
      i += v.length;
      continue;
    }
    if (c === '{') {
      const m = /^\{L:([^}]+)\}/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Référence de ligne invalide à la position ${i}`);
      out.push({ t: 'line', v: m[1] });
      i += m[0].length;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Nombre invalide à la position ${i}`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if ('+-*/^'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { out.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { out.push({ t: 'rp' }); i++; continue; }
    if (c === ',' || c === ';') { out.push({ t: 'sep' }); i++; continue; }
    const rest = src.slice(i);
    const fn = /^([A-Za-z.]+)\s*\(/.exec(rest);
    if (fn) {
      out.push({ t: 'fn', v: fn[1].toUpperCase() });
      i += fn[1].length;
      continue;
    }
    const r1 = REF.exec(rest);
    if (r1) {
      const a = (r1[1] + r1[2]).toUpperCase();
      i += r1[0].length;
      if (src[i] === ':') {
        const r2 = REF.exec(src.slice(i + 1));
        if (!r2) throw new FormulaError('Plage invalide');
        out.push({ t: 'range', from: a, to: (r2[1] + r2[2]).toUpperCase() });
        i += 1 + r2[0].length;
      } else {
        out.push({ t: 'ref', v: a });
      }
      continue;
    }
    throw new FormulaError(`Caractère inattendu « ${c} »`);
  }
  return out;
}

export interface Resolver {
  cell(ref: string): number | null;
  line?(id: string): number | null;
}

export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function indexToCol(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function splitRef(ref: string): { col: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!m) throw new FormulaError(`Référence invalide ${ref}`);
  return { col: m[1], row: Number(m[2]) };
}

export function expandRange(from: string, to: string): string[] {
  const a = splitRef(from);
  const b = splitRef(to);
  const c1 = Math.min(colToIndex(a.col), colToIndex(b.col));
  const c2 = Math.max(colToIndex(a.col), colToIndex(b.col));
  const r1 = Math.min(a.row, b.row);
  const r2 = Math.max(a.row, b.row);
  const out: string[] = [];
  for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) out.push(indexToCol(c) + r);
  return out;
}

/** Évalue une formule. Les cellules vides valent 0 (comme un tableur). */
export function evaluate(formula: string, resolver: Resolver): number {
  const tokens = tokenize(formula);
  let pos = 0;
  const peek = () => tokens[pos];

  const value = (n: number | null) => (n === null ? 0 : n);

  function primary(): number {
    const tk = tokens[pos++];
    if (!tk) throw new FormulaError('Formule incomplète');
    switch (tk.t) {
      case 'num': return tk.v;
      case 'ref': return value(resolver.cell(tk.v));
      case 'line': {
        if (!resolver.line) throw new FormulaError('Référence de ligne non prise en charge ici');
        return value(resolver.line(tk.v));
      }
      case 'err': throw new FormulaError(`Référence cassée ${tk.v}`);
      case 'lp': {
        const v = expr();
        if (peek()?.t !== 'rp') throw new FormulaError('Parenthèse fermante manquante');
        pos++;
        return v;
      }
      case 'op':
        if (tk.v === '-') return -unary();
        if (tk.v === '+') return unary();
        throw new FormulaError(`Opérateur inattendu ${tk.v}`);
      case 'fn': return call(tk.v);
      default: throw new FormulaError('Formule invalide');
    }
  }

  function call(name: string): number {
    if (peek()?.t !== 'lp') throw new FormulaError(`Parenthèse attendue après ${name}`);
    pos++;
    const args: number[] = [];
    while (peek() && peek().t !== 'rp') {
      const tk = peek();
      if (tk.t === 'range') {
        pos++;
        for (const r of expandRange(tk.from, tk.to)) args.push(value(resolver.cell(r)));
      } else {
        args.push(expr());
      }
      if (peek()?.t === 'sep') pos++;
    }
    if (peek()?.t !== 'rp') throw new FormulaError('Parenthèse fermante manquante');
    pos++;
    switch (name) {
      case 'SUM': case 'SOMME': return args.reduce((s, v) => s + v, 0);
      case 'ROUND': case 'ARRONDI': {
        const f = 10 ** (args[1] ?? 0);
        return Math.round(args[0] * f) / f;
      }
      case 'MAX': return Math.max(...args);
      case 'MIN': return Math.min(...args);
      case 'ABS': return Math.abs(args[0] ?? 0);
      default: throw new FormulaError(`Fonction non prise en charge : ${name}`);
    }
  }

  function unary(): number { return primary(); }

  function power(): number {
    let v = unary();
    while (peek()?.t === 'op' && (peek() as { v: string }).v === '^') {
      pos++;
      v = v ** unary();
    }
    return v;
  }

  function term(): number {
    let v = power();
    while (peek()?.t === 'op' && '*/'.includes((peek() as { v: string }).v)) {
      const op = (tokens[pos++] as { v: string }).v;
      const r = power();
      if (op === '/' && r === 0) throw new FormulaError('Division par zéro');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }

  function expr(): number {
    let v = term();
    while (peek()?.t === 'op' && '+-'.includes((peek() as { v: string }).v)) {
      const op = (tokens[pos++] as { v: string }).v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  const result = expr();
  if (pos < tokens.length) throw new FormulaError('Formule mal formée');
  return result;
}

/** Références de cellules (y compris celles des plages) utilisées par une formule. */
export function referencedCells(formula: string): string[] {
  try {
    const out: string[] = [];
    for (const tk of tokenize(formula)) {
      if (tk.t === 'ref') out.push(tk.v);
      if (tk.t === 'range') out.push(...expandRange(tk.from, tk.to));
    }
    return out;
  } catch {
    return [];
  }
}

export function referencedLines(expression: string): string[] {
  return [...expression.matchAll(/\{L:([^}]+)\}/g)].map((m) => m[1]);
}

export function hasBrokenReference(formula: string): boolean {
  return /#REF!|#NAME\?|#VALUE!|#DIV\/0!|#N\/A/i.test(formula);
}
