// Modèle de données DQP (cahier des charges §35).
// Tout ce qui est stocké dans un projet est sérialisable en JSON.

/** Niveau de confiance d'une information (§7). */
export type Confidence = 'confirmed' | 'to_verify' | 'undetermined';

export type Origin = 'import' | 'manual' | 'library' | 'calculated';

/** D'où vient une information (§37 Traçabilité). */
export interface SourceRef {
  fileId: string;
  fileName: string;
  sheet?: string;
  cell?: string;
  /** Formule telle qu'écrite dans le fichier source. */
  formula?: string;
}

/** Une valeur numérique suivie : valeur, état, origine, source et explication. */
export interface TrackedNumber {
  /** null = non déterminé : DQP n'invente jamais une valeur (§36). */
  value: number | null;
  status: Confidence;
  origin: Origin;
  source?: SourceRef;
  /**
   * Expression liant cette quantité à d'autres lignes, ex. `{L:abc123}*2.2`.
   * Recalculée à chaque modification de la ligne référencée.
   */
  expression?: string;
  /** Pourquoi cet état (ex. « prix unitaire nul dans le fichier »). */
  note?: string;
}

export interface ManualEdit {
  field: LineField;
  before: string | number | null;
  after: string | number | null;
  at: string;
}

export type LineField =
  | 'number'
  | 'designation'
  | 'unit'
  | 'quantity'
  | 'unitPrice'
  | 'coefficient'
  | 'lossPercent'
  | 'observation';

/** Ligne de DQE / ouvrage (WorkItem + Quantity + Price). */
export interface DqeLine {
  id: string;
  number: string;
  designation: string;
  unit: string;
  quantity: TrackedNumber;
  unitPrice: TrackedNumber;
  /** Coefficient multiplicateur appliqué à la quantité (1 par défaut). */
  coefficient: number;
  /** Perte / chute en % appliquée à la quantité (0 par défaut). */
  lossPercent: number;
  observation: string;
  priceItemId?: string;
  source?: SourceRef;
  /** Montant lu dans le fichier source, pour contrôle croisé. */
  sourceAmount?: number | null;
  edits: ManualEdit[];
}

/** Section d'un lot : ex. Bâtiment principal › Rez-de-chaussée › A - Tuyauterie. */
export interface DqeSection {
  id: string;
  /** Regroupements parents (zone, niveau…), du plus large au plus précis. */
  path: string[];
  title: string;
  lines: DqeLine[];
  source?: SourceRef;
}

export interface Lot {
  id: string;
  code: string;
  name: string;
  sections: DqeSection[];
  /** Total du lot tel qu'annoncé par le fichier source (contrôle croisé). */
  sourceTotal?: { value: number | null; source: SourceRef };
}

export interface SourceFile {
  id: string;
  name: string;
  kind: 'excel' | 'csv' | 'pdf' | 'dwg' | 'dxf' | 'ifc' | 'revit' | 'archicad' | 'other';
  size: number;
  importedAt: string;
  /** Chemin de la copie dans le dossier projet (Fichiers_sources). */
  storedPath?: string;
}

export type AlertSeverity = 'error' | 'warning' | 'info';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  code: string;
  message: string;
  lotId?: string;
  sectionId?: string;
  lineId?: string;
  source?: SourceRef;
}

/** Information de projet détectée dans un fichier, avec sa source. */
export interface DetectedInfo {
  key: 'title' | 'location' | 'country' | 'date' | 'phase' | 'projectType';
  value: string;
  status: Confidence;
  source?: SourceRef;
  note?: string;
}

export interface AnalysisResult {
  id: string;
  fileId: string;
  fileName: string;
  analyzedAt: string;
  engineVersion: string;
  detected: DetectedInfo[];
  /** Alertes propres au fichier (formules cassées, totaux faux…). */
  fileAlerts: Alert[];
  stats: { lots: number; sections: number; lines: number; formulas: number; brokenFormulas: number };
  /** Total général annoncé par le fichier. */
  sourceGrandTotal?: { value: number | null; source: SourceRef };
}

export interface JournalEntry {
  at: string;
  action: string;
  detail?: string;
}

export interface ProjectInfo {
  name: string;
  client: string;
  location: string;
  projectType: string;
  projectTypeStatus: Confidence;
  phase: string;
  date: string;
}

export interface ProjectSettings {
  currency: string;
  vatRate: number;
  /** Arrondi des montants à l'unité monétaire (FCFA : pas de centimes). */
  roundAmounts: boolean;
}

export interface Project {
  schema: 1;
  id: string;
  info: ProjectInfo;
  settings: ProjectSettings;
  sourceFiles: SourceFile[];
  lots: Lot[];
  analyses: AnalysisResult[];
  journal: JournalEntry[];
  createdAt: string;
  updatedAt: string;
}

/** Bibliothèque de prix (§14). */
export interface PriceItem {
  id: string;
  code: string;
  designation: string;
  unit: string;
  price: number;
  supplier: string;
  category: 'materiau' | 'main_oeuvre' | 'fourniture' | 'equipement' | 'prestation' | 'ouvrage';
  location: string;
  updatedAt: string;
  source?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  folder: string;
  updatedAt: string;
  total: number;
  lines: number;
}

export interface ProjectVersion {
  id: string;
  label: string;
  createdAt: string;
  file: string;
}
