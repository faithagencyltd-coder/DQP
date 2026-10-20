// Construit le logiciel installable Windows de PLANORA BTP :
//   1. application autonome (vite --mode desktop) → desktop/app/index.html
//   2. icône (public/favicon.svg → .ico)
//   3. installeur Windows (NSIS, x64) avec electron-builder → dist-installer/
// Usage : node scripts/desktop/build.mjs [--skip-app] [--dir]   (--dir : dossier sans installeur)
// Sous Linux, l'installeur Windows demande Wine (PATH=/usr/lib/wine:$PATH) ; sous Windows, rien.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Arch, build, Platform } from 'electron-builder';
import pngToIco from 'png-to-ico';
import * as ResEdit from 'resedit';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
const appDir = path.join(root, 'desktop/app');
const resDir = path.join(root, 'desktop/build');
fs.mkdirSync(resDir, { recursive: true });

if (!args.has('--skip-app')) execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'desktop'], { cwd: root, stdio: 'inherit' });
fs.copyFileSync(path.join(root, 'dist-desktop/index.html'), path.join(appDir, 'index.html'));
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
  name: 'planora-btp', productName: 'PLANORA BTP', version: pkg.version, main: 'main.cjs',
  description: 'PLANORA BTP — du plan au chantier (logiciel installé)', author: 'PLANORA BTP', license: 'UNLICENSED',
}, null, 2));

// Icône : logo vectoriel rendu à chaque taille utile (16 à 256 px), réunies dans un fichier .ico.
const ico = path.join(resDir, 'icon.ico');
if (!fs.existsSync(ico)) {
  const svg = fs.readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const pngs = [];
  for (const size of [256, 128, 64, 48, 32, 24, 16]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    pngs.push(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(resDir, 'icon.png'), pngs[0]);
  fs.writeFileSync(ico, await pngToIco(pngs));
}

// Icône et informations de version inscrites dans PLANORA BTP.exe (sans outil Windows).
function brandExe(exe) {
  const exeObj = ResEdit.NtExecutable.from(fs.readFileSync(exe));
  const res = ResEdit.NtExecutableResource.from(exeObj);
  const group = res.entries.find((e) => e.type === 14);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group?.id ?? 1, group?.lang ?? 1033, iconFile.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const [a, b, c] = pkg.version.split('.').map(Number);
  vi.setFileVersion(a, b, c, 0);
  vi.setProductVersion(a, b, c, 0);
  for (const lang of vi.getAllLanguagesForStringValues()) {
    vi.setStringValues(lang, { ProductName: 'PLANORA BTP', FileDescription: 'PLANORA BTP', CompanyName: 'PLANORA BTP', InternalName: 'PLANORA BTP', OriginalFilename: 'PLANORA BTP.exe', LegalCopyright: '© PLANORA BTP', FileVersion: pkg.version, ProductVersion: pkg.version });
  }
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exeObj);
  fs.writeFileSync(exe, Buffer.from(exeObj.generate()));
}

const electronVersion = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const out = await build({
  projectDir: root,
  // Aucune publication automatique (la mise à disposition est faite par le workflow GitHub).
  publish: 'never',
  targets: Platform.WINDOWS.createTarget(args.has('--dir') ? ['dir'] : ['nsis'], Arch.x64),
  config: {
    appId: 'bj.planora.btp',
    productName: 'PLANORA BTP',
    copyright: '© PLANORA BTP',
    electronVersion,
    directories: { app: 'desktop/app', output: 'dist-installer', buildResources: 'desktop/build' },
    files: ['main.cjs', 'index.html', 'package.json'],
    asar: true,
    win: { target: 'nsis', icon: ico, signAndEditExecutable: false, artifactName: 'PLANORA-BTP-Installation-${version}.${ext}' },
    nsis: {
      oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
      createDesktopShortcut: 'always', createStartMenuShortcut: true, shortcutName: 'PLANORA BTP',
      installerIcon: ico, uninstallerIcon: ico, uninstallDisplayName: 'PLANORA BTP',
      installerLanguages: ['fr_FR'], language: '1036', deleteAppDataOnUninstall: false, runAfterFinish: true,
    },
    afterPack: async (ctx) => brandExe(path.join(ctx.appOutDir, 'PLANORA BTP.exe')),
  },
});
console.log('Produit :', out.join('\n  '));
