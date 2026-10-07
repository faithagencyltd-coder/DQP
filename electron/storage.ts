// Stockage local des projets (§33, §40) : un dossier par projet, écriture atomique,
// copie de secours (.bak), versions horodatées et journal.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { computeProject } from '../src/core/dqe';
import { migrateProject } from '../src/core/migrate';
import { progressSummary, projectSteps } from '../src/core/progress';
import type { Project, ProjectSummary, ProjectVersion } from '../src/core/types';

export const PROJECT_SUBFOLDERS = [
  'Fichiers_sources',
  'Analyse',
  'Metre',
  'Quantites',
  'DQE',
  'Estimation',
  'Plans',
  'Documents',
  'Exports',
];

const META = '.dqp';
const FILE = 'project.json';

export function safeName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 _-]+/g, ' ')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 60) || 'Projet'
  );
}

export async function writeAtomic(file: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

export async function createProjectFolder(root: string, project: Project): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  const base = `Projet_${safeName(project.info.name)}`;
  let folder = path.join(root, base);
  for (let i = 2; await exists(folder); i++) folder = path.join(root, `${base}_${i}`);
  await fs.mkdir(folder, { recursive: true });
  for (const sub of PROJECT_SUBFOLDERS) await fs.mkdir(path.join(folder, sub), { recursive: true });
  await fs.mkdir(path.join(folder, META, 'versions'), { recursive: true });
  await saveProjectFile(folder, project);
  return folder;
}

export async function saveProjectFile(folder: string, project: Project): Promise<void> {
  const file = path.join(folder, META, FILE);
  // La version précédente devient la copie de secours avant d'être remplacée.
  if (await exists(file)) await fs.copyFile(file, file + '.bak');
  await writeAtomic(file, JSON.stringify(project, null, 1));
}

export async function loadProjectFile(folder: string): Promise<{ project: Project; recovered?: string }> {
  const file = path.join(folder, META, FILE);
  try {
    return { project: validate(JSON.parse(await fs.readFile(file, 'utf8'))) };
  } catch (e) {
    const bak = await fs.readFile(file + '.bak', 'utf8').catch(() => null);
    if (bak) {
      const project = validate(JSON.parse(bak));
      return { project, recovered: `Le fichier du projet était illisible (${(e as Error).message}). DQP a restauré la dernière sauvegarde de secours.` };
    }
    throw new Error(`Projet illisible : ${(e as Error).message}`);
  }
}

function validate(p: unknown): Project {
  return migrateProject(p);
}

export async function listProjects(root: string): Promise<ProjectSummary[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const out: ProjectSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const folder = path.join(root, e.name);
    try {
      const { project } = await loadProjectFile(folder);
      const lines = project.lots.reduce((s, l) => s + l.sections.reduce((t, x) => t + x.lines.length, 0), 0);
      const r = computeProject(project);
      out.push({
        id: project.id, name: project.info.name, folder, updatedAt: project.updatedAt, total: r.totalHT, lines,
        progress: progressSummary(projectSteps(project, r)), projectType: project.info.projectType, location: project.info.location, files: project.sourceFiles.length,
      });
    } catch {
      // Dossier sans projet DQP : ignoré.
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createVersion(folder: string, project: Project, label: string): Promise<ProjectVersion> {
  const createdAt = new Date().toISOString();
  const id = createdAt.replace(/[:.]/g, '-');
  const file = path.join(folder, META, 'versions', `${id}.json`);
  await writeAtomic(file, JSON.stringify({ label, createdAt, project }));
  return { id, label, createdAt, file };
}

export async function listVersions(folder: string): Promise<ProjectVersion[]> {
  const dir = path.join(folder, META, 'versions');
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  const out: ProjectVersion[] = [];
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
      out.push({ id: f.replace(/\.json$/, ''), label: data.label, createdAt: data.createdAt, file: path.join(dir, f) });
    } catch {
      // version corrompue ignorée
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readVersion(folder: string, id: string): Promise<Project> {
  if (!/^[\w-]+$/.test(id)) throw new Error('Version invalide');
  const data = JSON.parse(await fs.readFile(path.join(folder, META, 'versions', `${id}.json`), 'utf8'));
  return validate(data.project);
}

/** Écrit dans un sous-dossier du projet en refusant toute sortie du dossier. */
export async function writeInProject(folder: string, subdir: string, name: string, bytes: Uint8Array | string): Promise<string> {
  if (!PROJECT_SUBFOLDERS.includes(subdir)) throw new Error(`Sous-dossier inconnu : ${subdir}`);
  const clean = path.basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  const target = path.join(folder, subdir, clean);
  let final = target;
  const ext = path.extname(clean);
  const stem = clean.slice(0, clean.length - ext.length);
  for (let i = 2; subdir === 'Fichiers_sources' && (await exists(final)); i++) final = path.join(folder, subdir, `${stem}_${i}${ext}`);
  await writeAtomic(final, bytes);
  return final;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Lit un fichier du dossier projet ; tout chemin qui sort du dossier est refusé. */
export async function readInProject(folder: string, file: string): Promise<Uint8Array> {
  const root = path.resolve(folder) + path.sep;
  const target = path.resolve(file);
  if (!target.startsWith(root)) throw new Error('Accès refusé : fichier hors du dossier du projet');
  return new Uint8Array(await fs.readFile(target));
}
