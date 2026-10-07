// Contrat entre l'interface (renderer) et le processus principal Electron.

import type { PriceItem, Project, ProjectSummary, ProjectVersion } from '../core/types';

export interface PickedFile {
  name: string;
  path?: string;
  bytes: Uint8Array;
}

export interface AppSettings {
  projectsRoot: string;
  company: string;
  defaultVatRate: number;
}

export interface OpenedProject {
  project: Project;
  folder: string;
  /** Message si le projet a été récupéré depuis la sauvegarde de secours. */
  recovered?: string;
}

export type MenuCommand =
  | { type: 'navigate'; view: string }
  | { type: 'new-project' }
  | { type: 'open-project' }
  | { type: 'import' }
  | { type: 'save-version' }
  | { type: 'export'; format: 'xlsx' | 'pdf-dqe' | 'pdf-report' }
  | { type: 'undo' }
  | { type: 'redo' };

export interface DqpApi {
  platform: 'electron' | 'browser';
  appVersion: string;
  getSettings(): Promise<AppSettings>;
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  chooseFolder(): Promise<string | null>;

  listProjects(): Promise<ProjectSummary[]>;
  createProject(project: Project): Promise<OpenedProject>;
  openProject(folder: string): Promise<OpenedProject>;
  saveProject(folder: string, project: Project): Promise<{ savedAt: string }>;
  trashProject(folder: string): Promise<void>;

  listVersions(folder: string): Promise<ProjectVersion[]>;
  createVersion(folder: string, project: Project, label: string): Promise<ProjectVersion>;
  readVersion(folder: string, versionId: string): Promise<Project>;

  pickFiles(filters: { name: string; extensions: string[] }[], multiple: boolean): Promise<PickedFile[]>;
  storeSourceFile(folder: string, name: string, bytes: Uint8Array): Promise<string>;
  /** Écrit un fichier dans un sous-dossier du projet (Exports, Analyse, DQE…). */
  writeProjectFile(folder: string, subdir: string, name: string, bytes: Uint8Array): Promise<string>;
  htmlToPdf(folder: string, subdir: string, name: string, html: string): Promise<string>;
  saveAs(defaultName: string, bytes: Uint8Array): Promise<string | null>;
  openPath(path: string): Promise<void>;
  showInFolder(path: string): Promise<void>;

  loadPrices(): Promise<PriceItem[]>;
  savePrices(items: PriceItem[]): Promise<void>;

  onMenu(handler: (cmd: MenuCommand) => void): () => void;
}

declare global {
  interface Window {
    dqp?: DqpApi;
  }
}
