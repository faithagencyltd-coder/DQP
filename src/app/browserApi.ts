// Mode navigateur (développement et démonstration) : même contrat que l'application
// de bureau, stockage dans le navigateur et téléchargements à la place du disque.

import { computeProject } from '../core/dqe';
import type { PriceItem, Project, ProjectSummary, ProjectVersion } from '../core/types';
import type { AppSettings, DqpApi, PickedFile } from '../shared/api';

const K = {
  settings: 'dqp.settings',
  prices: 'dqp.prices',
  project: (id: string) => `dqp.project.${id}`,
  versions: (id: string) => `dqp.versions.${id}`,
};

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new Error(`Stockage du navigateur indisponible ou plein : ${(e as Error).message}`);
  }
}

function download(name: string, bytes: Uint8Array | string, type = 'application/octet-stream') {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const idOf = (folder: string) => folder.replace(/^navigateur:/, '');

export const browserApi: DqpApi = {
  platform: 'browser',
  appVersion: import.meta.env.VITE_DQP_VERSION ?? '0.1.0',
  async getSettings() {
    return read<AppSettings>(K.settings, { projectsRoot: 'Stockage du navigateur', company: '', defaultVatRate: 0 });
  },
  async setSettings(patch) {
    const next = { ...(await this.getSettings()), ...patch };
    write(K.settings, next);
    return next;
  },
  async chooseFolder() {
    return null;
  },
  async listProjects() {
    const out: ProjectSummary[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith('dqp.project.')) continue;
      const p = read<Project | null>(key, null);
      if (!p) continue;
      out.push({
        id: p.id,
        name: p.info.name,
        folder: `navigateur:${p.id}`,
        updatedAt: p.updatedAt,
        total: computeProject(p).totalHT,
        lines: p.lots.reduce((s, l) => s + l.sections.reduce((t, x) => t + x.lines.length, 0), 0),
      });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async createProject(project) {
    write(K.project(project.id), project);
    return { project, folder: `navigateur:${project.id}` };
  },
  async openProject(folder) {
    const p = read<Project | null>(K.project(idOf(folder)), null);
    if (!p) throw new Error('Projet introuvable');
    return { project: p, folder };
  },
  async saveProject(folder, project) {
    write(K.project(idOf(folder)), project);
    return { savedAt: new Date().toISOString() };
  },
  async trashProject(folder) {
    localStorage.removeItem(K.project(idOf(folder)));
    localStorage.removeItem(K.versions(idOf(folder)));
  },
  async listVersions(folder) {
    return read<(ProjectVersion & { project: Project })[]>(K.versions(idOf(folder)), []).map(({ project: _p, ...v }) => v);
  },
  async createVersion(folder, project, label) {
    const list = read<(ProjectVersion & { project: Project })[]>(K.versions(idOf(folder)), []);
    const createdAt = new Date().toISOString();
    const v = { id: createdAt.replace(/[:.]/g, '-'), label, createdAt, file: '', project };
    write(K.versions(idOf(folder)), [v, ...list].slice(0, 30));
    const { project: _p, ...meta } = v;
    return meta;
  },
  async readVersion(folder, id) {
    const v = read<(ProjectVersion & { project: Project })[]>(K.versions(idOf(folder)), []).find((x) => x.id === id);
    if (!v) throw new Error('Version introuvable');
    return v.project;
  },
  pickFiles(filters, multiple) {
    return new Promise<PickedFile[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = multiple;
      input.accept = filters.flatMap((f) => f.extensions.map((e) => '.' + e)).join(',');
      input.onchange = async () => {
        const files = [...(input.files ?? [])];
        resolve(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
      };
      input.click();
    });
  },
  async storeSourceFile(_folder, name) {
    return `(navigateur) ${name}`;
  },
  async writeProjectFile(_folder, _subdir, name, bytes) {
    download(name, bytes);
    return `Téléchargements/${name}`;
  },
  async htmlToPdf(_folder, _subdir, name, html) {
    const w = window.open('', '_blank');
    if (!w) {
      download(name.replace(/\.pdf$/, '.html'), html, 'text/html');
      return `Téléchargements/${name.replace(/\.pdf$/, '.html')}`;
    }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
    return 'Impression du navigateur (Enregistrer en PDF)';
  },
  async saveAs(name, bytes) {
    download(name, bytes);
    return name;
  },
  async openPath() {},
  async showInFolder() {},
  async loadPrices() {
    return read<PriceItem[]>(K.prices, []);
  },
  async savePrices(items) {
    write(K.prices, items);
  },
  onMenu() {
    return () => {};
  },
};

export const api: DqpApi = typeof window !== 'undefined' && window.dqp ? window.dqp : browserApi;
