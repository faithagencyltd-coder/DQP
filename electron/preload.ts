// Pont sécurisé entre l'interface et le processus principal (aucun accès Node direct).

import { contextBridge, ipcRenderer } from 'electron';
import type { DqpApi, MenuCommand } from '../src/shared/api';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

const api: DqpApi = {
  platform: 'electron',
  appVersion: process.env.DQP_VERSION ?? '0.1.0',
  getSettings: () => invoke('settings:get'),
  setSettings: (patch) => invoke('settings:set', patch),
  chooseFolder: () => invoke('dialog:folder'),
  listProjects: () => invoke('projects:list'),
  createProject: (project) => invoke('project:create', project),
  openProject: (folder) => invoke('project:open', folder),
  saveProject: (folder, project) => invoke('project:save', folder, project),
  trashProject: (folder) => invoke('project:trash', folder),
  listVersions: (folder) => invoke('versions:list', folder),
  createVersion: (folder, project, label) => invoke('versions:create', folder, project, label),
  readVersion: (folder, id) => invoke('versions:read', folder, id),
  pickFiles: (filters, multiple) => invoke('files:pick', filters, multiple),
  storeSourceFile: (folder, name, bytes) => invoke('files:store-source', folder, name, bytes),
  readProjectFile: (folder, p) => invoke('files:read', folder, p),
  writeProjectFile: (folder, subdir, name, bytes) => invoke('files:write', folder, subdir, name, bytes),
  htmlToPdf: (folder, subdir, name, html) => invoke('pdf:from-html', folder, subdir, name, html),
  saveAs: (name, bytes) => invoke('files:save-as', name, bytes),
  openPath: (p) => invoke('shell:open', p),
  showInFolder: (p) => invoke('shell:show', p),
  loadPrices: () => invoke('prices:load'),
  savePrices: (items) => invoke('prices:save', items),
  onMenu: (handler) => {
    const listener = (_: unknown, cmd: MenuCommand) => handler(cmd);
    ipcRenderer.on('dqp:menu', listener);
    return () => ipcRenderer.removeListener('dqp:menu', listener);
  },
};

contextBridge.exposeInMainWorld('dqp', api);
