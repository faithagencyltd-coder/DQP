// Création et modification d'un projet. Chaque fonction renvoie un NOUVEAU projet
// (aucune mutation en place) et inscrit l'action au journal (§40).

import { dependentLines, findLine } from './dqe';
import { newId, normalizeUnit, nowIso, parseNumberFr } from './format';
import type { DqeLine, DqeSection, LineField, Lot, PriceItem, Project, TrackedNumber } from './types';

export const ENGINE_VERSION = '0.2.0';

export const DEFAULT_LOTS = [
  'Installation de chantier',
  'Terrassement',
  'Fondations',
  'Gros œuvre',
  'Charpente',
  'Couverture',
  'Étanchéité',
  'Menuiserie',
  'Revêtements',
  'Peinture',
  'Plomberie - sanitaire',
  'Électricité',
  'Climatisation',
  'VRD',
];

export function createProject(name: string, opts: Partial<Project['info']> = {}): Project {
  const at = nowIso();
  return {
    schema: 2,
    id: newId('p'),
    info: {
      name,
      client: '',
      location: '',
      projectType: '',
      projectTypeStatus: 'undetermined',
      phase: '',
      date: '',
      ...opts,
    },
    settings: { currency: 'FCFA', vatRate: 0, roundAmounts: true },
    sourceFiles: [],
    lots: [],
    analyses: [],
    elements: [],
    resolutions: [],
    journal: [{ at, action: 'Projet créé', detail: name }],
    createdAt: at,
    updatedAt: at,
  };
}

function mutate(project: Project, action: string, detail: string | undefined, fn: (p: Project) => void): Project {
  const next = structuredClone(project);
  fn(next);
  next.updatedAt = nowIso();
  next.journal.push({ at: next.updatedAt, action, detail });
  if (next.journal.length > 2000) next.journal = next.journal.slice(-2000);
  return next;
}

export function renumberLots(lots: Lot[]): void {
  lots.forEach((lot, i) => {
    lot.code = `LOT ${String(i + 1).padStart(2, '0')}`;
  });
}

export function emptyNumber(): TrackedNumber {
  return { value: null, status: 'undetermined', origin: 'manual' };
}

export function newLine(partial: Partial<DqeLine> = {}): DqeLine {
  return {
    id: newId('l'),
    number: '',
    designation: '',
    unit: '',
    quantity: emptyNumber(),
    unitPrice: emptyNumber(),
    coefficient: 1,
    lossPercent: 0,
    observation: '',
    edits: [],
    ...partial,
  };
}

export function newSection(title: string, path: string[] = []): DqeSection {
  return { id: newId('s'), title, path, lines: [] };
}

// ---------- Informations projet ----------

export function updateInfo(project: Project, patch: Partial<Project['info']>): Project {
  const keys = Object.keys(patch).join(', ');
  return mutate(project, 'Informations du projet modifiées', keys, (p) => {
    Object.assign(p.info, patch);
    if (patch.projectType !== undefined && patch.projectTypeStatus === undefined) p.info.projectTypeStatus = 'confirmed';
  });
}

export function updateSettings(project: Project, patch: Partial<Project['settings']>): Project {
  return mutate(project, 'Paramètres du projet modifiés', Object.keys(patch).join(', '), (p) => {
    Object.assign(p.settings, patch);
  });
}

// ---------- Lignes (§16, §17) ----------

/**
 * Modifie un champ d'une ligne. La modification est tracée (avant / après / date)
 * et la valeur devient « manuelle » et confirmée par l'utilisateur.
 */
export function editLine(project: Project, lineId: string, field: LineField, raw: string): Project {
  const found = findLine(project, lineId);
  if (!found) return project;
  const line = found.line;
  let before: string | number | null;
  let after: string | number | null;
  switch (field) {
    case 'quantity':
    case 'unitPrice':
      before = line[field].value;
      after = raw.trim() === '' ? null : parseNumberFr(raw);
      if (raw.trim() !== '' && after === null) return project;
      break;
    case 'coefficient':
    case 'lossPercent':
      before = line[field];
      after = parseNumberFr(raw);
      if (after === null) after = field === 'coefficient' ? 1 : 0;
      break;
    case 'unit':
      before = line.unit;
      after = normalizeUnit(raw);
      break;
    default:
      before = line[field];
      after = raw.trim();
  }
  if (before === after) return project;
  return mutate(project, 'Ligne modifiée', `${line.designation || '(sans désignation)'} — ${FIELD_LABEL[field]} : ${before ?? '—'} → ${after ?? '—'}`, (p) => {
    const l = findLine(p, lineId)!.line;
    l.edits.push({ field, before, after, at: nowIso() });
    if (field === 'quantity' || field === 'unitPrice') {
      l[field] = {
        value: after as number | null,
        status: after === null ? 'undetermined' : 'confirmed',
        origin: 'manual',
        source: l[field].source,
        note: after === null ? 'Valeur effacée par l’utilisateur' : 'Saisie / corrigée par l’utilisateur',
      };
      if (field === 'unitPrice') delete l.priceItemId;
    } else if (field === 'coefficient' || field === 'lossPercent') {
      l[field] = after as number;
    } else {
      l[field] = after as string;
    }
  });
}

