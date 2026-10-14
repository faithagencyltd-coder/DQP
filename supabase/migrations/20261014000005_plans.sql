-- PLANORA BTP — 5. Plans techniques, rendus de présentation et consommation IA
-- (cahier des charges §9, §10, §12, §22.5, §26.2).
-- Un plan = un fichier importé (PDF ou image, facultatif) + un dessin vectoriel en mètres
-- (murs, ouvertures, pièces, mobilier, cotes). Le rendu fidèle est calculé dans le navigateur
-- à partir du dessin ; le rendu par IA passe par une fonction serveur, avec quota mensuel.

-- ---------------------------------------------------------------- plans
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  reference text not null default '',
  name text not null check (length(btrim(name)) between 1 and 200),
  level text not null default '' check (length(level) <= 60),
  plan_type text not null default 'architecture' check (plan_type in (
    'architecture', 'structure', 'electricite', 'plomberie', 'vrd', 'amenagement', 'autre')),
  version integer not null default 1 check (version >= 1),
  status text not null default 'travail' check (status in ('travail', 'verifie', 'approuve')),
  -- Fichier d'origine : « <entreprise>/plans-techniques/<plan>/… » dans le compartiment privé.
  source_path text,
  source_name text,
  source_mime text,
  source_page integer not null default 1 check (source_page >= 1),
  -- Dessin (format versionné, voir src/engine/plan/model.ts). Coordonnées en mètres.
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  -- Règle §9.4 : aucune mesure tirée d'un fichier n'est exacte avant vérification de l'échelle.
  scale_verified boolean not null default false,
  comment text,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference),
  check (source_path is null or source_path like org_id::text || '/plans-techniques/%')
);
create index plans_org_idx on public.plans (org_id, project_id, updated_at desc);

create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();

create or replace function public.plans_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can(new.org_id, 'plans', 'creer') then return new; end if;
  if coalesce(new.reference, '') = '' then new.reference := public.next_number(new.org_id, 'plan', 'PLN'); end if;
  new.created_by := auth.uid();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger plans_before_insert before insert on public.plans for each row execute function public.plans_before_insert();

create or replace function public.plans_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.org_id <> old.org_id then raise exception 'Changement d''entreprise interdit'; end if;
  if new.reference <> old.reference then raise exception 'La référence d''un plan ne peut pas être modifiée'; end if;
  if old.status = 'approuve' and new.status = 'approuve' and new.data <> old.data then
    raise exception 'Plan approuvé : repassez-le en « travail » avant de modifier le dessin';
  end if;
  new.created_by := old.created_by;
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger plans_guard before update on public.plans for each row execute function public.plans_guard();

-- Journal : les sauvegardes automatiques du dessin sont regroupées (une entrée / 10 min).
create trigger plans_audit after insert or update or delete on public.plans for each row execute function public.audit_row();

-- ---------------------------------------------------------------- consommation IA (§22.5)
-- Grand livre des unités IA : réservées à la demande, consommées au succès, rendues à l'échec.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  feature text not null,
  units integer not null check (units > 0),
  status text not null default 'reserve' check (status in ('reserve', 'consomme', 'rembourse')),
  provider text,
  model text,
  ref_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_usage_org_idx on public.ai_usage (org_id, created_at desc);
create index ai_usage_ref_idx on public.ai_usage (ref_id);

-- Coût en unités de chaque fonction IA (un rendu d'image coûte bien plus qu'une question).
create or replace function public.ai_cost(p_feature text) returns integer
language sql immutable set search_path = '' as $$
  select case p_feature when 'rendu_plan' then 10 else 1 end
$$;

create or replace function public.ai_quota_status(p_org uuid)
returns table (quota integer, used integer, remaining integer, period_start timestamptz)
language sql stable security definer set search_path = '' as $$
  with q as (
    select sp.ai_quota_month as quota from public.organizations o join public.subscription_plans sp on sp.id = o.plan_id where o.id = p_org
  ), u as (
    select coalesce(sum(units), 0)::integer as used from public.ai_usage
    where org_id = p_org and status in ('reserve', 'consomme') and created_at >= date_trunc('month', now())
  )
  select q.quota, u.used, greatest(q.quota - u.used, 0), date_trunc('month', now())
  from q, u
  where public.is_member(p_org) or public.is_platform_admin()
$$;

