// Parcours de recette de bout en bout (annexe B du cahier des charges), dans un vrai
// navigateur, sur la pile locale (vraie base, vraies règles d'accès).
//   1. sh scripts/local-stack/start.sh
//   2. VITE_SUPABASE_URL=http://localhost:54320 VITE_SUPABASE_PUBLISHABLE_KEY=cle npx vite build
//   3. node scripts/e2e.mjs <dossier_captures>
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { preview } from 'vite';

const OUT = process.argv[2] ?? '/tmp/planora-e2e';
const API = process.env.SUPABASE_URL ?? 'http://localhost:54320';
mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: 5180, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:5180/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const errors = [];
const stamp = Date.now();
const owner = { first: 'Awa', last: 'Adjovi', email: `awa${stamp}@planora.test`, password: 'Chantier2026' };
const metreur = { first: 'Comlan', last: 'Houngbo', email: `comlan${stamp}@planora.test`, password: 'Metre2026x' };
let step = 0;
const ok = (m) => console.log(`ok ${String(++step).padStart(2, '0')} — ${m}`);

async function newPage(width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, locale: 'fr-FR' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_|status of 4/.test(m.text()) && errors.push(m.text()));
  return page;
}
const shot = (page, name) => page.waitForTimeout(400).then(() => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }));
const confirm = (email) => fetch(`${API}/__dev/confirm?email=${encodeURIComponent(email)}`);
const nav = (page, label) => page.locator('aside').getByRole('link', { name: label }).first().click();
const field = (page, label) => page.getByLabel(label, { exact: true });

