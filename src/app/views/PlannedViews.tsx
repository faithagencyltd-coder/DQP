// Modules prévus dans les phases suivantes : on montre ce qui viendra, sans simuler
// une fonction qui n'existe pas encore (§36, §44).

import { Panel, PhaseNotice } from '../components/ui';
import { useStore } from '../store';

export function PlansView() {
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 className="title">Plans techniques</h1>
      <p className="subtitle">Assistance à la production de documents techniques à partir d’un projet existant.</p>
      <PhaseNotice phase="Phase 5">
        DQP ne dessine pas de bâtiment. À partir d’un projet analysé, il proposera des documents techniques à contrôler, modifier, valider puis exporter.
      </PhaseNotice>
      <Panel title="Documents prévus">
        <ul className="roadmap" style={{ margin: 0 }}>
          <li>Proposition de plan électrique (implantation des points à partir des pièces détectées).</li>
          <li>Schéma de plomberie (appareils sanitaires, arrivées, évacuations).</li>
          <li>Préparation des informations nécessaires au plan de fondation.</li>
          <li>Préparation du plan de masse.</li>
        </ul>
        <p className="small muted">Chaque document généré sera une proposition à vérifier : DQP n’affirmera jamais qu’un plan est conforme aux normes locales.</p>
      </Panel>
    </div>
  );
}

export function EngineeringView() {
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 className="title">DQP Engineering</h1>
      <p className="subtitle">Assistance au dimensionnement d’éléments en béton armé.</p>
      <PhaseNotice phase="Phase 6">
        Poteaux, poutres, dalles, escaliers, fondations. Chaque calcul affichera les données utilisées, les hypothèses, la formule, le résultat, la norme ou le référentiel
        choisi et les avertissements.
      </PhaseNotice>
      <div className="notice warn">
        <b>Avertissement</b>
        Les résultats de dimensionnement devront être vérifiés par un professionnel qualifié avant toute utilisation pour l’exécution.
      </div>
    </div>
  );
}

const CONVERSIONS: [string, string, 'direct' | 'partielle' | 'à étudier' | 'impossible', string][] = [
  ['DXF', 'DWG', 'à étudier', 'Écriture DWG soumise à licence (Open Design Alliance).'],
  ['DWG', 'DXF', 'à étudier', 'Lecture DWG soumise à licence (Open Design Alliance).'],
  ['Revit (RVT)', 'IFC', 'à étudier', 'Format propriétaire : export IFC depuis Revit ou API Autodesk sous licence.'],
  ['IFC', 'formats compatibles', 'partielle', 'Format ouvert ; certaines données propres à un logiciel peuvent être perdues.'],
  ['SKP', 'formats compatibles', 'à étudier', 'SDK SketchUp soumis à conditions de licence.'],
  ['Renommer une extension', '—', 'impossible', 'DQP ne crée jamais un faux fichier en changeant seulement son extension.'],
];

export function ConverterView() {
  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 className="title">DQP Converter</h1>
      <p className="subtitle">Conversions de fichiers réalisées par des moteurs de conversion fiables, avec indication des pertes possibles.</p>
      <PhaseNotice phase="Phase 7">
        Aucune conversion n’est disponible dans cette version. Chaque conversion sera classée « directe », « partielle » ou « impossible », avec l’explication.
      </PhaseNotice>
      <Panel title="Étude préalable des conversions envisagées" flush>
        <table className="t">
          <thead><tr><th>De</th><th>Vers</th><th>Classement envisagé</th><th>Contrainte technique ou juridique</th></tr></thead>
          <tbody>
            {CONVERSIONS.map(([a, b, c, d]) => (
              <tr key={a + b}><td>{a}</td><td>{b}</td><td><span className={`badge ${c === 'impossible' ? 'bad' : c === 'partielle' ? 'warn' : 'grey'}`}>{c}</span></td><td className="small">{d}</td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

export function AiView() {
  const s = useStore();
  return (
    <div style={{ maxWidth: 900 }}>
      <h1 className="title">DQP AI</h1>
      <p className="subtitle">Assistant d’analyse, de classification et d’explication — l’IA assiste, le moteur déterministe calcule.</p>
      <PhaseNotice phase="Phase 8">
        L’assistant aidera à interpréter les fichiers, expliquer les résultats, rechercher des incohérences et préparer le DQE. Les calculs resteront faits par les moteurs
        déterministes de DQP.
      </PhaseNotice>
      <div className={`notice ${s.online ? '' : 'warn'}`}>
        <b>Connexion Internet {s.online ? 'disponible' : 'absente'}</b>
        Les fonctions d’IA nécessiteront une connexion Internet. L’import, l’analyse Excel/CSV, le DQE, l’estimation et les exports fonctionnent entièrement hors ligne.
      </div>
    </div>
  );
}