-- ---------------------------------------------------------------- rendus par IA
create table public.plan_renders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete cascade,
  -- Image envoyée à l'IA : le rendu fidèle (géométrie exacte) ou le fichier importé tel quel.
  source text not null check (source in ('rendu_fidele', 'plan_importe')),
  style text not null default 'moderne' check (style in ('moderne', 'chaleureux', 'luxe', 'epure')),
  status text not null default 'en_attente' check (status in ('en_attente', 'en_cours', 'termine', 'echec')),
  input_path text not null,
  storage_path text,
  -- Cadre de l'image (mètres → pixels) : permet de superposer les noms et cotes exacts.
  frame jsonb,
  plan_version timestamptz,
  provider text,
  model text,
  error text,
  units integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check (input_path like org_id::text || '/plans-techniques/%'),
  check (storage_path is null or storage_path like org_id::text || '/plans-techniques/%')
);
create index plan_renders_plan_idx on public.plan_renders (plan_id, created_at desc);

-- Les demandes abandonnées (navigateur fermé, délai dépassé) ne bloquent pas le quota.
create or replace function public.expire_stale_renders(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  with stale as (
    update public.plan_renders set status = 'echec', finished_at = now(),
      error = 'Traitement interrompu (délai dépassé). Les unités ont été restituées.'
    where org_id = p_org and status in ('en_attente', 'en_cours') and created_at < now() - interval '15 minutes'
    returning id
  )
  update public.ai_usage set status = 'rembourse', updated_at = now()
  where ref_id in (select id from stale) and status = 'reserve';
end $$;

-- Demande d'un rendu IA : droit « créer » sur les plans, offre active, quota, anti-abus.
-- Réserve les unités et renvoie l'emplacement où déposer l'image d'entrée.
create or replace function public.request_plan_render(p_plan uuid, p_source text, p_style text, p_frame jsonb default null)
returns table (render_id uuid, input_path text, remaining integer)
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans;
  v_cost integer := public.ai_cost('rendu_plan');
  v_left integer;
  v_id uuid := gen_random_uuid();
  v_path text;
begin
  select * into p from public.plans where id = p_plan;
  if p.id is null or not public.can(p.org_id, 'plans', 'consulter') then raise exception 'Plan introuvable'; end if;
  if not public.can(p.org_id, 'plans', 'creer') then
    raise exception 'Droit « créer » sur les plans requis, avec une offre active qui inclut le module Plans';
  end if;
  if p_source = 'plan_importe' and p.source_path is null then raise exception 'Ce plan n''a pas de fichier importé'; end if;
  perform public.expire_stale_renders(p.org_id);
  -- Verrou par entreprise : deux demandes simultanées ne dépassent pas le quota.
  perform pg_advisory_xact_lock(hashtext('ai_quota:' || p.org_id::text));
  select s.remaining into v_left from public.ai_quota_status(p.org_id) s;
  if coalesce(v_left, 0) < v_cost then
    raise exception 'Quota IA du mois atteint (% unité(s) restante(s), % nécessaires par rendu). Changez d''offre ou attendez le mois prochain.', coalesce(v_left, 0), v_cost;
  end if;
  if (select count(*) from public.plan_renders where org_id = p.org_id and status in ('en_attente', 'en_cours')) >= 3 then
    raise exception 'Trois rendus IA sont déjà en cours pour votre entreprise : patientez quelques instants.';
  end if;
  v_path := p.org_id::text || '/plans-techniques/' || p.id::text || '/ia/' || v_id::text || '-entree.png';
  insert into public.plan_renders (id, org_id, plan_id, source, style, input_path, frame, plan_version, units)
  values (v_id, p.org_id, p.id, p_source, p_style, v_path, p_frame, p.updated_at, v_cost);
  insert into public.ai_usage (org_id, user_id, feature, units, status, ref_id)
  values (p.org_id, auth.uid(), 'rendu_plan', v_cost, 'reserve', v_id);
  insert into public.activity_log (org_id, project_id, user_id, action, entity, entity_id, label, detail)
  values (p.org_id, p.project_id, auth.uid(), 'demande de rendu IA', 'plans', p.id::text, left(p.reference || ' — ' || p.name, 300),
          jsonb_build_object('source', p_source, 'style', p_style, 'unités', v_cost));
  return query select v_id, v_path, v_left - v_cost;
end $$;

-- Utilisé par la fonction serveur (rôle service) pour clore une demande.
create or replace function public.finish_plan_render(p_render uuid, p_ok boolean, p_storage_path text, p_provider text, p_model text, p_error text)
returns void
language plpgsql security definer set search_path = '' as $$
declare r public.plan_renders;
begin
  select * into r from public.plan_renders where id = p_render for update;
  if r.id is null then raise exception 'Rendu introuvable'; end if;
  if r.status not in ('en_attente', 'en_cours') then raise exception 'Rendu déjà clos'; end if;
  update public.plan_renders set
    status = case when p_ok then 'termine' else 'echec' end,
    storage_path = case when p_ok then p_storage_path end,
    provider = p_provider, model = p_model, error = case when p_ok then null else left(p_error, 500) end,
    finished_at = now()
  where id = p_render;
  update public.ai_usage set status = case when p_ok then 'consomme' else 'rembourse' end,
    provider = p_provider, model = p_model, updated_at = now()
  where ref_id = p_render and status = 'reserve';
end $$;

-- Le navigateur annule sa propre demande si le service de rendu n'a pas pu la prendre en charge.
create or replace function public.cancel_plan_render(p_render uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.plan_renders;
begin
  select * into r from public.plan_renders where id = p_render for update;
  if r.id is null or r.created_by is distinct from auth.uid() then raise exception 'Rendu introuvable'; end if;
  if r.status <> 'en_attente' then return; end if;
  update public.plan_renders set status = 'echec', finished_at = now(),
    error = left(coalesce(p_reason, 'Service de rendu IA indisponible') || ' Les unités ont été restituées.', 500)
  where id = p_render;
  update public.ai_usage set status = 'rembourse', updated_at = now() where ref_id = p_render and status = 'reserve';
end $$;

-- ---------------------------------------------------------------- stockage par module
-- Les fichiers des plans (« <entreprise>/plans-techniques/… ») suivent les droits du module
-- Plans ; les autres fichiers suivent ceux du module Documents.
create or replace function public.storage_module(p_name text) returns text
language sql immutable set search_path = '' as $$
  select case when (storage.foldername(p_name))[2] = 'plans-techniques' then 'plans' else 'documents' end
$$;

drop policy "fichiers lecture" on storage.objects;
drop policy "fichiers dépôt" on storage.objects;
drop policy "fichiers suppression" on storage.objects;

create policy "fichiers lecture" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can(public.storage_org(name), public.storage_module(name), 'consulter'));

create policy "fichiers dépôt" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.can(public.storage_org(name), public.storage_module(name), 'creer')
    and public.org_storage_bytes(public.storage_org(name)) <
        (select sp.max_storage_mb::bigint * 1048576 from public.organizations o join public.subscription_plans sp on sp.id = o.plan_id
         where o.id = public.storage_org(objects.name))
    -- Une image d'entrée IA ne peut être déposée que pour une demande en attente de l'auteur.
    and (name not like '%/ia/%' or exists (
      select 1 from public.plan_renders r where r.input_path = objects.name and r.status = 'en_attente' and r.created_by = auth.uid()))
  );

