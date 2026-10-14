// Cœur de la fonction serveur « rendu-ia » (sans dépendance : Deno, Node et tests).
// 1. vérifie l'utilisateur et la demande (créée et réservée par la base, en attente) ;
// 2. passe la demande « en cours », lit l'image d'entrée dans le stockage privé ;
// 3. appelle le fournisseur d'images configuré (clé secrète côté serveur uniquement) ;
// 4. dépose le résultat et clôt la demande (unités consommées) — ou la passe en échec
//    avec un message clair (unités restituées). Aucun résultat n'est inventé.

export interface RenderRow {
  id: string;
  org_id: string;
  plan_id: string;
  source: 'rendu_fidele' | 'plan_importe';
  style: 'moderne' | 'chaleureux' | 'luxe' | 'epure';
  status: string;
  input_path: string;
  created_by: string | null;
}

export interface ImageProvider {
  name: string;
  model: string;
  generate(input: Uint8Array, prompt: string, size: { width: number; height: number }): Promise<Uint8Array>;
}

export interface Deps {
  userFromToken(token: string): Promise<{ id: string } | null>;
  getRender(id: string): Promise<RenderRow | null>;
  /** Passe la demande « en cours » si elle est encore en attente ; false sinon. */
  markStarted(id: string): Promise<boolean>;
  finish(id: string, ok: boolean, storagePath: string | null, provider: string | null, model: string | null, error: string | null): Promise<void>;
  download(path: string): Promise<Uint8Array>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  provider: ImageProvider | null;
}

export interface Reply { status: number; body: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INPUT = 8 * 1024 * 1024;

export function imageType(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  return null;
}

/** Dimensions d'un PNG (en-tête IHDR). */
export function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (imageType(b) !== 'image/png' || b.length < 24) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

const STYLE_PROMPT: Record<RenderRow['style'], string> = {
  moderne: 'Style: contemporary, light oak wood floors, light grey tiles, neutral fabrics, bright natural daylight.',
  chaleureux: 'Style: warm and welcoming, honey-coloured wood, terracotta and beige tones, warm soft light.',
  luxe: 'Style: high-end luxury interior, dark walnut floors, white marble, elegant contrasts, refined designer furniture.',
  epure: 'Style: minimalist Scandinavian, white and very light grey surfaces, very bright and airy.',
};

export function buildPrompt(source: RenderRow['source'], style: RenderRow['style']): string {
  const keep = source === 'rendu_fidele'
    ? 'Transform this 2D architectural floor plan into a premium, photorealistic top-down rendered floor plan for a client presentation. ' +
      'Orthographic top view with exactly the same framing, scale and image size as the input. ' +
      'Keep every wall, partition, door, window, room and piece of furniture exactly where it is, with the same shapes and proportions: do not add, remove, move or resize anything. ' +
      'Walls stay solid and dark. Replace flat colours and simple textures with realistic materials (wood flooring, ceramic tiles, concrete, fabrics, plants), soft natural daylight and gentle ambient-occlusion shadows.'
    : 'This image is a technical 2D floor plan (possibly a scan or a photo). Turn it into a premium, photorealistic top-down rendered floor plan for a client presentation. ' +
      'Keep exactly the same layout: same walls, rooms, doors, windows, stairs and proportions, same framing. ' +
      'Furnish each room plausibly according to its apparent use. Remove dimension lines, hatching, text and annotations.';
  return `${keep} ${STYLE_PROMPT[style]} Do not write any text, letters, numbers, dimensions, labels, logos or watermarks. Keep the background around the building plain white.`;
}

/** Message d'erreur présentable (jamais de clé, d'URL signée ni de trace technique). */
export function publicError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const clean = raw.replace(/(sk|key|AIza)[-_A-Za-z0-9]{8,}/g, '•••').replace(/https?:\/\/\S+/g, '').slice(0, 300);
  return `Le service d’images a échoué : ${clean || 'erreur inconnue'}. Les unités ont été restituées.`;
}

