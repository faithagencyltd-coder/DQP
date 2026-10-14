// Fonction serveur Supabase « rendu-ia » (Deno). Secrets à définir dans le projet :
//   IA_IMAGE_PROVIDER = openai | gemini     (défaut : openai)
//   IA_IMAGE_API_KEY  = clé du fournisseur  (sans clé : rendu IA désactivé, message clair)
//   IA_IMAGE_MODEL    = modèle (facultatif)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { handleRenduIa, providerFromEnv, type RenderRow } from './core.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), { status: 405, headers: { ...CORS, 'content-type': 'application/json' } });
  const body = await req.json().catch(() => null);
  const reply = await handleRenduIa(req.headers.get('authorization'), body, {
    userFromToken: async (token) => {
      const { data } = await admin.auth.getUser(token);
      return data.user ? { id: data.user.id } : null;
    },
    getRender: async (id) => {
      const { data } = await admin.from('plan_renders').select('id, org_id, plan_id, source, style, status, input_path, created_by').eq('id', id).maybeSingle();
      return (data as RenderRow | null) ?? null;
    },
    markStarted: async (id) => {
      const { data } = await admin.from('plan_renders').update({ status: 'en_cours', started_at: new Date().toISOString() }).eq('id', id).eq('status', 'en_attente').select('id');
      return (data?.length ?? 0) === 1;
    },
    finish: async (id, ok, path, provider, model, error) => {
      const { error: e } = await admin.rpc('finish_plan_render', { p_render: id, p_ok: ok, p_storage_path: path, p_provider: provider, p_model: model, p_error: error });
      if (e) throw new Error(e.message);
    },
    download: async (path) => {
      const { data, error } = await admin.storage.from('documents').download(path);
      if (error || !data) throw new Error('image d’entrée introuvable');
      return new Uint8Array(await data.arrayBuffer());
    },
    upload: async (path, bytes, contentType) => {
      const { error } = await admin.storage.from('documents').upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(`dépôt du résultat impossible (${error.message})`);
    },
    provider: providerFromEnv((k) => Deno.env.get(k)),
  });
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { ...CORS, 'content-type': 'application/json' } });
});
