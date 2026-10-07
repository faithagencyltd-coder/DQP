// pdf.js pour l'interface : lecture des plans et rendu de l'aperçu, entièrement hors ligne.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };

/** Octets des PDF importés pendant la session (le mode navigateur ne les garde pas sur disque). */
export const pdfCache = new Map<string, Uint8Array>();