export async function handleRenduIa(authorization: string | null, body: unknown, deps: Deps): Promise<Reply> {
  const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const user = token ? await deps.userFromToken(token) : null;
  if (!user) return { status: 401, body: { error: 'Session invalide : reconnectez-vous.' } };
  const id = (body as { render_id?: unknown } | null)?.render_id;
  if (typeof id !== 'string' || !UUID.test(id)) return { status: 400, body: { error: 'Demande de rendu invalide.' } };
  const r = await deps.getRender(id);
  if (!r || r.created_by !== user.id) return { status: 404, body: { error: 'Demande de rendu introuvable.' } };
  if (r.status !== 'en_attente') return { status: 409, body: { error: 'Cette demande a déjà été traitée.' } };

  if (!deps.provider) {
    const msg = 'Rendu IA non activé sur cette installation : la clé du fournisseur d’images n’est pas configurée. Les unités ont été restituées.';
    await deps.finish(id, false, null, null, null, msg);
    return { status: 503, body: { error: msg } };
  }
  if (!(await deps.markStarted(id))) return { status: 409, body: { error: 'Cette demande a déjà été prise en charge.' } };

  const { provider } = deps;
  try {
    const input = await deps.download(r.input_path);
    if (input.length > MAX_INPUT) throw new Error('image d’entrée trop volumineuse');
    const size = pngSize(input);
    if (!size) throw new Error('image d’entrée invalide (PNG attendu)');
    const out = await provider.generate(input, buildPrompt(r.source, r.style), size);
    const type = imageType(out);
    if (!type) throw new Error('réponse sans image exploitable');
    const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';
    const path = `${r.org_id}/plans-techniques/${r.plan_id}/ia/${r.id}.${ext}`;
    await deps.upload(path, out, type);
    await deps.finish(id, true, path, provider.name, provider.model, null);
    return { status: 200, body: { ok: true, storage_path: path } };
  } catch (e) {
    const msg = publicError(e);
    await deps.finish(id, false, null, provider.name, provider.model, msg).catch(() => undefined);
    return { status: 502, body: { error: msg } };
  }
}

// ------------------------------------------------------------------ fournisseurs
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await run(ctl.signal);
  } catch (e) {
    if (ctl.signal.aborted) throw new Error('délai dépassé');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function failText(res: Response): Promise<string> {
  const t = await res.text().catch(() => '');
  try {
    const j = JSON.parse(t) as { error?: { message?: string } | string };
    const m = typeof j.error === 'string' ? j.error : j.error?.message;
    if (m) return `${res.status} ${m}`;
  } catch { /* texte brut */ }
  return `${res.status} ${t.slice(0, 200)}`;
}

/** OpenAI Images (édition d'image) : modèle par défaut gpt-image-1. */
export function openAiProvider(apiKey: string, model = 'gpt-image-1', opts: { baseUrl?: string; inputFidelity?: string; fetchImpl?: typeof fetch } = {}): ImageProvider {
  const f = opts.fetchImpl ?? fetch;
  return {
    name: 'openai',
    model,
    generate: (input, prompt, size) => withTimeout(140_000, async (signal) => {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('image', new Blob([input as Uint8Array<ArrayBuffer>], { type: 'image/png' }), 'plan.png');
      form.append('size', `${size.width}x${size.height}`);
      form.append('n', '1');
      if (model.startsWith('gpt-image')) form.append('quality', 'high');
      if (opts.inputFidelity) form.append('input_fidelity', opts.inputFidelity);
      const res = await f(`${opts.baseUrl ?? 'https://api.openai.com'}/v1/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal });
      if (!res.ok) throw new Error(await failText(res));
      const j = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = j.data?.[0]?.b64_json;
      if (!b64) throw new Error('réponse sans image');
      return b64ToBytes(b64);
    }),
  };
}

/** Google Gemini (génération / retouche d'image) : modèle par défaut gemini-2.5-flash-image. */
export function geminiProvider(apiKey: string, model = 'gemini-2.5-flash-image', opts: { baseUrl?: string; fetchImpl?: typeof fetch } = {}): ImageProvider {
  const f = opts.fetchImpl ?? fetch;
  return {
    name: 'gemini',
    model,
    generate: (input, prompt, size) => withTimeout(140_000, async (signal) => {
      const ratio = size.width === size.height ? '1:1' : size.width > size.height ? '3:2' : '2:3';
      const res = await f(`${opts.baseUrl ?? 'https://generativelanguage.googleapis.com'}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: bytesToB64(input) } }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ratio } },
        }),
        signal,
      });
      if (!res.ok) throw new Error(await failText(res));
      const j = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string }; inline_data?: { data?: string } }[] } }[] };
      const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data || p.inline_data?.data);
      const b64 = part?.inlineData?.data ?? part?.inline_data?.data;
      if (!b64) throw new Error('réponse sans image (contenu refusé ou indisponible)');
      return b64ToBytes(b64);
    }),
  };
}

/** Fournisseur choisi par les secrets du serveur ; null si aucune clé n'est configurée. */
export function providerFromEnv(get: (k: string) => string | undefined): ImageProvider | null {
  const key = get('IA_IMAGE_API_KEY');
  if (!key) return null;
  const kind = (get('IA_IMAGE_PROVIDER') ?? 'openai').toLowerCase();
  const model = get('IA_IMAGE_MODEL') || undefined;
  if (kind === 'gemini') return geminiProvider(key, model);
  // « input_fidelity » (fidélité à l'image d'entrée) n'existe que pour certains modèles.
  const fidelity = get('IA_IMAGE_INPUT_FIDELITY') ?? ((model ?? 'gpt-image-1').startsWith('gpt-image-1') ? 'high' : '');
  return openAiProvider(key, model, { inputFidelity: fidelity || undefined });
}
