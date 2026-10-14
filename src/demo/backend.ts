// Version de démonstration autonome : un « serveur » qui tourne dans le navigateur.
// Les appels que la bibliothèque Supabase enverrait sur le réseau (authentification, données,
// fichiers) sont traités ici sur une vraie base PostgreSQL (PGlite) avec les MÊMES migrations,
// fonctions et règles d'accès (RLS) que la production. Rien ne sort de l'ordinateur.

import type { PGlite, Transaction } from '@electric-sql/pglite';

// Base utilisée : celle du navigateur par défaut ; un banc d'essai peut en fournir une autre.
let provider: () => Promise<PGlite> = () => import('./db').then((m) => m.getDemoDb());
export const demoOptions = { autoConfirm: true };
export function useDemoDb(get: () => Promise<PGlite>) { provider = get; }
const getDemoDb = () => provider();

type Claims = { sub: string; email: string; role: 'authenticated'; aud: 'authenticated'; aal: 'aal1'; iat: number; exp: number } | null;
type Tx = Transaction | PGlite;

export const DEMO_URL = 'https://demo.planora.local';

// ---------------------------------------------------------------- utilitaires
const enc = new TextEncoder();
const b64url = (s: string) => btoa(String.fromCharCode(...enc.encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined || status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const ident = (s: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new RestError(400, 'PGRST100', `Nom invalide : ${s}`);
  return `"${s}"`;
};
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

class RestError extends Error {
  status: number;
  code: string;
  details: string | null;
  constructor(status: number, code: string, message: string, details: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function token(u: { id: string; email: string }) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 30 * 86400;
  const payload = { sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', aal: 'aal1', iat: now, exp, session_id: crypto.randomUUID() };
  return { access: `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.demo`, exp };
}
function claimsFrom(req: Request): Claims {
  const h = req.headers.get('authorization') ?? '';
  const t = h.replace(/^Bearer\s+/i, '');
  const parts = t.split('.');
  if (parts.length !== 3) return null;
  try {
    const c = JSON.parse(unb64url(parts[1]));
    return c?.sub ? c : null;
  } catch { return null; }
}

/** Exécute fn avec le rôle et l'identité de l'appelant : les règles RLS s'appliquent. */
async function asUser<T>(db: PGlite, claims: Claims, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${claims ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? { role: 'anon' })]);
    return fn(tx);
  });
}

function pgError(e: unknown): Response {
  if (e instanceof RestError) return json(e.status, { code: e.code, message: e.message, details: e.details, hint: null });
  const err = e as { code?: string; message?: string; detail?: string; hint?: string };
  const code = err.code ?? 'XX000';
  const status = code === '42501' ? 403 : code === '23505' ? 409 : code.startsWith('23') || code === 'P0001' || code.startsWith('22') ? 400 : code === '42883' || code === '42P01' ? 404 : 400;
  return json(status, { code, message: err.message ?? 'Erreur', details: err.detail ?? null, hint: err.hint ?? null });
}

// ---------------------------------------------------------------- métadonnées (clés étrangères, fonctions)
interface Fk { child: string; col: string; parent: string; pcol: string }
let fks: Fk[] | null = null;
async function foreignKeys(db: PGlite): Promise<Fk[]> {
  if (fks) return fks;
  const r = await db.query<Fk>(`
    select cl.relname as child, a.attname as col, pl.relname as parent, af.attname as pcol
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid join pg_namespace cn on cn.oid = cl.relnamespace and cn.nspname = 'public'
    join pg_class pl on pl.oid = c.confrelid join pg_namespace pn on pn.oid = pl.relnamespace and pn.nspname = 'public'
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1`);
  fks = r.rows;
  return fks;
}