async function signup(page, u) {
  await page.goto(BASE + '#/inscription');
  await page.getByLabel('Prénom').fill(u.first);
  await page.getByLabel('Nom', { exact: true }).fill(u.last);
  await page.getByLabel('Adresse e-mail').fill(u.email);
  await page.getByLabel('Téléphone').fill('+229 01 97 00 00 00');
  await page.getByLabel('Mot de passe', { exact: true }).fill(u.password);
  await page.getByLabel('Confirmer le mot de passe').fill(u.password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  await page.getByText('Confirmez votre adresse e-mail').waitFor();
}
async function login(page, u) {
  await page.goto(BASE + '#/connexion');
  await page.getByLabel('Adresse e-mail').fill(u.email);
  await page.getByLabel('Mot de passe').fill(u.password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
}

try {
  // ------------------------------------------------------------ accueil, inscription, connexion
  let page = await newPage();
  await page.goto(BASE);
  await page.getByText('Du plan au chantier,').waitFor();
  await page.getByText('Découverte').first().waitFor();
  await shot(page, '01-accueil');
  ok('page d’accueil PLANORA BTP avec les offres lues en base');

  await signup(page, owner);
  await shot(page, '02-inscription-confirmation');
  ok('inscription : confirmation d’e-mail demandée');
  await login(page, owner);
  await page.getByText('Adresse e-mail non confirmée').waitFor();
  ok('connexion refusée avant confirmation');
  await confirm(owner.email);
  await login(page, owner);
  await page.getByText('Créer mon entreprise').waitFor();
  ok('connexion après confirmation, invitation à créer l’entreprise');

  await page.getByLabel('Nom commercial').fill('Bâtir Plus');
  await page.getByLabel('Raison sociale').fill('BÂTIR PLUS SARL');
  await page.getByLabel('Ville').fill('Cotonou');
  await page.getByRole('button', { name: 'Créer l’entreprise', exact: true }).click();
  await page.getByText('Votre espace est prêt').waitFor();
  await shot(page, '03-tableau-de-bord-vide');
  ok('entreprise créée, tableau de bord sans chiffres inventés');

  // ------------------------------------------------------------ client et doublon
  await nav(page, 'Clients et fournisseurs');
  await page.getByRole('button', { name: 'Nouveau client', exact: true }).click();
  await field(page, 'Nom ou raison sociale').fill('M. Hounkpè Codjo');
  await field(page, 'Téléphone').fill('+229 97 11 22 33');
  await field(page, 'E-mail').fill('hounkpe@exemple.bj');
  await field(page, 'Ville').fill('Abomey-Calavi');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Coordonnées').waitFor();
  ok('client créé');
  await nav(page, 'Clients et fournisseurs');
  await page.getByRole('button', { name: 'Nouveau client', exact: true }).click();
  await field(page, 'Nom ou raison sociale').fill('Autre client');
  await field(page, 'Téléphone').fill('97112233');
  await page.getByText('Doublon possible').waitFor();
  await shot(page, '04-doublon');
  ok('doublon détecté (même téléphone)');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();

  // ------------------------------------------------------------ projet
  await nav(page, 'Projets et chantiers');
  await page.getByRole('button', { name: 'Nouveau projet', exact: true }).click();
  await field(page, 'Nom du projet').fill('Villa R+1 Fidjrossè');
  await page.getByRole('combobox', { name: 'Client', exact: true }).selectOption({ label: 'M. Hounkpè Codjo' });
  await field(page, 'Localisation').fill('Fidjrossè, lot 245');
  await field(page, 'Budget estimatif (FCFA)').fill('45 000 000');
  await page.getByRole('button', { name: 'Créer le projet', exact: true }).click();
  await page.getByText(/PRJ-\d{4}-0001/).first().waitFor();
  await page.getByRole('tab', { name: 'Lots' }).click();
  await page.getByText('Lots du projet (23)').waitFor();
  await shot(page, '05-projet-lots');
  ok('projet créé avec référence unique et 23 lots standard');

  // ------------------------------------------------------------ bibliothèque de prix
  await nav(page, 'Bibliothèque de prix');
  await page.getByRole('button', { name: 'Nouvel article', exact: true }).click();
  await field(page, 'Code article').fill('CIM-50');
  await field(page, 'Désignation').fill('Ciment CPJ 35 (sac 50 kg)');
  await page.getByLabel('Unité').selectOption('sac');
  await field(page, 'Prix d’achat HT').fill('4 800');
  await field(page, 'Prix de vente HT').fill('5 200');
  await field(page, 'Source').fill('Facture fournisseur');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('table').getByText('Ciment CPJ 35 (sac 50 kg)').waitFor();
  await page.getByRole('button', { name: 'Nouvel article', exact: true }).click();
  await page.getByLabel('Type').selectOption('ouvrage');
  await field(page, 'Code article').fill('BA-350');
  await field(page, 'Désignation').fill('Béton armé dosé à 350 kg/m³');
  await page.getByLabel('Unité').selectOption('m³');
  await page.getByRole('combobox').filter({ hasText: 'Depuis la bibliothèque' }).selectOption({ index: 1 });
  await page.getByLabel('Quantité du composant').first().fill('7');
  await page.getByLabel('Quantité du composant').first().press('Tab');
  await page.getByText(/Prix de vente HT : 4/).waitFor();
  await shot(page, '06-ouvrage-debourse');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('table').getByText('Béton armé dosé à 350 kg/m³').waitFor();
  ok('article et ouvrage composé (déboursé sec → prix de vente) enregistrés');

  // ------------------------------------------------------------ métré manuel
  await nav(page, 'Métrés et quantitatifs');
  await page.getByRole('button', { name: 'Nouveau métré', exact: true }).click();
  await field(page, 'Titre').fill('Métré gros œuvre');
  await page.getByLabel('Projet').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await page.getByText(/MET-\d{4}-0001/).first().waitFor();
  await page.getByRole('button', { name: 'Ajouter une ligne', exact: true }).click();
  await page.getByLabel('Désignation').first().fill('Dalle pleine');
  await page.getByLabel('Lot').first().fill('Gros œuvre');
  await page.getByLabel('longueur').first().fill('5');
  await page.getByLabel('largeur').first().fill('4');
  await page.getByLabel('largeur').first().press('Tab');
  await page.getByRole('cell', { name: '20,00', exact: true }).waitFor();
  ok('métré : surface 5 × 4 = 20,00 m²');
  await page.getByRole('button', { name: 'Ajouter une ligne', exact: true }).click();
  await page.getByLabel('Désignation').nth(1).fill('Béton armé dosé à 350 kg/m³');
  await page.getByLabel('Lot').nth(1).fill('Gros œuvre');
  await page.getByLabel('Formule').nth(1).selectOption('volume');
  await page.getByLabel('longueur').nth(1).fill('32,4');
  await page.getByLabel('largeur').nth(1).fill('0,6');
  await page.getByLabel('largeur').nth(1).press('Tab');
  await page.getByText('à compléter').first().waitFor();
  ok('dimension manquante : quantité « à compléter », non devinée');
  await page.getByLabel('hauteur').last().fill('0,4');
  await page.getByLabel('hauteur').last().press('Tab');
  await page.getByRole('cell', { name: '7,78', exact: true }).waitFor();
  await page.getByText(/Enregistré/).waitFor({ timeout: 8000 });
  await shot(page, '07-metre');
  ok('volume 32,4 × 0,6 × 0,4 = 7,78 m³, sauvegarde automatique');

  // ------------------------------------------------------------ DQE depuis le métré
  await page.getByRole('button', { name: 'Générer un DQE', exact: true }).click();
  await page.getByRole('button', { name: 'Générer', exact: true }).click();
  await page.getByText(/DQE-\d{4}-0001/).first().waitFor();
  await page.getByLabel('Prix unitaire').first().fill('12 000');
  await page.getByLabel('Prix unitaire').first().press('Tab');
  await page.getByRole('button', { name: 'Choisir un prix dans la bibliothèque', exact: true }).nth(1).click();
  await page.getByRole('button', { name: /Béton armé dosé/ }).click();
  await page.getByText('240 000').first().waitFor(); // 20 × 12 000
  await page.getByText(/Enregistré/).waitFor({ timeout: 8000 });
  await shot(page, '08-dqe');
  ok('DQE généré depuis le métré, prix saisi et repris de la bibliothèque');

  // ------------------------------------------------------------ devis
  await page.getByRole('button', { name: 'Créer un devis depuis ce DQE', exact: true }).click();
  await page.getByText(/DEV-\d{4}-0001/).first().waitFor();
  await page.getByText('TVA 18').first().waitFor();
  const ht = await page.locator('dt:text("Total HT") + dd').textContent();
  const ttc = await page.locator('dt:text("Total TTC") + dd').textContent();
  ok(`devis créé : Total HT ${ht?.trim()}, TTC ${ttc?.trim()}`);
  await page.getByLabel('Remise').fill('5');
  await page.getByLabel('Remise').press('Tab');
  await page.getByText('Remise 5 %').waitFor();
  await page.getByText(/Enregistré/).waitFor({ timeout: 8000 });
  await shot(page, '09-devis');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
  const pdfPath = `${OUT}/devis.pdf`;
  await download.saveAs(pdfPath);
  const pdf = readFileSync(pdfPath);
  if (pdf.subarray(0, 4).toString() !== '%PDF' || pdf.length < 3000) throw new Error('PDF invalide');
  ok(`PDF du devis téléchargé (${Math.round(pdf.length / 1024)} Ko)`);
  const [xl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel', exact: true }).click()]);
  await xl.saveAs(`${OUT}/devis.xlsx`);
  ok('Excel du devis téléchargé');
  await page.getByRole('button', { name: 'Valider et verrouiller', exact: true }).click();
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  await page.getByText('verrouillée').first().waitFor();
  ok('version validée et verrouillée');
  await page.getByRole('button', { name: 'Nouvelle version', exact: true }).click();
  await page.getByLabel('Motif de la révision').fill('Remise commerciale revue');
  await page.getByRole('button', { name: 'Créer la version', exact: true }).click();
  await page.getByText('version 2').first().waitFor();
  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  await page.getByText('Remise commerciale revue').waitFor();
  await page.keyboard.press('Escape');
  ok('nouvelle version 2, version 1 conservée dans l’historique');

  // ------------------------------------------------------------ équipe et permissions
  await nav(page, 'Paramètres');
  await page.getByRole('tab', { name: 'Équipe' }).click();
  await page.getByLabel('Adresse e-mail').fill(metreur.email);
  await page.getByLabel('Rôle').selectOption('metreur');
  await page.getByRole('button', { name: 'Créer le lien d’invitation', exact: true }).click();
  const link = (await page.locator('.font-mono').textContent()).trim();
  ok('lien d’invitation créé pour un métreur');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Rôles et permissions' }).click();
  await shot(page, '10-permissions');

  const page2 = await newPage(390, 844);
  await signup(page2, metreur);
  await confirm(metreur.email);
  await login(page2, metreur);
  await page2.waitForURL(/#\/app/);
  await page2.goto(link);
  await page2.getByRole('button', { name: /Rejoindre Bâtir Plus/ }).click();
  await page2.getByText(/Bonjour Comlan/).waitFor();
  await shot(page2, '11-mobile-metreur');
  ok('le métreur a rejoint l’entreprise (téléphone 390 px)');
  await page2.goto(BASE + '#/app/clients');
  await page2.getByText('M. Hounkpè Codjo').filter({ visible: true }).first().waitFor();
  const disabled = await page2.getByRole('button', { name: 'Nouveau client', exact: true }).isDisabled();
  if (!disabled) throw new Error('Le métreur ne devrait pas pouvoir créer de client');
  ok('permissions : le métreur consulte les clients mais ne peut pas en créer');
  await page2.goto(BASE + '#/app/devis');
  await page2.getByText(/DEV-\d{4}-0001/).filter({ visible: true }).first().waitFor();
  await shot(page2, '12-mobile-devis');
  ok('le métreur consulte les devis sur téléphone');

  // ------------------------------------------------------------ abonnement et administration
  await nav(page, 'Abonnement');
  await page.getByRole('button', { name: 'Choisir', exact: true }).first().click();
  await page.getByRole('button', { name: 'Envoyer la demande', exact: true }).click();
  await page.getByText('En attente').first().waitFor();
  await shot(page, '13-abonnement');
  ok('demande d’abonnement envoyée (paiement en ligne signalé « à venir »)');

  const admin = { first: 'Admin', last: 'Planora', email: `admin${stamp}@planora.test`, password: 'Admin2026x' };
  await fetch(`${API}/__dev/sql`, { method: 'POST', body: `insert into public.platform_admins (email) values ('${admin.email}')` });
  const page3 = await newPage();
  await signup(page3, admin);
  await confirm(admin.email);
  await login(page3, admin);
  await page3.waitForURL(/#\/app/);
  await page3.goto(BASE + '#/app/admin');
  await page3.getByText('Administration PLANORA BTP').waitFor();
  await page3.getByRole('tab', { name: 'Demandes d’abonnement' }).click();
  await page3.getByRole('button', { name: 'Règlement reçu : activer', exact: true }).first().click();
  await page3.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await page3.getByText('traitee').first().waitFor();
  await page3.getByRole('tab', { name: 'Entreprises' }).click();
  await shot(page3, '14-administration');
  ok('administration : offre activée après règlement');
  await page.reload();
  await page.getByText('Actif').first().waitFor();
  ok('l’entreprise voit son offre active');

  // ------------------------------------------------------------ tableau de bord rempli
  await nav(page, 'Tableau de bord');
  await page.getByText('Budget par chantier').waitFor();
  await shot(page, '15-tableau-de-bord');
  await nav(page, 'Journal d’activité');
  await page.getByText(/Nouvelle version/i).first().waitFor();
  await shot(page, '16-journal');
  ok('tableau de bord et journal d’activité alimentés par les vraies opérations');

  console.log('RECETTE RÉUSSIE');
} catch (e) {
  console.error('ÉCHEC :', e.message);
  process.exitCode = 1;
  for (const [i, p] of browser.contexts().flatMap((c) => c.pages()).entries()) await p.screenshot({ path: `${OUT}/zz-echec-${i}.png` }).catch(() => {});
} finally {
  if (errors.length) console.log('Erreurs dans la console :\n' + [...new Set(errors)].join('\n'));
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
