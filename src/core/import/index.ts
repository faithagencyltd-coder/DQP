// Point d'entrée de l'import (§3) : identifie le format RÉEL du fichier (signature,
// pas seulement l'extension) et l'oriente vers le moteur adapté.

import { newId, nowIso } from '../format';
import { analyzePlan } from '../pdf/detect';
import { extractPdf, type PdfJsLib } from '../pdf/extract';
import { ENGINE_VERSION, replaceProject } from '../project';
import type { AnalysisResult, BuildingElement, Project, SourceFile } from '../types';
import { parseDqeGrid, type ImportResult } from './dqe-parser';
import { readWorkbook } from './excel';
import { parseCsv } from './grid';

export type FormatSupport = 'supported' | 'planned' | 'unsupported';

export interface FormatInfo {
  kind: SourceFile['kind'];
  label: string;
  support: FormatSupport;
  phase?: string;
  explanation: string;
}

/** Ce que DQP sait réellement faire de chaque format aujourd'hui (§44 : ne rien promettre). */
export const FORMATS: { ext: string[]; info: FormatInfo }[] = [
  { ext: ['xlsx', 'xlsm'], info: { kind: 'excel', label: 'Excel', support: 'supported', explanation: 'Lecture des valeurs, des formules et des valeurs calculées.' } },
  { ext: ['csv', 'txt'], info: { kind: 'csv', label: 'CSV', support: 'supported', explanation: 'Séparateur « ; » ou « , » détecté automatiquement, décimales à virgule acceptées.' } },
  { ext: ['xls'], info: { kind: 'excel', label: 'Excel 97-2003', support: 'unsupported', explanation: 'Ancien format binaire non lu par le moteur actuel. Ouvrez le fichier dans Excel et enregistrez-le en .xlsx.' } },
  { ext: ['pdf'], info: { kind: 'pdf', label: 'PDF (plans)', support: 'supported', explanation: 'Plans vectoriels : texte lu avec sa position (pièces, surfaces, niveaux, échelle, cartouche, équipements et menuiseries annotés, cotes). Les pages scannées sont signalées ; leur lecture (OCR) est prévue.' } },
  { ext: ['dxf'], info: { kind: 'dxf', label: 'DXF', support: 'planned', phase: 'Phase 4', explanation: 'Format CAO ouvert : lecture prévue en phase 4.' } },
  { ext: ['dwg'], info: { kind: 'dwg', label: 'DWG', support: 'planned', phase: 'Phase 4', explanation: 'Format propriétaire : nécessite une bibliothèque sous licence (ODA). Étude technique et juridique en phase 4.' } },
  { ext: ['ifc'], info: { kind: 'ifc', label: 'IFC', support: 'planned', phase: 'Phase 4', explanation: 'Format BIM ouvert : lecture prévue en phase 4.' } },
  { ext: ['rvt', 'rfa'], info: { kind: 'revit', label: 'Revit', support: 'planned', phase: 'Phase 4', explanation: 'Format propriétaire Autodesk : passage par un export IFC ou une API sous licence, à étudier en phase 4.' } },
  { ext: ['pln', 'pla'], info: { kind: 'archicad', label: 'Archicad', support: 'planned', phase: 'Phase 4', explanation: 'Format propriétaire Graphisoft : passage par un export IFC, à étudier en phase 4.' } },
];

export function formatOf(fileName: string): FormatInfo {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return FORMATS.find((f) => f.ext.includes(ext))?.info ?? {
    kind: 'other',
    label: ext.toUpperCase() || 'Inconnu',
    support: 'unsupported',
    explanation: 'Format non reconnu par DQP.',
  };
}

/** Vérifie la signature binaire : on ne se fie pas à l'extension seule. */
export function sniff(bytes: Uint8Array): 'zip' | 'ole' | 'pdf' | 'text' | 'unknown' {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'ole';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  const sample = bytes.subarray(0, 512);
  if (sample.length > 0 && sample.every((b) => b === 9 || b === 10 || b === 13 || b >= 32)) return 'text';
  return 'unknown';
}

export class ImportError extends Error {}

