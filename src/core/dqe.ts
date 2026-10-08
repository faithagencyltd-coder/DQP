// Moteur de calcul DQE / estimation (§11, §13). Entièrement déterministe :
// Montant = Quantité retenue × Prix unitaire ; Quantité retenue = Quantité × coefficient × (1 + perte %).

import { evaluate, FormulaError, referencedLines } from './formula';
import { formatNumber } from './format';
import { computeMeasure } from './metre/measure';
import type { Confidence, DqeLine, DqeSection, Lot, Project } from './types';

export interface LineResult {
  /** Quantité de base (après résolution d'une éventuelle expression liée). */
  quantity: number | null;
  quantityStatus: Confidence;
  /** Quantité retenue (coefficient et perte appliqués). */
  retained: number | null;
  amount: number | null;
  /** Explication pas à pas du calcul (§10). */
  steps: string[];
  error?: string;
}

export interface GroupTotal {
  amount: number;
  lines: number;
  /** Lignes dont le montant est indéterminé (quantité ou prix manquant). */
  incomplete: number;
}

export interface ProjectResult {
  lines: Map<string, LineResult>;
  sections: Map<string, GroupTotal>;
  lots: Map<string, GroupTotal & { byZone: { zone: string; amount: number }[] }>;
  totalHT: number;
  vat: number;
  totalTTC: number;
  lineCount: number;
  incomplete: number;
  status: Record<Confidence, number>;
}

export function allLines(project: Pick<Project, 'lots'>): DqeLine[] {
  return project.lots.flatMap((l) => l.sections.flatMap((s) => s.lines));
}

export function findLine(project: Pick<Project, 'lots'>, lineId: string):
  | { lot: Lot; section: DqeSection; line: DqeLine; index: number }
  | undefined {
  for (const lot of project.lots)
    for (const section of lot.sections) {
      const index = section.lines.findIndex((l) => l.id === lineId);
      if (index >= 0) return { lot, section, line: section.lines[index], index };
    }
  return undefined;
}

function round(value: number, enabled: boolean): number {
  return enabled ? Math.round(value) : Math.round(value * 100) / 100;
}

export function computeProject(project: Project): ProjectResult {
  const byId = new Map(allLines(project).map((l) => [l.id, l]));
  const lineResults = new Map<string, LineResult>();
  const resolving = new Set<string>();

  function baseQuantity(line: DqeLine): { value: number | null; steps: string[]; status: Confidence; error?: string } {
    const q = line.quantity;
    if (!q.expression) return { value: q.value, steps: [], status: q.status };
    if (resolving.has(line.id)) {
      return { value: null, steps: [], status: 'undetermined', error: 'Référence circulaire entre quantités' };
    }
    resolving.add(line.id);
    try {
      const steps: string[] = [];
      let status: Confidence = q.status;
      const value = evaluate(q.expression, {
        cell: () => {
          throw new FormulaError('Référence de cellule inattendue');
        },
        line: (id) => {
          const ref = byId.get(id);
          if (!ref) throw new FormulaError('Ligne référencée supprimée');
          const r = baseQuantity(ref);
          if (r.error) throw new FormulaError(r.error);
          if (r.status !== 'confirmed') status = 'to_verify';
          if (r.value === null) status = 'undetermined';
          steps.push(`Quantité de « ${ref.designation} » = ${formatNumber(r.value)} ${ref.unit}`);
          return r.value;
        },
        measure: (id) => {
          const m = (project.measurements ?? []).find((x) => x.id === id);
          if (!m) throw new FormulaError('Mesure référencée supprimée');
          const r = computeMeasure(project, m);
          if (r.status !== 'confirmed') status = 'to_verify';
          if (r.value === null) status = 'undetermined';
          steps.push(`Mesure « ${m.label} » (${m.fileName}, page ${m.page}) :`, ...r.steps.map((x) => `  ${x}`));
          return r.value;
        },
      });
      if (!/^\{M:[^}]+\}$/.test(q.expression)) steps.push(`Formule : ${describeExpression(q.expression, byId, project)} = ${formatNumber(value)}`);
      return { value, steps, status };
    } catch (e) {
      return { value: null, steps: [], status: 'undetermined', error: (e as Error).message };
    } finally {
      resolving.delete(line.id);
    }
  }

  const status: Record<Confidence, number> = { confirmed: 0, to_verify: 0, undetermined: 0 };
  let lineCount = 0;
  let incomplete = 0;

  for (const line of byId.values()) {
    const base = baseQuantity(line);
    const steps = [...base.steps];
    let retained: number | null = null;
    let amount: number | null = null;
    if (base.value !== null) {
      retained = base.value * line.coefficient * (1 + line.lossPercent / 100);
      if (line.coefficient !== 1 || line.lossPercent !== 0) {
        steps.push(
          `Quantité retenue = ${formatNumber(base.value)} × coef ${formatNumber(line.coefficient, 3)}` +
            ` × (1 + ${formatNumber(line.lossPercent)} % de perte) = ${formatNumber(retained)} ${line.unit}`,
        );
      }
      if (line.unitPrice.value !== null) {
        amount = round(retained * line.unitPrice.value, project.settings.roundAmounts);
        steps.push(
          `Montant = ${formatNumber(retained)} ${line.unit} × ${formatNumber(line.unitPrice.value)} = ${formatNumber(amount)}`,
        );
      }
    }
    if (base.value === null) steps.push('Quantité non déterminée : montant non calculé.');
    else if (line.unitPrice.value === null) steps.push('Prix unitaire non déterminé : montant non calculé.');

    const worst = worstOf(base.status, line.unitPrice.status);
    status[worst]++;
    lineCount++;
    if (amount === null) incomplete++;
    lineResults.set(line.id, { quantity: base.value, quantityStatus: base.status, retained, amount, steps, error: base.error });
  }

  const sections = new Map<string, GroupTotal>();
  const lots = new Map<string, GroupTotal & { byZone: { zone: string; amount: number }[] }>();
  let totalHT = 0;
  for (const lot of project.lots) {
    const lotTotal = { amount: 0, lines: 0, incomplete: 0, byZone: [] as { zone: string; amount: number }[] };
    for (const section of lot.sections) {
      const t: GroupTotal = { amount: 0, lines: 0, incomplete: 0 };
      for (const line of section.lines) {
        const r = lineResults.get(line.id)!;
        t.lines++;
        if (r.amount === null) t.incomplete++;
        else t.amount += r.amount;
      }
      sections.set(section.id, t);
      lotTotal.amount += t.amount;
      lotTotal.lines += t.lines;
      lotTotal.incomplete += t.incomplete;
      const zone = section.path[0] ?? section.title;
      const z = lotTotal.byZone.find((x) => x.zone === zone);
      if (z) z.amount += t.amount;
      else lotTotal.byZone.push({ zone, amount: t.amount });
    }
    lots.set(lot.id, lotTotal);
    totalHT += lotTotal.amount;
  }
  const vat = round((totalHT * project.settings.vatRate) / 100, project.settings.roundAmounts);
  return { lines: lineResults, sections, lots, totalHT, vat, totalTTC: totalHT + vat, lineCount, incomplete, status };
}

