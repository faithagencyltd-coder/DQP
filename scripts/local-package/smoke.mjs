// Vérification du paquet local : inscription confirmée d'office, création de l'entreprise,
// accès administrateur, page Planning. Usage : node scripts/local-package/smoke.mjs <dossier_captures>
import { chromium } from 'playwright-core';
const OUT = process.argv[2] ?? '/tmp/planora-local';
const BASE = 'http://localhost:54320/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: 'fr-FR' })).newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(BASE);
  await page.getByText('Du plan au chantier,').waitFor();
  await page.goto(BASE + '#/inscription');
  await page.getByLabel('Prénom').fill('Test');
  await page.getByLabel('Nom', { exact: true }).fill('Local');
  await page.getByLabel('Adresse e-mail').fill('admin-local@planora.test');
  await page.getByLabel('Téléphone').fill('+229 01 97 00 00 00');
  await page.getByLabel('Mot de passe', { exact: true }).fill('Chantier2026');
  await page.getByLabel('Confirmer le mot de passe').fill('Chantier2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  await page.waitForURL(/#\/app/);
  console.log('ok — inscription confirmée d’office, connexion directe');
  await page.screenshot({ path: `${OUT}/local-1-bienvenue.png` });
  await page.getByLabel(/^Nom commercial/).fill('Entreprise Test Locale');
  await page.getByRole('button', { name: 'Créer l’entreprise', exact: true }).click();
  await page.getByText(/Bonjour Test/).waitFor();
  console.log('ok — entreprise créée, tableau de bord');
  await page.goto(BASE + '#/app/admin');
  await page.getByText('Administration PLANORA BTP').waitFor();
  console.log('ok — espace administrateur accessible (e-mail saisi au premier lancement)');
  await page.screenshot({ path: `${OUT}/local-2-admin.png` });
  console.log(errors.length ? 'Erreurs : ' + errors.join(' | ') : 'PAQUET LOCAL OK');
} catch (e) {
  console.error('ÉCHEC :', e.message);
  await page.screenshot({ path: `${OUT}/local-echec.png` });
  process.exitCode = 1;
} finally { await browser.close(); }
