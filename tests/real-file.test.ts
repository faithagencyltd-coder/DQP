// Test optionnel sur un vrai fichier client (jamais versionné) :
//   DQE_FILE=/chemin/DQE.xlsx npx vitest run tests/real-file.test.ts
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { computeProject } from '../src/core/dqe';
import { analyzeFile, applyImport } from '../src/core/import';
import { createProject } from '../src/core/project';

const file = process.env.DQE_FILE;

test.skipIf(!file)('import d’un fichier réel', async () => {
  const { file: f, result } = await analyzeFile(file!.split(/[\\/]/).pop()!, new Uint8Array(readFileSync(file!)));
  const p = applyImport(createProject('Réel'), f, result, 'replace');
  const r = computeProject(p);
  for (const lot of p.lots) console.log(lot.code, lot.name, r.lots.get(lot.id)!.amount, 'fichier :', lot.sourceTotal?.value);
  console.log('Total DQP', r.totalHT, 'fichier', result.analysis.sourceGrandTotal?.value, r.status);
  for (const a of result.analysis.fileAlerts) console.log(`[${a.severity}] ${a.message}`);
  expect(r.lineCount).toBeGreaterThan(0);
});
