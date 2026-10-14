// Menu principal (§4.1), dans l'ordre du cahier des charges. Chaque entrée indique son
// module (pour l'adapter au rôle) et son état réel : disponible ou à venir (phase prévue).
import {
  Banknote, Bot, Boxes, Briefcase, Building2, CalendarRange, Calculator, ClipboardList, CreditCard, FileSpreadsheet, FileText,
  FolderOpen, LayoutDashboard, Library, Map, Receipt, Settings, ShieldCheck, ShoppingCart, Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { Module } from '../lib/types';

export interface NavItem {
  path: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  module?: Module;
  /** Phase du cahier des charges où le module sera livré (absent = disponible). */
  soon?: string;
  group: 'pilotage' | 'etudes' | 'gestion' | 'compte';
  adminOnly?: boolean;
}

export const NAV: NavItem[] = [
  { path: '/app', label: 'Tableau de bord', icon: LayoutDashboard, group: 'pilotage' },
  { path: '/app/clients', label: 'Clients et fournisseurs', icon: Users, module: 'clients', group: 'pilotage' },
  { path: '/app/projets', label: 'Projets et chantiers', icon: Briefcase, module: 'projets', group: 'pilotage' },
  { path: '/app/plans', label: 'Plans techniques', icon: Map, module: 'plans', group: 'etudes' },
  { path: '/app/metres', label: 'Métrés et quantitatifs', icon: Calculator, module: 'metres', group: 'etudes' },
  { path: '/app/prix', label: 'Bibliothèque de prix', icon: Library, module: 'prix', group: 'etudes' },
  { path: '/app/dqe', label: 'DQE et BPU', icon: FileSpreadsheet, module: 'dqe', group: 'etudes' },
  { path: '/app/devis', label: 'Devis', icon: FileText, module: 'devis', group: 'etudes' },
  { path: '/app/achats', label: 'Achats et commandes', icon: ShoppingCart, module: 'achats', group: 'gestion' },
  { path: '/app/stocks', label: 'Stocks', icon: Boxes, module: 'stocks', group: 'gestion' },
  { path: '/app/factures', label: 'Facturation', icon: Receipt, module: 'factures', group: 'gestion' },
  { path: '/app/depenses', label: 'Dépenses', icon: Banknote, module: 'depenses', group: 'gestion' },
  { path: '/app/planning', label: 'Planning', icon: CalendarRange, module: 'planning', group: 'gestion', soon: 'Phase 5' },
  { path: '/app/documents', label: 'Documents et rapports', icon: FolderOpen, module: 'documents', group: 'gestion' },
  { path: '/app/assistant', label: 'Assistant IA', icon: Bot, group: 'gestion', soon: 'Phase 4' },
  { path: '/app/abonnement', label: 'Abonnement', icon: CreditCard, group: 'compte' },
  { path: '/app/parametres', label: 'Paramètres', icon: Settings, group: 'compte' },
  { path: '/app/journal', label: 'Journal d’activité', icon: ClipboardList, group: 'compte' },
  { path: '/app/admin', label: 'Administration PLANORA', icon: ShieldCheck, group: 'compte', adminOnly: true },
];

export const GROUP_LABEL = { pilotage: 'Pilotage', etudes: 'Études et chiffrage', gestion: 'Gestion de chantier', compte: 'Compte' };
export const ORG_ICON = Building2;
