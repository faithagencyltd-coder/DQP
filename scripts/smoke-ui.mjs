// Parcours complet de l'interface (mode navigateur) : créer un projet, importer un DQE,
// naviguer dans les modules, modifier une quantité. Captures dans le dossier donné.
//   node scripts/smoke-ui.mjs <fichier.xlsx> <dossier_captures>
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const [file, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const server = await preview({ preview: { port: 5199, strictPort: true }, logLevel: 'silent' });
console.log('serveur prêt');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => { console.log('capture', n); return page.screenshot({ path: `${outDir}/${n}.png` }); };
try {
  await page.goto('http://localhost:5199/');
  await shot('01-accueil');
  await page.getByRole('button', { name: 'Nouveau projet' }).first().click();
  await page.getByPlaceholder('Ex. Villa SENOU').fill('Villa SENOU');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await page.getByText('02 — Importer').waitFor();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choisir un fichier…' }).click()]);
  await chooser.setFiles(file);
  await page.getByRole('button', { name: 'Importer dans le projet' }).waitFor();
  await shot('02-apercu-analyse');
  await page.getByRole('button', { name: 'Importer dans le projet' }).click();
  await page.getByText('03 / 04 — Analyse et vérification').waitFor();
  await shot('03-analyse');
  await page.locator('.side button', { hasText: 'DQE' }).click();
  await page.locator('.lot-item', { hasText: 'Tous les lots' }).waitFor();
  await shot('04-dqe');
  // Modifier la quantité de la première ligne du lot affiché.
  const qty = page.locator('tr.line').first().locator('td').nth(3);
  await qty.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await page.locator('tr.line').first().locator('td').nth(1).click();
  await page.waitForTimeout(300);
  await shot('05-dqe-modifie');
  await page.locator('.side button', { hasText: 'Estimation' }).click();
  await shot('06-estimation');
  await page.locator('.side button', { hasText: 'Tableau de bord' }).click();
  await shot('07-tableau-de-bord');
  await page.locator('.side button', { hasText: 'Métré' }).click();
  await shot('08-metre');
  await page.locator('.side button', { hasText: 'Bibliothèque de prix' }).click();
  await page.getByRole('button', { name: 'Prix du projet → bibliothèque' }).click();
  await page.waitForTimeout(200);
  await shot('09-prix');
  await page.locator('.side button', { hasText: 'Documents' }).click();
  await shot('10-documents');
  await page.locator('.side button', { hasText: 'Converter' }).click();
  await shot('11-converter');
  await page.keyboard.press('Control+z');
  console.log('OK');
} catch (e) {
  console.error('ÉCHEC', e.message);
  await shot('zz-echec');
  process.exitCode = 1;
} finally {
  if (errors.length) console.log('Erreurs console :', errors.join('\n'));
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
