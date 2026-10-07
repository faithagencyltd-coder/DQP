// Lance les analyses en montrant leur progression réelle. Excel/CSV : dans un worker
// (repli sur le fil principal si le worker est indisponible). PDF : pdf.js analyse
// déjà dans son propre worker ; DQP rend la main à l'interface entre chaque page.

import { analyzeFile, analyzePlanFile, ImportError, type ImportProgress } from '../../core/import';

export async function runDqeAnalysis(name: string, bytes: Uint8Array, onProgress: (p: ImportProgress) => void): ReturnType<typeof analyzeFile> {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  if (!worker) return analyzeFile(name, bytes, onProgress);
  return new Promise((resolve, reject) => {
    let started = false;
    const fallback = () => {
      worker?.terminate();
      analyzeFile(name, bytes, onProgress).then(resolve, reject);
    };
    worker!.onmessage = (e) => {
      started = true;
      const m = e.data;
      if (m.type === 'progress') onProgress(m.p);
      else if (m.type === 'done') {
        worker!.terminate();
        resolve(m.out);
      } else if (m.type === 'error') {
        worker!.terminate();
        reject(m.importError ? new ImportError(m.message) : new Error(m.message));
      }
    };
    worker!.onerror = (e) => {
      e.preventDefault();
      if (!started) fallback();
      else {
        worker?.terminate();
        reject(new Error(e.message || 'Erreur pendant l’analyse'));
      }
    };
    worker!.postMessage({ name, bytes });
  });
}

export async function runPlanAnalysis(name: string, bytes: Uint8Array, onProgress: (p: ImportProgress) => void): ReturnType<typeof analyzePlanFile> {
  const { pdfjs } = await import('./pdfjs');
  return analyzePlanFile(name, bytes, pdfjs, onProgress);
}
