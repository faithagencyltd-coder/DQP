// Avancement réel d'un projet dans le parcours DQP (§32), calculé à partir des données :
// aucune étape n'est marquée « terminée » sans que le travail correspondant existe.

import { crossCheck } from './elements/crosscheck';
import { activeElements, effectiveStatus } from './elements/ops';
import type { ProjectResult } from './dqe';
import type { Project } from './types';

export type StepId = 'import' | 'analyse' | 'verification' | 'metre' | 'quantification' | 'dqe' | 'estimation' | 'export';
export type StepState = 'done' | 'current' | 'verify' | 'todo' | 'unavailable';

export interface Step {
  id: StepId;
  label: string;
  state: StepState;
  detail: string;
}

export function projectSteps(p: Project, r: ProjectResult): Step[] {
  const files = p.sourceFiles.length;
  const analysed = p.analyses.length;
  const lines = r.lineCount;
  const els = activeElements(p);
  const elToVerify = els.filter((e) => effectiveStatus(e) !== 'confirmed').length;
  const lineToVerify = r.status.to_verify + r.status.undetermined;
  const openDiffs = crossCheck(p, r).filter((c) => c.differs && !c.resolution).length;
  const qtyMissing = [...r.lines.values()].filter((l) => l.quantity === null).length;
  const exported = p.journal.some((j) => j.action.startsWith('Export'));

  const raw: (Omit<Step, 'state'> & { s: StepState })[] = [
    { id: 'import', label: 'Import', s: files ? 'done' : 'todo', detail: files ? `${files} fichier(s) importé(s)` : 'Aucun fichier importé' },
    { id: 'analyse', label: 'Analyse', s: analysed ? 'done' : files ? 'todo' : 'unavailable', detail: analysed ? `${analysed} analyse(s)` : 'Importez un fichier analysable' },
    {
      id: 'verification',
      label: 'Vérification',
      s: !analysed && !lines ? 'unavailable' : lineToVerify + elToVerify + openDiffs > 0 ? 'verify' : 'done',
      detail: `${lineToVerify} ligne(s) et ${elToVerify} élément(s) à vérifier, ${openDiffs} différence(s) entre fichiers`,
    },
    { id: 'metre', label: 'Métré', s: lines ? (qtyMissing ? 'verify' : 'done') : 'unavailable', detail: lines ? `${lines - qtyMissing}/${lines} quantités déterminées (métré géométrique des plans : phase 3)` : 'Aucune quantité' },
    { id: 'quantification', label: 'Quantification', s: lines ? (qtyMissing ? 'verify' : 'done') : 'unavailable', detail: lines ? `${qtyMissing} quantité(s) manquante(s)` : 'Aucun ouvrage' },
    { id: 'dqe', label: 'DQE', s: lines ? 'done' : p.lots.length ? 'todo' : 'unavailable', detail: `${p.lots.length} lot(s), ${lines} ligne(s)` },
    { id: 'estimation', label: 'Estimation', s: !lines ? 'unavailable' : r.incomplete ? 'verify' : 'done', detail: r.incomplete ? `${r.incomplete} ligne(s) non chiffrée(s)` : 'Toutes les lignes sont chiffrées' },
    { id: 'export', label: 'Export', s: exported ? 'done' : lines ? 'todo' : 'unavailable', detail: exported ? 'Documents exportés' : 'Aucun export' },
  ];
  // L'étape « en cours » est la première qui n'est pas terminée.
  let currentSet = false;
  return raw.map(({ s, ...st }) => {
    let state: StepState = s;
    if (!currentSet && s !== 'done') {
      currentSet = true;
      if (s === 'todo') state = 'current';
    }
    return { ...st, state };
  });
}

export function progressSummary(steps: Step[]): { done: number; total: number; current: string } {
  return { done: steps.filter((s) => s.state === 'done').length, total: steps.length, current: steps.find((s) => s.state !== 'done')?.label ?? 'Terminé' };
}

/** Confiance globale : part des informations confirmées (lignes de DQE et éléments de plans). */
export function confidence(p: Project, r: ProjectResult): { confirmed: number; to_verify: number; undetermined: number; total: number; pct: number } {
  const c = { confirmed: r.status.confirmed, to_verify: r.status.to_verify, undetermined: r.status.undetermined };
  for (const e of activeElements(p)) {
    const st = effectiveStatus(e);
    if (st !== 'rejected') c[st]++;
  }
  const total = c.confirmed + c.to_verify + c.undetermined;
  return { ...c, total, pct: total ? Math.round((c.confirmed / total) * 100) : 0 };
}

/** Surface totale connue du projet, avec sa provenance (jamais estimée). */
export function knownSurface(p: Project): { value: number; source: string } | null {
  const els = activeElements(p);
  const tot = els.find((e) => e.kind === 'surface_total' && typeof e.props.surface?.value === 'number' && /habitable|utile|plancher|b[aâ]tie/i.test(e.name));
  if (tot) return { value: tot.props.surface.value as number, source: `${tot.name} (${tot.source.fileName}, p.${tot.source.page})` };
  const rooms = els.filter((e) => e.kind === 'room' && typeof e.props.surface?.value === 'number' && !/terrasse|balcon|cour/i.test(e.category));
  if (rooms.length) return { value: Math.round(rooms.reduce((s, x) => s + (x.props.surface.value as number), 0) * 100) / 100, source: `somme de ${rooms.length} pièce(s) des plans` };
  return null;
}