export async function analyzeFile(name: string, bytes: Uint8Array): Promise<{ file: SourceFile; result: ImportResult }> {
  const fmt = formatOf(name);
  const file: SourceFile = { id: newId('f'), name, kind: fmt.kind, size: bytes.byteLength, importedAt: nowIso() };
  if (fmt.support !== 'supported') {
    throw new ImportError(`${fmt.label} : ${fmt.explanation}`);
  }
  const sig = sniff(bytes);
  if (fmt.kind === 'pdf') {
    throw new ImportError('Les PDF sont analysés par analyzePlanFile.');
  }
  if (fmt.kind === 'excel') {
    if (sig !== 'zip') {
      throw new ImportError(
        sig === 'ole'
          ? 'Ce fichier porte l’extension .xlsx mais est en réalité au format Excel 97-2003 (.xls). Enregistrez-le en .xlsx.'
          : 'Ce fichier porte l’extension .xlsx mais son contenu n’est pas un classeur Excel valide.',
      );
    }
    const grids = await readWorkbook(bytes);
    const results = grids.map((g) => parseDqeGrid(g, file)).filter((r) => r.analysis.stats.lines > 0);
    if (results.length === 0) {
      throw new ImportError('Aucun tableau de DQE reconnu dans ce classeur (colonnes attendues : Désignation, Unité, Quantité, Prix unitaire, Montant).');
    }
    return { file, result: mergeResults(results) };
  }
  if (fmt.kind === 'csv') {
    if (sig !== 'text') throw new ImportError('Ce fichier n’est pas un fichier texte CSV.');
    const text = decodeText(bytes);
    const result = parseDqeGrid(parseCsv(text, name), file);
    if (result.analysis.stats.lines === 0) {
      throw new ImportError('Aucune ligne de DQE reconnue dans ce CSV (en-tête attendu : Désignation;Unité;Quantité;Prix unitaire;Montant).');
    }
    return { file, result };
  }
  throw new ImportError('Format non pris en charge.');
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function mergeResults(results: ImportResult[]): ImportResult {
  if (results.length === 1) return results[0];
  const [first, ...rest] = results;
  const analysis: AnalysisResult = {
    ...first.analysis,
    detected: results.flatMap((r) => r.analysis.detected),
    fileAlerts: results.flatMap((r) => r.analysis.fileAlerts),
    stats: results.reduce(
      (s, r) => ({
        lots: s.lots + r.analysis.stats.lots,
        sections: s.sections + r.analysis.stats.sections,
        lines: s.lines + r.analysis.stats.lines,
        formulas: s.formulas + r.analysis.stats.formulas,
        brokenFormulas: s.brokenFormulas + r.analysis.stats.brokenFormulas,
      }),
      { lots: 0, sections: 0, lines: 0, formulas: 0, brokenFormulas: 0 },
    ),
    sourceGrandTotal: first.analysis.sourceGrandTotal ?? rest.find((r) => r.analysis.sourceGrandTotal)?.analysis.sourceGrandTotal,
  };
  return { lots: results.flatMap((r) => r.lots), analysis };
}

/** Ajoute le résultat d'un import au projet (fichier, lots, analyse) et pré-remplit les infos vides. */
export function applyImport(project: Project, file: SourceFile, result: ImportResult, mode: 'append' | 'replace'): Project {
  return replaceProject(project, 'Fichier importé', `${file.name} — ${result.analysis.stats.lines} lignes, ${result.lots.length} lots`, (p) => {
    p.sourceFiles.push(file);
    p.analyses.push(result.analysis);
    p.lots = mode === 'replace' ? result.lots : [...p.lots, ...result.lots];
    p.lots.forEach((lot, i) => (lot.code = `LOT ${String(i + 1).padStart(2, '0')}`));
    const get = (k: string) => result.analysis.detected.find((d) => d.key === k);
    if (!p.info.location && get('location')) p.info.location = get('location')!.value;
    if (!p.info.date && get('date')) p.info.date = get('date')!.value;
    if (!p.info.phase && get('phase')) p.info.phase = get('phase')!.value;
    const type = get('projectType');
    if (!p.info.projectType && type) {
      p.info.projectType = type.value.split(' / ')[0];
      p.info.projectTypeStatus = 'to_verify';
    }
  });
}

// ---------- Plans PDF (phase 2) ----------

export interface PlanImport {
  analysis: AnalysisResult;
  elements: BuildingElement[];
}

export async function analyzePlanFile(name: string, bytes: Uint8Array, pdfjs: PdfJsLib): Promise<{ file: SourceFile; plan: PlanImport }> {
  const file: SourceFile = { id: newId('f'), name, kind: 'pdf', size: bytes.byteLength, importedAt: nowIso() };
  if (sniff(bytes) !== 'pdf') throw new ImportError('Ce fichier porte l’extension .pdf mais son contenu n’est pas un document PDF.');
  let raw;
  try {
    raw = await extractPdf(bytes, pdfjs);
  } catch (e) {
    const msg = (e as Error).message ?? '';
    throw new ImportError(/password/i.test(msg) ? 'PDF protégé par un mot de passe : ouvrez-le et enregistrez une copie sans protection.' : `PDF illisible : ${msg}`);
  }
  const res = analyzePlan(raw, file);
  const analysis: AnalysisResult = {
    id: newId('an'),
    fileId: file.id,
    fileName: name,
    analyzedAt: nowIso(),
    engineVersion: ENGINE_VERSION,
    detected: res.detected,
    fileAlerts: res.alerts,
    stats: { lots: 0, sections: 0, lines: 0, formulas: 0, brokenFormulas: 0, pages: res.pages.length, elements: res.elements.length },
    pages: res.pages,
  };
  return { file, plan: { analysis, elements: res.elements } };
}

export function applyPlanImport(project: Project, file: SourceFile, plan: PlanImport): Project {
  const rooms = plan.elements.filter((e) => e.kind === 'room').length;
  return replaceProject(project, 'Plan importé', `${file.name} — ${plan.analysis.stats.pages} page(s), ${rooms} pièce(s), ${plan.elements.length} élément(s)`, (p) => {
    p.sourceFiles.push(file);
    p.analyses.push(plan.analysis);
    p.elements.push(...plan.elements);
    const get = (k: string) => plan.analysis.detected.find((d) => d.key === k);
    if (!p.info.client && get('client')) p.info.client = get('client')!.value;
    if (!p.info.location && get('location')) p.info.location = get('location')!.value;
    if (!p.info.date && get('date')) p.info.date = get('date')!.value;
  });
}
