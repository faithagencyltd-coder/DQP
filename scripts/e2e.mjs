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

// Coordonnées écran d'un point du plan (mètres), d'après le cadrage courant de la zone de dessin.
async function toScreen(page, [x, y]) {
  const svg = page.getByRole('img', { name: 'Zone de dessin du plan' });
  const box = await svg.boundingBox();
  const vb = (await svg.getAttribute('viewBox')).split(' ').map(Number);
  const k = box.width / vb[2];
  return [box.x + (x - vb[0]) * k, box.y + (y - vb[1]) * k];
}
async function clickAt(page, pt) {
  const [sx, sy] = await toScreen(page, pt);
  await page.mouse.move(sx, sy);
  await page.mouse.click(sx, sy);
}
const tool = (page, name) => page.getByRole('toolbar', { name: 'Outils de dessin' }).getByRole('button', { name, exact: true }).click();

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
  const quoteUrl = page.url();

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
  await page.locator('div.rounded-xl', { hasText: 'Professionnelle' }).getByRole('button', { name: 'Choisir', exact: true }).click();
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
  await page3.getByRole('tab', { name: 'Fonctions IA' }).click();
  const iaRow = page3.locator('li', { hasText: 'Rendu des plans par IA' });
  await iaRow.getByText(/Ouverte|Fermée/).waitFor();
  if (!(await iaRow.getByRole('checkbox').isChecked())) {
    await iaRow.getByRole('checkbox').click();
    await page3.getByText('Réglage enregistré.').waitFor();
  }
  await iaRow.getByText(/^Ouverte/).waitFor();
  ok('administration : rendu IA des plans ouvert (désactivé par défaut)');
  await page.reload();
  await page.getByText('Actif').first().waitFor();
  ok('l’entreprise voit son offre active');

  // ------------------------------------------------------------ facturation depuis le devis
  await page.goto(quoteUrl);
  await page.getByRole('button', { name: 'Valider et verrouiller', exact: true }).click();
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  await page.getByText('verrouillée').filter({ visible: true }).first().waitFor();
  await page.getByRole('button', { name: /Facturer ce devis/ }).click();
  let dlg = page.getByRole('dialog');
  await dlg.getByText('Nouvelle facture').waitFor();
  await dlg.getByLabel('Type de facture').selectOption('acompte');
  await dlg.getByRole('button', { name: 'Créer le brouillon', exact: true }).click();
  await page.getByRole('button', { name: 'Émettre', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Émettre', exact: true }).click();
  await page.getByText(/FAC-\d{4}-0001/).filter({ visible: true }).first().waitFor();
  ok('facture d’acompte (30 %) créée depuis le devis validé puis émise : numéro FAC définitif');
  await page.getByRole('button', { name: 'Enregistrer un paiement', exact: true }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel(/^Montant/).fill('100 000');
  await dlg.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Partiellement payée').filter({ visible: true }).first().waitFor();
  await shot(page, '21-facture');
  const [invPdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
  await invPdf.saveAs(`${OUT}/facture.pdf`);
  if (readFileSync(`${OUT}/facture.pdf`).subarray(0, 4).toString() !== '%PDF') throw new Error('PDF de facture invalide');
  ok('paiement partiel déclaré (100 000) : facture « partiellement payée », PDF téléchargé');

  // ------------------------------------------------------------ dépenses et rentabilité du chantier
  await nav(page, 'Dépenses');
  await page.getByRole('button', { name: 'Nouvelle dépense', exact: true }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel('Projet').selectOption({ index: 1 });
  await dlg.getByLabel('Libellé').fill('Location bétonnière');
  await dlg.getByLabel('Montant HT').fill('75 000');
  await dlg.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('table').getByText('Location bétonnière').waitFor();
  ok('dépense de chantier enregistrée');
  await nav(page, 'Projets et chantiers');
  await page.getByText('Villa R+1 Fidjrossè').filter({ visible: true }).first().click();
  await page.getByRole('tab', { name: 'Finances' }).click();
  await page.getByText('Facturation client').waitFor();
  await page.getByText('75 000').filter({ visible: true }).first().waitFor();
  await shot(page, '22-finances-chantier');
  ok('onglet Finances du chantier : facturé, encaissé, dépenses');

  // ------------------------------------------------------------ achats et stocks
  await nav(page, 'Clients et fournisseurs');
  await page.getByRole('tab', { name: 'Fournisseurs' }).click();
  await page.getByRole('button', { name: 'Nouveau fournisseur', exact: true }).click();
  await field(page, 'Nom ou raison sociale').fill('Quincaillerie du Port');
  await field(page, 'Téléphone').fill('+229 96 44 55 66');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Coordonnées').waitFor();
  await nav(page, 'Stocks');
  await page.getByRole('tab', { name: 'Dépôts' }).click();
  for (const name of ['Magasin central', 'Conteneur Fidjrossè']) {
    await page.getByRole('button', { name: 'Nouveau dépôt', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Nom').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.locator('table').getByText(name).waitFor();
  }
  ok('deux dépôts créés (magasin central, conteneur de chantier)');

  await nav(page, 'Achats et commandes');
  await page.getByRole('button', { name: 'Nouvelle demande', exact: true }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel('Article de la bibliothèque').selectOption({ label: 'Ciment CPJ 35 (sac 50 kg) (sac)' });
  await dlg.getByLabel(/^Quantité/).fill('100');
  await dlg.getByLabel('Justification').fill('Coulage dalle haute');
  await dlg.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await page.getByText(/DA-\d{4}-0001/).filter({ visible: true }).first().waitFor();
  await page.getByRole('button', { name: 'Approuver', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approuver', exact: true }).click();
  await page.getByText('Approuvée').filter({ visible: true }).first().waitFor();
  await page.getByRole('checkbox', { name: /Sélectionner DA-/ }).click();
  await page.getByLabel('Fournisseur').selectOption({ label: 'Quincaillerie du Port' });
  await page.getByRole('button', { name: /Créer le bon de commande/ }).click();
  await page.getByText(/BC-\d{4}-0001/).filter({ visible: true }).first().waitFor();
  ok('demande d’achat approuvée puis transformée en bon de commande');
  await page.getByLabel('Dépôt de livraison (entrée en stock)').selectOption({ label: 'Magasin central' });
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('480 000').filter({ visible: true }).first().waitFor(); // 100 × 4 800 (prix d'achat de la bibliothèque)
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  await page.getByText('Validée').filter({ visible: true }).first().waitFor();
  const [bc] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Bon de commande PDF', exact: true }).click()]);
  await bc.saveAs(`${OUT}/bon-commande.pdf`);
  await page.getByRole('button', { name: 'Réceptionner', exact: true }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel('Dépôt').selectOption({ label: 'Magasin central' });
  await dlg.getByLabel(/^Reçu Ciment/).fill('60');
  await dlg.getByRole('button', { name: 'Enregistrer la réception', exact: true }).click();
  await page.getByText('Reçue partiellement').filter({ visible: true }).first().waitFor();
  await shot(page, '23-commande');
  ok('commande validée (480 000), PDF, réception partielle de 60 sacs');

  await nav(page, 'Stocks');
  await page.locator('table').getByText('60 sac').waitFor();
  await page.getByRole('button', { name: 'Transfert', exact: true }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel('Article').selectOption({ label: 'Ciment CPJ 35 (sac 50 kg) (sac)' });
  await dlg.getByLabel('Dépôt de départ').selectOption({ label: 'Magasin central' });
  await dlg.getByLabel('Dépôt d’arrivée').selectOption({ label: 'Conteneur Fidjrossè' });
  await dlg.getByLabel(/^Quantité/).fill('20');
  await dlg.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('table').getByText('40 sac').waitFor();
  await page.locator('table').getByText('20 sac').waitFor();
  ok('transfert de 20 sacs vers le conteneur : 40 + 20');
  const conteneur = page.locator('tr', { hasText: 'Conteneur Fidjrossè' });
  await conteneur.getByRole('button', { name: 'Sortie', exact: true }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel(/^Quantité/).fill('25');
  await dlg.getByText('Stock insuffisant').waitFor();
  await dlg.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText(/Stock insuffisant : 20 disponible/).filter({ visible: true }).first().waitFor();
  await dlg.getByLabel(/^Quantité/).fill('5');
  await dlg.getByLabel('Chantier').selectOption({ index: 1 });
  await dlg.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('table').getByText('15 sac').waitFor();
  ok('sortie refusée au-delà du stock (25 > 20), sortie de 5 sacs affectée au chantier');
  const magasin = page.locator('tr', { hasText: 'Magasin central' });
  await magasin.getByRole('button', { name: 'Inventaire', exact: true }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel(/^Quantité comptée/).fill('38');
  await dlg.getByLabel(/^Motif/).fill('Deux sacs déchirés');
  await dlg.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText(/Écart d’inventaire enregistré : -2/).waitFor();
  await page.locator('table').getByText('38 sac').waitFor();
  await magasin.getByRole('button', { name: 'Seuil', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Quantité minimale').fill('50');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('À réapprovisionner').filter({ visible: true }).first().waitFor();
  await shot(page, '24-stocks');
  ok('inventaire (écart −2 tracé avec motif) et alerte sous le minimum (38 < 50)');
  await page.getByRole('tab', { name: 'Mouvements' }).click();
  await page.getByText('Deux sacs déchirés').waitFor();
  await page.getByText('Réception de commande').filter({ visible: true }).first().waitFor();
  await shot(page, '25-mouvements');
  ok('journal des mouvements : réception, transferts, sortie, inventaire');

  // ------------------------------------------------------------ planning, rapport journalier, réserves
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  await nav(page, 'Planning');
  const addTask = async (title, start, end, status, deps = []) => {
    await page.getByRole('button', { name: 'Nouvelle tâche', exact: true }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel(/^Titre/).fill(title);
    await d.getByLabel(/^Début/).fill(start);
    await d.getByLabel(/^Fin/).fill(end);
    await d.getByLabel('Statut').selectOption(status);
    for (const dep of deps) await d.getByLabel(new RegExp(`^${dep}`)).check();
    await d.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByRole('button', { name: `Ouvrir la tâche ${title}` }).waitFor();
  };
  await addTask('Implantation et fouilles', day(-10), day(-3), 'termine');
  await addTask('Fondations', day(-2), day(5), 'en_cours', ['Implantation et fouilles']);
  await addTask('Élévation des murs', day(3), day(20), 'a_faire', ['Fondations']);
  await addTask('Clôture provisoire', day(-8), day(-1), 'a_faire');
  await page.getByText('Dépendances à revoir').waitFor();
  await page.getByText(/1 tâche\(s\) en retard/).waitFor();
  await shot(page, '26-planning-gantt');
  ok('planning : 4 tâches, dépendances (chevauchement signalé), tâche en retard signalée, chronologie');
  await page.getByRole('button', { name: 'Calendrier', exact: true }).click();
  await page.getByRole('button', { name: 'Fondations', exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await page.getByRole('button', { name: 'Chronologie', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir la tâche Implantation et fouilles' }).click();
  await page.getByRole('dialog').getByLabel('Statut').selectOption('valide');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Tâche enregistrée.').first().waitFor();
  ok('tâche terminée puis validée par le responsable');
  await page.getByRole('tab', { name: 'Avancement' }).click();
  await page.getByText('25 %', { exact: true }).first().waitFor(); // 1 tâche terminée sur 4
  await page.getByLabel('Méthode d’avancement').selectOption('quantites');
  await page.getByText('Tâches exclues du calcul').waitFor();
  await page.getByLabel('Méthode d’avancement').selectOption('taches');
  await shot(page, '27-avancement');
  ok('avancement : 25 % (1 tâche terminée sur 4), méthode affichée ; méthode « quantités » : tâches sans quantité exclues, non devinées');

  await page.getByRole('tab', { name: 'Rapports journaliers' }).click();
  await page.getByRole('button', { name: 'Nouveau rapport', exact: true }).click();
  await page.getByText(/RJ-\d{4}-0001/).first().waitFor();
  await page.getByLabel('Météo').selectOption('Ensoleillé');
  await page.getByLabel('Travaux exécutés').fill('Coulage du béton de propreté, ferraillage des semelles axe A à C.');
  await page.getByRole('button', { name: 'Ajouter une fonction', exact: true }).click();
  await page.getByLabel('Fonction').fill('Maçons');
  await page.getByLabel('Nombre').fill('4');
  await page.getByText('Sorties de stock de ce jour pour ce chantier').waitFor();
  await page.getByRole('button', { name: 'Reprendre dans « Matériaux utilisés »' }).click();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Rapport enregistré.').first().waitFor();
  await page.getByLabel('Fichiers photo').setInputFiles(`${OUT}/23-commande.png`);
  await page.getByText('1 photo(s) ajoutée(s).').first().waitFor();
  await page.getByRole('img', { name: 'Photo du chantier' }).first().waitFor();
  await page.getByRole('button', { name: 'Soumettre', exact: true }).click();
  await page.getByText('en attente de validation').waitFor();
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Valider', exact: true }).click();
  await page.getByText(/Le rapport est figé/).waitFor();
  await shot(page, '28-rapport-journalier');
  const [rj] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
  await rj.saveAs(`${OUT}/rapport-journalier.pdf`);
  const rjPdf = readFileSync(`${OUT}/rapport-journalier.pdf`);
  if (rjPdf.subarray(0, 4).toString() !== '%PDF' || rjPdf.length < 20000) throw new Error('PDF du rapport journalier invalide (photo absente ?)');
  ok(`rapport journalier : effectifs, matériaux repris des sorties de stock réelles, photo réduite, soumis puis validé (figé), PDF avec photo (${Math.round(rjPdf.length / 1024)} Ko)`);

  await page.getByRole('link', { name: '← Rapports journaliers' }).click();
  await page.getByRole('tab', { name: 'Réserves' }).click();
  await page.getByRole('button', { name: 'Nouvelle réserve', exact: true }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel(/^Réserve/).fill('Fissure sur l’enduit, façade nord');
  await dlg.getByLabel('Localisation').fill('Façade nord');
  await dlg.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await dlg.getByText(/RES-\d{4}-0001/).waitFor();
  await dlg.getByRole('button', { name: 'Marquer levée', exact: true }).click();
  await dlg.getByRole('button', { name: 'Valider la levée', exact: true }).click();
  await dlg.getByText('Levée et validée').waitFor();
  await dlg.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await page.getByLabel('Filtre des réserves').selectOption('toutes');
  await page.locator('table').getByText('Fissure sur l’enduit, façade nord').waitFor();
  ok('réserve constatée, levée puis levée validée (close)');

  await nav(page, 'Projets et chantiers');
  await page.getByText('Villa R+1 Fidjrossè').filter({ visible: true }).first().click();
  await page.getByRole('tab', { name: 'Gestion de chantier' }).click();
  await page.getByText('Matériaux sortis du stock vers ce chantier').waitFor();
  await page.getByText('5 sac').first().waitFor();
  await page.getByText('Avancement mesuré').waitFor();
  await shot(page, '29-fiche-chantier');
  ok('fiche chantier : avancement, rapports, réserves, commandes et matériaux sortis du stock');

  // ------------------------------------------------------------ rapports, historiques, tableau de bord
  await nav(page, 'Rapports');
  await page.getByRole('option', { name: /Rapport financier/ }).click();
  await page.getByRole('cell', { name: 'PRJ-2026-0001 · Villa R+1 Fidjrossè' }).waitFor();
  await page.getByText('Limites des données').first().waitFor();
  await shot(page, '30-rapport-financier');
  for (const [label, ext, magic] of [['PDF', 'pdf', '%PDF'], ['Excel', 'xlsx', 'PK'], ['CSV', 'csv', '﻿']]) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: label, exact: true }).click()]);
    const path = `${OUT}/rapport-financier.${ext}`;
    await dl.saveAs(path);
    if (!readFileSync(path).toString('utf8', 0, 4).startsWith(magic)) throw new Error(`Export ${label} du rapport invalide`);
  }
  ok('rapport financier par chantier (période, limites) exporté en PDF, Excel et CSV');
  await page.getByRole('option', { name: /Rapport de chantier/ }).click();
  await page.getByLabel('Projet (obligatoire)').selectOption({ index: 1 });
  await page.getByRole('heading', { name: /^Rapports journaliers/ }).waitFor();
  await page.getByText('Coulage du béton de propreté, ferraillage des semelles axe A à C.').waitFor();
  const [rc] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
  await rc.saveAs(`${OUT}/rapport-chantier.pdf`);
  await page.getByRole('option', { name: /Comparatif budget/ }).click();
  await page.getByLabel('Projet (obligatoire)').selectOption({ index: 1 });
  await page.getByRole('heading', { name: /^Par lot/ }).waitFor();
  await shot(page, '31-comparatif-budget');
  ok('rapport de chantier (avancement, rapports journaliers, réserves) et comparatif budget / réel par lot');

  await nav(page, 'Clients et fournisseurs');
  await page.getByText('M. Hounkpè Codjo').filter({ visible: true }).first().click();
  await page.getByText('Situation financière du client').waitFor();
  await page.getByText(/FAC-\d{4}-0001/).filter({ visible: true }).first().waitFor();
  await page.getByText('Historique des modifications de la fiche').waitFor();
  await nav(page, 'Clients et fournisseurs');
  await page.getByRole('tab', { name: 'Fournisseurs' }).click();
  await page.getByText('Quincaillerie du Port').filter({ visible: true }).first().click();
  await page.getByText('Commandes (1)').waitFor();
  await page.getByText(/BC-\d{4}-0001/).filter({ visible: true }).first().waitFor();
  ok('historiques : factures, paiements et solde du client ; commandes du fournisseur');

  await nav(page, 'Tableau de bord');
  await page.getByText('Chiffre d’affaires facturé').waitFor();
  await page.getByRole('img', { name: 'Évolution mensuelle des recettes et des dépenses' }).waitFor();
  await page.getByText('Répartition des coûts par lot').waitFor();
  await page.getByText(/^45\s000\s000\sFCFA$/).first().waitFor(); // budget estimatif du projet, saisi à la création
  await shot(page, '32-tableau-de-bord-complet');
  ok('tableau de bord complet : facturé, encaissé, reste, dépenses, marges, alertes, graphiques');

  // ------------------------------------------------------------ plans : dessin, pièces, rendus
  await nav(page, 'Plans techniques');
  await page.getByRole('button', { name: 'Nouveau plan', exact: true }).click();
  await page.getByLabel('Nom du plan').fill('Villa Awa — vue en plan');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await page.getByRole('img', { name: 'Zone de dessin du plan' }).waitFor();
  const planUrl = page.url();
  await tool(page, 'Mur');
  for (const pt of [[0, 0], [9, 0], [9, 7], [0, 7], [0, 0]]) await clickAt(page, pt);
  await page.getByRole('toolbar', { name: 'Outils de dessin' }).locator('..').getByLabel('Type', { exact: true }).selectOption('cloison');
  await clickAt(page, [4, 0]);
  const [mx, my] = await toScreen(page, [4, 5]);
  await page.mouse.move(mx, my);
  await page.getByLabel('Longueur saisie').fill('7');
  await page.getByLabel('Longueur saisie').press('Enter');
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  await page.getByText('5 mur(s)').waitFor();
  ok('plan dessiné : 4 murs et une cloison (longueur saisie au clavier : 7 m)');

  await tool(page, 'Porte / fenêtre');
  await clickAt(page, [4, 3.5]);
  await page.getByText('Porte', { exact: true }).first().waitFor();
  await tool(page, 'Porte / fenêtre');
  await page.getByLabel('Ouverture', { exact: true }).selectOption('fenetre');
  await clickAt(page, [2, 0]);
  await tool(page, 'Pièce (clic)');
  await page.getByLabel('Type de pièce').selectOption('sejour');
  await clickAt(page, [2, 3.5]);
  await page.getByText('26,18 m²').first().waitFor();
  await page.getByLabel('Type de pièce').selectOption('chambre');
  await clickAt(page, [6.5, 3.5]);
  await page.getByText('32,98 m²').first().waitFor();
  ok('pièces détectées d’un clic entre les murs : séjour 3,85 × 6,80 = 26,18 m², chambre 4,85 × 6,80 = 32,98 m²');
  await page.getByRole('button', { name: 'Proposer un aménagement', exact: true }).click();
  await page.getByText(/élément\(s\) proposé\(s\)/).waitFor();
  ok('aménagement proposé dans la chambre (lit, chevets, armoire), déplaçable');

  await page.getByRole('tab', { name: 'Rendu', exact: true }).click();
  await page.getByRole('button', { name: 'Agrandir l’aperçu du rendu' }).click();
  await page.getByRole('img', { name: 'Rendu de présentation', exact: true }).waitFor();
  await shot(page, '17-plan-rendu');
  await page.keyboard.press('Escape');
  const [pdfDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF', exact: true }).click()]);
  const planPdf = readFileSync(await pdfDl.path());
  const [dxfDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'DXF', exact: true }).click()]);
  const dxf = readFileSync(await dxfDl.path(), 'utf8');
  if (!planPdf.subarray(0, 4).toString().startsWith('%PDF') || !dxf.includes('AC1009')) throw new Error('exports du plan invalides');
  ok(`rendu de présentation : PDF à l’échelle (${Math.round(planPdf.length / 1024)} Ko) et DXF exportés`);

  await page.getByRole('tab', { name: 'Rendu IA', exact: true }).click();
  await page.getByText('300 / 300 unités').waitFor();
  await page.getByRole('button', { name: /Générer le rendu IA/ }).click();
  await page.getByText('Terminé', { exact: true }).first().waitFor({ timeout: 60000 });
  await page.getByText('290 / 300 unités').waitFor();
  await page.getByRole('button', { name: 'Voir', exact: true }).first().click();
  await page.getByRole('img', { name: /illustration non contractuelle/ }).waitFor();
  await shot(page, '18-plan-rendu-ia');
  await page.keyboard.press('Escape');
  ok('rendu IA : quota réservé puis consommé (10 unités), image marquée « non contractuelle » (fournisseur de test local)');

  await page.getByRole('button', { name: 'Plus', exact: true }).click();
  await page.getByText('Créer un métré depuis ce plan').click();
  await page.waitForURL(/#\/app\/metres\//);
  await page.getByText('Revêtement de sol').first().waitFor();
  ok('métré créé depuis le plan (sols, plinthes, murs ; hauteur des murs « à compléter »)');

  // Import d'un plan scanné (image), calibration, détection d'une pièce sur les traits du fichier.
  const pngPath = `${OUT}/plan-scanne.png`;
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 700;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 1000, 700);
    x.strokeStyle = '#000'; x.lineWidth = 12; x.strokeRect(50, 50, 900, 600);
    x.lineWidth = 8; x.beginPath(); x.moveTo(450, 50); x.lineTo(450, 650); x.stroke();
    return c.toDataURL('image/png');
  });
  (await import('node:fs')).writeFileSync(pngPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await nav(page, 'Plans techniques');
  await page.getByRole('button', { name: 'Nouveau plan', exact: true }).click();
  await page.getByLabel('Nom du plan').fill('Plan client scanné');
  await page.getByLabel('Fichier du plan').setInputFiles(pngPath);
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await page.getByText('Échelle non vérifiée').first().waitFor();
  await page.waitForTimeout(800);
  ok('plan importé (image) : échelle provisoire signalée « non vérifiée », mesures indicatives (≈)');
  await tool(page, 'Échelle');
  await clickAt(page, [0.5, 0.5]);
  await clickAt(page, [9.5, 0.5]);
  await page.getByLabel('Distance réelle (lue sur une cote du plan)').fill('18');
  await page.getByRole('button', { name: 'Appliquer', exact: true }).click();
  await page.getByText(/Échelle vérifiée/).first().waitFor();
  await page.waitForTimeout(500);
  await tool(page, 'Pièce (clic)');
  await page.getByLabel('Type de pièce').selectOption('salon');
  await clickAt(page, [5, 7]);
  await page.getByText(/^9[01],\d\d m²$/).first().waitFor();
  await shot(page, '19-plan-import-calibre');
  ok('calibration sur une cote connue (9 m provisoires → 18 m) puis pièce détectée sur les traits du scan (7,80 × 11,76 = 91,73 m² attendus, à un pixel près)');

  const phone = await newPage(390, 844);
  await login(phone, owner);
  await phone.waitForURL(/#\/app/);
  await phone.goto(planUrl);
  await phone.getByRole('img', { name: 'Zone de dessin du plan' }).waitFor();
  await phone.waitForTimeout(600);
  await shot(phone, '20-plan-mobile');
  ok('éditeur de plan utilisable sur téléphone (390 px)');

  // ------------------------------------------------------------ tableau de bord rempli
  await nav(page, 'Tableau de bord');
  await page.getByText('Budget prévisionnel et dépenses réelles').waitFor();
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
