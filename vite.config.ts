import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Version de démonstration : moteur PGlite, extension pgcrypto et base de départ (migrations +
// compte de démonstration) compressés et embarqués dans le fichier HTML unique.
function demoAssets(): Plugin {
  const id = 'virtual:planora-demo-assets';
  return {
    name: 'planora-demo-assets',
    enforce: 'pre',
    // Le moteur est fourni compressé (voir load) : on retire les références d'origine, que le
    // constructeur incorporerait sinon plusieurs fois en clair.
    transform(code, file) {
      if (!file.includes('@electric-sql/pglite/dist')) return null;
      const out = code.replace(/new URL\("\.?\/?pglite\.(wasm|data)",\s*import\.meta\.url\)/g, 'new URL("data:,")');
      return out === code ? null : { code: out, map: null };
    },
    resolveId: (s) => (s === id ? '\0' + id : null),
    async load(i) {
      if (i !== '\0' + id) return null;
      const dist = path.resolve(__dirname, 'node_modules/@electric-sql/pglite/dist');
      const gz = (f: string) => zlib.gzipSync(fs.readFileSync(path.join(dist, f)), { level: 9 }).toString('base64');
      const { buildSeed } = await import('./scripts/demo/build-seed.mjs');
      const seed = Buffer.from(await buildSeed(__dirname)).toString('base64');
      const mdir = path.resolve(__dirname, 'supabase/migrations');
      const migrations = fs.readdirSync(mdir).filter((f) => f.endsWith('.sql')).sort().map((name) => ({ name, sql: fs.readFileSync(path.join(mdir, name), 'utf8') }));
      const assets = { wasm: gz('pglite.wasm'), data: gz('pglite.data'), pgcrypto: fs.readFileSync(path.join(dist, 'pgcrypto.tar.gz')).toString('base64'), seed, migrations };
      return `export default ${JSON.stringify(assets)};`;
    },
  };
}

// Construction normale : la démonstration (base embarquée) est remplacée par un module vide,
// pour ne rien ajouter au site en ligne.
function demoStub(): Plugin {
  const stub = '\0planora-demo-stub';
  return {
    name: 'planora-demo-stub',
    enforce: 'pre',
    resolveId(source, importer) {
      const fromDemo = importer?.includes(`${path.sep}src${path.sep}demo${path.sep}`);
      if (/\/demo\/(db|backend)$/.test(source) || (fromDemo && /^\.\/(db|backend)$/.test(source))) return stub;
      return null;
    },
    load: (i) => (i === stub
      ? `const off = () => { throw new Error('Version de démonstration non incluse'); };
         export const getDemoDb = off, resetDemo = off, demoFetch = off, demoFileBlob = off, exportBackup = off, restoreBackup = off;`
      : null),
  };
}

// base relative : l'application fonctionne aussi bien à la racine d'un domaine que dans un
// sous-dossier (GitHub Pages : /DQP/), ou ouverte directement depuis le disque (démonstration).
export default defineConfig(({ mode }) => {
  // « desktop » : même application autonome que la démonstration, pour le logiciel installé.
  const desktop = mode === 'desktop';
  const demo = mode === 'demo' || desktop;
  return {
    base: './',
    define: demo ? { 'import.meta.env.VITE_DEMO': JSON.stringify('1'), 'import.meta.env.VITE_DESKTOP': JSON.stringify(desktop ? '1' : '') } : undefined,
    plugins: [react(), tailwindcss(), ...(demo ? [demoAssets(), viteSingleFile({ removeViteModuleLoader: true })] : [demoStub()])],
    optimizeDeps: { exclude: ['@electric-sql/pglite'] },
    build: demo
      ? { outDir: desktop ? 'dist-desktop' : 'dist-demo', chunkSizeWarningLimit: 100000, assetsInlineLimit: 100_000_000 }
      : {
        chunkSizeWarningLimit: 1800,
        rollupOptions: { output: { manualChunks: { pdf: ['jspdf', 'jspdf-autotable'], excel: ['exceljs'] } } },
      },
  };
});
