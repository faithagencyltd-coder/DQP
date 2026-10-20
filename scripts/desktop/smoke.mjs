// Recette du logiciel installé (même application que l'installeur Windows, lancée ici avec
// Electron pour Linux) : démarrage, connexion, écriture, sauvegarde, redémarrage (données
// conservées), restauration d'une sauvegarde, instance unique.
// Usage : xvfb-run -a node scripts/desktop/smoke.mjs <dossier_captures>
import { _electron as electron } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = path.resolve(process.argv[2] ?? '/tmp/planora-desktop');
fs.mkdirSync(OUT, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'planora-donnees-'));
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'planora-telechargements-'));
const exe = require('electron');
const appDir = path.resolve('desktop/app');
const env = { ...process.env, PLANORA_TEST_USER_DATA: userData, PLANORA_TEST_DOWNLOADS: downloads };
const errors = [];
let step = 0;
const ok = (m) => console.log(`ok ${++step} — ${m}`);

async function start() {
  const app = await electron.launch({ executablePath: exe, args: ['--no-sandbox', appDir], env });
  const page = await app.firstWindow();
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  return { app, page };
}
async function login(page) {
  await page.evaluate(() => { location.hash = '#/connexion'; });
  await page.getByLabel('Adresse e-mail').fill('demo@planora.bj');
  await page.getByLabel('Mot de passe').fill('Demo2026');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByText(/Bonjour Awa/).waitFor();
}
async function addClient(page, name) {
  await page.evaluate(() => { location.hash = '#/app/clients'; });
  await page.getByRole('button', { name: 'Nouveau client', exact: true }).click();
  await page.getByLabel('Nom ou raison sociale', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Coordonnées').waitFor();
}
// Après un redémarrage ou une restauration, la session peut être conservée : connexion seulement si besoin.
async function ensureLoggedIn(page) {
  const app = page.getByRole('link', { name: 'Clients et fournisseurs' }).first();
  const form = page.getByLabel('Adresse e-mail');
  await Promise.race([app.waitFor(), form.waitFor()]);
  if (await form.isVisible().catch(() => false)) await login(page);
}
const clientVisible = async (page, name) => {
  await page.evaluate(() => { location.hash = '#/app/clients'; });
  await page.getByRole('button', { name: 'Nouveau client', exact: true }).waitFor();
  await page.waitForTimeout(800);
  return page.getByText(name).filter({ visible: true }).count();
};

let run;
try {
  run = await start();
  let { page } = run;
  await page.getByText('Connexion').first().waitFor().catch(() => undefined);
  await login(page);
  await page.getByText('Logiciel installé (version d’essai)').waitFor();
  await page.screenshot({ path: `${OUT}/logiciel-1-tableau-de-bord.png` });
  ok(`application démarrée dans sa fenêtre « ${await page.title()} », connexion au compte d’essai`);

  await addClient(page, 'Client A (avant sauvegarde)');
  ok('client enregistré dans la base de l’ordinateur');
  await page.getByRole('button', { name: 'Sauvegarder les données', exact: true }).click();
  await page.getByText(/Sauvegarde créée/).waitFor();
  let backup = null;
  for (let i = 0; i < 40 && !backup; i++) {
    backup = fs.readdirSync(downloads).find((f) => f.endsWith('.planora'));
    if (!backup) await page.waitForTimeout(250);
  }
  if (!backup) throw new Error('fichier de sauvegarde absent');
  const size = fs.statSync(path.join(downloads, backup)).size;
  ok(`sauvegarde enregistrée : ${backup} (${Math.round(size / 1024)} Ko)`);
  await addClient(page, 'Client B (après sauvegarde)');

  // Instance unique : un second lancement se ferme tout de suite.
  const second = spawn(exe, ['--no-sandbox', appDir], { env, stdio: 'ignore' });
  const code = await Promise.race([new Promise((r) => second.on('exit', (c) => r(c))), new Promise((r) => setTimeout(() => r('toujours ouvert'), 15000))]);
  if (code === 'toujours ouvert') { second.kill(); throw new Error('un second lancement reste ouvert'); }
  ok('un second lancement ne crée pas de deuxième fenêtre (base protégée)');

  await run.app.close();
  run = await start();
  page = run.page;
  await page.evaluate(() => { if (!location.hash || location.hash === '#/') location.hash = '#/connexion'; });
  await ensureLoggedIn(page);
  if (!(await clientVisible(page, 'Client A (avant sauvegarde)')) || !(await clientVisible(page, 'Client B (après sauvegarde)'))) throw new Error('données perdues au redémarrage');
  ok('logiciel fermé puis rouvert : les deux clients sont toujours là');

  await page.getByLabel('Fichier de sauvegarde').setInputFiles(path.join(downloads, backup));
  await page.waitForEvent('load', { timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  await page.evaluate(() => { if (!location.hash || location.hash === '#/') location.hash = '#/connexion'; });
  await ensureLoggedIn(page);
  const a = await clientVisible(page, 'Client A (avant sauvegarde)');
  const b = await clientVisible(page, 'Client B (après sauvegarde)');
  if (!a || b) throw new Error(`restauration incorrecte (A visible : ${a}, B visible : ${b})`);
  await page.screenshot({ path: `${OUT}/logiciel-2-apres-restauration.png` });
  ok('sauvegarde restaurée : on retrouve l’état sauvegardé (client A présent, client B absent)');

  const bad = path.join(downloads, 'faux.planora');
  fs.writeFileSync(bad, 'pas une sauvegarde');
  await page.getByLabel('Fichier de sauvegarde').setInputFiles(bad);
  await page.getByText('Ce fichier n’est pas une sauvegarde PLANORA BTP.').waitFor();
  ok('fichier qui n’est pas une sauvegarde : refusé, données intactes');

  console.log(errors.length ? 'Erreurs : ' + [...new Set(errors)].join(' | ') : 'LOGICIEL OK');
} catch (e) {
  console.error('ÉCHEC :', e.message);
  await run?.page.screenshot({ path: `${OUT}/logiciel-echec.png` }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await run?.app.close().catch(() => undefined);
}
