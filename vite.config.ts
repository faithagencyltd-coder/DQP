import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// base relative : l'application fonctionne aussi bien à la racine d'un domaine que dans un
// sous-dossier (GitHub Pages : /DQP/).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: { output: { manualChunks: { pdf: ['jspdf', 'jspdf-autotable'], excel: ['exceljs'] } } },
  },
});
