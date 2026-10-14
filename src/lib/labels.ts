// Libellés français des valeurs stockées.
import type { Action, Module, Role } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  proprietaire: 'Propriétaire',
  administrateur: 'Administrateur d’entreprise',
  directeur: 'Directeur / chef de projet',
  architecte: 'Architecte / ingénieur',
  metreur: 'Métreur / économiste',
  conducteur: 'Conducteur de travaux',
  comptable: 'Comptable / gestionnaire',
  commercial: 'Commercial / chargé d’affaires',
  lecteur: 'Lecture seule',
};

export const MODULE_LABEL: Record<Module, string> = {
  clients: 'Clients et fournisseurs',
  projets: 'Projets et chantiers',
  documents: 'Documents',
  prix: 'Bibliothèque de prix',
  metres: 'Métrés',
  dqe: 'DQE et BPU',
  devis: 'Devis',
  factures: 'Facturation',
  depenses: 'Dépenses',
  achats: 'Achats',
  stocks: 'Stocks',
  planning: 'Planning',
  plans: 'Plans techniques',
  rapports: 'Rapports',
  equipe: 'Équipe et permissions',
  entreprise: 'Paramètres de l’entreprise',
  abonnement: 'Abonnement',
};

export const ACTION_LABEL: Record<Action, string> = {
  consulter: 'Consulter', creer: 'Créer', modifier: 'Modifier', supprimer: 'Supprimer',
  valider: 'Valider', exporter: 'Exporter', partager: 'Partager', administrer: 'Administrer',
};

export const PROJECT_TYPES: Record<string, string> = {
  construction_neuve: 'Construction neuve', renovation: 'Rénovation', amenagement_interieur: 'Aménagement intérieur',
  rehabilitation: 'Réhabilitation', extension: 'Extension', finition: 'Travaux de finition', vrd: 'Voirie et réseaux divers',
  commercial: 'Construction commerciale', residentiel: 'Construction résidentielle', industriel: 'Travaux industriels', entretien: 'Travaux d’entretien',
};

export const PROJECT_STATUS: Record<string, { label: string; tone: 'grey' | 'navy' | 'signal' | 'ok' | 'warn' | 'bad' }> = {
  prospect: { label: 'Prospect', tone: 'grey' },
  etude: { label: 'En étude', tone: 'navy' },
  en_attente: { label: 'En attente', tone: 'warn' },
  en_cours: { label: 'Chantier en cours', tone: 'signal' },
  suspendu: { label: 'Suspendu', tone: 'warn' },
  termine: { label: 'Terminé', tone: 'ok' },
  annule: { label: 'Annulé', tone: 'bad' },
};

export const DEFAULT_LOTS = [
  'Installation de chantier', 'Terrassement', 'Fondations', 'Gros œuvre', 'Maçonnerie', 'Béton armé et structure',
  'Charpente et couverture', 'Étanchéité', 'Menuiserie bois', 'Menuiserie aluminium', 'Métallerie', 'Électricité',
  'Plomberie', 'Climatisation et ventilation', 'Cloisons et faux plafonds', 'Carrelage', 'Peinture', 'Revêtements',
  'Aménagement intérieur', 'Signalétique et communication visuelle', 'VRD', 'Espaces extérieurs', 'Nettoyage et réception',
];

export const CLIENT_TYPES: Record<string, string> = {
  particulier: 'Particulier', entreprise: 'Entreprise', administration: 'Administration', ong: 'ONG / organisme', promoteur: 'Promoteur immobilier', autre: 'Autre',
};

export const PRICE_CATEGORIES = [
  'Ciment', 'Sable', 'Gravier', 'Fer à béton', 'Béton', 'Parpaings et briques', 'Bois', 'Charpente', 'Couverture', 'Peinture',
  'Carrelage', 'Revêtements', 'Menuiserie bois', 'Menuiserie aluminium', 'Vitrerie', 'Électricité', 'Plomberie', 'Climatisation',
  'Étanchéité', 'Faux plafonds', 'Cloisons', 'Quincaillerie', 'Matériel de chantier', 'Main-d’œuvre', 'Location d’équipements',
  'Transport', 'Prestations spécialisées', 'Ouvrages composés', 'Autre',
];

