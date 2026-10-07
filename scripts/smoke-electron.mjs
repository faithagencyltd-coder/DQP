// Vérifie l'application de bureau : stockage disque, sauvegarde atomique, versions,
// export Excel et PDF via le processus principal.
//   xvfb-run node scripts/smoke-electron.mjs <fichier.xlsx> <dossier_de_travail>
import { _electron as electron } from 'playwright-core';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [file, work, planFile] = process.argv.slice(2);
mkdirSync(work, { recursive: true });
const app = await electron.launch({
  executablePath: path.resolve('node_modules/electron/dist/electron'),
  args: ['.', '--no-sandbox'],
  env: { ...process.env, HOME: work, XDG_CONFIG_HOME: path.join(work, 'config'), XDG_DOCUMENTS_DIR: path.join(work, 'Documents') },
});
const page = await app.firstWindow();
page.setDefaultTimeout(15000);
try {
  await page.waitForSelector('.toolbar');
  const root = path.join(work, 'Projets');
  const bytes = [...readFileSync(file)];
  const out = await page.evaluate(async ({ root, bytes }) => {
    const api = window.dqp;
    await api.setSettings({ projectsRoot: root });
    const now = new Date().toISOString();
    const project = { schema: 1, id: 'p-test', info: { name: 'Villa SENOU', client: '', location: '', projectType: '', projectTypeStatus: 'undetermined', phase: '', date: '' }, settings: { currency: 'FCFA', vatRate: 0, roundAmounts: true }, sourceFiles: [], lots: [], analyses: [], journal: [], createdAt: now, updatedAt: now };
    const { folder } = await api.createProject(project);
    const stored = await api.storeSourceFile(folder, 'DQE.xlsx', new Uint8Array(bytes));
    await api.saveProject(folder, { ...project, updatedAt: new Date().toISOString() });
    const v = await api.createVersion(folder, project, 'Version test');
    const versions = await api.listVersions(folder);
    const back = await api.readVersion(folder, v.id);
    const pdf = await api.htmlToPdf(folder, 'Exports', 'test.pdf', '<html><body><h1>DQP</h1><p>Test PDF</p></body></html>');
    const list = await api.listProjects();
    let escaped = 'refusé';
    try { await api.writeProjectFile(folder, '../..', 'x.txt', new Uint8Array([1])); escaped = 'ÉCRIT'; } catch {}
    return { folder, stored, versions: versions.length, back: back.info.name, pdf, list: list.map((p) => p.name), escaped, platform: api.platform, version: api.appVersion };
  }, { root, bytes });
  console.log(JSON.stringify(out, null, 1));
  console.log('Sous-dossiers :', readdirSync(out.folder).sort().join(', '));
  console.log('PDF :', existsSync(out.pdf), readFileSync(out.pdf).subarray(0, 5).toString());
  console.log('Copie de secours :', existsSync(path.join(out.folder, '.dqp', 'project.json.bak')));

  // Parcours dans l'interface : nouveau projet, import par glisser-déposer, exports.
  await page.reload();
  await page.waitForSelector('.toolbar');
  await page.getByRole('button', { name: 'Nouveau', exact: true }).click();
  await page.getByPlaceholder('Ex. Villa SENOU').fill('SENOU interface');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  await page.getByText('02 — Importer').waitFor();
  const dt = await page.evaluateHandle(({ bytes, name }) => {
    const d = new DataTransfer();
    d.items.add(new File([new Uint8Array(bytes)], name));
    return d;
  }, { bytes, name: 'DQE_PM_SENOU.xlsx' });
  await page.dispatchEvent('.drop', 'drop', { dataTransfer: dt });
  await page.getByRole('button', { name: 'Importer dans le projet' }).click();
  await page.getByText('03 / 04 — Analyse et vérification').waitFor();
  if (planFile) {
    // Plan PDF : pdf.js doit fonctionner dans l'application de bureau (hors ligne, file://).
    const planBytes = [...readFileSync(planFile)];
    await page.locator('.side button', { hasText: 'Importation' }).click();
    const dt2 = await page.evaluateHandle(({ bytes }) => {
      const d = new DataTransfer();
      d.items.add(new File([new Uint8Array(bytes)], 'Plans_villa.pdf'));
      return d;
    }, { bytes: planBytes });
    await page.dispatchEvent('.drop', 'drop', { dataTransfer: dt2 });
    await page.getByRole('button', { name: 'Importer dans le projet' }).click();
    await page.getByRole('heading', { name: 'Aperçu des plans' }).waitFor();
    await page.locator('canvas').waitFor();
    await page.waitForTimeout(1500);
    const painted = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i + 3] > 0) dark++;
      return { w: c.width, h: c.height, dark };
    });
    console.log('Aperçu du plan rendu :', JSON.stringify(painted));
    await page.screenshot({ path: path.join(work, 'electron-plan.png') });
    // Relecture depuis le disque (après rechargement, sans cache de session).
    await page.reload();
    await page.waitForSelector('.toolbar');
    await page.locator('.side button', { hasText: 'Projets' }).click();
    await page.locator('tr', { hasText: 'SENOU interface' }).getByRole('button', { name: 'Ouvrir' }).click();
    await page.locator('.side button', { hasText: 'Aperçu des plans' }).click();
    await page.locator('canvas').waitFor();
    await page.waitForTimeout(1500);
    const err = await page.locator('.empty').count();
    console.log('Aperçu après réouverture :', err ? 'ÉCHEC' : 'OK');
  }
  for (const name of ['Excel', 'PDF', 'Rapport']) {
    await page.locator('.toolbar .tb', { hasText: name }).click();
    await page.locator('.toast.success', { hasText: 'enregistré' }).or(page.locator('.toast.success', { hasText: 'Rapport' })).first().waitFor();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
  const folder2 = path.join(root, 'Projet_SENOU_interface');
  console.log('Exports :', readdirSync(path.join(folder2, 'Exports')).join(', '));
  console.log('Documents :', readdirSync(path.join(folder2, 'Documents')).join(', '));
  console.log('Analyse :', readdirSync(path.join(folder2, 'Analyse')).join(', '));
  console.log('Sources :', readdirSync(path.join(folder2, 'Fichiers_sources')).join(', '));
  const saved = JSON.parse(readFileSync(path.join(folder2, '.dqp', 'project.json'), 'utf8'));
  console.log('Projet enregistré :', saved.lots.length, 'lots,', saved.journal.length, 'entrées de journal');
  await page.screenshot({ path: path.join(work, 'electron.png') });
} catch (e) {
  console.error('ÉCHEC', e);
  process.exitCode = 1;
} finally {
  await app.close();
}
