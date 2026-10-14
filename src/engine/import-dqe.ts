// Import d'un DQE Excel / CSV existant, avec l'analyseur éprouvé de DQP (src/engine/dqp) :
// lots, sous-parties, lignes, formules relues, contrôles du fichier. Les valeurs absentes
// restent vides (« à compléter »), jamais remplacées par une estimation.
import { analyzeFile } from './dqp/import';
import { roundTo } from './money';
import { newLine, type DocBody } from './dqe';
import { uid } from './ids';

export interface DqeImportReport {
  body: DocBody;
  lots: number;
  lines: number;
  missingQty: number;
  missingPrice: number;
  alerts: string[];
  projectInfo: { key: string; value: string }[];
}

export async function importDqeFile(name: string, bytes: Uint8Array): Promise<DqeImportReport> {
  const { result } = await analyzeFile(name, bytes);
  let lines = 0, missingQty = 0, missingPrice = 0;
  const body: DocBody = {
    lots: result.lots.map((lot, li) => ({
      id: uid('lot'),
      code: `LOT ${String(li + 1).padStart(2, '0')}`,
      name: lot.name,
      lines: lot.sections.flatMap((sec) => {
        const head = sec.title || sec.path.length ? [newLine({ kind: 'titre', designation: [...sec.path, sec.title].filter(Boolean).join(' › ') })] : [];
        return [...head, ...sec.lines.map((l) => {
          lines++;
          let qty = l.quantity.value;
          const notes: string[] = [];
          if (qty !== null && (l.coefficient !== 1 || l.lossPercent !== 0)) {
            notes.push(`Quantité du fichier ${l.quantity.value} × coefficient ${l.coefficient} × (1 + ${l.lossPercent} %)`);
            qty = roundTo(qty * l.coefficient * (1 + l.lossPercent / 100), 3);
          }
          if (l.quantity.source?.formula) notes.push(`Formule source : ${l.quantity.source.formula}`);
          if (l.observation) notes.push(l.observation);
          if (qty === null) missingQty++;
          if (l.unitPrice.value === null) missingPrice++;
          return newLine({
            ref: l.code || l.number, designation: l.designation, unit: l.unit, qty, unitPrice: l.unitPrice.value,
            note: notes.join(' · ') || undefined,
            qtySource: { kind: 'import', label: `${name}${l.quantity.source?.cell ? ` · ${l.quantity.source.cell}` : ''}` },
            priceSource: l.unitPrice.value === null ? undefined : { kind: 'import', label: `${name}${l.unitPrice.source?.cell ? ` · ${l.unitPrice.source.cell}` : ''}` },
          });
        })];
      }),
    })),
  };
  return {
    body, lots: body.lots.length, lines, missingQty, missingPrice,
    alerts: result.analysis.fileAlerts.map((a) => a.message),
    projectInfo: result.analysis.detected.map((d) => ({ key: d.key, value: String(d.value) })),
  };
}