export const FIELD_LABEL: Record<LineField, string> = {
  number: 'N°',
  designation: 'Désignation',
  unit: 'Unité',
  quantity: 'Quantité',
  unitPrice: 'Prix unitaire',
  coefficient: 'Coefficient',
  lossPercent: 'Perte %',
  observation: 'Observation',
};

/** Valide une valeur « à vérifier » sans la changer : elle devient confirmée par l'utilisateur. */
export function validateValue(project: Project, lineId: string, field: 'quantity' | 'unitPrice'): Project {
  const found = findLine(project, lineId);
  if (!found || found.line[field].value === null) return project;
  return mutate(project, 'Valeur validée', `${found.line.designation} — ${FIELD_LABEL[field]}`, (p) => {
    const tn = findLine(p, lineId)!.line[field];
    tn.status = 'confirmed';
    tn.note = 'Validée par l’utilisateur';
  });
}

/** Rompt le lien d'une quantité calculée à partir d'une autre ligne (la valeur actuelle est figée). */
export function unlinkQuantity(project: Project, lineId: string, currentValue: number | null): Project {
  return mutate(project, 'Quantité détachée de sa formule', undefined, (p) => {
    const l = findLine(p, lineId)!.line;
    l.edits.push({ field: 'quantity', before: l.quantity.expression ?? null, after: currentValue, at: nowIso() });
    delete l.quantity.expression;
    l.quantity.value = currentValue;
    l.quantity.origin = 'manual';
  });
}

export function addLine(project: Project, sectionId: string, afterLineId?: string): { project: Project; lineId: string } {
  const line = newLine();
  const next = mutate(project, 'Ligne ajoutée', undefined, (p) => {
    for (const lot of p.lots)
      for (const s of lot.sections)
        if (s.id === sectionId) {
          const idx = afterLineId ? s.lines.findIndex((l) => l.id === afterLineId) : -1;
          s.lines.splice(idx >= 0 ? idx + 1 : s.lines.length, 0, line);
        }
  });
  return { project: next, lineId: line.id };
}

export function deleteLine(project: Project, lineId: string): Project {
  const found = findLine(project, lineId);
  if (!found) return project;
  const deps = dependentLines(project, lineId);
  return mutate(project, 'Ligne supprimée', found.line.designation, (p) => {
    // Les quantités liées à cette ligne sont figées à leur dernière valeur connue.
    for (const dep of deps) {
      const d = findLine(p, dep.id)!.line;
      delete d.quantity.expression;
      d.quantity.status = 'to_verify';
      d.quantity.note = `La ligne de référence « ${found.line.designation} » a été supprimée : quantité à vérifier.`;
    }
    const f = findLine(p, lineId)!;
    f.section.lines.splice(f.index, 1);
  });
}

export function duplicateLine(project: Project, lineId: string): Project {
  return mutate(project, 'Ligne dupliquée', findLine(project, lineId)?.line.designation, (p) => {
    const f = findLine(p, lineId)!;
    const copy = structuredClone(f.line);
    copy.id = newId('l');
    copy.edits = [];
    f.section.lines.splice(f.index + 1, 0, copy);
  });
}

export function moveLine(project: Project, lineId: string, delta: -1 | 1): Project {
  const f = findLine(project, lineId);
  if (!f) return project;
  const target = f.index + delta;
  if (target < 0 || target >= f.section.lines.length) return project;
  return mutate(project, 'Ligne déplacée', f.line.designation, (p) => {
    const g = findLine(p, lineId)!;
    const [l] = g.section.lines.splice(g.index, 1);
    g.section.lines.splice(target, 0, l);
  });
}

export function moveLineToSection(project: Project, lineId: string, sectionId: string): Project {
  return mutate(project, 'Ligne déplacée vers une autre section', findLine(project, lineId)?.line.designation, (p) => {
    const g = findLine(p, lineId)!;
    const [l] = g.section.lines.splice(g.index, 1);
    for (const lot of p.lots) for (const s of lot.sections) if (s.id === sectionId) s.lines.push(l);
  });
}

/** Applique un prix de la bibliothèque à une ligne (§14). */
export function applyPrice(project: Project, lineId: string, item: PriceItem): Project {
  const f = findLine(project, lineId);
  if (!f) return project;
  return mutate(project, 'Prix appliqué depuis la bibliothèque', `${f.line.designation} ← ${item.code} ${item.designation} (${item.price})`, (p) => {
    const l = findLine(p, lineId)!.line;
    l.edits.push({ field: 'unitPrice', before: l.unitPrice.value, after: item.price, at: nowIso() });
    l.unitPrice = {
      value: item.price,
      status: 'confirmed',
      origin: 'library',
      note: `Bibliothèque de prix : ${item.code} — ${item.designation} (mis à jour le ${item.updatedAt.slice(0, 10)})`,
    };
    l.priceItemId = item.id;
  });
}

