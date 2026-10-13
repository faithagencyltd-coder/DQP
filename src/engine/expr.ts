// Évaluateur d'expressions de métré, sans eval : nombres (virgule ou point), variables,
// + - × / ( ), « x » ou « × » acceptés pour la multiplication.

export class ExprError extends Error {}

type Tok = { t: 'n'; v: number } | { t: 'v'; v: string } | { t: 'o'; v: string } | { t: '(' } | { t: ')' };

function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
    if (num) { out.push({ t: 'n', v: Number(num[0].replace(',', '.')) }); i += num[0].length; continue; }
    const id = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ_0-9]*/.exec(s.slice(i));
    if (id) {
      // « x » seul entre deux opérandes = multiplication (5 x 4).
      if (id[0] === 'x' && out.length && (out[out.length - 1].t === 'n' || out[out.length - 1].t === ')' || out[out.length - 1].t === 'v')) {
        out.push({ t: 'o', v: '*' });
      } else out.push({ t: 'v', v: id[0] });
      i += id[0].length;
      continue;
    }
    if ('+-*/'.includes(c)) { out.push({ t: 'o', v: c }); i++; continue; }
    if (c === '(') { out.push({ t: '(' }); i++; continue; }
    if (c === ')') { out.push({ t: ')' }); i++; continue; }
    throw new ExprError(`Caractère non autorisé « ${c} »`);
  }
  return out;
}

/** Évalue l'expression. Une variable sans valeur lève une erreur listant les manquantes. */
export function evaluate(src: string, vars: Record<string, number | null | undefined>): number {
  const toks = tokenize(src);
  if (!toks.length) throw new ExprError('Expression vide');
  const missing = [...new Set(toks.filter((t): t is { t: 'v'; v: string } => t.t === 'v').map((t) => t.v))].filter((v) => vars[v] === null || vars[v] === undefined);
  if (missing.length) throw new ExprError(`Valeur manquante : ${missing.join(', ')}`);
  let p = 0;
  const peek = () => toks[p];
  const primary = (): number => {
    const t = toks[p++];
    if (!t) throw new ExprError('Expression incomplète');
    if (t.t === 'n') return t.v;
    if (t.t === 'v') return vars[t.v] as number;
    if (t.t === '(') {
      const v = sum();
      if (peek()?.t !== ')') throw new ExprError('Parenthèse fermante manquante');
      p++;
      return v;
    }
    if (t.t === 'o' && t.v === '-') return -primary();
    throw new ExprError('Expression mal formée');
  };
  const product = (): number => {
    let v = primary();
    for (;;) {
      const t = peek();
      if (t?.t === 'o' && (t.v === '*' || t.v === '/')) {
        p++;
        const r = primary();
        if (t.v === '/' && r === 0) throw new ExprError('Division par zéro');
        v = t.v === '*' ? v * r : v / r;
      } else if (t && (t.t === 'n' || t.t === 'v' || t.t === '(')) {
        throw new ExprError('Opérateur manquant');
      } else return v;
    }
  };
  const sum = (): number => {
    let v = product();
    for (;;) {
      const t = peek();
      if (t?.t === 'o' && (t.v === '+' || t.v === '-')) { p++; const r = product(); v = t.v === '+' ? v + r : v - r; }
      else return v;
    }
  };
  const v = sum();
  if (p < toks.length) throw new ExprError('Expression mal formée');
  if (!Number.isFinite(v)) throw new ExprError('Résultat non numérique');
  return v;
}

export function variablesOf(src: string): string[] {
  try {
    return [...new Set(tokenize(src).filter((t): t is { t: 'v'; v: string } => t.t === 'v').map((t) => t.v))];
  } catch {
    return [];
  }
}
