// Types des données stockées (miroir des tables de supabase/migrations).
import type { DocBody, TaxDef } from '../engine/dqe';
import type { MetreLine, MetreRules } from '../engine/metre';
import type { CostBreakdown } from '../engine/debourse';

export type Role = 'proprietaire' | 'administrateur' | 'directeur' | 'architecte' | 'metreur' | 'conducteur' | 'comptable' | 'commercial' | 'lecteur';
export type Action = 'consulter' | 'creer' | 'modifier' | 'supprimer' | 'valider' | 'exporter' | 'partager' | 'administrer';
export type Module =
  | 'clients' | 'projets' | 'documents' | 'prix' | 'metres' | 'dqe' | 'devis' | 'factures' | 'depenses' | 'achats'
  | 'stocks' | 'planning' | 'plans' | 'rapports' | 'equipe' | 'entreprise' | 'abonnement';

export interface Plan {
  id: string; name: string; description: string; price_month: number; price_year: number; currency: string;
  max_users: number | null; max_projects: number | null; max_documents: number | null; max_storage_mb: number;
  ai_quota_month: number; modules: string[]; trial_days: number; sort: number; active: boolean;
}

export interface Organization {
  id: string; name: string; legal_name: string | null; country: string; currency: string; city: string | null; address: string | null;
  phone: string | null; email: string | null; website: string | null; logo_path: string | null;
  legal_ids: { label: string; value: string }[]; bank_details: string | null; default_taxes: TaxDef[];
  quote_validity_days: number; payment_terms: string; quote_footer: string | null;
  metre_rules: MetreRules; pricing_method: Omit<CostBreakdown, 'components' | 'baseQty'>;
  payment_days?: number; reminder_before_days?: number; reminder_every_days?: number;
  plan_id: string; plan_status: 'essai' | 'actif' | 'expire' | 'suspendu' | 'annule'; plan_period: 'mois' | 'an' | null; plan_ends_at: string;
  suspended_reason: string | null; created_at: string;
}

export interface Membership { org_id: string; user_id: string; role: Role; organizations: Organization }
export interface Profile { id: string; email: string; first_name: string; last_name: string; phone: string | null }

export interface Contact {
  id: string; org_id: string; kind: 'client' | 'fournisseur'; client_type: string | null; name: string; legal_name: string | null;
  contact_person: string | null; phone: string | null; email: string | null; address: string | null; city: string | null; country: string | null;
  legal_ids: string | null; categories: string[]; lead_time_days: number | null; rating: number | null; notes: string | null;
  archived_at: string | null; created_at: string; updated_at: string;
}

export interface Project {
  id: string; org_id: string; reference: string; name: string; client_id: string | null; project_type: string; location: string | null;
  city: string | null; country: string | null; description: string | null; start_date: string | null; end_date: string | null;
  manager_id: string | null; budget_estimate: number | null; budget_validated: number | null; budget_revised?: number | null; margin_target_pct?: number | null; progress_method?: 'taches' | 'quantites' | 'ponderation'; status: string;
  archived_at: string | null; created_at: string; updated_at: string;
}

export interface ProjectLot { id: string; org_id: string; project_id: string; name: string; sort: number; budget?: number | null }

export interface DocumentRow {
  id: string; org_id: string; project_id: string | null; lot: string | null; doc_type: string; name: string; storage_path: string;
  size_bytes: number; mime: string; version: number; previous_id: string | null; status: string; comment: string | null;
  uploaded_by: string | null; created_at: string;
}

export interface PriceItem {
  id: string; org_id: string; kind: 'article' | 'ouvrage'; code: string; designation: string; category: string; description: string | null;
  unit: string; purchase_price: number | null; sale_price: number | null; currency: string; supplier_id: string | null;
  country: string | null; city: string | null; price_date: string | null; source: string | null; purchase_conditions: string | null;
  loss_pct: number | null; breakdown: CostBreakdown | null; archived_at: string | null; updated_at: string;
  trade?: string | null; section?: string | null; metre_method?: string | null; formula?: string | null; observations?: string | null;
  validation_status?: 'a_verifier' | 'valide' | 'rejete'; validated_by?: string | null; validated_at?: string | null;
  source_ref?: { file?: string; sheet?: string | null; sources?: { cell: string | null; number: string; section: string; quantity: number | null; price: number | null; quantityFormula?: string }[] } | null;
  import_id?: string | null;
}