// ---------------------------------------------------------------- traduction PostgREST → SQL
function splitTop(s: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0, quote = false, cur = '';
  for (const ch of s) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (!quote && depth === 0 && ch === sep) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

async function selectList(db: PGlite, table: string, alias: string, select: string, depth = 0): Promise<string> {
  const items = splitTop(select || '*');
  const out: string[] = [];
  for (const raw of items) {
    const m = /^(?:([A-Za-z_][\w]*):)?([A-Za-z_][\w]*)(?:!([\w]+))?\((.*)\)$/s.exec(raw);
    if (m) {
      const [, aliasName, rel, , inner] = m;
      const all = await foreignKeys(db);
      const ra = `r${depth + 1}`;
      const sub = await selectList(db, rel, ra, inner, depth + 1);
      const toParent = all.find((f) => f.child === table && f.parent === rel);
      const toChild = all.find((f) => f.child === rel && f.parent === table);
      const name = ident(aliasName ?? rel);
      if (toParent) out.push(`(select row_to_json(_x) from (select ${sub} from public.${ident(rel)} ${ra} where ${ra}.${ident(toParent.pcol)} = ${alias}.${ident(toParent.col)}) _x) as ${name}`);
      else if (toChild) out.push(`coalesce((select json_agg(row_to_json(_x)) from (select ${sub} from public.${ident(rel)} ${ra} where ${ra}.${ident(toChild.col)} = ${alias}.${ident(toChild.pcol)}) _x), '[]'::json) as ${name}`);
      else throw new RestError(400, 'PGRST200', `Aucune relation entre ${table} et ${rel}`);
      continue;
    }
    if (raw === '*') { out.push(`${alias}.*`); continue; }
    const c = /^(?:([A-Za-z_][\w]*):)?([A-Za-z_][\w]*)(?:::([\w]+))?$/.exec(raw);
    if (!c) throw new RestError(400, 'PGRST100', `Sélection non gérée : ${raw}`);
    const [, a, col, cast] = c;
    out.push(`${alias}.${ident(col)}${cast ? `::${ident(cast).replace(/"/g, '')}` : ''} as ${ident(a ?? col)}`);
  }
  return out.join(', ');
}

function listValues(s: string): string[] {
  const inner = s.replace(/^\(/, '').replace(/\)$/, '');
  return splitTop(inner).map((v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v));
}

function condition(alias: string, col: string, expr: string): string {
  let neg = false;
  let e = expr;
  if (e.startsWith('not.')) { neg = true; e = e.slice(4); }
  const dot = e.indexOf('.');
  const op = e.slice(0, dot);
  const val = e.slice(dot + 1);
  const c = `${alias}.${ident(col)}`;
  let sql: string;
  switch (op) {
    case 'eq': sql = `${c} = ${lit(val)}`; break;
    case 'neq': sql = `${c} <> ${lit(val)}`; break;
    case 'gt': sql = `${c} > ${lit(val)}`; break;
    case 'gte': sql = `${c} >= ${lit(val)}`; break;
    case 'lt': sql = `${c} < ${lit(val)}`; break;
    case 'lte': sql = `${c} <= ${lit(val)}`; break;
    case 'like': sql = `${c}::text like ${lit(val.replace(/\*/g, '%'))}`; break;
    case 'ilike': sql = `${c}::text ilike ${lit(val.replace(/\*/g, '%'))}`; break;
    case 'is': sql = `${c} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : val === 'false' ? 'false' : 'unknown'}`; break;
    case 'in': { const vs = listValues(val); sql = vs.length ? `${c} in (${vs.map(lit).join(', ')})` : 'false'; break; }
    case 'cs': sql = `${c} @> ${lit(val)}`; break;
    case 'cd': sql = `${c} <@ ${lit(val)}`; break;
    case 'ov': sql = `${c} && ${lit(val)}`; break;
    default: throw new RestError(400, 'PGRST100', `Opérateur non géré : ${op}`);
  }
  return neg ? `not (${sql})` : sql;
}

function logical(alias: string, kind: 'or' | 'and', body: string): string {
  const parts = splitTop(body.replace(/^\(/, '').replace(/\)$/, '')).map((p) => {
    const m = /^(not\.)?(and|or)(\(.*\))$/s.exec(p);
    if (m) return `${m[1] ? 'not ' : ''}(${logical(alias, m[2] as 'or' | 'and', m[3])})`;
    const dot = p.indexOf('.');
    return condition(alias, p.slice(0, dot), p.slice(dot + 1));
  });
  return parts.length ? parts.map((x) => `(${x})`).join(` ${kind} `) : 'true';
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function whereClause(alias: string, params: URLSearchParams): string {
  const conds: string[] = [];
  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue;
    if (k === 'or' || k === 'and') conds.push(`(${logical(alias, k, v)})`);
    else if (k === 'not.or' || k === 'not.and') conds.push(`not (${logical(alias, k.slice(4) as 'or' | 'and', v)})`);
    else conds.push(condition(alias, k, v));
  }
  return conds.length ? `where ${conds.join(' and ')}` : '';
}

function orderClause(alias: string, order: string | null): string {
  if (!order) return '';
  return 'order by ' + splitTop(order).map((o) => {
    const [col, ...mods] = o.split('.');
    let s = `${alias}.${ident(col)}`;
    if (mods.includes('desc')) s += ' desc';
    if (mods.includes('nullsfirst')) s += ' nulls first';
    if (mods.includes('nullslast')) s += ' nulls last';
    return s;
  }).join(', ');
}

async function rows(tx: Tx, sql: string, params: unknown[] = []): Promise<unknown[]> {
  const r = await tx.query<{ j: unknown[] | null }>(`select coalesce(json_agg(_q), '[]'::json) as j from (${sql}) _q`, params);
  return (r.rows[0]?.j ?? []) as unknown[];
}

/** Écriture avec retour des lignes : la requête de modification doit rester au premier niveau. */
async function writeRows(tx: Tx, name: string, dml: string, select: string, params: unknown[] = []): Promise<unknown[]> {
  const r = await tx.query<{ j: unknown[] | null }>(`with ${name} as (${dml}) select coalesce(json_agg(_q), '[]'::json) as j from (${select}) _q`, params);
  return (r.rows[0]?.j ?? []) as unknown[];
}

function shape(req: Request, data: unknown[], status = 200): Response {
  const accept = req.headers.get('accept') ?? '';
  if (accept.includes('vnd.pgrst.object')) {
    if (data.length !== 1) throw new RestError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${data.length} rows`);
    return json(status, data[0]);
  }
  return json(status, data, { 'content-range': data.length ? `0-${data.length - 1}/*` : '*/0' });
}

async function rest(db: PGlite, req: Request, url: URL): Promise<Response> {
  const claims = claimsFrom(req);
  const path = url.pathname.replace(/^\/rest\/v1\/?/, '');
  const params = url.searchParams;
  const prefer = req.headers.get('prefer') ?? '';

  if (path.startsWith('rpc/')) return rpc(db, req, claims, path.slice(4), url);

  const table = path;
  ident(table);
  const T = `public.${ident(table)}`;
  const select = params.get('select') ?? '*';

  if (req.method === 'GET' || req.method === 'HEAD') {
    const cols = await selectList(db, table, 't', select);
    const lim = params.get('limit') ? `limit ${Number(params.get('limit'))}` : '';
    const off = params.get('offset') ? `offset ${Number(params.get('offset'))}` : '';
    const data = await asUser(db, claims, (tx) => rows(tx, `select ${cols} from ${T} t ${whereClause('t', params)} ${orderClause('t', params.get('order'))} ${lim} ${off}`));
    if (req.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}` } });
    return shape(req, data);
  }

  const wantRows = prefer.includes('return=representation');
  if (req.method === 'POST') {
    const body = JSON.parse((await req.text()) || '[]');
    const list = (Array.isArray(body) ? body : [body]) as Record<string, unknown>[];
    const colsParam = params.get('columns');
    const keys = colsParam ? colsParam.split(',').map((c) => c.replace(/"/g, '')) : [...new Set(list.flatMap((o) => Object.keys(o)))];
    if (!list.length) return json(201, []);
    const colSql = keys.map(ident).join(', ');
    let conflict = '';
    const onConflict = params.get('on_conflict');
    if (onConflict) {
      const target = onConflict.split(',').map(ident).join(', ');
      if (prefer.includes('ignore-duplicates')) conflict = `on conflict (${target}) do nothing`;
      else if (prefer.includes('merge-duplicates')) {
        const upd = keys.filter((k) => !onConflict.split(',').includes(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`);
        conflict = upd.length ? `on conflict (${target}) do update set ${upd.join(', ')}` : `on conflict (${target}) do nothing`;
      }
    }
    // Liste des colonnes calculée AVANT la transaction (PGlite n'a qu'une connexion).
    const cols = wantRows ? await selectList(db, table, 't', select) : '';
    const data = await asUser(db, claims, async (tx) => {
      const ins = `insert into ${T} (${colSql}) select ${colSql} from json_populate_recordset(null::${T}, $1::json) ${conflict} returning *`;
      if (!wantRows) { await tx.query(ins, [JSON.stringify(list)]); return []; }
      return writeRows(tx, 't', ins, `select ${cols} from t`, [JSON.stringify(list)]);
    });
    return wantRows ? shape(req, data, 201) : json(201, undefined);
  }

  if (req.method === 'PATCH') {
    const body = JSON.parse((await req.text()) || '{}') as Record<string, unknown>;
    const keys = Object.keys(body);
    if (!keys.length) throw new RestError(400, 'PGRST102', 'Aucune colonne à modifier');
    const set = keys.map((k) => `${ident(k)} = _r.${ident(k)}`).join(', ');
    const where = whereClause('t', params);
    const cols = wantRows ? await selectList(db, table, 'u', select) : '';
    const data = await asUser(db, claims, async (tx) => {
      const upd = `update ${T} t set ${set} from json_populate_record(null::${T}, $1::json) _r ${where} returning t.*`;
      if (!wantRows) { await tx.query(upd, [JSON.stringify(body)]); return []; }
      return writeRows(tx, 'u', upd, `select ${cols} from u`, [JSON.stringify(body)]);
    });
    return wantRows ? shape(req, data) : json(204, undefined);
  }

  if (req.method === 'DELETE') {
    const data = await asUser(db, claims, async (tx) => {
      const del = `delete from ${T} t ${whereClause('t', params)} returning t.*`;
      if (!wantRows) { await tx.query(del); return []; }
      return writeRows(tx, 'd', del, 'select * from d');
    });
    return wantRows ? shape(req, data) : json(204, undefined);
  }
  throw new RestError(405, 'PGRST000', 'Méthode non gérée');
}

interface Fn { argnames: string[] | null; argtypes: string[]; argmodes: string[] | null; retset: boolean; rettype: string }
async function rpc(db: PGlite, req: Request, claims: Claims, name: string, url: URL): Promise<Response> {
  ident(name);
  const args = (req.method === 'GET' ? Object.fromEntries(url.searchParams) : JSON.parse((await req.text()) || '{}')) as Record<string, unknown>;
  const fns = (await db.query<Fn>(`
    select p.proargnames as argnames, p.proargtypes::regtype[]::text[] as argtypes, p.proargmodes::text[] as argmodes,
           p.proretset as retset, p.prorettype::regtype::text as rettype
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [name])).rows;
  const keys = Object.keys(args);
  const fn = fns.find((f) => keys.every((k) => (f.argnames ?? []).includes(k))) ?? fns[0];
  if (!fn) throw new RestError(404, 'PGRST202', `Fonction introuvable : ${name}`);
  const names = (fn.argnames ?? []).slice(0, fn.argtypes.length);
  const params: unknown[] = [];
  const callArgs = keys.map((k) => {
    const type = fn.argtypes[names.indexOf(k)] ?? 'text';
    const v = args[k];
    if (v === null || v === undefined) return `${ident(k)} := null::${type}`;
    if (type === 'json' || type === 'jsonb') { params.push(JSON.stringify(v)); return `${ident(k)} := $${params.length}::${type}`; }
    if (type.endsWith('[]')) {
      params.push(JSON.stringify(v));
      return `${ident(k)} := (select coalesce(array_agg(_e), '{}') from json_array_elements_text($${params.length}::json) _e)::${type}`;
    }
    params.push(typeof v === 'object' ? JSON.stringify(v) : String(v));
    return `${ident(k)} := $${params.length}::text::${type}`;
  });
  const call = `public.${ident(name)}(${callArgs.join(', ')})`;
  const result = await asUser(db, claims, async (tx) => {
    if (fn.retset || fn.rettype === 'record') {
      const r = await tx.query<{ j: unknown }>(`select coalesce(json_agg(to_json(_r)), '[]'::json) as j from ${call} _r`, params);
      return r.rows[0].j;
    }
    const r = await tx.query<{ j: unknown }>(`select to_json(${call}) as j`, params);
    return fn.rettype === 'void' ? undefined : r.rows[0].j;
  });
  if (result === undefined) return json(204, undefined);
  return json(200, result);
}

// ---------------------------------------------------------------- authentification
interface UserRow { id: string; email: string; email_confirmed_at: string | null; raw_user_meta_data: Record<string, unknown> | null; created_at: string }
const userJson = (u: UserRow) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
  email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at,
  user_metadata: u.raw_user_meta_data ?? {}, app_metadata: { provider: 'email' }, created_at: u.created_at, updated_at: u.created_at,
  identities: [], factors: [],
});
function session(u: UserRow) {
  const t = token(u);
  return { access_token: t.access, token_type: 'bearer', expires_in: t.exp - Math.floor(Date.now() / 1000), expires_at: t.exp, refresh_token: b64url(u.id), user: userJson(u) };
}
const authErr = (status: number, msg: string, code: string) => json(status, { code: status, error_code: code, msg, message: msg, error: code, error_description: msg });

async function auth(db: PGlite, req: Request, url: URL): Promise<Response> {
  const route = url.pathname.replace('/auth/v1', '');
  const body = async () => JSON.parse((await req.text()) || '{}');
  if (route === '/settings') return json(200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
  if (route === '/signup' && req.method === 'POST') {
    const b = await body();
    if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return authErr(400, 'Unable to validate email address: invalid format', 'validation_failed');
    if (!b.password || b.password.length < 8) return authErr(422, 'Password should be at least 8 characters.', 'weak_password');
    const exists = await db.query('select 1 from auth.users where lower(email) = lower($1)', [b.email]);
    if (exists.rows.length) return authErr(422, 'User already registered', 'user_already_exists');
    const r = await db.query<UserRow>(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
       values (lower($1), extensions.crypt($2, extensions.gen_salt('bf', 6)), $3::jsonb, case when $4 then now() end) returning *`,
      [b.email, b.password, JSON.stringify(b.data ?? {}), demoOptions.autoConfirm]);
    // Démonstration : adresse confirmée d'office (aucun courriel ne peut être envoyé).
    return json(200, demoOptions.autoConfirm ? session(r.rows[0]) : userJson(r.rows[0]));
  }
  if (route === '/token' && req.method === 'POST') {
    const b = await body();
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const r = await db.query<UserRow>(`select * from auth.users where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)`, [b.email ?? '', b.password ?? '']);
      if (!r.rows.length) return authErr(400, 'Invalid login credentials', 'invalid_credentials');
      if (!r.rows[0].email_confirmed_at) return authErr(400, 'Email not confirmed', 'email_not_confirmed');
      return json(200, session(r.rows[0]));
    }
    if (grant === 'refresh_token') {
      let id = '';
      try { id = unb64url(b.refresh_token ?? ''); } catch { /* jeton illisible */ }
      const r = await db.query<UserRow>('select * from auth.users where id::text = $1', [id]);
      if (!r.rows.length) return authErr(400, 'Invalid Refresh Token', 'refresh_token_not_found');
      return json(200, session(r.rows[0]));
    }
    return authErr(400, 'unsupported grant', 'unsupported_grant_type');
  }
  if (route === '/user') {
    const c = claimsFrom(req);
    if (!c) return authErr(401, 'invalid JWT', 'bad_jwt');
    if (req.method === 'PUT') {
      const b = await body();
      if (b.password) {
        if (b.password.length < 8) return authErr(422, 'Password should be at least 8 characters.', 'weak_password');
        await db.query(`update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 6)) where id = $1`, [c.sub, b.password]);
      }
      if (b.data) await db.query(`update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || $2::jsonb where id = $1`, [c.sub, JSON.stringify(b.data)]);
    }
    const r = await db.query<UserRow>('select * from auth.users where id = $1', [c.sub]);
    if (!r.rows.length) return authErr(401, 'User not found', 'user_not_found');
    return json(200, userJson(r.rows[0]));
  }
  if (route === '/logout') return json(204, undefined);
  if (route === '/recover') return json(200, {});
  if (route.startsWith('/factors')) return authErr(501, 'La double authentification n’est pas disponible dans la version de démonstration.', 'not_implemented');
  return authErr(404, `Route d'authentification inconnue : ${route}`, 'not_found');
}

// ---------------------------------------------------------------- fichiers
async function storage(db: PGlite, req: Request, url: URL): Promise<Response> {
  const route = url.pathname.replace('/storage/v1', '');
  const claims = claimsFrom(req);
  const err = (status: number, message: string) => json(status, { statusCode: String(status), error: status === 403 ? 'Unauthorized' : 'Error', message });
  let m: RegExpExecArray | null;
  if ((m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(route))) {
    const [bucket, name] = [decodeURIComponent(m[1]), decodeURIComponent(m[2])];
    const r = await asUser(db, claims, (tx) => tx.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name]));
    if (!r.rows.length) return err(404, 'Object not found');
    return json(200, { signedURL: `/object/sign/${bucket}/${encodeURI(name)}?token=demo` });
  }
  if ((m = /^\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(route))) {
    const [bucket, name] = [decodeURIComponent(m[1]), decodeURIComponent(m[2])];
    if (req.method === 'POST' || req.method === 'PUT') {
      let bytes: Uint8Array;
      let mime = req.headers.get('content-type') ?? 'application/octet-stream';
      if (mime.startsWith('multipart/form-data')) {
        const fd = await req.formData();
        const file = [...fd.values()].find((v): v is File => typeof v !== 'string');
        if (!file) return err(400, 'Fichier absent');
        bytes = new Uint8Array(await file.arrayBuffer());
        mime = file.type || 'application/octet-stream';
      } else bytes = new Uint8Array(await req.arrayBuffer());
      try {
        await asUser(db, claims, (tx) => tx.query(`insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3::jsonb)`, [bucket, name, JSON.stringify({ size: bytes.length, mimetype: mime })]));
      } catch (e) {
        return err(403, (e as Error).message);
      }
      await db.query('insert into planora_demo.files (bucket, name, mime, data) values ($1, $2, $3, $4) on conflict (bucket, name) do update set mime = excluded.mime, data = excluded.data', [bucket, name, mime, bytes]);
      return json(200, { Key: `${bucket}/${name}`, Id: name });
    }
    if (req.method === 'GET') {
      const r = await asUser(db, claims, (tx) => tx.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name]));
      if (!r.rows.length) return err(404, 'Object not found');
      const f = await db.query<{ mime: string; data: Uint8Array }>('select mime, data from planora_demo.files where bucket = $1 and name = $2', [bucket, name]);
      if (!f.rows.length) return err(404, 'Object not found');
      return new Response(f.rows[0].data as BlobPart, { status: 200, headers: { 'content-type': f.rows[0].mime } });
    }
  }
  if ((m = /^\/object\/([^/]+)$/.exec(route)) && req.method === 'DELETE') {
    const bucket = decodeURIComponent(m[1]);
    const b = JSON.parse((await req.text()) || '{}');
    const deleted = await asUser(db, claims, (tx) => tx.query<{ name: string }>('delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name', [bucket, b.prefixes ?? []]));
    for (const row of deleted.rows) await db.query('delete from planora_demo.files where bucket = $1 and name = $2', [bucket, row.name]);
    return json(200, deleted.rows.map((r) => ({ name: r.name })));
  }
  return err(404, `Route de stockage inconnue : ${route}`);
}

// ---------------------------------------------------------------- point d'entrée
export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.origin !== DEMO_URL) return fetch(input, init);
  try {
    const db = await getDemoDb();
    if (url.pathname.startsWith('/rest/v1')) return await rest(db, req, url);
    if (url.pathname.startsWith('/auth/v1')) return await auth(db, req, url);
    if (url.pathname.startsWith('/storage/v1')) return await storage(db, req, url);
    if (url.pathname.startsWith('/functions/v1/')) return json(503, { error: 'Le rendu IA n’est pas disponible dans la version de démonstration (il nécessite un service IA en ligne).' });
    return json(404, { message: 'introuvable' });
  } catch (e) {
    return pgError(e);
  }
}

/** Contenu d'un fichier déposé (pour l'ouvrir ou le télécharger sans serveur). */
export async function demoFileBlob(path: string): Promise<Blob> {
  const db = await getDemoDb();
  const f = await db.query<{ mime: string; data: Uint8Array }>(`select mime, data from planora_demo.files where bucket = 'documents' and name = $1`, [path]);
  if (!f.rows.length) throw new Error('Fichier introuvable');
  return new Blob([f.rows[0].data as BlobPart], { type: f.rows[0].mime });
}
