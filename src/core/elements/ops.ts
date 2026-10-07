// Validation humaine des éléments détectés (§8, §16) : accepter, corriger, rejeter.
// Chaque action est tracée dans l'élément et dans le journal du projet.

import { formatNumber, nowIso, parseNumberFr } from '../format';
import { replaceProject } from '../project';
import type { BuildingElement, Confidence, Project } from '../types';

export function elementLabel(e: BuildingElement): string {
  return `${e.category} « ${e.name} »${e.level ? ` (${e.level})` : ''}`;
}

/** État effectif d'un élément : rejeté, ou le pire de sa détection et de ses propriétés. */
export function effectiveStatus(e: BuildingElement): Confidence | 'rejected' {
  if (e.validation?.state === 'rejected') return 'rejected';
  if (e.validation?.state === 'accepted') {
    return Object.values(e.props).some((v) => v.status === 'undetermined') ? 'undetermined' : 'confirmed';
  }
  const states = [e.status, ...Object.values(e.props).map((v) => v.status)];
  if (states.includes('undetermined')) return 'undetermined';
  if (states.includes('to_verify')) return 'to_verify';
  return 'confirmed';
}

export function activeElements(p: Project): BuildingElement[] {
  return p.elements.filter((e) => e.validation?.state !== 'rejected');
}

function findEl(p: Project, id: string) {
  return p.elements.find((e) => e.id === id);
}

/** Accepte l'élément tel quel : la détection et les valeurs présentes deviennent confirmées. */
export function acceptElement(project: Project, id: string): Project {
  const e = findEl(project, id);
  if (!e) return project;
  return replaceProject(project, 'Élément validé', elementLabel(e), (p) => {
    const x = findEl(p, id)!;
    x.validation = { state: 'accepted', at: nowIso() };
    x.status = 'confirmed';
    for (const v of Object.values(x.props)) if (v.value !== null && v.status === 'to_verify') {
      v.status = 'confirmed';
      v.note = (v.note ? v.note + ' — ' : '') + 'validé par l’utilisateur';
    }
  });
}

export function rejectElement(project: Project, id: string): Project {
  const e = findEl(project, id);
  if (!e) return project;
  return replaceProject(project, 'Élément rejeté', elementLabel(e), (p) => {
    findEl(p, id)!.validation = { state: 'rejected', at: nowIso() };
  });
}

export function restoreElement(project: Project, id: string): Project {
  const e = findEl(project, id);
  if (!e) return project;
  return replaceProject(project, 'Élément rétabli', elementLabel(e), (p) => {
    delete findEl(p, id)!.validation;
  });
}

/** Corrige une propriété (surface, largeur…) ou le nom, la catégorie, le niveau. */
export function correctElement(project: Project, id: string, prop: string, raw: string): Project {
  const e = findEl(project, id);
  if (!e) return project;
  const text = raw.trim();
  if (prop === 'name' || prop === 'category' || prop === 'level') {
    const before = (e[prop as 'name'] as string | undefined) ?? '';
    if (before === text) return project;
    return replaceProject(project, 'Élément corrigé', `${elementLabel(e)} — ${prop} : ${before || '—'} → ${text || '—'}`, (p) => {
      const x = findEl(p, id)!;
      x.edits.push({ prop, before, after: text, at: nowIso() });
      (x as unknown as Record<string, string>)[prop] = text;
    });
  }
  const cur = e.props[prop];
  const numeric = typeof cur?.value === 'number' || cur?.unit !== undefined;
  const after: number | string | null = text === '' ? null : numeric ? parseNumberFr(text) : text;
  if (numeric && text !== '' && after === null) return project;
  const before = cur?.value ?? null;
  if (before === after) return project;
  const shown = (v: number | string | null) => (typeof v === 'number' ? formatNumber(v) : v ?? '—');
  return replaceProject(project, 'Élément corrigé', `${elementLabel(e)} — ${prop} : ${shown(before)} → ${shown(after)}`, (p) => {
    const x = findEl(p, id)!;
    x.edits.push({ prop, before, after, at: nowIso() });
    x.props[prop] = {
      value: after,
      unit: cur?.unit,
      status: after === null ? 'undetermined' : 'confirmed',
      source: cur?.source,
      note: after === null ? 'Valeur effacée par l’utilisateur' : 'Corrigée par l’utilisateur',
    };
  });
}
