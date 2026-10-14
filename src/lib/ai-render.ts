// Rendu IA d'un plan, côté navigateur : réserve le quota (base de données), dépose l'image
// d'entrée dans le stockage privé, puis demande le traitement à la fonction serveur
// « rendu-ia », seule détentrice de la clé du fournisseur. L'état réel (en cours, terminé,
// échec) est toujours relu dans la base.

import { supabase } from './supabase';
import { errorMessage } from './errors';
import type { PlanRender } from './types';
import type { Frame } from '../engine/plan/render';

export const AI_RENDER_UNITS = 10;

export const AI_STYLES: Record<PlanRender['style'], { label: string; hint: string }> = {
  moderne: { label: 'Moderne', hint: 'Lumière naturelle, chêne clair, tons neutres' },
  chaleureux: { label: 'Chaleureux', hint: 'Bois miel, terre cuite, tissus chauds' },
  luxe: { label: 'Prestige', hint: 'Noyer, marbre, contrastes élégants' },
  epure: { label: 'Épuré', hint: 'Blanc, gris clair, très lumineux' },
};

export const RENDER_STATUS: Record<PlanRender['status'], { label: string; tone: 'grey' | 'navy' | 'ok' | 'bad' }> = {
  en_attente: { label: 'En attente', tone: 'grey' },
  en_cours: { label: 'En cours', tone: 'navy' },
  termine: { label: 'Terminé', tone: 'ok' },
  echec: { label: 'Échec', tone: 'bad' },
};

/** Lance un rendu IA ; renvoie l'identifiant du rendu (dont l'état se lit ensuite en base). */
export async function startAiRender(args: { planId: string; source: PlanRender['source']; style: PlanRender['style']; frame: Frame | null; input: Blob }): Promise<string> {
  const { data, error } = await supabase.rpc('request_plan_render', { p_plan: args.planId, p_source: args.source, p_style: args.style, p_frame: args.frame });
  if (error) throw new Error(errorMessage(error));
  const row = (Array.isArray(data) ? data[0] : data) as { render_id: string; input_path: string } | undefined;
  if (!row) throw new Error('Demande de rendu refusée.');
  const up = await supabase.storage.from('documents').upload(row.input_path, args.input, { contentType: 'image/png', upsert: false });
  if (up.error) {
    const reason = `Envoi de l’image impossible : ${errorMessage(up.error)}`;
    await supabase.rpc('cancel_plan_render', { p_render: row.render_id, p_reason: reason });
    throw new Error(reason);
  }
  // Le traitement dure de quelques secondes à deux minutes ; l'état est suivi en base.
  const res = await supabase.functions.invoke('rendu-ia', { body: { render_id: row.render_id } }).catch((e: unknown) => ({ error: e, data: null }));
  if (res.error) {
    let reason = 'Service de rendu IA injoignable.';
    const ctx = (res.error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null) as { error?: string } | null;
      if (body?.error) reason = body.error;
    }
    // Si le service n'a pas pris la demande, elle est annulée et les unités restituées.
    await supabase.rpc('cancel_plan_render', { p_render: row.render_id, p_reason: reason });
    throw new Error(reason);
  }
  return row.render_id;
}

export async function signedUrl(path: string, seconds = 600): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, seconds);
  if (error || !data) throw new Error(errorMessage(error ?? 'Lien indisponible'));
  return data.signedUrl;
}
