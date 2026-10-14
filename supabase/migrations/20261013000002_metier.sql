-- PLANORA BTP — 2. Données métier des phases 1 et 2 : clients et fournisseurs, projets et
-- lots, documents, bibliothèque de prix (avec historique), métrés, DQE / BPU / devis
-- (avec versions figées), numérotation contrôlée, journal et limites d'abonnement.

-- ---------------------------------------------------------------- numérotation
create table public.counters (
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null,
  year integer not null,
  value integer not null default 0,
  primary key (org_id, kind, year)
);
alter table public.counters enable row level security;
revoke all on public.counters from anon, authenticated;

create or replace function public.next_number(p_org uuid, p_kind text, p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare v integer; y integer := extract(year from now())::integer;
begin
  insert into public.counters (org_id, kind, year, value) values (p_org, p_kind, y, 1)
  on conflict (org_id, kind, year) do update set value = public.counters.value + 1
  returning value into v;
  return p_prefix || '-' || y || '-' || lpad(v::text, 4, '0');
end $$;


-- ---------------------------------------------------------------- contacts
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('client', 'fournisseur')),
  client_type text check (client_type in ('particulier', 'entreprise', 'administration', 'ong', 'promoteur', 'autre')),
  name text not null check (length(btrim(name)) between 1 and 160),
  legal_name text,
  contact_person text,
  phone text,
  email text,
  address text,
  city text,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  legal_ids text,
  categories text[] not null default '{}',
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  rating smallint check (rating between 1 and 5),
  notes text,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_org_idx on public.contacts (org_id, kind, name);

-- ---------------------------------------------------------------- projets
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  reference text not null default '',
  name text not null check (length(btrim(name)) between 2 and 160),
  client_id uuid references public.contacts (id) on delete set null,
  project_type text not null default 'construction_neuve' check (project_type in (
    'construction_neuve', 'renovation', 'amenagement_interieur', 'rehabilitation', 'extension', 'finition', 'vrd',
    'commercial', 'residentiel', 'industriel', 'entretien')),
  location text,
  city text,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  description text,
  start_date date,
  end_date date check (end_date is null or start_date is null or end_date >= start_date),
  manager_id uuid references auth.users (id) on delete set null,
  budget_estimate numeric(16, 2) check (budget_estimate is null or budget_estimate >= 0),
  budget_validated numeric(16, 2) check (budget_validated is null or budget_validated >= 0),
  status text not null default 'etude' check (status in ('prospect', 'etude', 'en_attente', 'en_cours', 'suspendu', 'termine', 'annule')),
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference)
);
create index projects_org_idx on public.projects (org_id, status);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  function text,
  primary key (project_id, user_id)
);

create table public.project_lots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

-- ---------------------------------------------------------------- documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  lot text,
  doc_type text not null default 'autre' check (doc_type in (
    'plan', 'devis', 'dqe_bpu', 'facture', 'bon_commande', 'contrat', 'rapport', 'photo', 'compte_rendu',
    'proces_verbal', 'reception', 'fiche_technique', 'administratif', 'autre')),
  name text not null check (length(btrim(name)) between 1 and 200),
  storage_path text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  mime text not null,
  version integer not null default 1 check (version >= 1),
  previous_id uuid references public.documents (id) on delete set null,
  status text not null default 'travail' check (status in ('travail', 'verifie', 'approuve', 'archive')),
  comment text,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_org_idx on public.documents (org_id, project_id, created_at desc);

-- ---------------------------------------------------------------- bibliothèque de prix
create table public.price_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null default 'article' check (kind in ('article', 'ouvrage')),
  code text not null default '',
  designation text not null check (length(btrim(designation)) between 1 and 300),
  category text not null default 'autre',
  description text,
  unit text not null default 'u',
  purchase_price numeric(16, 2) check (purchase_price is null or purchase_price >= 0),
  sale_price numeric(16, 2) check (sale_price is null or sale_price >= 0),
  currency text not null default 'XOF',
  supplier_id uuid references public.contacts (id) on delete set null,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  city text,
  price_date date,
  source text,
  purchase_conditions text,
  loss_pct numeric(6, 2) check (loss_pct is null or (loss_pct >= 0 and loss_pct < 100)),
  breakdown jsonb,          -- décomposition des coûts (ouvrage) : voir src/engine/debourse.ts
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index price_items_org_idx on public.price_items (org_id, category, designation);

