// Moteur de métré sur plans (§9, §10, §37). Fonctions pures et déterministes :
// longueur, surface, mur (longueur × hauteur − ouvertures), comptage, avec chaque
// étape écrite. Sans échelle ou sans hauteur, la valeur est « non déterminée ».

import { formatNumber, newId, nowIso } from '../format';
import { findLine } from '../dqe';
import { replaceProject } from '../project';
import type { Confidence, Deduction, MeasureKind, Measurement, PlanScale, Project } from '../types';

/** Un point PDF vaut 25,4 / 72 mm sur le papier. */
export const MM_PER_PT_PAPER = 25.4 / 72;

export const MEASURE_UNIT: Record<MeasureKind, string> = { length: 'ml', area: 'm²', wall: 'm²', count: 'u' };
export const MEASURE_LABEL: Record<MeasureKind, string> = { length: 'Longueur', area: 'Surface', wall: 'Mur', count: 'Comptage' };

export interface ScaleInfo {
  mmPerPt: number;
  status: Confidence;
  label: string;
}

/** Échelle d'une planche : étalonnée (🟢), sinon lue sur la planche (🟠), sinon aucune (🔴). */
export function scaleFor(p: Project, fileId: string, page: number): ScaleInfo | null {
  const s = p.scales.find((x) => x.fileId === fileId && x.page === page);
  if (s) {
    // Un étalonnage qui contredit l'échelle écrite reste à vérifier.
    const ok = s.source === 'calibrated' && !scaleConflict(p, fileId, page);
    return { mmPerPt: s.mmPerPt, status: ok ? 'confirmed' : 'to_verify', label: s.label };
  }
  const written = p.analyses.find((a) => a.fileId === fileId)?.pages?.find((x) => x.number === page)?.scale;
  if (written) {
    return {
      mmPerPt: MM_PER_PT_PAPER * written,
      status: 'to_verify',
      label: `1/${written} lue sur la planche (à confirmer par un étalonnage : le PDF a pu être redimensionné)`,
    };
  }
  return null;
}

/**
 * Écart entre l'échelle étalonnée et l'échelle écrite sur la planche (> 10 %) :
 * soit l'étalonnage est faux (mauvaise cote), soit le PDF a été redimensionné.
 */
