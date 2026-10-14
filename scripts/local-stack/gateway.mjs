// Pile de test LOCALE imitant les API Supabase utilisées par PLANORA BTP :
//   /rest/v1    → PostgREST (vraie base, vraies migrations, vraies règles RLS)
//   /auth/v1    → authentification simplifiée (inscription, confirmation, connexion, jetons)
//   /storage/v1 → stockage de fichiers (les droits sont vérifiés par la base, en RLS)
//   /functions/v1/rendu-ia → même cœur que la fonction serveur Supabase (supabase/functions/rendu-ia)
// Réservé aux tests : jamais déployé. La production utilise Supabase.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { handleRenduIa, providerFromEnv } from '../../supabase/functions/rendu-ia/core.ts';

const PORT = Number(process.env.GATEWAY_PORT ?? 54320);
const REST = process.env.POSTGREST_URL ?? 'http://127.0.0.1:54331';
const SECRET = process.env.JWT_SECRET ?? 'planora-local-dev-secret-at-least-32-characters!!';
const FILES = process.env.FILES_DIR ?? '/tmp/planora-files';
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT ?? 5432), user: 'postgres', database: process.env.PGDATABASE ?? 'planora_dev' });
fs.mkdirSync(FILES, { recursive: true });

const b64 = (x) => Buffer.from(x).toString('base64url');
function sign(payload) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [h, b, s] = (token ?? '').split('.');
  if (!s) return null;
  const sig = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
  if (sig !== s) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  return p.exp * 1000 > Date.now() ? p : null;
}
const refresh = new Map();
const signedUrls = new Map();

const userJson = (u) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
  email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at,
  user_metadata: u.raw_user_meta_data ?? {}, app_metadata: { provider: 'email' }, created_at: u.created_at, updated_at: u.created_at,
  identities: [], factors: [],
});
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 });
  const rt = crypto.randomBytes(24).toString('hex');
  refresh.set(rt, u.id);
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: rt, user: userJson(u) };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body));
}
const authErr = (res, status, msg, code) => send(res, status, { code: status, error_code: code, msg, message: msg, error: code, error_description: msg });
const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const json = (buf) => { try { return JSON.parse(buf.toString() || '{}'); } catch { return {}; } };
// Envoi en « multipart/form-data » (navigateur, Node) : on extrait la partie fichier.
function fileFromBody(req, body) {
  const ct = req.headers['content-type'] ?? 'application/octet-stream';
  const m = /multipart\/form-data;\s*boundary=(.+)$/i.exec(ct);
  if (!m) return { data: body, mime: ct };
  const boundary = Buffer.from('--' + m[1].replace(/^"|"$/g, ''));
  let start = body.indexOf(boundary);
  while (start !== -1) {
    const next = body.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    const part = body.subarray(start + boundary.length + 2, next - 2);
    const sep = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, sep).toString();
    if (/filename=|name="file"|name=""/i.test(head)) {
      const mime = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1] ?? 'application/octet-stream';
      return { data: part.subarray(sep + 4), mime };
    }
    start = next;
  }
  return { data: body, mime: ct };
}
const bearer = (req) => verify((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));