create table public.price_history (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.price_items (id) on delete cascade,
  purchase_price numeric(16, 2),
  sale_price numeric(16, 2),
  price_date date,
  source text,
  changed_by uuid default auth.uid() references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index price_history_item_idx on public.price_history (item_id, changed_at desc);

create or replace function public.track_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.purchase_price is distinct from old.purchase_price or new.sale_price is distinct from old.sale_price
     or new.price_date is distinct from old.price_date then
    insert into public.price_history (org_id, item_id, purchase_price, sale_price, price_date, source)
    values (new.org_id, new.id, new.purchase_price, new.sale_price, new.price_date, new.source);
  end if;
  return new;
end $$;
create trigger price_items_history after insert or update on public.price_items
  for each row execute function public.track_price();

-- ---------------------------------------------------------------- métrés
create table public.metres (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  reference text not null default '',
  title text not null check (length(btrim(title)) between 1 and 200),
  rules jsonb not null default '{"decimals":2,"openingThreshold":0}'::jsonb,
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  status text not null default 'travail' check (status in ('travail', 'verifie', 'approuve')),
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference)
);

-- ---------------------------------------------------------------- DQE / BPU / devis
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('dqe', 'bpu', 'devis')),
  reference text not null default '',
  title text not null check (length(btrim(title)) between 1 and 200),
  project_id uuid references public.projects (id) on delete set null,
  client_id uuid references public.contacts (id) on delete set null,
  source_kind text check (source_kind in ('dqe', 'metre', 'devis', 'modele', 'import', 'manuel')),
  source_id uuid,
  status text not null default 'brouillon' check (status in (
    'brouillon', 'en_validation', 'envoye', 'accepte', 'refuse', 'expire', 'annule', 'converti', 'verifie', 'approuve')),
  issue_date date not null default current_date,
  valid_until date,
  version integer not null default 1 check (version >= 1),
  locked boolean not null default false,
  body jsonb not null default '{"lots":[]}'::jsonb,       -- voir src/engine/dqe.ts (DocBody)
  settings jsonb not null default '{"currency":"XOF","taxes":[{"label":"TVA","rate":18}],"discountPct":0}'::jsonb,
  payment_terms text,
  execution_delay text,
  notes text,
  total_ht numeric(18, 2),
  total_ttc numeric(18, 2),
  incomplete_lines integer not null default 0,
  decision_at timestamptz,
  decision_note text,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference)
);
create index quotes_org_idx on public.quotes (org_id, kind, status, issue_date desc);

-- Versions figées (§14.6, §30.3) : un document verrouillé n'est plus modifiable ; toute
-- modification passe par une nouvelle version, l'ancienne reste consultable.
create table public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  version integer not null,
  title text not null,
  status text not null,
  body jsonb not null,
  settings jsonb not null,
  total_ht numeric(18, 2),
  total_ttc numeric(18, 2),
  reason text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quote_id, version)
);

-- ---------------------------------------------------------------- déclencheurs communs
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger documents_touch before update on public.documents for each row execute function public.touch_updated_at();
create trigger price_items_touch before update on public.price_items for each row execute function public.touch_updated_at();
create trigger metres_touch before update on public.metres for each row execute function public.touch_updated_at();
create trigger quotes_touch before update on public.quotes for each row execute function public.touch_updated_at();

