// Banc d'essai : expose le « serveur » de la démonstration (src/demo/backend.ts, base PGlite)
// en HTTP sur le port 54320, pour lui faire passer la recette complète (scripts/e2e.mjs).
// Usage : node scripts/demo/serve-backend.mjs   (puis vite build normal + node scripts/e2e.mjs)
import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { buildSeed } from './build-seed.mjs';
import { demoFetch, demoOptions, useDemoDb, DEMO_URL } from '../../src/demo/backend.ts';
import { handleRenduIa } from '../../supabase/functions/rendu-ia/core.ts';

const root = new URL('../..', import.meta.url).pathname;
const seed = await buildSeed(root);
const db = await PGlite.create({ extensions: { pgcrypto }, loadDataDir: new Blob([seed]) });
useDemoDb(async () => db);
demoOptions.autoConfirm = process.env.AUTO_CONFIRM === '1';

const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD', 'access-control-expose-headers': 'content-range' };

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const body = await readBody(req);
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/__dev/confirm') {
      await db.query('update auth.users set email_confirmed_at = now() where lower(email) = lower($1)', [url.searchParams.get('email')]);
      res.writeHead(200, cors); return res.end('{}');
    }
    if (url.pathname === '/__dev/sql') {
      await db.exec(body.toString());
      res.writeHead(200, cors); return res.end('[]');
    }
    if (url.pathname === '/functions/v1/rendu-ia') {
      const files = async (name) => (await db.query(`select data from planora_demo.files where bucket = 'documents' and name = $1`, [name])).rows[0]?.data;
      const claim = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); } catch { return null; } };
      const reply = await handleRenduIa(req.headers.authorization ?? null, JSON.parse(body.toString() || '{}'), {
        userFromToken: async (t) => { const c = claim(t); return c?.sub ? { id: c.sub } : null; },
        getRender: async (id) => (await db.query('select id, org_id, plan_id, source, style, status, input_path, created_by from public.plan_renders where id = $1', [id])).rows[0] ?? null,
        markStarted: async (id) => (await db.query(`update public.plan_renders set status = 'en_cours', started_at = now() where id = $1 and status = 'en_attente'`, [id])).affectedRows === 1,
        finish: async (id, ok, p, provider, model, error) => { await db.query('select public.finish_plan_render($1, $2, $3, $4, $5, $6)', [id, ok, p, provider, model, error]); },
        download: async (name) => new Uint8Array(await files(name)),
        upload: async (name, bytes, mime) => {
          await db.query('insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3::jsonb)', ['documents', name, JSON.stringify({ size: bytes.length, mimetype: mime })]);
          await db.query('insert into planora_demo.files (bucket, name, mime, data) values ($1, $2, $3, $4)', ['documents', name, mime, bytes]);
        },
        provider: process.env.PLANORA_TEST_AI === '1' ? { name: 'test-local', model: 'copie-de-l-entree', generate: async (input) => input } : null,
      });
      res.writeHead(reply.status, { ...cors, 'content-type': 'application/json' }); return res.end(JSON.stringify(reply.body));
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string' && k !== 'host' && k !== 'content-length') headers.set(k, v);
    const r = await demoFetch(new Request(DEMO_URL + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
    const out = Buffer.from(await r.arrayBuffer());
    const h = { ...cors };
    r.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(r.status, h);
    res.end(out);
  } catch (e) {
    console.error(e);
    res.writeHead(500, cors); res.end(JSON.stringify({ message: e.message }));
  }
}).listen(54320, '127.0.0.1', () => console.log('Banc d’essai de la démonstration : http://localhost:54320'));