// ---------- Sections ----------

export function addSection(project: Project, lotId: string, title: string, path: string[] = []): Project {
  return mutate(project, 'Section ajoutée', title, (p) => {
    p.lots.find((l) => l.id === lotId)?.sections.push(newSection(title, path));
  });
}

export function renameSection(project: Project, sectionId: string, title: string, path?: string[]): Project {
  return mutate(project, 'Section renommée', title, (p) => {
    for (const lot of p.lots)
      for (const s of lot.sections)
        if (s.id === sectionId) {
          s.title = title;
          if (path) s.path = path;
        }
  });
}

export function deleteSection(project: Project, sectionId: string): Project {
  return mutate(project, 'Section supprimée', undefined, (p) => {
    for (const lot of p.lots) lot.sections = lot.sections.filter((s) => s.id !== sectionId);
  });
}

export function moveSection(project: Project, sectionId: string, delta: -1 | 1): Project {
  return mutate(project, 'Section déplacée', undefined, (p) => {
    for (const lot of p.lots) {
      const i = lot.sections.findIndex((s) => s.id === sectionId);
      const j = i + delta;
      if (i >= 0 && j >= 0 && j < lot.sections.length) {
        const [s] = lot.sections.splice(i, 1);
        lot.sections.splice(j, 0, s);
      }
    }
  });
}

// ---------- Lots (§12) : créer, supprimer, renommer, déplacer, fusionner, subdiviser ----------

export function addLot(project: Project, name: string): Project {
  return mutate(project, 'Lot créé', name, (p) => {
    p.lots.push({ id: newId('lot'), code: '', name, sections: [newSection('Général')] });
    renumberLots(p.lots);
  });
}

export function renameLot(project: Project, lotId: string, name: string): Project {
  const old = project.lots.find((l) => l.id === lotId)?.name;
  return mutate(project, 'Lot renommé', `${old} → ${name}`, (p) => {
    const lot = p.lots.find((l) => l.id === lotId);
    if (lot) lot.name = name;
  });
}

export function deleteLot(project: Project, lotId: string): Project {
  return mutate(project, 'Lot supprimé', project.lots.find((l) => l.id === lotId)?.name, (p) => {
    p.lots = p.lots.filter((l) => l.id !== lotId);
    renumberLots(p.lots);
  });
}

export function moveLot(project: Project, lotId: string, delta: -1 | 1): Project {
  const i = project.lots.findIndex((l) => l.id === lotId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= project.lots.length) return project;
  return mutate(project, 'Lot déplacé', project.lots[i].name, (p) => {
    const [lot] = p.lots.splice(i, 1);
    p.lots.splice(j, 0, lot);
    renumberLots(p.lots);
  });
}

/** Fusionne `sourceId` dans `targetId` : les sections du lot source sont ajoutées à la cible. */
export function mergeLots(project: Project, sourceId: string, targetId: string): Project {
  if (sourceId === targetId) return project;
  const src = project.lots.find((l) => l.id === sourceId);
  const dst = project.lots.find((l) => l.id === targetId);
  if (!src || !dst) return project;
  return mutate(project, 'Lots fusionnés', `${src.name} → ${dst.name}`, (p) => {
    const s = p.lots.find((l) => l.id === sourceId)!;
    const d = p.lots.find((l) => l.id === targetId)!;
    d.sections.push(...s.sections.map((sec) => ({ ...sec, path: [s.name, ...sec.path] })));
    if (d.sourceTotal && s.sourceTotal) {
      d.sourceTotal = undefined; // les totaux source ne sont plus comparables
    }
    p.lots = p.lots.filter((l) => l.id !== sourceId);
    renumberLots(p.lots);
  });
}

/** Subdivise un lot : les sections choisies partent dans un nouveau lot placé juste après. */
export function splitLot(project: Project, lotId: string, sectionIds: string[], newName: string): Project {
  if (sectionIds.length === 0) return project;
  return mutate(project, 'Lot subdivisé', newName, (p) => {
    const i = p.lots.findIndex((l) => l.id === lotId);
    const lot = p.lots[i];
    const moved = lot.sections.filter((s) => sectionIds.includes(s.id));
    lot.sections = lot.sections.filter((s) => !sectionIds.includes(s.id));
    lot.sourceTotal = undefined;
    p.lots.splice(i + 1, 0, { id: newId('lot'), code: '', name: newName, sections: moved });
    renumberLots(p.lots);
  });
}

export function journal(project: Project, action: string, detail?: string): Project {
  return mutate(project, action, detail, () => {});
}

export function replaceProject(project: Project, action: string, detail: string | undefined, fn: (p: Project) => void): Project {
  return mutate(project, action, detail, fn);
}
