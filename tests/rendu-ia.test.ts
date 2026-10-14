import { describe, expect, it, vi } from 'vitest';
import {
  buildPrompt, geminiProvider, handleRenduIa, openAiProvider, pngSize, providerFromEnv, publicError, type Deps, type RenderRow,
} from '../supabase/functions/rendu-ia/core';

/** En-tête PNG minimal (signature + IHDR) aux dimensions données. */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

const RENDER: RenderRow = {
  id: '11111111-1111-4111-8111-111111111111', org_id: 'org', plan_id: 'plan', source: 'rendu_fidele', style: 'luxe', status: 'en_attente',
  input_path: 'org/plans-techniques/plan/ia/x-entree.png', created_by: 'user-1',
};

function deps(over: Partial<Deps> = {}) {
  const calls = { finish: [] as unknown[][], upload: [] as unknown[][] };
  const d: Deps = {
    userFromToken: async (t) => (t === 'jeton' ? { id: 'user-1' } : null),
    getRender: async (id) => (id === RENDER.id ? { ...RENDER } : null),
    markStarted: async () => true,
    finish: async (...a) => { calls.finish.push(a); },
    download: async () => png(1536, 1024),
    upload: async (...a) => { calls.upload.push(a); },
    provider: { name: 'test', model: 'm', generate: async () => png(1536, 1024) },
    ...over,
  };
  return { d, calls };
}

describe('fonction serveur rendu-ia', () => {
  it('refuse sans session, demande d’un autre ou déjà traitée', async () => {
    expect((await handleRenduIa(null, { render_id: RENDER.id }, deps().d)).status).toBe(401);
    expect((await handleRenduIa('Bearer jeton', { render_id: 'pas-un-uuid' }, deps().d)).status).toBe(400);
    const other = deps({ getRender: async () => ({ ...RENDER, created_by: 'user-2' }) });
    expect((await handleRenduIa('Bearer jeton', { render_id: RENDER.id }, other.d)).status).toBe(404);
    const done = deps({ getRender: async () => ({ ...RENDER, status: 'termine' }) });
    expect((await handleRenduIa('Bearer jeton', { render_id: RENDER.id }, done.d)).status).toBe(409);
  });

  it('sans clé de fournisseur : échec explicite et unités restituées (pas de faux résultat)', async () => {
    const { d, calls } = deps({ provider: null });
    const r = await handleRenduIa('Bearer jeton', { render_id: RENDER.id }, d);
    expect(r.status).toBe(503);
    expect(String(r.body.error)).toMatch(/non activé/);
    expect(calls.finish[0]).toEqual([RENDER.id, false, null, null, null, expect.stringMatching(/restituées/)]);
    expect(calls.upload).toHaveLength(0);
  });

  it('succès : image déposée dans le dossier du plan, demande close', async () => {
    const gen = vi.fn(async (_i: Uint8Array, _p: string, _s: { width: number; height: number }) => png(1536, 1024));
    const { d, calls } = deps({ provider: { name: 'openai', model: 'gpt-image-1', generate: gen } });
    const r = await handleRenduIa('Bearer jeton', { render_id: RENDER.id }, d);
    expect(r).toEqual({ status: 200, body: { ok: true, storage_path: `org/plans-techniques/plan/ia/${RENDER.id}.png` } });
    expect(gen.mock.calls[0][2]).toEqual({ width: 1536, height: 1024 });
    expect(gen.mock.calls[0][1]).toContain('dark walnut');
    expect(calls.upload[0][2]).toBe('image/png');
    expect(calls.finish[0]).toEqual([RENDER.id, true, `org/plans-techniques/plan/ia/${RENDER.id}.png`, 'openai', 'gpt-image-1', null]);
  });

  it('échec du fournisseur : message sans secret, unités restituées', async () => {
    const { d, calls } = deps({ provider: { name: 'openai', model: 'x', generate: async () => { throw new Error('401 Incorrect API key sk-proj-ABCDEFGH12345678 https://api.example'); } } });
    const r = await handleRenduIa('Bearer jeton', { render_id: RENDER.id }, d);
    expect(r.status).toBe(502);
    expect(String(r.body.error)).not.toMatch(/sk-proj|https/);
    expect(calls.finish[0][1]).toBe(false);
    const bad = deps({ provider: { name: 'p', model: 'm', generate: async () => new TextEncoder().encode('pas une image') } });
    expect(String((await handleRenduIa('Bearer jeton', { render_id: RENDER.id }, bad.d)).body.error)).toMatch(/sans image exploitable/);
  });

  it('consigne : géométrie conservée et aucun texte écrit par l’IA', () => {
    for (const s of ['rendu_fidele', 'plan_importe'] as const) expect(buildPrompt(s, 'moderne')).toMatch(/Do not write any text/);
    expect(buildPrompt('rendu_fidele', 'moderne')).toMatch(/do not add, remove, move or resize anything/);
    expect(pngSize(png(1024, 1536))).toEqual({ width: 1024, height: 1536 });
    expect(publicError(new Error('AIzaSyABCDEFGHIJKLMNOP'))).not.toContain('AIza');
  });
});

describe('fournisseurs d’images', () => {
  it('OpenAI : édition d’image en multipart, réponse base64', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ data: [{ b64_json: btoa('\x89PNG') }] }), { status: 200 }));
    const p = openAiProvider('cle', 'gpt-image-1', { fetchImpl: fetchImpl as unknown as typeof fetch, inputFidelity: 'high' });
    const out = await p.generate(png(1536, 1024), 'consigne', { width: 1536, height: 1024 });
    expect(Array.from(out.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/images/edits');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer cle');
    const form = init!.body as FormData;
    expect(form.get('model')).toBe('gpt-image-1');
    expect(form.get('size')).toBe('1536x1024');
    expect(form.get('input_fidelity')).toBe('high');
    expect(form.get('image')).toBeInstanceOf(Blob);
  });

  it('OpenAI : erreur HTTP remontée avec son message', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ error: { message: 'Billing hard limit reached' } }), { status: 400 });
    await expect(openAiProvider('cle', 'gpt-image-1', { fetchImpl: fetchImpl as unknown as typeof fetch }).generate(png(1, 1), 'x', { width: 1024, height: 1024 })).rejects.toThrow(/400 Billing hard limit/);
  });

  it('Gemini : image en ligne, format demandé, réponse inlineData', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: btoa('\x89PNG') } }] } }] }), { status: 200 }));
    const p = geminiProvider('cle', 'gemini-2.5-flash-image', { fetchImpl: fetchImpl as unknown as typeof fetch });
    await p.generate(png(1024, 1536), 'consigne', { width: 1024, height: 1536 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('/v1beta/models/gemini-2.5-flash-image:generateContent');
    const body = JSON.parse(String(init!.body));
    expect(body.generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '2:3' } });
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('image/png');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('cle');
  });

  it('configuration par les secrets du serveur', () => {
    expect(providerFromEnv(() => undefined)).toBeNull();
    expect(providerFromEnv((k) => ({ IA_IMAGE_API_KEY: 'k' } as Record<string, string>)[k])).toMatchObject({ name: 'openai', model: 'gpt-image-1' });
    expect(providerFromEnv((k) => ({ IA_IMAGE_API_KEY: 'k', IA_IMAGE_PROVIDER: 'gemini' } as Record<string, string>)[k])).toMatchObject({ name: 'gemini', model: 'gemini-2.5-flash-image' });
  });
});