-- Références uniques et contrôle des limites d'abonnement à la création.
create or replace function public.before_insert_business() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_max integer; v_count integer;
begin
  -- Sans le droit de créer, on laisse la règle d'accès refuser (aucune information divulguée).
  if not public.can(new.org_id, case tg_table_name when 'projects' then 'projets' when 'documents' then 'documents'
       when 'metres' then 'metres' else case when (to_jsonb(new) ->> 'kind') = 'devis' then 'devis' else 'dqe' end end, 'creer') then
    return new;
  end if;
  if tg_table_name = 'projects' then
    select sp.max_projects into v_max from public.organizations o join public.subscription_plans sp on sp.id = o.plan_id where o.id = new.org_id;
    select count(*) into v_count from public.projects where org_id = new.org_id and archived_at is null;
    if v_max is not null and v_count >= v_max then
      raise exception 'Limite de l''offre atteinte : % projet(s) actif(s). Archivez un projet ou changez d''offre.', v_max;
    end if;
    if coalesce(new.reference, '') = '' then new.reference := public.next_number(new.org_id, 'projet', 'PRJ'); end if;
  elsif tg_table_name = 'documents' then
    select sp.max_documents into v_max from public.organizations o join public.subscription_plans sp on sp.id = o.plan_id where o.id = new.org_id;
    select count(*) into v_count from public.documents where org_id = new.org_id;
    if v_max is not null and v_count >= v_max then
      raise exception 'Limite de l''offre atteinte : % document(s).', v_max;
    end if;
  elsif tg_table_name = 'metres' then
    if coalesce(new.reference, '') = '' then new.reference := public.next_number(new.org_id, 'metre', 'MET'); end if;
  elsif tg_table_name = 'quotes' then
    if new.client_id is null and new.project_id is not null then
      select p.client_id into new.client_id from public.projects p where p.id = new.project_id and p.org_id = new.org_id;
    end if;
    if coalesce(new.reference, '') = '' then
      new.reference := public.next_number(new.org_id, new.kind, case new.kind when 'devis' then 'DEV' when 'dqe' then 'DQE' else 'BPU' end);
    end if;
  end if;
  if tg_table_name = 'documents' then new.uploaded_by := auth.uid(); else new.created_by := auth.uid(); end if;
  return new;
end $$;

create trigger projects_before_insert before insert on public.projects for each row execute function public.before_insert_business();
create trigger documents_before_insert before insert on public.documents for each row execute function public.before_insert_business();
create trigger metres_before_insert before insert on public.metres for each row execute function public.before_insert_business();
create trigger quotes_before_insert before insert on public.quotes for each row execute function public.before_insert_business();

-- Les références, l'entreprise et le créateur ne changent jamais ; un document verrouillé
-- n'est plus modifiable (seuls son statut commercial et la décision du client évoluent).
create or replace function public.guard_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.org_id <> old.org_id then raise exception 'Changement d''entreprise interdit'; end if;
  if to_jsonb(new) ? 'reference' and (to_jsonb(new) ->> 'reference') <> (to_jsonb(old) ->> 'reference') then
    raise exception 'La référence d''un document ne peut pas être modifiée';
  end if;
  if tg_table_name <> 'documents' then new.created_by := old.created_by; end if;
  if tg_table_name = 'quotes' then
    if old.locked and coalesce(current_setting('planora.server_change', true), '') <> 'on' and (new.body <> old.body or new.settings <> old.settings or new.title <> old.title
        or new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id
        or new.version <> old.version or not new.locked) then
      raise exception 'Version % verrouillée : créez une nouvelle version pour la modifier', old.version;
    end if;
    new.updated_by := auth.uid();
  elsif tg_table_name = 'metres' then
    if old.status = 'approuve' and new.lines <> old.lines then
      raise exception 'Métré approuvé : repassez-le en « travail » avant de modifier les quantités';
    end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

create trigger contacts_guard before update on public.contacts for each row execute function public.guard_update();
create trigger projects_guard before update on public.projects for each row execute function public.guard_update();
create trigger documents_guard before update on public.documents for each row execute function public.guard_update();
create trigger price_items_guard before update on public.price_items for each row execute function public.guard_update();
create trigger metres_guard before update on public.metres for each row execute function public.guard_update();
create trigger quotes_guard before update on public.quotes for each row execute function public.guard_update();

-- Journal automatique (§8.4) : création, modification, archivage, suppression.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_action text;
  v_label text := coalesce(r ->> 'reference', '') || case when r ? 'reference' and r ->> 'reference' <> '' then ' — ' else '' end
                  || coalesce(r ->> 'name', r ->> 'title', r ->> 'designation', '');
  v_project uuid := case when tg_table_name = 'projects' then (r ->> 'id')::uuid else (r ->> 'project_id')::uuid end;
  v_detail jsonb := null;
