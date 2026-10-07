// Croisement des informations entre fichiers (§27) : pour chaque grandeur comparable,
// DQP rassemble la valeur de chaque source. S'il y a une différence, il la signale et
// l'utilisateur décide. Une source qui ne dit rien vaut « non déterminé », jamais 0 (§36).

import { detectElements } from '../classify';
import type { ProjectResult } from '../dqe';
import { formatNumber, normalizeText, nowIso } from '../format';
import { replaceProject } from '../project';
import type { Project, Resolution } from '../types';
import { activeElements } from './ops';

export interface SourceValue {
  source: string;
  value: number | string | null;
  detail: string;
  /** Lignes de DQE concernées (pour appliquer un choix au DQE). */
  lineIds?: string[];
  elementIds?: string[];
}

export interface Comparison {
  key: string;
  subject: string;
  unit?: string;
  values: SourceValue[];
  /** Au moins deux sources déterminées et en désaccord. */
  differs: boolean;
  /** Comparaison indicative : grandeurs voisines mais pas strictement équivalentes. */
  indicative?: boolean;
  note?: string;
  resolution?: Resolution;
}

/** Catégorie d'élément de plan → élément reconnu dans le DQE (classify.ts). */
const EQUIVALENTS: [string, string, string][] = [
  ['WC', 'WC', 'WC'],
  ['Lavabo', 'Lavabos / vasques', 'Lavabos / vasques'],
  ['Douche', 'Douches', 'Douches'],
  ['Évier', 'Éviers', 'Éviers'],
  ['Baignoire', 'Baignoires', 'Baignoires'],
  ['Climatiseur', 'Climatiseurs', 'Climatiseurs'],
  ['Porte', 'Portes', 'Portes'],
  ['Fenêtre', 'Fenêtres / baies', 'Fenêtres'],
];

const COUNT_UNITS = new Set(['u', 'ens']);

export function crossCheck(project: Project, result: ProjectResult): Comparison[] {
  const out: Comparison[] = [];
  const els = activeElements(project);
  const files = project.sourceFiles.filter((f) => f.kind === 'pdf' && els.some((e) => e.source.fileId === f.id));
  const dqeElements = project.lots.length ? detectElements(project, result) : [];
  const hasDqe = project.lots.length > 0;

  // 1. Nombres d'équipements et de menuiseries.
  for (const [planCat, dqeEl, subject] of EQUIVALENTS) {
    const values: SourceValue[] = [];
    for (const f of files) {
      const mine = els.filter((e) => e.source.fileId === f.id && (e.kind === 'equipment' || e.kind === 'opening' || (e.kind === 'room' && (planCat === 'WC' || planCat === 'Douche'))) && e.category === planCat);
      values.push({
        source: f.name,
        value: mine.length || null,
        detail: mine.length ? `${mine.length} repère(s) lu(s) sur le plan : ${mine.map((e) => e.name).slice(0, 6).join(', ')}${mine.length > 6 ? '…' : ''}` : 'Aucun repère sur ce plan : non déterminé',
        elementIds: mine.map((e) => e.id),
      });
    }
    if (hasDqe) {
      const d = dqeElements.filter((e) => e.element === dqeEl && COUNT_UNITS.has(e.unit));
      const lines = d.flatMap((e) => e.lines);
      const known = lines.filter((l) => l.quantity !== null);
      values.push({
        source: 'DQE',
        value: known.length ? known.reduce((s, l) => s + (l.quantity ?? 0), 0) : null,
        detail: lines.length ? lines.map((l) => `${l.designation} : ${formatNumber(l.quantity)}`).join(' · ') : 'Aucune ligne correspondante dans le DQE : non déterminé',
        lineIds: lines.map((l) => l.id),
      });
    }
    // Il faut au moins deux sources qui disent quelque chose pour comparer.
    const determined = values.filter((v) => v.value !== null);
    if (determined.length < 2) continue;
    out.push({
      key: `count:${planCat}`,
      subject,
      unit: 'u',
      values,
      differs: new Set(determined.map((v) => v.value)).size > 1,
    });
  }

  // 2. Surfaces des pièces (indicatif) : somme des pièces du plan / carrelage de sol du DQE.
  const rooms = els.filter((e) => e.kind === 'room' && typeof e.props.surface?.value === 'number');
  if (rooms.length && hasDqe) {
    const roomSum = rooms.filter((r) => !/terrasse|balcon|véranda|cour/i.test(r.category)).reduce((s, r) => s + (r.props.surface.value as number), 0);
    const floor = project.lots.flatMap((l) => l.sections.flatMap((s) => s.lines)).filter((l) => l.unit === 'm²' && /carreaux? (de )?sol|carrelage (de )?sol|revetement de sol/.test(normalizeText(l.designation)));
    const floorSum = floor.reduce((s, l) => s + (result.lines.get(l.id)?.quantity ?? 0), 0);
    out.push({
      key: 'surface:rooms-floor',
      subject: 'Surface des pièces intérieures / carrelage de sol',
      unit: 'm²',
      indicative: true,
      differs: false,
      note: 'Comparaison indicative : le carrelage ne couvre pas forcément toutes les pièces, et le DQE peut couvrir plusieurs niveaux.',
      values: [
        { source: 'Plans', value: Math.round(roomSum * 100) / 100, detail: `${rooms.length} pièce(s) avec surface écrite (hors terrasses et balcons)` },
        { source: 'DQE', value: floor.length ? Math.round(floorSum * 100) / 100 : null, detail: floor.length ? floor.map((l) => l.designation).join(' · ') : 'Aucune ligne de carrelage de sol', lineIds: floor.map((l) => l.id) },
      ],
    });
  }

  // 3. Intitulé, localisation, maître d'ouvrage : entre tous les fichiers analysés.
  for (const key of ['title', 'location', 'client'] as const) {
    const values: SourceValue[] = [];
    for (const a of project.analyses) {
      const d = a.detected.filter((x) => x.key === key);
      for (const x of d) values.push({ source: a.fileName, value: x.value, detail: x.source?.cell ? `cellule ${x.source.cell}` : x.source?.page ? `page ${x.source.page}` : '' });
    }
    if (values.length < 2) continue;
    const n = values.map((v) => normalizeText(String(v.value)).replace(/^projet de construction d (une?|un) /, ''));
    // Deux valeurs compatibles si l'une contient l'autre (« ABOMEY-CALAVI » ⊂ « ZOPAH COMMUNE D'ABOMEY-CALAVI »).
    const differs = n.some((a, i) => n.some((b, j) => j > i && !a.includes(b) && !b.includes(a)));
    if (!differs) continue;
    out.push({ key: `info:${key}`, subject: key === 'title' ? 'Intitulé du projet' : key === 'location' ? 'Localisation' : 'Maître d’ouvrage', values, differs: true });
  }

  for (const c of out) c.resolution = project.resolutions.find((r) => r.key === c.key);
  return out;
}

export function resolve(project: Project, comparison: Comparison, chosen: SourceValue): Project {
  if (chosen.value === null) return project;
  return replaceProject(project, 'Différence arbitrée', `${comparison.subject} : « ${chosen.source} » retenu (${chosen.value})`, (p) => {
    p.resolutions = p.resolutions.filter((r) => r.key !== comparison.key);
    p.resolutions.push({ key: comparison.key, chosen: chosen.source, value: chosen.value!, at: nowIso() });
  });
}

export function unresolve(project: Project, key: string): Project {
  return replaceProject(project, 'Arbitrage annulé', key, (p) => {
    p.resolutions = p.resolutions.filter((r) => r.key !== key);
  });
}
