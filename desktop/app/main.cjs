// PLANORA BTP — logiciel installé (Windows). Une seule fenêtre affiche l'application autonome
// (index.html : application + base PostgreSQL embarquée). Les données restent sur l'ordinateur,
// dans le dossier de l'application de l'utilisateur ; aucune connexion Internet n'est nécessaire.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');

app.setAppUserModelId('bj.planora.btp');
// Recette automatisée uniquement : dossier de données et dossier d'enregistrement imposés.
if (process.env.PLANORA_TEST_USER_DATA) app.setPath('userData', process.env.PLANORA_TEST_USER_DATA);
const testDownloads = process.env.PLANORA_TEST_DOWNLOADS;

// Une seule instance : deux fenêtres sur la même base l'abîmeraient.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  const createWindow = () => {
    win = new BrowserWindow({
      width: 1366, height: 860, minWidth: 980, minHeight: 640,
      title: 'PLANORA BTP', backgroundColor: '#0f1d33', show: false,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
    });
    win.once('ready-to-show', () => win.show());
    // Liens externes (WhatsApp, e-mail, sites) : navigateur de l'ordinateur.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^(https?:|mailto:|tel:)/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith('file:')) { e.preventDefault(); if (/^(https?:|mailto:|tel:)/.test(url)) void shell.openExternal(url); }
    });
    // Fichiers produits (PDF, Excel, sauvegardes) : fenêtre « Enregistrer sous » de Windows.
    win.webContents.session.on('will-download', (_e, item) => {
      if (testDownloads) item.setSavePath(path.join(testDownloads, item.getFilename()));
      else item.setSaveDialogOptions({ title: 'Enregistrer le fichier', defaultPath: path.join(app.getPath('documents'), item.getFilename()) });
    });
    void win.loadFile(path.join(__dirname, 'index.html'));
    win.on('closed', () => { win = null; });
  };

  const menu = Menu.buildFromTemplate([
    { label: 'Fichier', submenu: [{ role: 'quit', label: 'Quitter PLANORA BTP' }] },
    { label: 'Édition', submenu: [
      { role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' },
      { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' },
    ] },
    { label: 'Affichage', submenu: [
      { role: 'reload', label: 'Recharger' }, { type: 'separator' },
      { role: 'resetZoom', label: 'Taille normale' }, { role: 'zoomIn', label: 'Agrandir' }, { role: 'zoomOut', label: 'Réduire' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Plein écran' },
    ] },
    { label: 'Aide', submenu: [
      { label: 'Dossier des données', click: () => void shell.openPath(app.getPath('userData')) },
      { label: 'À propos de PLANORA BTP', click: () => void dialog.showMessageBox({ type: 'info', title: 'PLANORA BTP', message: `PLANORA BTP ${app.getVersion()}`, detail: 'Du plan au chantier, tout devient plus simple.\nLogiciel installé : vos données sont enregistrées sur cet ordinateur. Faites des sauvegardes régulières (bandeau en haut de l’application).' }) },
    ] },
  ]);

  app.whenReady().then(() => {
    Menu.setApplicationMenu(menu);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
