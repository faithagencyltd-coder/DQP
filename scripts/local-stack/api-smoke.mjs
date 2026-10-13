// Vérifie la pile locale avec la bibliothèque officielle @supabase/supabase-js.
import { createClient } from '@supabase/supabase-js';
const URL = process.env.SUPABASE_URL ?? 'http://localhost:54320';
const sb = createClient(URL, 'cle-locale', { auth: { persistSession: false } });
const email = `essai${Date.now()}@planora.test`;
const ok = (c, m) => { if (!c) { console.error('ÉCHEC :', m); process.exit(1); } console.log('ok —', m); };

let r = await sb.auth.signUp({ email, password: 'Motdepasse1', options: { data: { first_name: 'Essai', last_name: 'Local', accepted_terms: 'true' } } });
ok(!r.error && r.data.user && !r.data.session, 'inscription sans session avant confirmation');
r = await sb.auth.signInWithPassword({ email, password: 'Motdepasse1' });
ok(r.error?.message === 'Email not confirmed', 'connexion refusée avant confirmation');
await fetch(`${URL}/__dev/confirm?email=${encodeURIComponent(email)}`);
r = await sb.auth.signInWithPassword({ email, password: 'Motdepasse1' });
ok(!r.error && r.data.session, 'connexion après confirmation');
const org = await sb.rpc('create_organization', { p_name: 'Entreprise essai', p_country: 'BJ' });
ok(!org.error && org.data, 'création d’entreprise');
const c = await sb.from('contacts').insert({ org_id: org.data, kind: 'client', name: 'Client essai' }).select().single();
ok(!c.error && c.data.name === 'Client essai', 'création de client');
const up = await sb.storage.from('documents').upload(`${org.data}/essai.txt`, new Blob(['bonjour'], { type: 'text/plain' }), { contentType: 'text/plain' });
ok(!up.error, 'dépôt de fichier');
const bad = await sb.storage.from('documents').upload(`00000000-0000-0000-0000-000000000000/x.txt`, new Blob(['x']), { contentType: 'text/plain' });
ok(!!bad.error, 'dépôt refusé hors de son entreprise');
const s = await sb.storage.from('documents').createSignedUrl(`${org.data}/essai.txt`, 60);
ok(!s.error && s.data.signedUrl, 'lien signé temporaire');
const txt = await (await fetch(s.data.signedUrl)).text();
ok(txt === 'bonjour', 'téléchargement par lien signé');
console.log('PILE LOCALE COMPATIBLE');