export function worstOf(...states: Confidence[]): Confidence {
  if (states.includes('undetermined')) return 'undetermined';
  if (states.includes('to_verify')) return 'to_verify';
  return 'confirmed';
}

export function describeExpression(expression: string, byId: Map<string, DqeLine>, project?: Pick<Project, 'measurements'>): string {
  return expression
    .replace(/\{L:([^}]+)\}/g, (_, id: string) => {
      const l = byId.get(id);
      return l ? `[${l.number ? 'N° ' + l.number + ' ' : ''}${l.designation}]` : '[ligne supprimée]';
    })
    .replace(/\{M:([^}]+)\}/g, (_, id: string) => {
      const m = project?.measurements?.find((x) => x.id === id);
      return m ? `[mesure « ${m.label} », ${m.fileName} p.${m.page}]` : '[mesure]';
    })
    .replace(/\*/g, ' × ')
    .replace(/\//g, ' ÷ ');
}

/** Lignes dont la quantité dépend de la ligne donnée. */
export function dependentLines(project: Project, lineId: string): DqeLine[] {
  return allLines(project).filter((l) => l.quantity.expression && referencedLines(l.quantity.expression).includes(lineId));
}

/** Sections d'un lot regroupées par chemin (zone › niveau), dans l'ordre d'apparition. */
export function groupSections(lot: Lot): { path: string[]; sections: DqeSection[] }[] {
  const groups: { path: string[]; sections: DqeSection[] }[] = [];
  for (const s of lot.sections) {
    const key = s.path.join(' › ');
    const last = groups[groups.length - 1];
    if (last && last.path.join(' › ') === key) last.sections.push(s);
    else groups.push({ path: s.path, sections: [s] });
  }
  return groups;
}

/**
 * Numéros utilisés à l'export : ceux du fichier s'ils sont uniques dans le lot,
 * sinon une numérotation automatique « n° du lot.n° de ligne » (1.1, 1.2…).
 */
export function exportNumbers(project: Pick<Project, 'lots'>): Map<string, string> {
  const out = new Map<string, string>();
  project.lots.forEach((lot, li) => {
    const lines = lot.sections.flatMap((s) => s.lines);
    const nums = lines.map((l) => l.number.trim());
    const unique = nums.every((n) => n !== '') && new Set(nums).size === nums.length;
    lines.forEach((l, i) => out.set(l.id, unique ? l.number.trim() : `${li + 1}.${i + 1}`));
  });
  return out;
}
