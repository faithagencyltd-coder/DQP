import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : l'application de bureau charge dist/index.html depuis le disque.
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { port: 5199, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
});
