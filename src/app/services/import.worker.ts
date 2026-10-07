// Analyse des classeurs Excel/CSV hors du fil de l'interface (§19 performance).
import { analyzeFile } from '../../core/import';

self.onmessage = async (e: MessageEvent<{ name: string; bytes: Uint8Array }>) => {
  try {
    const out = await analyzeFile(e.data.name, e.data.bytes, (p) => self.postMessage({ type: 'progress', p }));
    self.postMessage({ type: 'done', out });
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message, importError: (err as Error).name === 'ImportError' || (err as Error).constructor?.name === 'ImportError' });
  }
};
