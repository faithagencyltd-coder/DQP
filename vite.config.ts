import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Chemins relatifs : l'application de bureau charge dist/index.html depuis le disque.
  base: './',
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Bibliothèques lourdes isolées : chargées seulement quand un écran en a besoin.
        manualChunks: (id) => (id.includes('exceljs') ? 'exceljs' : id.includes('pdfjs-dist') ? 'pdfjs' : id.includes('react') ? 'react' : undefined),
      },
    },
  },
  server: { port: 5199, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
});
