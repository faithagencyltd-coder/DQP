// Paquet de test local PLANORA BTP (Windows) : prépare la base au premier lancement et applique
// les nouvelles migrations aux lancements suivants (sans jamais effacer les données).
// Appelé par DEMARRER-PLANORA.bat : node installer.mjs <dossier_sql> <dossier_donnees> [e-mail admin]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const [sqlDir, dataDir, adminEmail] = process.argv.slice(2);
const conn = (database) => new pg.Client({ host: '127.0.0.1', port: 54329, user: 'postgres', database });

async function main() {
  const admin = conn('postgres');
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = 'planora'");
  if (!exists.rowCount) {
    console.log('Création de la base « planora »…');
    await admin.query('create database planora');
  }
  await admin.end();

  const db = conn('planora');
  await db.connect();
  await db.query('create schema if not exists planora_local');
  await db.query('create table if not exists planora_local.applied (name text primary key, at timestamptz not null default now())');
  const done = new Set((await db.query('select name from planora_local.applied')).rows.map((r) => r.name));
  const files = fs.readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    console.log(`Application de ${f}…`);
    const sql = fs.readFileSync(path.join(sqlDir, f), 'utf8');
    await db.query('begin');
    try {
      await db.query(sql);
      await db.query('insert into planora_local.applied (name) values ($1)', [f]);
      await db.query('commit');
    } catch (e) {
      await db.query('rollback');
      throw new Error(`${f} : ${e.message}`);
    }
  }
  if (adminEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    await db.query('insert into public.platform_admins (email) values ($1) on conflict do nothing', [adminEmail.trim().toLowerCase()]);
    console.log(`Administrateur de la plateforme : ${adminEmail}`);
  }
  await db.end();

  // Secret de signature propre à cette installation, et configuration de PostgREST.
  const secretFile = path.join(dataDir, 'secret.txt');
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));
  const secret = fs.readFileSync(secretFile, 'utf8').trim();
  fs.writeFileSync(path.join(dataDir, 'postgrest.conf'), [
    'db-uri = "postgres://postgres@127.0.0.1:54329/planora"',
    'db-schemas = "public"',
    'db-anon-role = "anon"',
    `jwt-secret = "${secret}"`,
    'server-port = 54331',
    'server-host = "127.0.0.1"',
    '',
  ].join('\n'));
  console.log('Base prête.');
}

main().catch((e) => { console.error('ÉCHEC de la préparation de la base : ' + e.message); process.exit(1); });