// Exécute une requête SQL avec l'identité de l'utilisateur (rôle « authenticated » + RLS).
async function asUser(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? {})]);
    await c.query(claims ? 'set local role authenticated' : 'set local role anon');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function auth(req, res, url) {
  const route = url.pathname.replace('/auth/v1', '');
  if (route === '/settings') return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: false });
  if (route === '/signup' && req.method === 'POST') {
    const b = json(await readBody(req));
    if (!b.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return authErr(res, 400, 'Unable to validate email address: invalid format', 'validation_failed');
    if (!b.password || b.password.length < 8) return authErr(res, 422, 'Password should be at least 8 characters.', 'weak_password');
    const exists = await pool.query('select 1 from auth.users where lower(email) = lower($1)', [b.email]);
    if (exists.rowCount) return authErr(res, 422, 'User already registered', 'user_already_exists');
    const token = crypto.randomBytes(20).toString('hex');
    const r = await pool.query(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data, confirmation_token)
       values ($1, extensions.crypt($2, extensions.gen_salt('bf')), $3, $4) returning *`,
      [b.email.toLowerCase(), b.password, b.data ?? {}, token]);
    const redirect = b.options?.emailRedirectTo ?? url.searchParams.get('redirect_to') ?? '';
    console.log(`[courriel de confirmation] ${b.email} → http://localhost:${PORT}/auth/v1/verify?type=signup&token=${token}&redirect_to=${encodeURIComponent(redirect)}`);
    return send(res, 200, userJson(r.rows[0]));
  }
  if (route === '/verify' && req.method === 'GET') {
    const r = await pool.query(`update auth.users set email_confirmed_at = now(), confirmation_token = null where confirmation_token = $1 returning *`, [url.searchParams.get('token')]);
    const to = url.searchParams.get('redirect_to') || 'http://localhost:5173/';
    res.writeHead(302, { location: r.rowCount ? to : `${to}#error=lien_invalide` });
    return res.end();
  }
  if (route === '/token' && req.method === 'POST') {
    const b = json(await readBody(req));
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const r = await pool.query(`select * from auth.users where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)`, [b.email ?? '', b.password ?? '']);
      if (!r.rowCount) return authErr(res, 400, 'Invalid login credentials', 'invalid_credentials');
      if (!r.rows[0].email_confirmed_at) return authErr(res, 400, 'Email not confirmed', 'email_not_confirmed');
      return send(res, 200, session(r.rows[0]));
    }
    if (grant === 'refresh_token') {
      const id = refresh.get(b.refresh_token);
      if (!id) return authErr(res, 400, 'Invalid Refresh Token', 'refresh_token_not_found');
      refresh.delete(b.refresh_token);
      const r = await pool.query('select * from auth.users where id = $1', [id]);
      return send(res, 200, session(r.rows[0]));
    }
    return authErr(res, 400, 'unsupported grant', 'unsupported_grant_type');
  }
  if (route === '/user') {
    const claims = bearer(req);
    if (!claims) return authErr(res, 401, 'invalid JWT', 'bad_jwt');
    if (req.method === 'PUT') {
      const b = json(await readBody(req));
      if (b.password) {
        if (b.password.length < 8) return authErr(res, 422, 'Password should be at least 8 characters.', 'weak_password');
        await pool.query(`update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1`, [claims.sub, b.password]);
      }
      if (b.data) await pool.query(`update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || $2 where id = $1`, [claims.sub, b.data]);
    }
    const r = await pool.query('select * from auth.users where id = $1', [claims.sub]);
    return send(res, 200, userJson(r.rows[0]));
  }
  if (route === '/logout') return send(res, 204);
  if (route === '/recover' && req.method === 'POST') {
    const b = json(await readBody(req));
    const token = crypto.randomBytes(20).toString('hex');
    await pool.query('update auth.users set recovery_token = $2 where lower(email) = lower($1)', [b.email ?? '', token]);
    console.log(`[courriel de réinitialisation] ${b.email} → jeton ${token}`);
    return send(res, 200, {});
  }
  if (route.startsWith('/factors')) return authErr(res, 501, 'Authentification à deux facteurs non disponible dans la pile de test locale', 'not_implemented');
  return authErr(res, 404, `Route d'authentification inconnue : ${route}`, 'not_found');
}

async function storage(req, res, url) {
  const route = url.pathname.replace('/storage/v1', '');
  const claims = bearer(req);
  const err = (status, message) => send(res, status, { statusCode: String(status), error: status === 403 ? 'Unauthorized' : 'Error', message });
  let m;
  if ((m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(route))) {
    const [, bucket, name] = m.map(decodeURIComponent);
    if (req.method === 'GET') {
      const entry = signedUrls.get(url.searchParams.get('token'));
      if (!entry || entry.exp < Date.now() || entry.name !== name) return err(400, 'Lien expiré ou invalide');
      const file = path.join(FILES, bucket, name);
      if (!fs.existsSync(file)) return err(404, 'Object not found');
      res.writeHead(200, { 'content-type': entry.mime ?? 'application/octet-stream', 'access-control-allow-origin': '*' });
      return fs.createReadStream(file).pipe(res);
    }
    const b = json(await readBody(req));
    const r = await asUser(claims, (c) => c.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, name]));
    if (!r.rowCount) return err(404, 'Object not found');
    const token = crypto.randomBytes(16).toString('hex');
    signedUrls.set(token, { name, exp: Date.now() + (b.expiresIn ?? 60) * 1000, mime: r.rows[0].metadata?.mimetype });
    return send(res, 200, { signedURL: `/object/sign/${bucket}/${encodeURI(name)}?token=${token}` });
  }
  if ((m = /^\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/.exec(route))) {
    const [, bucket, name] = m.map(decodeURIComponent);
    if (req.method === 'POST' || req.method === 'PUT') {
      const { data: body, mime } = fileFromBody(req, await readBody(req));
      try {
        await asUser(claims, (c) => c.query(
          `insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3)`,
          [bucket, name, { size: body.length, mimetype: mime }]));
      } catch (e) {
        return err(403, e.message);
      }
      const file = path.join(FILES, bucket, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      return send(res, 200, { Key: `${bucket}/${name}`, Id: name });
    }
    if (req.method === 'GET') {
      const r = await asUser(claims, (c) => c.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, name]));
      if (!r.rowCount) return err(404, 'Object not found');
      res.writeHead(200, { 'content-type': r.rows[0].metadata?.mimetype ?? 'application/octet-stream', 'access-control-allow-origin': '*' });
      return fs.createReadStream(path.join(FILES, bucket, name)).pipe(res);
    }
  }
  if ((m = /^\/object\/([^/]+)$/.exec(route)) && req.method === 'DELETE') {
    const bucket = decodeURIComponent(m[1]);
    const b = json(await readBody(req));
    const deleted = await asUser(claims, (c) => c.query('delete from storage.objects where bucket_id = $1 and name = any($2) returning name', [bucket, b.prefixes ?? []]));
    for (const row of deleted.rows) fs.rmSync(path.join(FILES, bucket, row.name), { force: true });
    return send(res, 200, deleted.rows.map((r) => ({ name: r.name })));
  }
  return err(404, `Route de stockage inconnue : ${route}`);
}

