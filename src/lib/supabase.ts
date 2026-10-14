import { createClient } from '@supabase/supabase-js';
import { config, isDemo } from './config';

// Version de démonstration autonome : les appels sont traités dans le navigateur par une vraie
// base PostgreSQL embarquée (src/demo), avec les mêmes règles d'accès que la production.
const DEMO_URL = 'https://demo.planora.local';

// PKCE : les liens de confirmation et de réinitialisation reviennent avec « ?code= »,
// compatible avec le routage par « # » utilisé pour l'hébergement statique.
export const supabase = isDemo
  ? createClient(DEMO_URL, 'demo', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'planora-demo-session' },
    global: { fetch: (input, init) => import('../demo/backend').then((m) => m.demoFetch(input, init)) },
  })
  : createClient(config.supabaseUrl || 'http://localhost', config.supabaseKey || 'cle-absente', {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

/** Adresse temporaire d'un fichier privé (lien signé ; en démonstration, contenu local). */
export async function fileUrl(path: string, seconds: number, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, seconds, download ? { download } : undefined);
  if (error || !data) throw error ?? new Error('Lien indisponible');
  if (isDemo) {
    const { demoFileBlob } = await import('../demo/backend');
    return URL.createObjectURL(await demoFileBlob(path));
  }
  return data.signedUrl;
}