export function scaleConflict(p: Project, fileId: string, page: number): { written: number; calibrated: number } | null {
  const s = p.scales.find((x) => x.fileId === fileId && x.page === page && x.source === 'calibrated');
  const written = p.analyses.find((a) => a.fileId === fileId)?.pages?.find((x) => x.number === page)?.scale;
  if (!s || !written) return null;
  const calibrated = s.mmPerPt / MM_PER_PT_PAPER;
  return Math.abs(calibrated - written) / written > 0.1 ? { written, calibrated: Math.round(calibrated) } : null;
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function polylineLength(points: [number, number][]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += dist(points[i - 1], points[i]);
  return l;
}

export function polygonArea(points: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export interface MeasureResult {
  value: number | null;
  unit: string;
  status: Confidence;
  steps: string[];
  /** Longueur réelle (m) pour les murs et longueurs. */
  length?: number;
}

const f2 = (n: number) => formatNumber(n, 2);

export function computeMeasure(p: Project, m: Measurement): MeasureResult {
  const unit = MEASURE_UNIT[m.kind];
  const steps: string[] = [];
  let status: Confidence = m.origin === 'proposal' && !m.accepted ? 'to_verify' : 'confirmed';

  if (m.kind === 'count') {
    steps.push(`Comptage sur le plan : ${m.points.length} élément(s) pointé(s)`);
    return { value: m.points.length, unit, status, steps };
  }
  const scale = scaleFor(p, m.fileId, m.page);
  if (!scale) {
    return { value: null, unit, status: 'undetermined', steps: ['Échelle de la planche non déterminée : étalonnez la planche sur une cote connue.'] };
  }
  if (scale.status !== 'confirmed') status = 'to_verify';
  const k = scale.mmPerPt / 1000; // mètres réels par point
  steps.push(`Échelle : ${scale.label}`);

  if (m.kind === 'area') {
    const a = polygonArea(m.points) * k * k;
    steps.push(`Surface du contour (${m.points.length} sommets) = ${f2(a)} m²`);
    return { value: a, unit, status, steps };
  }

  const lines = m.parts ?? [m.points];
  const segs = lines.flatMap((pts) => pts.slice(1).map((pt, i) => dist(pts[i], pt) * k));
  const L = segs.reduce((s, x) => s + x, 0);
  if (segs.length > 1 && segs.length <= 8) steps.push(`Longueur = ${segs.map(f2).join(' + ')} = ${f2(L)} m`);
  else steps.push(`Longueur mesurée = ${f2(L)} m${segs.length > 8 ? ` (${segs.length} tronçons)` : ''}`);
  if (m.kind === 'length') return { value: L, unit, status, steps, length: L };

  // Mur : longueur × hauteur − ouvertures.
  if (m.height == null || !(m.height > 0)) {
    steps.push('Hauteur du mur non renseignée : surface non déterminée.');
    return { value: null, unit, status: 'undetermined', steps, length: L };
  }
  const brute = L * m.height;
  steps.push(`Surface brute = ${f2(L)} × ${f2(m.height)} = ${f2(brute)} m²`);
  const ded = m.deductions.reduce((s, d) => s + d.width * d.height * d.count, 0);
  if (m.deductions.length) {
    steps.push(`Ouvertures déduites = ${m.deductions.map((d) => `${d.count} × ${f2(d.width)} × ${f2(d.height)}`).join(' + ')} = ${f2(ded)} m²`);
  }
  const net = Math.max(0, brute - ded);
  steps.push(`Surface nette = ${f2(brute)} − ${f2(ded)} = ${f2(net)} m²`);
  return { value: net, unit, status, steps, length: L };
}

export function measureById(p: Project, id: string): Measurement | undefined {
  return p.measurements.find((m) => m.id === id);
}

/** Unités compatibles entre une mesure et une ligne de DQE. */
export function unitsCompatible(measureUnit: string, lineUnit: string): boolean {
  const n = (u: string) => (u === 'm' ? 'ml' : u === 'ens' ? 'u' : u);
  return !lineUnit || n(measureUnit) === n(lineUnit);
}

// ---------------------------------------------------------------- opérations

export function setScale(project: Project, s: Omit<PlanScale, 'at'>): Project {
  return replaceProject(project, 'Échelle de planche définie', `${s.label} (page ${s.page})`, (p) => {
    p.scales = p.scales.filter((x) => !(x.fileId === s.fileId && x.page === s.page));
    p.scales.push({ ...s, at: nowIso() });
  });
}

/** Étalonnage : deux points du plan et la longueur réelle connue (en mètres). */
export function calibrate(project: Project, fileId: string, page: number, a: [number, number], b: [number, number], meters: number): Project {
  const d = dist(a, b);
  if (!(d > 0) || !(meters > 0)) return project;
  const mmPerPt = (meters * 1000) / d;
  const ratio = Math.round(mmPerPt / MM_PER_PT_PAPER);
  return setScale(project, { fileId, page, mmPerPt, source: 'calibrated', label: `étalonnée sur une cote de ${f2(meters)} m (≈ 1/${ratio})` });
}

export function addMeasurement(project: Project, m: Omit<Measurement, 'id' | 'createdAt'>): { project: Project; id: string } {
  const id = newId('m');
  const next = replaceProject(project, 'Mesure ajoutée', `${MEASURE_LABEL[m.kind]} « ${m.label} » — ${m.fileName} p.${m.page}`, (p) => {
    p.measurements.push({ ...m, id, createdAt: nowIso() });
  });
  return { project: next, id };
}

export function updateMeasurement(project: Project, id: string, patch: Partial<Pick<Measurement, 'label' | 'height' | 'deductions' | 'accepted' | 'note'>>): Project {
  const m = measureById(project, id);
  if (!m) return project;
  return replaceProject(project, 'Mesure modifiée', `« ${m.label} » — ${Object.keys(patch).join(', ')}`, (p) => {
    Object.assign(measureById(p, id)!, patch);
  });
}

export function deleteMeasurement(project: Project, id: string): Project {
  const m = measureById(project, id);
  if (!m) return project;
  const res = computeMeasure(project, m);
  return replaceProject(project, 'Mesure supprimée', m.label, (p) => {
    p.measurements = p.measurements.filter((x) => x.id !== id);
    // Les lignes liées gardent leur dernière valeur, marquée à vérifier.
    for (const lot of p.lots)
      for (const s of lot.sections)
        for (const l of s.lines)
          if (l.quantity.expression?.includes(`{M:${id}}`)) {
            delete l.quantity.expression;
            l.quantity.value = res.value;
            l.quantity.status = 'to_verify';
            l.quantity.note = `La mesure « ${m.label} » a été supprimée : quantité figée, à vérifier.`;
          }
  });
}

/** Utilise une mesure comme quantité d'une ligne de DQE (lien vivant, tracé). */
export function linkMeasureToLine(project: Project, lineId: string, measureId: string): Project {
  const f = findLine(project, lineId);
  const m = measureById(project, measureId);
  if (!f || !m) return project;
  const r = computeMeasure(project, m);
  return replaceProject(project, 'Quantité liée à une mesure', `${f.line.designation} ← ${MEASURE_LABEL[m.kind]} « ${m.label} » (${m.fileName} p.${m.page})`, (p) => {
    const l = findLine(p, lineId)!.line;
    l.edits.push({ field: 'quantity', before: l.quantity.value, after: r.value, at: nowIso() });
    l.quantity = {
      value: r.value,
      status: r.status,
      origin: 'calculated',
      expression: `{M:${measureId}}`,
      source: { fileId: m.fileId, fileName: m.fileName, page: m.page, text: m.label },
      note: `Quantité issue de la mesure « ${m.label} » sur ${m.fileName}, page ${m.page}`,
    };
  });
}

export function deductionFrom(label: string, widthCm: number | null, heightCm: number | null, elementId?: string): Deduction | null {
  if (widthCm == null || heightCm == null) return null;
  return { label, width: widthCm / 100, height: heightCm / 100, count: 1, elementId };
}
