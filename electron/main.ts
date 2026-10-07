// Processus principal Electron : fenêtre, menus de bureau, accès disque et PDF.

import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppSettings, MenuCommand } from '../src/shared/api';
import type { PriceItem, Project } from '../src/core/types';
import * as storage from './storage';

const isDev = !!process.env.DQP_DEV_URL;
let win: BrowserWindow | null = null;

// ---------- Paramètres de l'application ----------

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const pricesFile = () => path.join(app.getPath('userData'), 'prices.json');

async function getSettings(): Promise<AppSettings> {
  const defaults: AppSettings = {
    projectsRoot: path.join(app.getPath('documents'), 'DQP Projets'),
    company: '',
    defaultVatRate: 0,
  };
  try {
    return { ...defaults, ...JSON.parse(await fs.readFile(settingsFile(), 'utf8')) };
  } catch {
    return defaults;
  }
}

async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await getSettings()), ...patch };
  await storage.writeAtomic(settingsFile(), JSON.stringify(next, null, 1));
  return next;
}

// ---------- Fenêtre ----------

function send(cmd: MenuCommand) {
  win?.webContents.send('dqp:menu', cmd);
}

function buildMenu() {
  const nav = (label: string, view: string, accelerator?: string): MenuItemConstructorOptions => ({ label, accelerator, click: () => send({ type: 'navigate', view }) });
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Nouveau projet…', accelerator: 'CmdOrCtrl+N', click: () => send({ type: 'new-project' }) },
        { label: 'Ouvrir un projet…', accelerator: 'CmdOrCtrl+O', click: () => send({ type: 'open-project' }) },
        { label: 'Créer une version', accelerator: 'CmdOrCtrl+S', click: () => send({ type: 'save-version' }) },
        { type: 'separator' },
        { label: 'Exporter le DQE (Excel)', accelerator: 'CmdOrCtrl+E', click: () => send({ type: 'export', format: 'xlsx' }) },
        { label: 'Exporter le DQE (PDF)', click: () => send({ type: 'export', format: 'pdf-dqe' }) },
        { label: 'Exporter le rapport d’analyse (PDF)', click: () => send({ type: 'export', format: 'pdf-report' }) },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { label: 'Annuler', accelerator: 'CmdOrCtrl+Z', click: () => send({ type: 'undo' }) },
        { label: 'Rétablir', accelerator: 'CmdOrCtrl+Y', click: () => send({ type: 'redo' }) },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    { label: 'Projet', submenu: [nav('Tableau de bord', 'dashboard'), nav('Projets', 'projects'), nav('Informations du projet', 'project')] },
    { label: 'Importer', submenu: [{ label: 'Importer un fichier…', accelerator: 'CmdOrCtrl+I', click: () => send({ type: 'import' }) }, nav('Formats pris en charge', 'import')] },
    { label: 'Analyse', submenu: [nav('Résultats de l’analyse', 'analysis', 'F5')] },
    { label: 'Métré', submenu: [nav('Métré', 'metre')] },
    { label: 'DQE', submenu: [nav('Éditer le DQE', 'dqe', 'F6'), nav('Estimation', 'estimate', 'F7'), nav('Bibliothèque de prix', 'prices', 'F8')] },
    { label: 'Documents', submenu: [nav('Documents et exports', 'documents', 'F9')] },
    { label: 'Converter', submenu: [nav('DQP Converter', 'converter')] },
    { label: 'AI', submenu: [nav('DQP AI', 'ai')] },
    {
      label: 'Paramètres',
      submenu: [
        nav('Paramètres', 'settings'),
        { type: 'separator' },
        { role: 'reload', label: 'Recharger' },
        { role: 'toggleDevTools', label: 'Outils de développement', visible: isDev },
        { role: 'togglefullscreen', label: 'Plein écran' },
        { role: 'resetZoom', label: 'Zoom 100 %' },
        { role: 'zoomIn', label: 'Zoom +' },
        { role: 'zoomOut', label: 'Zoom −' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: 'DQP',
    backgroundColor: '#f3f5f8',
    show: false,
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => {
    win?.maximize();
    win?.show();
  });
  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'application.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env.DQP_DEV_URL ?? 'file:')) e.preventDefault();
  });
  if (isDev) await win.loadURL(process.env.DQP_DEV_URL!);
  else await win.loadFile(path.join(__dirname, '../dist/index.html'));
}

