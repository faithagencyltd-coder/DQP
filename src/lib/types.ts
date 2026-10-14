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
  manager_id: string | null; budget_estimate: number | null; budget_validated: number | null; status: string;
  archived_at: string | null; created_at: string; updated_at: string;
}

export interface ProjectLot { id: string; org_id: string; project_id: string; name: string; sort: number }

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
