// Base PostgreSQL de la démonstration (PGlite), embarquée dans le fichier HTML : moteur,
// extension pgcrypto et base de départ (migrations + compte de démonstration) sont inclus,
// compressés. Les données sont conservées dans le navigateur (IndexedDB) quand c'est possible.

import { PGlite } from '@electric-sql/pglite';
// Fourni par le greffon Vite « demoAssets » (vite.config.ts) au moment de la construction.
import assets from 'virtual:planora-demo-assets';

// Le nom change à chaque nouvelle structure de base : une ancienne démonstration ouverte dans ce
// navigateur n'est pas réutilisée avec une structure qui ne lui correspond plus.
const DB_NAME = 'planora-btp-demo-v2';
const STORE = `idb://${DB_NAME}`;
const FLAG = 'planora-demo-base-v2';

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
async function gunzip(b64: string): Promise<ArrayBuffer> {
  const stream = new Blob([bytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export let demoPersistence: 'navigateur' | 'memoire' = 'navigateur';
let ready: Promise<PGlite> | null = null;

async function open(): Promise<PGlite> {
  const [wasm, data] = await Promise.all([gunzip(assets.wasm), gunzip(assets.data)]);
  const wasmModule = await WebAssembly.compile(wasm);
  const fsBundle = new Blob([data]);
  const pgcryptoUrl = new URL(URL.createObjectURL(new Blob([bytes(assets.pgcrypto)], { type: 'application/gzip' })));
  const extensions = { pgcrypto: { name: 'pgcrypto', setup: async () => ({ bundlePath: pgcryptoUrl }) } };
  const seed = () => new Blob([bytes(assets.seed)], { type: 'application/gzip' });

  // Démonstration précédente (ancienne structure) : libère la place qu'elle occupait.
  try { localStorage.removeItem('planora-demo-base-v1'); indexedDB.deleteDatabase('/pglite/planora-btp-demo'); } catch { /* stockage indisponible */ }
  let initialized = false;
  try { initialized = localStorage.getItem(FLAG) === '1'; } catch { /* stockage indisponible */ }
  try {
    const db = initialized
      ? await PGlite.create({ dataDir: STORE, wasmModule, fsBundle, extensions })
      : await PGlite.create({ dataDir: STORE, wasmModule, fsBundle, extensions, loadDataDir: seed() });
    await db.query('select 1 from planora_demo.files limit 1');
    try { localStorage.setItem(FLAG, '1'); } catch { /* stockage indisponible */ }
    return db;
  } catch (e) {
    // Base du navigateur illisible ou indisponible (navigation privée, fichier ouvert sans
    // stockage autorisé) : la démonstration fonctionne en mémoire, sans conservation.
    console.warn('Démonstration : base en mémoire', e);
    demoPersistence = 'memoire';
    return PGlite.create({ wasmModule, fsBundle, extensions, loadDataDir: seed() });
  }
}

export function getDemoDb(): Promise<PGlite> {
  if (!ready) ready = open();
  return ready;
}

/** Efface toutes les données de démonstration de ce navigateur et recharge la page. */
export async function resetDemo() {
  try { localStorage.removeItem(FLAG); } catch { /* stockage indisponible */ }
  try { (await getDemoDb()).close(); } catch { /* déjà fermée */ }
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(`/pglite/${DB_NAME}`);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
  location.reload();
}
