// Vérifie le fichier de démonstration ouvert depuis le disque (file://), sans aucun serveur.
// Usage : node scripts/demo/smoke.mjs <chemin/index.html> <dossier_captures>
import { chromium } from 'playwright-core';
import path from 'node:path';
const FILE = 'file://' + path.resolve(process.argv[2] ?? 'dist-demo/index.html');
const OUT = process.argv[3] ?? '/tmp/planora-demo';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: 'fr-FR', acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const t0 = Date.now();
try {
  await page.goto(FILE + '#/connexion');
  await page.getByLabel('Adresse e-mail').fill('demo@planora.bj');
  await page.getByLabel('Mot de passe').fill('Demo2026');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByText(/Bonjour Awa/).waitFor({ timeout: 60000 });
  console.log(`ok — connexion au compte de démonstration (${Date.now() - t0} ms)`);
  await page.screenshot({ path: `${OUT}/demo-1-tableau-de-bord.png` });
  await page.goto(FILE + '#/app/projets');
  await page.getByText('Villa R+1 (exemple de démonstration)').filter({ visible: true }).first().waitFor();
  console.log('ok — projet d’exemple visible');
  await page.goto(FILE + '#/app/clients');
  await page.getByRole('button', { name: 'Nouveau client', exact: true }).click();
  await page.getByLabel('Nom ou raison sociale', { exact: true }).fill('Client créé pendant le test');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Coordonnées').waitFor();
  console.log('ok — création d’un client (écriture en base, règles d’accès appliquées)');
  await page.reload();
  await page.getByText('Client créé pendant le test').filter({ visible: true }).first().waitFor({ timeout: 60000 });
  console.log('ok — données conservées après rechargement de la page');
  const other = await ctx.newPage();
  await other.goto(FILE);
  await other.getByText(/déjà ouvert dans un autre onglet/).waitFor();
  await other.close();
  console.log('ok — second onglet refusé (protection de la base)');
  await page.goto(FILE + '#/app/devis');
  await page.getByRole('button', { name: 'Nouveau devis', exact: true }).click();
  await page.getByLabel(/^Titre/).fill('Devis de test');
  await page.getByRole('button', { name: /^Créer/ }).last().click();
  await page.getByText(/DEV-\d{4}-0001/).first().waitFor();
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
  await pdf.saveAs(`${OUT}/devis-demo.pdf`);
  console.log('ok — devis créé et PDF téléchargé');
  await page.goto(FILE + '#/app/admin');
  await page.getByText('Administration PLANORA BTP').waitFor();
  await page.screenshot({ path: `${OUT}/demo-2-admin.png` });
  console.log('ok — espace administrateur');
  console.log(errors.length ? 'Erreurs : ' + [...new Set(errors)].join(' | ') : 'DÉMO OK');
} catch (e) {
  console.error('ÉCHEC :', e.message);
  await page.screenshot({ path: `${OUT}/demo-echec.png` });
  console.log('Erreurs : ' + [...new Set(errors)].join(' | '));
  process.exitCode = 1;
} finally { await browser.close(); }