export const QUOTE_STATUS: Record<string, { label: string; tone: 'grey' | 'navy' | 'signal' | 'ok' | 'warn' | 'bad' }> = {
  brouillon: { label: 'Brouillon', tone: 'grey' },
  en_validation: { label: 'En attente de validation', tone: 'warn' },
  envoye: { label: 'Envoyé', tone: 'navy' },
  accepte: { label: 'Accepté', tone: 'ok' },
  refuse: { label: 'Refusé', tone: 'bad' },
  expire: { label: 'Expiré', tone: 'warn' },
  annule: { label: 'Annulé', tone: 'bad' },
  converti: { label: 'Converti', tone: 'ok' },
  verifie: { label: 'Vérifié', tone: 'navy' },
  approuve: { label: 'Approuvé', tone: 'ok' },
};

export const WORK_STATUS: Record<string, { label: string; tone: 'grey' | 'navy' | 'ok' }> = {
  travail: { label: 'Document de travail', tone: 'grey' },
  verifie: { label: 'Vérifié', tone: 'navy' },
  approuve: { label: 'Approuvé', tone: 'ok' },
  archive: { label: 'Archivé', tone: 'grey' },
};

export const DOC_TYPES: Record<string, string> = {
  plan: 'Plan', devis: 'Devis', dqe_bpu: 'DQE / BPU', facture: 'Facture', bon_commande: 'Bon de commande', contrat: 'Contrat',
  rapport: 'Rapport', photo: 'Photo', compte_rendu: 'Compte rendu', proces_verbal: 'Procès-verbal', reception: 'Document de réception',
  fiche_technique: 'Fiche technique', administratif: 'Document administratif', autre: 'Autre',
};

export const COUNTRIES: Record<string, string> = {
  BJ: 'Bénin', CI: 'Côte d’Ivoire', TG: 'Togo', BF: 'Burkina Faso', SN: 'Sénégal', ML: 'Mali', NE: 'Niger', GN: 'Guinée',
  CM: 'Cameroun', GA: 'Gabon', CG: 'Congo', CD: 'RD Congo', GH: 'Ghana', NG: 'Nigeria', FR: 'France', AUTRE: 'Autre',
};

export const fmtDate = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('fr-FR') : '—');
export const fmtDateTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const fmtSize = (n: number) => (n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toFixed(0)} Ko` : `${(n / 1048576).toFixed(1).replace('.', ',')} Mo`);

export const INVOICE_STATUS: Record<string, { label: string; tone: 'grey' | 'navy' | 'signal' | 'ok' | 'warn' | 'bad' }> = {
  brouillon: { label: 'Brouillon', tone: 'grey' },
  emise: { label: 'Émise', tone: 'navy' },
  partielle: { label: 'Partiellement payée', tone: 'warn' },
  payee: { label: 'Payée', tone: 'ok' },
  annulee: { label: 'Annulée', tone: 'grey' },
};

export const PAYMENT_METHODS: Record<string, string> = {
  especes: 'Espèces', virement: 'Virement bancaire', cheque: 'Chèque', mobile_money: 'Mobile Money', carte: 'Carte bancaire', autre: 'Autre',
};

export const EXPENSE_CATEGORIES: Record<string, string> = {
  materiaux: 'Achat de matériaux', main_oeuvre: 'Main-d’œuvre', transport: 'Transport', location: 'Location de matériel', sous_traitance: 'Sous-traitance',
  carburant: 'Carburant', deplacement: 'Hébergement et déplacements', administratif: 'Frais administratifs', autre: 'Autres dépenses',
};

export const EXPENSE_STATUS: Record<string, { label: string; tone: 'grey' | 'navy' | 'warn' | 'ok' }> = {
  engagee: { label: 'Engagée', tone: 'grey' },
  facturee: { label: 'Facturée (à payer)', tone: 'warn' },
  payee: { label: 'Payée', tone: 'ok' },
};

/** Date du jour (fuseau de l'appareil), au format AAAA-MM-JJ. */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
