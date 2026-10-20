// Mise à jour de la base locale (démonstration et logiciel installé) : quand une nouvelle version
// de PLANORA BTP apporte de nouvelles migrations, elles sont appliquées sur les données existantes
// au lieu de repartir d'une base vide. Chaque migration est appliquée une seule fois, en entier ou
// pas du tout (transaction), et notée dans planora_demo.migrations.

import type { PGlite } from '@electric-sql/pglite';

export interface Migration { name: string; sql: string }

/** Bases créées avant le suivi des migrations (démonstration de structure 3) : migrations 1 à 12. */
export const LEGACY_LAST = '20261015000012_dqe_bibliotheque.sql';

export class NewerDataError extends Error {}

/** Applique les migrations manquantes ; renvoie leurs noms. */
export async function upgradeSchema(db: PGlite, migrations: Migration[]): Promise<string[]> {
  const exists = (await db.query<{ t: string | null }>(`select to_regclass('planora_demo.migrations')::text as t`)).rows[0].t;
  if (!exists) {
    await db.exec(`create table planora_demo.migrations (name text primary key, applied_at timestamptz not null default now());
      revoke all on planora_demo.migrations from public;`);
    for (const m of migrations.filter((x) => x.name <= LEGACY_LAST)) await db.query('insert into planora_demo.migrations (name) values ($1)', [m.name]);
  }
  const applied = new Set((await db.query<{ name: string }>('select name from planora_demo.migrations')).rows.map((r) => r.name));
  const known = new Set(migrations.map((m) => m.name));
  const unknown = [...applied].filter((n) => !known.has(n));
  if (unknown.length) {
    throw new NewerDataError(`Ces données ont été enregistrées par une version plus récente de PLANORA BTP (${unknown.sort().at(-1)}). Installez cette version plus récente pour les ouvrir.`);
  }
  const todo = migrations.filter((m) => !applied.has(m.name)).sort((a, b) => a.name.localeCompare(b.name));
  for (const m of todo) {
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query('insert into planora_demo.migrations (name) values ($1)', [m.name]);
    });
  }
  return todo.map((m) => m.name);
}