begin
  if tg_op = 'INSERT' then v_action := 'création';
  elsif tg_op = 'DELETE' then v_action := 'suppression';
  else
    if tg_table_name = 'quotes' and (r ->> 'version') <> (o ->> 'version') then
      v_action := 'nouvelle version';
      v_detail := jsonb_build_object('version', r -> 'version');
    elsif tg_table_name = 'quotes' and (r ->> 'locked') = 'true' and (o ->> 'locked') = 'false' then
      v_action := 'validation et verrouillage';
      v_detail := jsonb_build_object('version', r -> 'version');
    elsif (r ->> 'archived_at') is not null and (o ->> 'archived_at') is null then v_action := 'archivage';
    elsif (r ->> 'archived_at') is null and (o ->> 'archived_at') is not null then v_action := 'restauration';
    elsif r ? 'status' and (r ->> 'status') <> (o ->> 'status') then
      v_action := 'changement de statut';
      v_detail := jsonb_build_object('avant', o ->> 'status', 'après', r ->> 'status');
    elsif tg_table_name = 'projects' and ((r ->> 'budget_estimate') is distinct from (o ->> 'budget_estimate') or (r ->> 'budget_validated') is distinct from (o ->> 'budget_validated')) then
      v_action := 'modification du budget';
      v_detail := jsonb_build_object('estimatif', jsonb_build_array(o -> 'budget_estimate', r -> 'budget_estimate'), 'validé', jsonb_build_array(o -> 'budget_validated', r -> 'budget_validated'));
    elsif tg_table_name = 'metres' and (r -> 'lines') <> (o -> 'lines') then v_action := 'modification des quantités';
    else v_action := 'modification';
    end if;
  end if;
  -- Les sauvegardes automatiques successives ne créent qu'une entrée toutes les 10 minutes.
  if v_action in ('modification', 'modification des quantités') and exists (
    select 1 from public.activity_log a
    where a.entity = tg_table_name and a.entity_id = r ->> 'id' and a.user_id is not distinct from auth.uid()
      and a.action = v_action and a.at > now() - interval '10 minutes') then
    return null;
  end if;
  insert into public.activity_log (org_id, project_id, user_id, action, entity, entity_id, label, detail)
  values ((r ->> 'org_id')::uuid, v_project, auth.uid(), v_action, tg_table_name, r ->> 'id', left(v_label, 300), v_detail);
  return null;
end $$;

create trigger contacts_audit after insert or update or delete on public.contacts for each row execute function public.audit_row();
create trigger projects_audit after insert or update or delete on public.projects for each row execute function public.audit_row();
create trigger documents_audit after insert or update or delete on public.documents for each row execute function public.audit_row();
create trigger price_items_audit after insert or delete on public.price_items for each row execute function public.audit_row();
create trigger metres_audit after insert or update or delete on public.metres for each row execute function public.audit_row();
create trigger quotes_audit after insert or update or delete on public.quotes for each row execute function public.audit_row();

