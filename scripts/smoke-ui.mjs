// Parcours complet de l'interface (mode navigateur) : créer un projet, importer un DQE
// et un plan PDF, parcourir les modules, modifier une quantité, recherche Ctrl+K.
//   node scripts/smoke-ui.mjs <DQE.xlsx> <dossier_captures> [plan.pdf] [largeur] [hauteur]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { preview } from 'vite';

const [file, outDir, planFile, w = '1600', h = '900'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const server = await preview({ preview: { port: 5199, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = async (n) => { console.log('capture', n); await page.waitForTimeout(350); await page.screenshot({ path: `${outDir}/${n}.png` }); };
const nav = (label) => page.locator('aside').getByRole('button', { name: label, exact: true }).first().click();
const tab = (label) => page.getByRole('tab', { name: label }).first().click();
try {
  await page.goto('http://localhost:5199/');
  await shot('01-accueil');
  await page.getByRole('button', { name: 'Nouveau projet' }).first().click();
  await page.getByPlaceholder('Ex. Villa SENOU').fill('Villa SENOU');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await page.getByText('02 — Importer').waitFor();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choisir un fichier…' }).click()]);
  await chooser.setFiles(file);
  await page.getByRole('button', { name: 'Importer dans le projet' }).waitFor({ timeout: 30000 });
  await shot('02-apercu-analyse');
  await page.getByRole('button', { name: 'Importer dans le projet' }).click();
  await page.getByText('03 / 04 — Analyse et vérification').waitFor();
  if (planFile) {
    await nav('Importer');
    const [pc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choisir un fichier…' }).click()]);
    // Import multiple : le plan et un fichier d'un format sans moteur (signalé, joignable).
    await pc.setFiles([{ name: 'Plans_villa.pdf', mimeType: 'application/pdf', buffer: readFileSync(planFile) }, { name: 'Plan_structure.dwg', mimeType: 'application/octet-stream', buffer: Buffer.from('AC1032 fichier de test') }]);
    await page.getByRole('button', { name: 'Importer dans le projet' }).waitFor({ timeout: 30000 });
    await shot('02b-apercu-plan');
    await page.getByRole('button', { name: 'Importer dans le projet' }).click();
    await page.locator('canvas').waitFor();
    await page.waitForTimeout(1200);
    await page.locator('button', { hasText: 'SEJOUR' }).first().click();
    await shot('03b-plan-2d');
    // Outils de métré : étalonnage, mur tracé, proposition automatique.
    const box = await page.locator('canvas').first().boundingBox();
    const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
    await page.getByRole('button', { name: 'Étalonner', exact: true }).click();
    await page.mouse.click(...at(0.25, 0.5));
    await page.mouse.click(...at(0.65, 0.5));
    await page.getByPlaceholder('Ex. 4,20 (lire la cote sur le plan)').fill('8');
    await page.getByRole('button', { name: 'Étalonner', exact: true }).last().click();
    await page.getByRole('button', { name: 'Mur', exact: true }).click();
    await page.mouse.click(...at(0.3, 0.3));
    await page.mouse.click(...at(0.6, 0.3));
    await page.mouse.move(...at(0.6, 0.6));
    await shot('03e-trace-mur');
    await page.mouse.click(...at(0.6, 0.6));
    await page.keyboard.press('Enter');
    await page.getByPlaceholder('Ex. 3,00 — vide = non déterminée').fill('3');
    await page.getByRole('button', { name: 'Enregistrer la mesure' }).click();
    await page.getByRole('button', { name: 'Sélection', exact: true }).click();
    await page.getByRole('button', { name: /Proposer les murs/ }).click();
    await shot('03f-mesures');
    await nav('Importer');
    await page.getByText('File d’import · 3 fichier(s)').waitFor();
    await page.getByRole('button', { name: 'Joindre' }).click();
    await page.locator('.badge', { hasText: 'Joint sans analyse' }).waitFor();
    await shot('03g-file-terminee');
  }
  await tab('Vue d’ensemble');
  await page.locator('canvas').first().waitFor().catch(() => {});
  await page.waitForTimeout(1200);
  await shot('03-vue-ensemble');
  await tab('Analyse');
  await shot('03c-analyse');
  await tab('Détection');
  await shot('03d-detection');
  await tab('DQE');
  await page.locator('.lot-item', { hasText: 'Tous les lots' }).waitFor();
  const qty = page.locator('tr.line').first().locator('td').nth(4);
  await qty.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await shot('04-dqe');
  await tab('Métré');
  if (planFile) await page.getByText('Mesures sur plans (2)').waitFor();
  await page.locator('table.t', { hasText: 'Désignation' }).locator('tbody tr').nth(2).click();
  await shot('05-metre');
  await tab('Quantitatif');
  await shot('06-quantitatif');
  await tab('Estimation');
  await shot('07-estimation');
  await nav('Tableau de bord');
  await page.waitForTimeout(900);
  await shot('08-tableau-de-bord');
  await nav('Bibliothèque de prix');
  await page.getByRole('button', { name: 'Prix du projet → bibliothèque' }).click();
  await shot('09-prix');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('beton');
  await shot('10-recherche');
  await page.keyboard.press('Escape');
  await nav('Converter');
  await shot('11-converter');
  await page.keyboard.press('Control+b');
  await nav('Documents');
  await shot('12-menu-reduit-documents');
  console.log('OK');
} catch (e) {
  console.error('ÉCHEC', e.message);
  await shot('zz-echec');
  process.exitCode = 1;
} finally {
  if (errors.length) console.log('Erreurs console :', [...new Set(errors)].join('\n'));
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