export interface MetreDoc {
  id: string; org_id: string; project_id: string | null; reference: string; title: string; rules: MetreRules; lines: MetreLine[];
  status: 'travail' | 'verifie' | 'approuve'; archived_at: string | null; updated_at: string; created_at: string;
}

export interface QuoteSettings { currency: string; taxes: TaxDef[]; discountPct?: number | null }

export interface Quote {
  id: string; org_id: string; kind: 'dqe' | 'bpu' | 'devis'; reference: string; title: string; project_id: string | null; client_id: string | null;
  source_kind: string | null; source_id: string | null; status: string; issue_date: string; valid_until: string | null; version: number;
  locked: boolean; body: DocBody; settings: QuoteSettings; payment_terms: string | null; execution_delay: string | null; notes: string | null;
  total_ht: number | null; total_ttc: number | null; incomplete_lines: number; decision_at: string | null; decision_note: string | null;
  archived_at: string | null; validated_at: string | null; created_at: string; updated_at: string;
}

export interface QuoteVersion { id: string; quote_id: string; version: number; title: string; status: string; body: DocBody; settings: QuoteSettings; total_ht: number | null; total_ttc: number | null; reason: string | null; created_at: string }

export interface ActivityRow { id: number; org_id: string; project_id: string | null; user_id: string | null; action: string; entity: string; entity_id: string | null; label: string | null; detail: Record<string, unknown> | null; at: string }

export interface PlanDoc {
  id: string; org_id: string; project_id: string | null; reference: string; name: string; level: string;
  plan_type: 'architecture' | 'structure' | 'electricite' | 'plomberie' | 'vrd' | 'amenagement' | 'autre';
  version: number; status: 'travail' | 'verifie' | 'approuve';
  source_path: string | null; source_name: string | null; source_mime: string | null; source_page: number;
  data: unknown; scale_verified: boolean; comment: string | null; archived_at: string | null;
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
}

export interface PlanRender {
  id: string; org_id: string; plan_id: string; source: 'rendu_fidele' | 'plan_importe'; style: 'moderne' | 'chaleureux' | 'luxe' | 'epure';
  status: 'en_attente' | 'en_cours' | 'termine' | 'echec'; input_path: string; storage_path: string | null;
  frame: { x0: number; y0: number; pxPerM: number; width: number; height: number } | null;
  plan_version: string | null; provider: string | null; model: string | null; error: string | null; units: number;
  created_by: string | null; created_at: string; started_at: string | null; finished_at: string | null;
}

export interface AiQuota { quota: number; used: number; remaining: number; period_start: string }

export interface Invoice {
  id: string; org_id: string; project_id: string | null; client_id: string | null; quote_id: string | null; credit_for: string | null;
  reference: string | null; kind: 'simple' | 'acompte' | 'situation' | 'finale' | 'avoir'; title: string;
  status: 'brouillon' | 'emise' | 'partielle' | 'payee' | 'annulee'; issue_date: string | null; due_date: string | null;
  body: DocBody; settings: QuoteSettings; total_ht: number; net_ht: number; total_ttc: number; incomplete_lines: number; amount_paid: number;
  payment_terms: string | null; notes: string | null; cancel_reason: string | null; issued_at: string | null; created_at: string; updated_at: string;
}

export interface Payment {
  id: string; org_id: string; invoice_id: string; amount: number; paid_on: string; method: PaymentMethod; reference: string | null; note: string | null;
  verified: boolean; created_by: string | null; created_at: string;
}
export type PaymentMethod = 'especes' | 'virement' | 'cheque' | 'mobile_money' | 'carte' | 'autre';

export interface InvoiceReminder { id: string; invoice_id: string; channel: string; note: string | null; sent_by: string | null; sent_at: string }