-- ---------------------------------------------------------------- fonctions métier
-- Nouvelle version d'un DQE / BPU / devis : fige l'actuelle puis déverrouille la suivante.
create or replace function public.new_quote_version(p_quote uuid, p_reason text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare q public.quotes; v_module text;
begin
  select * into q from public.quotes where id = p_quote for update;
  if q.id is null then raise exception 'Document introuvable'; end if;
  v_module := case q.kind when 'devis' then 'devis' else 'dqe' end;
  if not public.can(q.org_id, v_module, 'modifier') then raise exception 'Droit « modifier » requis'; end if;
  insert into public.quote_versions (org_id, quote_id, version, title, status, body, settings, total_ht, total_ttc, reason)
  values (q.org_id, q.id, q.version, q.title, q.status, q.body, q.settings, q.total_ht, q.total_ttc, p_reason)
  on conflict (quote_id, version) do update set reason = coalesce(excluded.reason, public.quote_versions.reason);
  perform set_config('planora.server_change', 'on', true);
  update public.quotes set locked = false, version = q.version + 1,
    status = 'brouillon', validated_by = null, validated_at = null
  where id = q.id;
  perform set_config('planora.server_change', 'off', true);
  return q.version + 1;
end $$;

-- Verrouillage d'une version (validation) : exige le droit « valider ».
create or replace function public.lock_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes; v_module text;
begin
  select * into q from public.quotes where id = p_quote for update;
  if q.id is null then raise exception 'Document introuvable'; end if;
  v_module := case q.kind when 'devis' then 'devis' else 'dqe' end;
  if not public.can(q.org_id, v_module, 'valider') then raise exception 'Droit « valider » requis'; end if;
  insert into public.quote_versions (org_id, quote_id, version, title, status, body, settings, total_ht, total_ttc, reason)
  values (q.org_id, q.id, q.version, q.title, q.status, q.body, q.settings, q.total_ht, q.total_ttc, 'Version validée et verrouillée')
  on conflict (quote_id, version) do update set body = excluded.body, settings = excluded.settings, total_ht = excluded.total_ht, total_ttc = excluded.total_ttc, reason = excluded.reason;
  update public.quotes set locked = true, validated_by = auth.uid(), validated_at = now(),
    status = case when q.kind = 'devis' then (case when q.status in ('brouillon', 'en_validation') then 'en_validation' else q.status end) else 'approuve' end
  where id = q.id;
end $$;

-- Utilisation du stockage par entreprise (limite de l'offre).
create or replace function public.org_storage_bytes(p_org uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o where o.bucket_id = 'documents' and (storage.foldername(o.name))[1] = p_org::text
$$;

create or replace function public.org_usage(p_org uuid)
returns table (users bigint, projects bigint, documents bigint, storage_bytes bigint)
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.members where org_id = p_org),
         (select count(*) from public.projects where org_id = p_org and archived_at is null),
         (select count(*) from public.documents where org_id = p_org),
         public.org_storage_bytes(p_org)
  where public.is_member(p_org) or public.is_platform_admin()
$$;

-- ---------------------------------------------------------------- RLS
alter table public.contacts enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_lots enable row level security;
alter table public.documents enable row level security;
alter table public.price_items enable row level security;
alter table public.price_history enable row level security;
alter table public.metres enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_versions enable row level security;

-- Contacts : module « clients » (clients et fournisseurs).
create policy "contacts lecture" on public.contacts for select to authenticated using (public.can(org_id, 'clients', 'consulter'));
create policy "contacts création" on public.contacts for insert to authenticated with check (public.can(org_id, 'clients', 'creer'));
create policy "contacts modification" on public.contacts for update to authenticated using (public.can(org_id, 'clients', 'modifier')) with check (public.can(org_id, 'clients', 'modifier'));
create policy "contacts suppression" on public.contacts for delete to authenticated using (public.can(org_id, 'clients', 'supprimer'));

create policy "projets lecture" on public.projects for select to authenticated using (public.can(org_id, 'projets', 'consulter'));
create policy "projets création" on public.projects for insert to authenticated with check (public.can(org_id, 'projets', 'creer'));
create policy "projets modification" on public.projects for update to authenticated using (public.can(org_id, 'projets', 'modifier')) with check (public.can(org_id, 'projets', 'modifier'));
create policy "projets suppression" on public.projects for delete to authenticated using (public.can(org_id, 'projets', 'supprimer'));

create policy "équipe projet lecture" on public.project_members for select to authenticated using (public.can(org_id, 'projets', 'consulter'));
create policy "équipe projet écriture" on public.project_members for all to authenticated
  using (public.can(org_id, 'projets', 'modifier'))
  with check (public.can(org_id, 'projets', 'modifier') and exists (select 1 from public.projects p where p.id = project_id and p.org_id = project_members.org_id)
              and exists (select 1 from public.members m where m.org_id = project_members.org_id and m.user_id = project_members.user_id));

create policy "lots lecture" on public.project_lots for select to authenticated using (public.can(org_id, 'projets', 'consulter'));
create policy "lots écriture" on public.project_lots for all to authenticated
  using (public.can(org_id, 'projets', 'modifier'))
  with check (public.can(org_id, 'projets', 'modifier') and exists (select 1 from public.projects p where p.id = project_id and p.org_id = project_lots.org_id));

create policy "documents lecture" on public.documents for select to authenticated using (public.can(org_id, 'documents', 'consulter'));
create policy "documents création" on public.documents for insert to authenticated with check (public.can(org_id, 'documents', 'creer') and storage_path like org_id::text || '/%');
create policy "documents modification" on public.documents for update to authenticated using (public.can(org_id, 'documents', 'modifier')) with check (public.can(org_id, 'documents', 'modifier'));
create policy "documents suppression" on public.documents for delete to authenticated using (public.can(org_id, 'documents', 'supprimer'));

create policy "prix lecture" on public.price_items for select to authenticated using (public.can(org_id, 'prix', 'consulter'));
create policy "prix création" on public.price_items for insert to authenticated with check (public.can(org_id, 'prix', 'creer'));
create policy "prix modification" on public.price_items for update to authenticated using (public.can(org_id, 'prix', 'modifier')) with check (public.can(org_id, 'prix', 'modifier'));
create policy "prix suppression" on public.price_items for delete to authenticated using (public.can(org_id, 'prix', 'supprimer'));
create policy "historique des prix" on public.price_history for select to authenticated using (public.can(org_id, 'prix', 'consulter'));

create policy "métrés lecture" on public.metres for select to authenticated using (public.can(org_id, 'metres', 'consulter'));
create policy "métrés création" on public.metres for insert to authenticated with check (public.can(org_id, 'metres', 'creer'));
create policy "métrés modification" on public.metres for update to authenticated using (public.can(org_id, 'metres', 'modifier'))
  with check (public.can(org_id, 'metres', 'modifier') and (status <> 'approuve' or public.can(org_id, 'metres', 'valider')));
create policy "métrés suppression" on public.metres for delete to authenticated using (public.can(org_id, 'metres', 'supprimer'));

-- DQE et BPU : module « dqe » ; devis : module « devis ».
create policy "documents chiffrés lecture" on public.quotes for select to authenticated
  using (public.can(org_id, case kind when 'devis' then 'devis' else 'dqe' end, 'consulter'));
create policy "documents chiffrés création" on public.quotes for insert to authenticated
  with check (public.can(org_id, case kind when 'devis' then 'devis' else 'dqe' end, 'creer') and not locked);
create policy "documents chiffrés modification" on public.quotes for update to authenticated
  using (public.can(org_id, case kind when 'devis' then 'devis' else 'dqe' end, 'modifier'))
  with check (public.can(org_id, case kind when 'devis' then 'devis' else 'dqe' end, 'modifier'));
create policy "documents chiffrés suppression" on public.quotes for delete to authenticated
  using (public.can(org_id, case kind when 'devis' then 'devis' else 'dqe' end, 'supprimer') and not locked and status in ('brouillon', 'annule'));
create policy "versions lecture" on public.quote_versions for select to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id and public.can(q.org_id, case q.kind when 'devis' then 'devis' else 'dqe' end, 'consulter')));

