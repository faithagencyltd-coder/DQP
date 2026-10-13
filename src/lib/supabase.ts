import { createClient } from '@supabase/supabase-js';
import { config } from './config';

// PKCE : les liens de confirmation et de réinitialisation reviennent avec « ?code= »,
// compatible avec le routage par « # » utilisé pour l'hébergement statique.
export const supabase = createClient(config.supabaseUrl || 'http://localhost', config.supabaseKey || 'cle-absente', {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
