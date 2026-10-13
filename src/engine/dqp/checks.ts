// Détection des incohérences sur le DQE en cours (§18). Recalculée à chaque modification.

import type { ProjectResult } from './dqe';
import { formatNumber, newId, normalizeText } from './format';
import type { Alert, PriceItem, Project } from './types';

const COUNT_UNITS = new Set(['u', 'ens', 'ff']);

export function checkProject(project: Project, result: ProjectResult, prices: PriceItem[] = []): Alert[] {
  const alerts: Alert[] = [];
  const push = (severity: Alert['severity'], code: string, message: string, extra: Partial<Alert> = {}) =>
    alerts.push({ id: newId('c'), severity, code, message, ...extra });
  const priceById = new Map(prices.map((p) => [p.id, p]));

  if (project.lots.length === 0) push('info', 'EMPTY', 'Le projet ne contient encore aucun lot. Importez un DQE (Excel/CSV) ou créez un lot.');

  for (const lot of project.lots) {
    const lineCount = lot.sections.reduce((s, x) => s + x.lines.length, 0);
    if (lineCount === 0) push('warning', 'EMPTY_LOT', `Le lot « ${lot.name} » ne contient aucune ligne.`, { lotId: lot.id });

    for (const section of lot.sections) {
      const seen = new Map<string, string>();
      for (const line of section.lines) {
        const r = result.lines.get(line.id);
        const where = { lotId: lot.id, sectionId: section.id, lineId: line.id, source: line.source };
        const name = line.designation || '(sans désignation)';

        if (!line.designation) push('warning', 'NO_DESIGNATION', `Ligne sans désignation dans « ${lot.name} › ${section.title} ».`, where);
        if (!line.unit) push('warning', 'NO_UNIT', `Unité manquante : « ${name} ».`, where);

        if (r?.error) push('error', 'FORMULA', `Quantité de « ${name} » non calculable : ${r.error}.`, where);
        else if (r?.quantity === null) push('warning', 'NO_QUANTITY', `Quantité non déterminée : « ${name} ».`, where);
        else if (r && r.quantity !== null) {
          if (r.quantity < 0) push('error', 'NEGATIVE_QUANTITY', `Quantité négative : « ${name} » (${formatNumber(r.quantity)}).`, where);
          else if (r.quantity === 0) push('warning', 'ZERO_QUANTITY', `Quantité nulle : « ${name} ». Ligne à supprimer ou à compléter.`, where);
          if (COUNT_UNITS.has(line.unit) && r.quantity > 0 && !Number.isInteger(Math.round(r.quantity * 1e6) / 1e6)) {
            push('warning', 'FRACTIONAL_COUNT', `Quantité non entière pour une unité de compte (${line.unit}) : « ${name} » = ${formatNumber(r.quantity)}.`, where);
          }
        }

        if (line.unitPrice.value === null) push('warning', 'NO_PRICE', `Prix unitaire manquant : « ${name} ».`, where);
        else if (line.unitPrice.value === 0) push('warning', 'ZERO_PRICE', `Prix unitaire nul : « ${name} ».`, where);
        else if (line.unitPrice.value < 0) push('error', 'NEGATIVE_PRICE', `Prix unitaire négatif : « ${name} ».`, where);

        if (line.coefficient <= 0) push('error', 'COEFFICIENT', `Coefficient invalide (${formatNumber(line.coefficient, 3)}) : « ${name} ».`, where);
        if (line.lossPercent < 0 || line.lossPercent > 50) push('warning', 'LOSS', `Perte inhabituelle (${formatNumber(line.lossPercent)} %) : « ${name} ».`, where);

        if (line.quantity.status === 'to_verify' && line.quantity.note) push('warning', 'QTY_TO_VERIFY', `Quantité à vérifier — « ${name} » : ${line.quantity.note}.`, where);

        // Doublons : même désignation et même unité dans la même section.
        if (line.designation) {
          const key = normalizeText(line.designation) + '|' + line.unit;
          const other = seen.get(key);
          if (other) push('warning', 'DUPLICATE', `Doublon possible dans « ${section.title} » : « ${name} » apparaît deux fois.`, where);
          else seen.set(key, line.id);
        }

        // Écart avec le montant lu dans le fichier source (ligne non modifiée seulement).
        if (line.edits.length === 0 && line.sourceAmount != null && r?.amount != null && Math.abs(line.sourceAmount - r.amount) > 1) {
          push('warning', 'SOURCE_AMOUNT', `Montant différent du fichier source pour « ${name} » : fichier ${formatNumber(line.sourceAmount)}, DQP ${formatNumber(r.amount)}.`, where);
        }

        // Prix de la bibliothèque modifié depuis son application.
        if (line.priceItemId) {
          const item = priceById.get(line.priceItemId);
          if (item && item.price !== line.unitPrice.value) {
            push('info', 'LIBRARY_PRICE_CHANGED', `Le prix de « ${item.designation} » a changé dans la bibliothèque (${formatNumber(item.price)} au lieu de ${formatNumber(line.unitPrice.value)}) : « ${name} ».`, where);
          }
          if (item && item.unit && line.unit && item.unit !== line.unit) {
            push('warning', 'UNIT_MISMATCH', `Unité différente entre la ligne (${line.unit}) et le prix de bibliothèque (${item.unit}) : « ${name} ».`, where);
          }
        }
      }
    }
  }
  return alerts;
}

export const SEVERITY_LABEL: Record<Alert['severity'], string> = {
  error: 'Erreur',
  warning: 'À vérifier',
  info: 'Information',
};