export interface Expense {
  id: string; org_id: string; project_id: string | null; lot: string | null; supplier_id: string | null; category: string; label: string;
  expense_date: string; amount_ht: number; tax_amount: number; amount_ttc: number; status: 'engagee' | 'facturee' | 'payee'; paid_on: string | null;
  payment_method: PaymentMethod | null; supplier_invoice_ref: string | null; receipt_path: string | null; note: string | null;
  purchase_order_id: string | null; created_at: string; updated_at: string;
}

export interface Warehouse { id: string; org_id: string; name: string; location: string | null; project_id: string | null; archived_at: string | null }
export interface StockLevel { org_id: string; item_id: string; warehouse_id: string; qty: number; min_qty: number | null; last_move: string }
export interface StockMovement {
  id: string; org_id: string; item_id: string; warehouse_id: string; kind: 'entree' | 'sortie' | 'transfert' | 'inventaire' | 'ajustement' | 'reception';
  qty: number; unit_cost: number | null; project_id: string | null; lot: string | null; order_id: string | null; reason: string | null; moved_on: string;
  created_by: string | null; created_at: string;
}
export interface PurchaseRequest {
  id: string; org_id: string; reference: string; project_id: string | null; lot: string | null; item_id: string | null; designation: string; qty: number; unit: string;
  needed_by: string | null; supplier_id: string | null; justification: string | null; status: 'soumise' | 'approuvee' | 'refusee' | 'commandee';
  decision_note: string | null; decided_at: string | null; order_id: string | null; requested_by: string | null; created_at: string;
}
export interface OrderLine { id: string; item_id?: string | null; designation: string; unit: string; qty: number | null; unit_price: number | null; received_qty?: number; request_id?: string }
export interface PurchaseOrder {
  id: string; org_id: string; reference: string; supplier_id: string | null; project_id: string | null; warehouse_id: string | null;
  status: 'brouillon' | 'validee' | 'envoyee' | 'partielle' | 'recue' | 'annulee'; order_date: string; expected_date: string | null; lines: OrderLine[];
  currency: string; total_ht: number; notes: string | null; supplier_invoice_ref: string | null; supplier_invoice_amount: number | null;
  validated_at: string | null; created_at: string; updated_at: string;
}
export interface PurchaseReceipt { id: string; order_id: string; received_on: string; warehouse_id: string | null; lines: { line_id: string; qty: number }[]; note: string | null; created_at: string }

export interface Task {
  id: string; org_id: string; project_id: string; title: string; lot: string | null; assignee_id: string | null; assignee_label: string | null;
  start_date: string; end_date: string; status: 'a_faire' | 'en_cours' | 'en_attente' | 'bloque' | 'termine' | 'valide';
  priority: 'basse' | 'normale' | 'haute' | 'urgente'; depends_on: string[]; planned_qty: number | null; done_qty: number | null; unit: string | null;
  weight: number | null; progress_pct: number | null; observations: string | null; validated_by: string | null; validated_at: string | null;
  created_at: string; updated_at: string;
}
export interface Photo { path: string; caption?: string | null }
export interface DailyReport {
  id: string; org_id: string; project_id: string; reference: string; report_date: string; weather: string | null; conditions: string | null;
  work_done: string | null; workforce: { role: string; count: number }[]; materials: string | null; equipment: string | null; incidents: string | null;
  delays: string | null; observations: string | null; photos: Photo[]; status: 'brouillon' | 'soumis' | 'valide';
  submitted_by: string | null; submitted_at: string | null; validated_by: string | null; validated_at: string | null; validation_note: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface Reserve {
  id: string; org_id: string; project_id: string; reference: string; title: string; description: string | null; location: string | null; lot: string | null;
  assignee_label: string | null; due_date: string | null; status: 'ouverte' | 'en_cours' | 'levee' | 'validee'; photos: Photo[];
  raised_on: string; lifted_on: string | null; lift_note: string | null; validated_by: string | null; validated_at: string | null; created_at: string;
}