// Rendu IA : le cœur est celui de la fonction serveur ; seul l'accès aux données change.
// Fournisseur : celui des variables IA_IMAGE_* si une clé est fournie ; sinon, uniquement si
// PLANORA_TEST_AI=1, un fournisseur de TEST qui renvoie l'image d'entrée telle quelle
// (permet de vérifier tout le parcours sans service payant ; jamais disponible en production).
const testProvider = process.env.PLANORA_TEST_AI === '1'
  ? { name: 'test-local', model: 'copie-de-l-entree', generate: async (input) => input }
  : null;
async function renduIa(req, res) {
  const body = json(await readBody(req));
  const reply = await handleRenduIa(req.headers.authorization ?? null, body, {
    userFromToken: async (t) => { const c = verify(t); return c?.sub ? { id: c.sub } : null; },
    getRender: async (id) => (await pool.query('select id, org_id, plan_id, source, style, status, input_path, created_by from public.plan_renders where id = $1', [id])).rows[0] ?? null,
    markStarted: async (id) => (await pool.query(`update public.plan_renders set status = 'en_cours', started_at = now() where id = $1 and status = 'en_attente'`, [id])).rowCount === 1,
    finish: async (id, ok, p, provider, model, error) => { await pool.query('select public.finish_plan_render($1, $2, $3, $4, $5, $6)', [id, ok, p, provider, model, error]); },
    download: async (name) => new Uint8Array(fs.readFileSync(path.join(FILES, 'documents', name))),
    upload: async (name, bytes, mime) => {
      await pool.query('insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3)', ['documents', name, { size: bytes.length, mimetype: mime }]);
      const file = path.join(FILES, 'documents', name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
    },
    provider: providerFromEnv((k) => process.env[k]) ?? testProvider,
  });
  return send(res, reply.status, reply.body);
}

async function proxyRest(req, res, url) {
  const target = REST + url.pathname.replace('/rest/v1', '') + url.search;
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];
  // Comme Supabase : la clé publiable (non JWT) vaut accès anonyme.
  if (!bearer(req)) delete headers.authorization;
  const r = await fetch(target, { method: req.method, headers, body });
  const out = Buffer.from(await r.arrayBuffer());
  const h = {};
  r.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) h[k] = v; });
  res.writeHead(r.status, { ...h, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range, x-total-count' });
  res.end(out);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'authorization, apikey, content-type, prefer, range, x-client-info, accept-profile, content-profile, x-upsert, cache-control, x-supabase-api-version');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
  if (req.method === 'OPTIONS') return send(res, 204);
  try {
    if (url.pathname.startsWith('/rest/v1')) return await proxyRest(req, res, url);
    if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url);
    if (url.pathname.startsWith('/storage/v1')) return await storage(req, res, url);
    if (url.pathname === '/functions/v1/rendu-ia' && req.method === 'POST') return await renduIa(req, res);
    if (url.pathname === '/__dev/confirm') {
      await pool.query('update auth.users set email_confirmed_at = now() where lower(email) = lower($1)', [url.searchParams.get('email')]);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/__dev/sql' && req.method === 'POST') {
      const r = await pool.query((await readBody(req)).toString());
      return send(res, 200, r.rows ?? []);
    }
    send(res, 404, { message: 'introuvable' });
  } catch (e) {
    console.error(e);
    send(res, 500, { message: e.message });
  }
}).listen(PORT, () => console.log(`Pile locale PLANORA BTP : http://localhost:${PORT}`));
