// Logiciel installé et démonstration : une nouvelle version met la base locale à jour (migrations
// manquantes) sans effacer les données ; une base plus récente que le logiciel est refusée.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { LEGACY_LAST, NewerDataError, upgradeSchema, type Migration } from '../src/demo/migrate';
import { buildSeed } from '../scripts/demo/build-seed.mjs';

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'supabase/migrations');
const migrations: Migration[] = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));

describe('mise à jour de la base locale', () => {
  test('base de l’ancienne version : migrations suivantes appliquées, données conservées', async () => {
    const db = await PGlite.create({ extensions: { pgcrypto } });
    await db.exec(fs.readFileSync(path.join(root, 'supabase/tests/shim_supabase.sql'), 'utf8'));
    for (const m of migrations.filter((x) => x.name <= LEGACY_LAST)) await db.exec(m.sql);
    await db.exec('create schema planora_demo; create table planora_demo.files (bucket text, name text, mime text, data bytea)');
    await db.query(`insert into auth.users (email) values ('existant@planora.bj')`);
    const before = (await db.query<{ src: string }>(`select prosrc as src from pg_proc where proname = 'lock_quote'`)).rows[0].src;
    expect(before).not.toContain('à vérifier');

    const applied = await upgradeSchema(db, migrations);
    expect(applied).toEqual(migrations.filter((m) => m.name > LEGACY_LAST).map((m) => m.name));
    expect(applied.length).toBeGreaterThan(0);
    const after = (await db.query<{ src: string }>(`select prosrc as src from pg_proc where proname = 'lock_quote'`)).rows[0].src;
    expect(after).toContain('à vérifier');
    expect((await db.query(`select 1 from auth.users where email = 'existant@planora.bj'`)).rows).toHaveLength(1);
    // Deuxième démarrage : rien à refaire.
    expect(await upgradeSchema(db, migrations)).toEqual([]);
    // Données d'une version plus récente : refusées, sans rien modifier.
    await db.query(`insert into planora_demo.migrations (name) values ('29990101000099_future.sql')`);
    await expect(upgradeSchema(db, migrations)).rejects.toBeInstanceOf(NewerDataError);
    await db.close();
  }, 60000);

  test('base de départ du logiciel : déjà à jour', async () => {
    const seed = await buildSeed(root);
    const db = await PGlite.create({ extensions: { pgcrypto }, loadDataDir: new Blob([seed as Uint8Array<ArrayBuffer>]) });
    expect(await upgradeSchema(db, migrations)).toEqual([]);
    expect((await db.query('select count(*)::int as n from planora_demo.migrations')).rows[0]).toEqual({ n: migrations.length });
    await db.close();
  }, 120000);
});