-- Colonnes modifiables par l'interface (les autres ne changent que par les fonctions du serveur).
revoke update on public.quotes, public.projects, public.contacts, public.documents, public.price_items, public.metres from authenticated;
grant update (title, project_id, client_id, status, issue_date, valid_until, body, settings, payment_terms, execution_delay, notes,
  total_ht, total_ttc, incomplete_lines, decision_at, decision_note, archived_at) on public.quotes to authenticated;
grant update (name, client_id, project_type, location, city, country, description, start_date, end_date, manager_id,
  budget_estimate, budget_validated, status, archived_at) on public.projects to authenticated;
grant update (kind, client_type, name, legal_name, contact_person, phone, email, address, city, country, legal_ids, categories,
  lead_time_days, rating, notes, archived_at) on public.contacts to authenticated;
grant update (project_id, lot, doc_type, name, status, comment) on public.documents to authenticated;
grant update (kind, code, designation, category, description, unit, purchase_price, sale_price, currency, supplier_id, country, city,
  price_date, source, purchase_conditions, loss_pct, breakdown, archived_at) on public.price_items to authenticated;
grant update (project_id, title, rules, lines, status, archived_at) on public.metres to authenticated;
revoke insert, update, delete on public.price_history, public.quote_versions from anon, authenticated;

-- Fonctions : jamais exécutables par un visiteur anonyme (sauf l'aperçu d'invitation).
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon;
revoke execute on function public.next_number(uuid, text, text) from authenticated;
