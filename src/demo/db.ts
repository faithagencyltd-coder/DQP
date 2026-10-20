// Base PostgreSQL autonome (PGlite) de la démonstration et du logiciel installé : moteur,
// extension pgcrypto, base de départ et migrations sont inclus, compressés. Les données sont
// conservées sur l'appareil (IndexedDB) quand c'est possible ; une nouvelle version met la base
// à jour (migrations) sans effacer les données ; une sauvegarde peut être exportée et restaurée.

import { PGlite } from '@electric-sql/pglite';
// Fourni par le greffon Vite « demoAssets » (vite.config.ts) au moment de la construction.
import assets from 'virtual:planora-demo-assets';
import { NewerDataError, upgradeSchema } from './migrate';

// La base de structure 3 reste la base de référence : les versions suivantes la mettent à jour.
const VERSION = 3;
const DB_NAME = `planora-btp-demo-v${VERSION}`;
const STORE = `idb://${DB_NAME}`;
const FLAG = `planora-demo-base-v${VERSION}`;

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
async function gunzip(b64: string): Promise<ArrayBuffer> {
  const stream = new Blob([bytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export let demoPersistence: 'navigateur' | 'memoire' = 'navigateur';
/** Migrations appliquées au dernier démarrage (mise à jour du logiciel). */
export let lastUpgrade: string[] = [];
let ready: Promise<PGlite> | null = null;

type Engine = { wasmModule: WebAssembly.Module; fsBundle: Blob; extensions: { pgcrypto: { name: string; setup: () => Promise<{ bundlePath: URL }> } } };
let engine: Promise<Engine> | null = null;
function getEngine(): Promise<Engine> {
  engine ??= (async () => {
    const [wasm, data] = await Promise.all([gunzip(assets.wasm), gunzip(assets.data)]);
    const wasmModule = await WebAssembly.compile(wasm);
    const pgcryptoUrl = new URL(URL.createObjectURL(new Blob([bytes(assets.pgcrypto)], { type: 'application/gzip' })));
    return { wasmModule, fsBundle: new Blob([data]), extensions: { pgcrypto: { name: 'pgcrypto', setup: async () => ({ bundlePath: pgcryptoUrl }) } } };
  })();
  return engine;
}
const seed = () => new Blob([bytes(assets.seed)], { type: 'application/gzip' });

// ---------------------------------------------------------------- sauvegarde en attente de restauration
const PENDING_DB = 'planora-restauration';
function pendingStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(PENDING_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('f');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('f', mode);
      const r = fn(tx.objectStore('f'));
      tx.oncomplete = () => { open.result.close(); resolve(r.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}
const takePending = async () => {
  try { return await pendingStore<Blob | undefined>('readonly', (s) => s.get('pending')); } catch { return undefined; }
};
const clearPending = () => pendingStore('readwrite', (s) => s.delete('pending')).catch(() => undefined);

function deleteIdb(name: string) {
  return new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

async function open(): Promise<PGlite> {
  const { wasmModule, fsBundle, extensions } = await getEngine();
  // Démonstrations de structure plus ancienne (1 et 2) : libère la place qu'elles occupaient.
  try {
    for (let v = 1; v < VERSION; v++) {
      localStorage.removeItem(`planora-demo-base-v${v}`);
      void deleteIdb(v === 1 ? '/pglite/planora-btp-demo' : `/pglite/planora-btp-demo-v${v}`);
    }
  } catch { /* stockage indisponible */ }

  const pending = await takePending();
  let initialized = false;
  try { initialized = localStorage.getItem(FLAG) === '1'; } catch { /* stockage indisponible */ }
  let db: PGlite;
  try {
    db = initialized && !pending
      ? await PGlite.create({ dataDir: STORE, wasmModule, fsBundle, extensions })
      : await PGlite.create({ dataDir: STORE, wasmModule, fsBundle, extensions, loadDataDir: pending ?? seed() });
    await db.query('select 1 from planora_demo.files limit 1');
  } catch (e) {
    if (pending) await clearPending();
    // Base de l'appareil illisible ou indisponible (navigation privée, fichier ouvert sans
    // stockage autorisé) : fonctionnement en mémoire, sans conservation.
    console.warn('Base locale indisponible : fonctionnement en mémoire', e);
    demoPersistence = 'memoire';
    db = await PGlite.create({ wasmModule, fsBundle, extensions, loadDataDir: seed() });
  }
  try {
    lastUpgrade = await upgradeSchema(db, assets.migrations);
  } catch (e) {
    // Jamais de repli silencieux sur une base vide : les données restent en place.
    await db.close().catch(() => undefined);
    throw e instanceof NewerDataError ? e : new Error(`Mise à jour de la base impossible (${(e as Error).message}). Vos données sont conservées ; contactez l’assistance PLANORA BTP.`);
  }
  if (pending) await clearPending();
  try { localStorage.setItem(FLAG, '1'); } catch { /* stockage indisponible */ }
  return db;
}

export function getDemoDb(): Promise<PGlite> {
  if (!ready) ready = open();
  return ready;
}

/** Efface toutes les données de cet appareil et recharge la page (base de départ). */
export async function resetDemo() {
  try { localStorage.removeItem(FLAG); } catch { /* stockage indisponible */ }
  try { (await getDemoDb()).close(); } catch { /* déjà fermée */ }
  await deleteIdb(`/pglite/${DB_NAME}`);
  location.reload();
}

/** Sauvegarde complète des données (base et fichiers déposés), à conserver hors de l'appareil. */
export async function exportBackup(): Promise<Blob> {
  const db = await getDemoDb();
  return db.dumpDataDir('gzip');
}

/**
 * Restaure une sauvegarde : elle est d'abord ouverte et vérifiée à part (lisible, pas plus
 * récente que ce logiciel) ; seulement ensuite les données actuelles sont remplacées.
 */
export async function restoreBackup(file: Blob): Promise<void> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b) throw new Error('Ce fichier n’est pas une sauvegarde PLANORA BTP.');
  const { wasmModule, fsBundle, extensions } = await getEngine();
  let check: PGlite | null = null;
  try {
    const c = await PGlite.create({ wasmModule, fsBundle, extensions, loadDataDir: file });
    check = c;
    await c.query('select 1 from planora_demo.files limit 1');
    await upgradeSchema(c, assets.migrations);
  } catch (e) {
    if (e instanceof NewerDataError) throw e;
    throw new Error('Sauvegarde illisible : ce fichier n’est pas une sauvegarde PLANORA BTP valide, ou il est endommagé.');
  } finally {
    await check?.close().catch(() => undefined);
  }
  await pendingStore('readwrite', (s) => s.put(file, 'pending'));
  try { localStorage.removeItem(FLAG); } catch { /* stockage indisponible */ }
  try { (await getDemoDb()).close(); } catch { /* déjà fermée */ }
  await deleteIdb(`/pglite/${DB_NAME}`);
  location.reload();
}
