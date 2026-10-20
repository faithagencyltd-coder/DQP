// Base de départ de la version de démonstration : migrations réelles + environnement Supabase
// simulé + un compte et une entreprise de démonstration. Toutes les données d'exemple sont
// marquées « démonstration » : aucune n'est présentée comme une donnée réelle (§6, §36).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEMO_ACCOUNTS = [
  { email: 'demo@planora.bj', password: 'Demo2026', first: 'Awa', last: 'Démo', role: 'proprietaire' },
  { email: 'conducteur@planora.bj', password: 'Demo2026', first: 'Koffi', last: 'Démo', role: 'conducteur' },
];

export async function buildSeed(root) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(fs.readFileSync(path.join(root, 'supabase/tests/shim_supabase.sql'), 'utf8'));
  const dir = path.join(root, 'supabase/migrations');
  const migrations = fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();
  for (const f of migrations) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));

  // Contenu des fichiers déposés (le « stockage » de la démonstration), réservé au serveur interne.
  await db.exec(`
    create schema planora_demo;
    create table planora_demo.files (bucket text not null, name text not null, mime text not null, data bytea not null, primary key (bucket, name));
    revoke all on schema planora_demo from public, anon, authenticated;
    -- Migrations appliquées : une version plus récente du logiciel n'applique que les suivantes.
    create table planora_demo.migrations (name text primary key, applied_at timestamptz not null default now());
    revoke all on planora_demo.migrations from public;
  `);
  for (const f of migrations) await db.query('insert into planora_demo.migrations (name) values ($1)', [f]);

  const ids = {};
  for (const a of DEMO_ACCOUNTS) {
    const r = await db.query(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
       values ($1, extensions.crypt($2, extensions.gen_salt('bf', 6)), $3::jsonb, now()) returning id`,
      [a.email, a.password, JSON.stringify({ first_name: a.first, last_name: a.last, phone: '+229 00 00 00 00', accepted_terms: 'true' })]);
    ids[a.email] = r.rows[0].id;
  }
  await db.query(`insert into public.platform_admins (email) values ($1)`, [DEMO_ACCOUNTS[0].email]);

  const as = async (email, fn) => db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ids[email], email, role: 'authenticated', aal: 'aal1' })]);
    return fn(tx);
  });
  const owner = DEMO_ACCOUNTS[0].email;

  const org = await as(owner, async (tx) => (await tx.query(`select public.create_organization('Entreprise de démonstration', 'BJ', 'Cotonou', '+229 00 00 00 00', 'ENTREPRISE DE DÉMONSTRATION') as id`)).rows[0].id);
  await as(owner, (tx) => tx.query(`select public.admin_set_subscription($1, 'pro', 'actif', 'an', now() + interval '1 year')`, [org]));
  // Second compte : conducteur de travaux dans la même entreprise (pour tester les droits).
  await db.query(`insert into public.members (org_id, user_id, role) values ($1, $2, 'conducteur')`, [org, ids[DEMO_ACCOUNTS[1].email]]);

  await as(owner, async (tx) => {
    const note = 'Fiche d’exemple (démonstration) : coordonnées fictives.';
    const c1 = (await tx.query(`insert into public.contacts (org_id, kind, client_type, name, phone, email, city, country, notes) values ($1, 'client', 'particulier', 'Client exemple — M. Agossou', '+229 00 00 00 01', 'client.exemple@demo.bj', 'Abomey-Calavi', 'BJ', $2) returning id`, [org, note])).rows[0].id;
    await tx.query(`insert into public.contacts (org_id, kind, client_type, name, phone, city, country, notes) values ($1, 'client', 'entreprise', 'Client exemple — Société Lagune', '+229 00 00 00 02', 'Cotonou', 'BJ', $2)`, [org, note]);
    const s1 = (await tx.query(`insert into public.contacts (org_id, kind, name, phone, city, country, categories, lead_time_days, notes) values ($1, 'fournisseur', 'Fournisseur exemple — Quincaillerie', '+229 00 00 00 03', 'Cotonou', 'BJ', '{matériaux}', 3, $2) returning id`, [org, note])).rows[0].id;
    const src = 'Prix fictif (démonstration) — à remplacer par vos prix réels';
    const items = [
      ['CIM-50', 'Ciment CPJ 35 (sac 50 kg)', 'sac', 4800, 5200, 'materiaux'],
      ['FER-10', 'Fer à béton HA 10 (barre de 12 m)', 'barre', 3900, 4300, 'materiaux'],
      ['SAB-01', 'Sable lavé', 'm³', 9000, 10000, 'materiaux'],
      ['GRA-01', 'Gravier 5/15', 'm³', 18000, 20000, 'materiaux'],
      ['AGG-01', 'Agglos creux de 15', 'u', 350, 400, 'materiaux'],
    ];
    for (const [code, des, unit, buy, sell, cat] of items) {
      await tx.query(`insert into public.price_items (org_id, kind, code, designation, unit, purchase_price, sale_price, category, supplier_id, country, price_date, source) values ($1, 'article', $2, $3, $4, $5, $6, $7, $8, 'BJ', current_date, $9)`, [org, code, des, unit, buy, sell, cat, s1, src]);
    }
    const p = (await tx.query(`insert into public.projects (org_id, name, client_id, project_type, location, city, country, description, budget_estimate, start_date, end_date) values ($1, 'Villa R+1 (exemple de démonstration)', $2, 'construction_neuve', 'Fidjrossè, lot 245 (fictif)', 'Cotonou', 'BJ', 'Projet d’exemple pour découvrir PLANORA BTP. Toutes les données sont fictives.', 45000000, current_date, current_date + 180) returning id`, [org, c1])).rows[0].id;
    const lots = ['Installation de chantier', 'Terrassement', 'Fondations', 'Gros œuvre', 'Maçonnerie', 'Charpente et couverture', 'Électricité', 'Plomberie', 'Carrelage', 'Peinture', 'Nettoyage et réception'];
    for (const [i, name] of lots.entries()) await tx.query(`insert into public.project_lots (org_id, project_id, name, sort) values ($1, $2, $3, $4)`, [org, p, name, i]);
    await tx.query(`insert into public.warehouses (org_id, name, location) values ($1, 'Magasin central (exemple)', 'Cotonou')`, [org]);
  });

  const out = await db.dumpDataDir('gzip');
  await db.close();
  return new Uint8Array(await out.arrayBuffer());
}
