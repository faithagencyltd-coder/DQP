// Classeur de test synthétique reproduisant la structure du DQE de référence
// (page de garde, lots, zones, niveaux, sous-parties, TOTAL, ARRÊTÉ, récapitulatifs)
// et ses anomalies réelles : total de lot qui oublie une partie, #REF!, formule
// de quantité suspecte, montant en chiffres tronqué, intitulés contradictoires.

import ExcelJS from 'exceljs';

export async function buildFixture(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Feuil1');
  const set = (ref: string, v: ExcelJS.CellValue) => (ws.getCell(ref).value = v);
  const f = (ref: string, formula: string, result?: number | { error: ExcelJS.ErrorValue }) =>
    (ws.getCell(ref).value = { formula, result } as ExcelJS.CellFormulaValue);

  set('B2', 'REPUBLIQUE DU BENIN');
  set('B4', 'PHASE 2 :  EXECUTION');
  set('B5', 'DEVIS QUANTITATIFS ET ESTIMATIFS');
  set('B6', 'FEVRIER  2026');

  // ----- Lot 1 -----
  set('B9', 'MACONNERIE - BETON');
  set('C9', 'DEVIS QUANTITATIF ET ESTIMATIF');
  ['N°', 'DESIGNATION', 'UNITE', 'QUANTITE', 'PRIX UNITAIRE', 'MONTANT PARTIEL'].forEach((h, i) => (ws.getRow(10).getCell(i + 1).value = h));
  set('A12', 'I - INSTALLATION');
  set('A13', 1); set('B13', 'Amenée et replis du matériel'); set('C13', 'ff'); set('D13', 1); set('E13', 200000); f('F13', 'D13*E13', 200000);
  set('A14', 2); set('B14', 'Implantation'); set('C14', 'm2'); set('D14', 100); set('E14', 400); f('F14', 'D14*E14', 40000);
  set('B15', 'TOTAL INSTALLATION'); f('F15', 'SUM(F13:F14)', 240000);
  set('A17', 'II - REZ-DE-CHAUSSEE');
  set('A18', 'F - ELEVATION');
  set('A19', 41); set('B19', 'Murs en élévation en agglos creux de 15cm'); set('C19', 'm²'); set('D19', 100); set('E19', 6500); f('F19', 'D19*E19', 650000);
  set('A20', 42); set('B20', 'Béton armé pour escalier'); set('C20', 'm3'); f('F20', 'D20*E20', 0);
  set('A21', 43); set('B21', 'Enduits verticaux dosé à 400kg/m3'); set('C21', 'm²'); f('D21', '(D19*2.2)', 220); set('E21', 2200); f('F21', 'D21*E21', 484000);
  set('B22', 'TOTAL F'); f('F22', 'SUM(F19:F21)', 1134000);
  set('B24', 'TOTAL REZ-DE-CHAUSSEE'); f('F24', 'F22', 1134000);
  set('B26', 'AMENAGEMENTS EXTERIEURS');
  set('A27', 'H - CLÔTURES');
  set('A28', 4); set('B28', 'Mur de clôture'); set('C28', 'ml'); set('D28', 10); set('E28', 15000); f('F28', 'D28*E28', 150000);
  set('B29', 'TOTAL H'); f('F29', 'SUM(F28:F28)', 150000);
  set('A31', "PR0JET DE CONSTRUCTION D'UNE VILLA BAS");
  set('A32', 'RECAPITULATIF GROS-ŒUVRE');
  set('B33', 'TOTAL INSTALLATION'); f('E33', 'F15', 240000);
  set('B34', 'REZ-DE-CHAUSSEE'); f('E34', 'F24', 1134000);
  set('B35', 'CLÔTURES'); f('E35', 'F29', 150000);
  // Le total du lot oublie l'installation (comme dans le fichier de référence).
  set('A36', 'TOTAL GROS-ŒUVRE'); f('E36', 'E34+E35', 1284000);
  set('B38', 'ARRETES LES PRESENTS TRAVAUX DE GROS ŒUVRE A LA SOMME DE : ');
  set('A39', 'Un million deux cent quatre-vingt-quatre mille (1 284 00) FRANCS CFA');

  // ----- Lot 2 -----
  set('B50', 'PLOMBERIE - SANITAIRE');
  set('C50', 'DEVIS QUANTITATIF ET ESTIMATIF');
  ['N°', 'DESIGNATION', 'UNITE', 'QUANTITE', 'PRIX UNITAIRE', 'MONTANT PARTIEL'].forEach((h, i) => (ws.getRow(51).getCell(i + 1).value = h));
  set('B53', 'BATIMENT PRINCIPAL');
  set('B54', 'I - REZ-DE-CHAUSSEE');
  set('A55', 'B - APPAREILLAGE');
  set('A56', 7); set('B56', 'Evier à 2 bacs cuisine secondaire'); set('C56', 'u'); f('D56', '---E56', 0); f('F56', 'D56*E56', 0);
  set('A57', 7); set('B57', 'WC principal'); set('C57', 'u'); set('D57', 3); set('E57', 60000); f('F57', 'D57*E57', 180000);
  set('A58', 7); set('B58', 'Lavabo visiteur'); set('C58', 'u'); set('D58', 1); set('E58', 0); f('F58', 'D58*E58', 0);
  set('A59', 7); set('B59', 'Siphon de sol'); set('C59', 'u'); set('D59', 4); set('E59', 3000); f('F59', 'E59*D59', 12000);
  set('B60', 'TOTAL B'); f('F60', 'SUM(F56:F59)', 192000);
  set('B62', 'TOTAL BATIMENT PRINCIPAL'); f('F62', '#REF!+F60+#REF!', { error: '#REF!' as ExcelJS.ErrorValue });
  set('A64', "PR0JET DE CONSTRUCTION D'UNE RESIDENCE R+1 AVEC SOUS-SOL A ZOPAH COMMUNE D'ABOMEY-CALAVI");
  set('A65', 'RECAPITULATIF PLOMBERIE - SANITAIRE');
  set('A66', 'TOTAL PLOMBERIE - SANITAIRE'); f('E66', 'F60', 192000);

  // ----- Récapitulatif général -----
  set('C80', 'RECAPITULATIF GENERAL');
  set('A81', 'N°'); set('B81', 'DESIGNATION');
  set('A82', 1); set('B82', 'GROS - ŒUVRE'); f('E82', 'E36', 1284000);
  set('A83', 2); set('B83', 'PLOMBERIE - SANITAIRE'); f('E83', 'E66', 192000);
  set('B85', 'TOTAL CONSTRUCTION'); f('E85', 'E83+E82', 1476000);

  ws.mergeCells('B9:B9');
  ws.mergeCells('E36:F36');
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