create policy "fichiers suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can(public.storage_org(name), public.storage_module(name), 'supprimer'));

-- ---------------------------------------------------------------- RLS
alter table public.plans enable row level security;
alter table public.plan_renders enable row level security;
alter table public.ai_usage enable row level security;

create policy "plans lecture" on public.plans for select to authenticated using (public.can(org_id, 'plans', 'consulter'));
create policy "plans création" on public.plans for insert to authenticated with check (public.can(org_id, 'plans', 'creer'));
create policy "plans modification" on public.plans for update to authenticated
  using (public.can(org_id, 'plans', 'modifier'))
  with check (public.can(org_id, 'plans', 'modifier') and (status <> 'approuve' or public.can(org_id, 'plans', 'valider')));
create policy "plans suppression" on public.plans for delete to authenticated using (public.can(org_id, 'plans', 'supprimer'));

create policy "rendus lecture" on public.plan_renders for select to authenticated using (public.can(org_id, 'plans', 'consulter'));
create policy "rendus suppression" on public.plan_renders for delete to authenticated
  using (public.can(org_id, 'plans', 'supprimer') or (created_by = auth.uid() and public.can(org_id, 'plans', 'creer')));

create policy "consommation IA lecture" on public.ai_usage for select to authenticated using (public.is_member(org_id));

revoke update on public.plans from authenticated;
grant update (project_id, name, level, plan_type, version, status, source_path, source_name, source_mime, source_page, data,
  scale_verified, comment, archived_at) on public.plans to authenticated;
-- Rendus IA et consommation : écrits uniquement par les fonctions serveur.
revoke insert, update on public.plan_renders from anon, authenticated;
revoke insert, update, delete on public.ai_usage from anon, authenticated;

-- Administration de la plateforme : consommation IA du mois (§24).
create or replace function public.admin_ai_overview()
returns table (units_month bigint, renders_ok bigint, renders_failed bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Réservé à l''administration de PLANORA BTP'; end if;
  return query select
    (select coalesce(sum(units), 0)::bigint from public.ai_usage where status = 'consomme' and created_at >= date_trunc('month', now())),
    (select count(*) from public.plan_renders where status = 'termine' and created_at >= date_trunc('month', now())),
    (select count(*) from public.plan_renders where status = 'echec' and created_at >= date_trunc('month', now()));
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon;
revoke execute on function public.next_number(uuid, text, text) from authenticated;
revoke execute on function public.finish_plan_render(uuid, boolean, text, text, text, text) from authenticated;
revoke execute on function public.expire_stale_renders(uuid) from authenticated;
