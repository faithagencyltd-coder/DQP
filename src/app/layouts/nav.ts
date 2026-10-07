// Navigation de DQP : un seul endroit qui décrit les modules (barre latérale,
// onglets du projet, recherche globale).

import {
  BookOpen, Bot, Box, Calculator, ChartColumn, ClipboardList, Cpu, FileSpreadsheet, FileText, FolderKanban,
  Import, LayoutDashboard, LayoutGrid, Map as MapIcon, Ruler, ScanLine, ScanSearch, Settings, Sigma, type LucideIcon,
} from 'lucide-react';
import type { View } from '../stores/app-store';

export interface NavItem {
  view: View;
  label: string;
  icon: LucideIcon;
  needsProject?: boolean;
  /** Module dont le moteur n'est pas encore disponible (affiché honnêtement). */
  phase?: string;
  hint?: string;
}

export const SIDEBAR: { group: string; items: NavItem[] }[] = [
  {
    group: 'Espace',
    items: [
      { view: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { view: 'projects', label: 'Projets', icon: FolderKanban },
      { view: 'import', label: 'Importer', icon: Import, needsProject: true },
    ],
  },
  {
    group: 'Analyse',
    items: [
      { view: 'analysis', label: 'Analyse', icon: ScanSearch, needsProject: true },
      { view: 'detection', label: 'Détection', icon: ScanLine, needsProject: true },
      { view: 'metre', label: 'Métré', icon: Ruler, needsProject: true },
      { view: 'quantitatif', label: 'Quantitatif', icon: Sigma, needsProject: true },
    ],
  },
  {
    group: 'Chiffrage',
    items: [
      { view: 'dqe', label: 'DQE', icon: FileSpreadsheet, needsProject: true },
      { view: 'estimate', label: 'Estimation', icon: ChartColumn, needsProject: true },
      { view: 'prices', label: 'Bibliothèque de prix', icon: BookOpen },
    ],
  },
  {
    group: 'Production',
    items: [
      { view: 'plans', label: 'Plans techniques', icon: MapIcon, phase: 'Phase 5' },
      { view: 'engineering', label: 'Engineering', icon: Calculator, phase: 'Phase 6' },
      { view: 'converter', label: 'Converter', icon: Cpu, phase: 'Phase 7' },
      { view: 'documents', label: 'Documents', icon: FileText, needsProject: true },
      { view: 'ai', label: 'DQP AI', icon: Bot, phase: 'Phase 8' },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { view: 'settings', label: 'Paramètres', icon: Settings };

/** Onglets de l'espace de travail d'un projet (§7). */
export const WORKSPACE_TABS: NavItem[] = [
  { view: 'overview', label: 'Vue d’ensemble', icon: LayoutGrid },
  { view: 'model3d', label: 'Modèle 3D', icon: Box, phase: 'Phase 4', hint: 'Disponible avec l’import IFC (phase 4)' },
  { view: 'viewer', label: 'Plan 2D', icon: MapIcon },
  { view: 'analysis', label: 'Analyse', icon: ScanSearch },
  { view: 'detection', label: 'Détection', icon: ScanLine },
  { view: 'metre', label: 'Métré', icon: Ruler },
  { view: 'quantitatif', label: 'Quantitatif', icon: Sigma },
  { view: 'dqe', label: 'DQE', icon: FileSpreadsheet },
  { view: 'estimate', label: 'Estimation', icon: ChartColumn },
  { view: 'documents', label: 'Documents', icon: ClipboardList },
];

export const WORKSPACE_VIEWS = new Set<View>([...WORKSPACE_TABS.map((t) => t.view), 'import', 'project']);

export const ALL_NAV: NavItem[] = [
  ...SIDEBAR.flatMap((g) => g.items),
  ...WORKSPACE_TABS.filter((t) => !SIDEBAR.some((g) => g.items.some((i) => i.view === t.view))),
  { view: 'project', label: 'Informations du projet', icon: FolderKanban, needsProject: true },
  SETTINGS_ITEM,
];
