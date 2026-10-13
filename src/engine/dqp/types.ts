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
  /** Pour un plan : page (à partir de 1), zone [x, y, largeur, hauteur] en points, texte lu. */
  page?: number;
  bbox?: [number, number, number, number];
  text?: string;
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
  | 'code'
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
  /** Code d'ouvrage (bibliothèque ou saisi). */
  code?: string;
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
  key: 'title' | 'location' | 'country' | 'date' | 'phase' | 'projectType' | 'client' | 'architect';
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
  stats: { lots: number; sections: number; lines: number; formulas: number; brokenFormulas: number; pages?: number; elements?: number };
  /** Résumé page par page pour un plan PDF. */
  pages?: PlanPage[];
  /** Total général annoncé par le fichier. */
  sourceGrandTotal?: { value: number | null; source: SourceRef };
}

export interface JournalEntry {
  at: string;
  action: string;
  detail?: string;
  /** Total HT du projet après l'action (historique du montant estimatif). */
  total?: number;
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

// ---------- Éléments du bâtiment (§4, §8, §16) ----------

export type ElementKind = 'level' | 'room' | 'equipment' | 'opening' | 'surface_total';

/** Valeur d'une propriété d'élément, avec son état et sa source. */
export interface DetectedValue {
  value: number | string | null;
  unit?: string;
  status: Confidence;
  source?: SourceRef;
  note?: string;
}

export interface ElementEdit {
  prop: string;
  before: string | number | null;
  after: string | number | null;
  at: string;
}

export interface BuildingElement {
  id: string;
  kind: ElementKind;
  /** Libellé tel que lu (« CHAMBRE 1 »). */
  name: string;
  /** Catégorie normalisée (« Chambre », « WC », « Porte »…). */
  category: string;
  level?: string;
  /** Propriétés : surface, largeur, hauteur, code… */
  props: Record<string, DetectedValue>;
  /** État de la détection elle-même. */
  status: Confidence;
  note?: string;
  source: SourceRef;
  validation?: { state: 'accepted' | 'rejected'; at: string };
  edits: ElementEdit[];
}

export type PlanPageKind = 'plan' | 'coupe' | 'facade' | 'masse' | 'toiture' | 'fondation' | 'electricite' | 'plomberie' | 'structure' | 'autre';

export interface PlanPage {
  number: number;
  kind: PlanPageKind;
  title?: string;
  level?: string;
  scale?: number;
  width: number;
  height: number;
  textLines: number;
  vectorOps: number;
  images: number;
  scanned: boolean;
  dimensions: number;
}

/** Choix de l'utilisateur entre des sources qui divergent (§27). */
export interface Resolution {
  key: string;
  /** Source retenue (nom de fichier, « DQE » ou « Saisie »). */
  chosen: string;
  value: number | string;
  at: string;
}

// ---------- Métré sur plans (§9, §10 — phase 3) ----------

/** Échelle d'une planche : millimètres réels par point de page PDF. */
export interface PlanScale {
  fileId: string;
  page: number;
  mmPerPt: number;
  source: 'written' | 'calibrated';
  /** Ex. « 1/100 lue sur la planche » ou « étalonnée sur une cote de 4,20 m ». */
  label: string;
  at: string;
}

export type MeasureKind = 'length' | 'area' | 'wall' | 'count';

export interface Deduction {
  label: string;
  /** Dimensions en mètres. */
  width: number;
  height: number;
  count: number;
  elementId?: string;
}

/** Mesure prise sur un plan (Measurement du §35). */
export interface Measurement {
  id: string;
  kind: MeasureKind;
  label: string;
  fileId: string;
  fileName: string;
  page: number;
  /** Points en coordonnées de page (points PDF, origine en haut à gauche). */
  points: [number, number][];
  /** Tronçons disjoints (propositions automatiques) : remplace `points` pour les longueurs. */
  parts?: [number, number][][];
  /** Hauteur en mètres (murs) : saisie par l'utilisateur, jamais devinée. */
  height?: number | null;
  deductions: Deduction[];
  origin: 'manual' | 'proposal';
  /** Proposition automatique non encore acceptée. */
  accepted?: boolean;
  note?: string;
  createdAt: string;
}

export interface Project {
  schema: 3;
  id: string;
  info: ProjectInfo;
  settings: ProjectSettings;
  sourceFiles: SourceFile[];
  lots: Lot[];
  analyses: AnalysisResult[];
  elements: BuildingElement[];
  resolutions: Resolution[];
  scales: PlanScale[];
  measurements: Measurement[];
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
  observation?: string;
  /** Historique des prix (ancien prix, date du changement). */
  history?: { price: number; at: string }[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  folder: string;
  updatedAt: string;
  total: number;
  lines: number;
  /** Étapes terminées / nombre d'étapes du parcours (§32). */
  progress?: { done: number; total: number; current: string };
  projectType?: string;
  location?: string;
  files?: number;
}

export interface ProjectVersion {
  id: string;
  label: string;
  createdAt: string;
  file: string;
}
