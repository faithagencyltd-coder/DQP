import { Drawer, Kbd } from '../../ds/primitives';

const SHORTCUTS: [string[], string][] = [
  [['Ctrl', 'K'], 'Recherche globale'],
  [['Ctrl', 'N'], 'Nouveau projet'],
  [['Ctrl', 'O'], 'Ouvrir un projet'],
  [['Ctrl', 'I'], 'Importer un fichier'],
  [['Ctrl', 'S'], 'Créer une version'],
  [['Ctrl', 'E'], 'Exporter le DQE en Excel'],
  [['Ctrl', 'Z'], 'Annuler'],
  [['Ctrl', 'Y'], 'Rétablir'],
  [['Ctrl', 'B'], 'Réduire / agrandir le menu'],
  [['F1'], 'Aide'],
  [['Tab'], 'Cellule suivante dans le DQE'],
  [['Entrée'], 'Valider une cellule'],
  [['Échap'], 'Annuler la saisie, fermer une fenêtre'],
];

export function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} title="Aide DQP" width={440}>
      <h4 className="mb-2 mt-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Le parcours</h4>
      <p className="mt-0 text-[12.5px] text-fg-2">
        Importer → Analyser → Vérifier → Métré → Quantifier → DQE → Estimer → Exporter. L’en-tête du projet montre l’état réel de chaque étape ; cliquez sur une
        étape pour y aller.
      </p>
      <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Niveaux de confiance</h4>
      <ul className="m-0 space-y-1.5 pl-4 text-[12.5px] text-fg-2">
        <li><b className="text-[#4ade80]">🟢 Confirmé</b> : lu directement dans un fichier, ou validé par vous.</li>
        <li><b className="text-[#fbbf24]">🟠 À vérifier</b> : interprété ou déduit par DQP.</li>
        <li><b className="text-[#ff7a7a]">🔴 Non déterminé</b> : absent des fichiers. DQP n’invente jamais une valeur.</li>
      </ul>
      <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Raccourcis clavier</h4>
      <table className="w-full text-[12.5px]">
        <tbody>
          {SHORTCUTS.map(([keys, label]) => (
            <tr key={label} className="border-b border-line-2">
              <td className="py-1.5 pr-3"><span className="flex gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span></td>
              <td className="py-1.5 text-fg-2">{label}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Formats</h4>
      <p className="mt-0 text-[12.5px] text-fg-2">
        Analysés aujourd’hui : Excel (.xlsx), CSV, PDF vectoriels. DXF et IFC : phase 4. DWG, Revit, Archicad : après étude des licences (voie IFC recommandée).
        Le module Importer affiche toujours l’état réel de chaque format.
      </p>
    </Drawer>
  );
}