// ---------- IPC ----------

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R) {
  ipcMain.handle(channel, async (_e, ...args) => fn(...(args as A)));
}

const toBytes = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength);

function registerIpc() {
  handle('settings:get', getSettings);
  handle('settings:set', setSettings);
  handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  handle('projects:list', async () => storage.listProjects((await getSettings()).projectsRoot));
  handle('project:create', async (project: Project) => {
    const folder = await storage.createProjectFolder((await getSettings()).projectsRoot, project);
    return { project, folder };
  });
  handle('project:open', async (folder: string) => ({ ...(await storage.loadProjectFile(folder)), folder }));
  handle('project:save', async (folder: string, project: Project) => {
    await storage.saveProjectFile(folder, project);
    return { savedAt: new Date().toISOString() };
  });
  handle('project:trash', async (folder: string) => shell.trashItem(folder));
  handle('versions:list', (folder: string) => storage.listVersions(folder));
  handle('versions:create', (folder: string, project: Project, label: string) => storage.createVersion(folder, project, label));
  handle('versions:read', (folder: string, id: string) => storage.readVersion(folder, id));

  handle('files:pick', async (filters: { name: string; extensions: string[] }[], multiple: boolean) => {
    const r = await dialog.showOpenDialog(win!, { properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'], filters });
    if (r.canceled) return [];
    return Promise.all(r.filePaths.map(async (p) => ({ name: path.basename(p), path: p, bytes: new Uint8Array(await fs.readFile(p)) })));
  });
  handle('files:store-source', (folder: string, name: string, bytes: Uint8Array) => storage.writeInProject(folder, 'Fichiers_sources', name, toBytes(bytes)));
  handle('files:write', (folder: string, subdir: string, name: string, bytes: Uint8Array) => storage.writeInProject(folder, subdir, name, toBytes(bytes)));
  handle('files:save-as', async (defaultName: string, bytes: Uint8Array) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: defaultName });
    if (r.canceled || !r.filePath) return null;
    await storage.writeAtomic(r.filePath, toBytes(bytes));
    return r.filePath;
  });
  handle('pdf:from-html', async (folder: string, subdir: string, name: string, html: string) => {
    const tmp = path.join(os.tmpdir(), `dqp-${Date.now()}.html`);
    await fs.writeFile(tmp, html, 'utf8');
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
      await pdfWin.loadFile(tmp);
      const pdf = await pdfWin.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
      return await storage.writeInProject(folder, subdir, name, pdf);
    } finally {
      pdfWin.destroy();
      await fs.unlink(tmp).catch(() => {});
    }
  });
  handle('shell:open', async (p: string) => {
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
  });
  handle('shell:show', (p: string) => shell.showItemInFolder(p));

  handle('prices:load', async (): Promise<PriceItem[]> => {
    try {
      return JSON.parse(await fs.readFile(pricesFile(), 'utf8'));
    } catch {
      return [];
    }
  });
  handle('prices:save', async (items: PriceItem[]) => {
    if (await fs.access(pricesFile()).then(() => true, () => false)) await fs.copyFile(pricesFile(), pricesFile() + '.bak');
    await storage.writeAtomic(pricesFile(), JSON.stringify(items, null, 1));
  });
}

app.setAppUserModelId('com.faithagency.dqp');
const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  app.whenReady().then(async () => {
    registerIpc();
    buildMenu();
    await createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
