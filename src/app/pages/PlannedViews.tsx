// Modules dont le moteur n'est pas encore disponible : on montre l'architecture et
// l'état réel, jamais un faux résultat (§22 « Ne pas faire »).

import { Bot, Box, Calculator, Cpu, Map as MapIcon, Wifi, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, Pending } from '../ds/primitives';
import { useStore } from '../stores/app-store';

function Planned({ title, subtitle, icon, phase, children, side }: { title: string; subtitle: string; icon: ReactNode; phase: string; children: ReactNode; side?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <div>
        <h1 className="title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr]">
        <Pending title={title} phase={phase} icon={icon}>{children}</Pending>
        {side}
      </div>
    </div>
  );
}

export function Model3DView() {
  return (
    <Planned title="Modèle 3D" subtitle="Visualisation de la maquette du projet." icon={<Box size={34} />} phase="phase 4 (IFC)"
      side={
        <Card title="Ce qui est prévu">
          <ul className="roadmap m-0">
            <li>Lecture IFC 2x3 / IFC 4 (exports natifs de Revit et d’Archicad).</li>
            <li>Rotation, zoom, déplacement, coupes, plein écran ; calques par catégorie IFC.</li>
            <li>Sélection d’un élément → propriétés, quantités, source, confiance — comme sur le plan 2D.</li>
            <li>Chargement à la demande : la 3D n’est jamais chargée si on ne l’ouvre pas.</li>
          </ul>
        </Card>
      }>
      DQP n’affiche pas de modèle 3D fictif. La vue s’activera dès qu’un fichier IFC pourra être lu par le moteur.
    </Planned>
  );
}

export function PlansView() {
  return (
    <Planned title="Plans techniques" subtitle="Assistance à la production de documents techniques à partir d’un projet existant." icon={<MapIcon size={34} />} phase="phase 5"
      side={
        <Card title="Documents prévus">
          <ul className="roadmap m-0">
            <li>Proposition de plan électrique (points par pièce selon règles paramétrables).</li>
            <li>Schéma de plomberie (appareils, arrivées, évacuations).</li>
            <li>Informations nécessaires au plan de fondation.</li>
            <li>Plan de masse.</li>
          </ul>
          <p className="small muted mb-0">Chaque document est une proposition à contrôler, modifier puis valider. DQP ne garantit pas la conformité aux normes locales.</p>
        </Card>
      }>
      DQP ne dessine pas de bâtiment : il assistera la production de documents à partir des éléments validés du projet.
    </Planned>
  );
}

export function EngineeringView() {
  return (
    <Planned title="DQP Engineering" subtitle="Dimensionnement assisté des éléments en béton armé." icon={<Calculator size={34} />} phase="phase 6"
      side={
        <Card title="Chaque calcul affichera">
          <ul className="roadmap m-0">
            <li>Données utilisées et hypothèses.</li>
            <li>Formules, étapes et résultat.</li>
            <li>Norme ou référentiel choisi (BAEL 91 mod. 99, Eurocode 2…).</li>
            <li>Avertissements.</li>
          </ul>
          <div className="notice warn mb-0 mt-3"><b>Avertissement</b>Les résultats devront être vérifiés par un professionnel qualifié avant toute utilisation pour l’exécution.</div>
        </Card>
      }>
      Poteaux, poutres, dalles, escaliers, fondations.
    </Planned>
  );
}

const CONVERSIONS: [string, string, 'direct' | 'partielle' | 'à étudier' | 'impossible', string][] = [
  ['DXF', 'DWG', 'à étudier', 'Écriture DWG soumise à licence (Open Design Alliance).'],
  ['DWG', 'DXF', 'à étudier', 'Lecture DWG soumise à licence (Open Design Alliance).'],
  ['Revit (RVT)', 'IFC', 'à étudier', 'Format fermé : export IFC depuis Revit ou API Autodesk sous licence.'],
  ['IFC', 'formats compatibles', 'partielle', 'Format ouvert ; certaines données propres à un logiciel peuvent être perdues.'],
  ['SKP', 'formats compatibles', 'à étudier', 'SDK SketchUp soumis à conditions de licence.'],
  ['Renommer une extension', '—', 'impossible', 'DQP ne crée jamais un faux fichier en changeant seulement son extension.'],
];

export function ConverterView() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <div>
        <h1 className="title">DQP Converter</h1>
        <p className="subtitle">Conversions réalisées par des moteurs fiables, avec indication des pertes possibles.</p>
      </div>
      <Pending title="Aucune conversion disponible dans cette version" phase="phase 7" icon={<Cpu size={30} />}>
        Chaque conversion sera classée « directe », « partielle » ou « impossible », avec son explication et un rapport des pertes.
      </Pending>
      <Card title="Étude préalable des conversions envisagées" bodyClass="p-0">
        <table className="t">
          <thead><tr><th>De</th><th>Vers</th><th>Classement envisagé</th><th>Contrainte technique ou juridique</th></tr></thead>
          <tbody>
            {CONVERSIONS.map(([a, b, c, d]) => (
              <tr key={a + b}><td><b>{a}</b></td><td>{b}</td><td><span className={`badge ${c === 'impossible' ? 'bad' : c === 'partielle' ? 'warn' : 'grey'}`}>{c}</span></td><td className="small">{d}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function AiView() {
  const s = useStore();
  return (
    <Planned title="DQP AI" subtitle="Assistant d’analyse, de classification et d’explication — l’IA assiste, le moteur déterministe calcule." icon={<Bot size={34} />} phase="phase 8"
      side={
        <Card title="Connexion" icon={s.online ? <Wifi size={15} /> : <WifiOff size={15} />}>
          <p className="m-0 text-[12.5px] text-fg-2">
            {s.online ? 'Connexion Internet disponible.' : 'Hors ligne.'} Les fonctions d’IA nécessiteront Internet. L’import, l’analyse, le DQE, l’estimation et les exports
            fonctionnent entièrement hors ligne.
          </p>
          <ul className="roadmap mb-0 mt-3">
            <li>Suggestions toujours marquées 🟠 « à vérifier » et traçables.</li>
            <li>Aucun calcul confié à l’IA.</li>
            <li>Données envoyées minimisées, avec votre accord.</li>
          </ul>
        </Card>
      }>
      Interprétation des fichiers, explication des résultats, recherche d’incohérences, rapprochement avec la bibliothèque de prix.
    </Planned>
  );
}
