-- PLANORA BTP — 1. Fondations SaaS (cahier des charges §3, §5, §23, §24, §27)
-- Offres, entreprises (multi-locataire), profils, membres, rôles, matrice de permissions
-- configurable par entreprise, invitations, administration de la plateforme, journal.
-- Toutes les règles d'accès sont appliquées par la base (RLS), pas seulement par l'interface.

-- ---------------------------------------------------------------- offres
create table public.subscription_plans (
  id text primary key,
  name text not null,
  description text not null default '',
  price_month integer not null default 0 check (price_month >= 0),
  price_year integer not null default 0 check (price_year >= 0),
  currency text not null default 'XOF',
  max_users integer check (max_users > 0),            -- null = illimité
  max_projects integer check (max_projects > 0),      -- null = illimité
  max_documents integer check (max_documents > 0),    -- null = illimité
  max_storage_mb integer not null default 300 check (max_storage_mb > 0),
  ai_quota_month integer not null default 0 check (ai_quota_month >= 0),
  modules text[] not null default '{}',
  trial_days integer not null default 0 check (trial_days >= 0),
  sort integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Tarifs indicatifs, à valider par le porteur du projet (§23.1) ; modifiables dans l'administration.
insert into public.subscription_plans (id, name, description, price_month, price_year, max_users, max_projects, max_documents, max_storage_mb, ai_quota_month, modules, trial_days, sort) values
  ('decouverte', 'Découverte', 'Pour tester PLANORA BTP : fonctions de base, projets et documents limités.',
    0, 0, 2, 3, 30, 200, 0,
    array['clients','projets','documents','prix','metres','dqe','devis'], 30, 0),
  ('artisan', 'Artisan', 'Artisans et petites structures : clients, projets, devis, prix, dépenses simples, exports PDF.',
    9900, 99000, 2, 20, 300, 1000, 50,
    array['clients','projets','documents','prix','metres','dqe','devis','factures','depenses'], 0, 1),
  ('pro', 'Professionnelle', 'Entreprises BTP et bureaux d’études : plans et métrés, DQE/BPU, finances, achats et stocks, collaboration.',
    29900, 299000, 8, null, 3000, 10000, 300,
    array['clients','projets','documents','prix','metres','dqe','devis','factures','depenses','achats','stocks','planning','plans','rapports'], 0, 2),
  ('entreprise', 'Entreprise', 'Structures multi-collaborateurs : permissions avancées, suivi multi-projets, quotas personnalisés.',
    79900, 799000, 40, null, null, 50000, 1500,
    array['clients','projets','documents','prix','metres','dqe','devis','factures','depenses','achats','stocks','planning','plans','rapports'], 0, 3);

-- ---------------------------------------------------------------- plateforme
create table public.platform_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- profils
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  accepted_terms_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, first_name, last_name, phone, accepted_terms_at)
  values (
    new.id, coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 80),
    left(coalesce(new.raw_user_meta_data ->> 'last_name', ''), 80),
    left(new.raw_user_meta_data ->> 'phone', 30),
    case when (new.raw_user_meta_data ->> 'accepted_terms') = 'true' then now() end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- entreprises
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),       -- nom commercial
  legal_name text,                                                         -- raison sociale
  country text not null default 'BJ' check (country ~ '^[A-Z]{2}$'),
  currency text not null default 'XOF',
  city text,
  address text,
  phone text,
  email text,
  website text,
  logo_path text,
  -- Champs légaux propres au pays (IFU, RCCM, NCC, CC…), libellés configurables : [{label, value}]
  legal_ids jsonb not null default '[]'::jsonb,
  bank_details text,
  -- Taxes appliquées par défaut aux devis : [{label, rate}] (ex. TVA 18 %). Paramétrables (§15.2).
  default_taxes jsonb not null default '[{"label":"TVA","rate":18}]'::jsonb,
  quote_validity_days integer not null default 30 check (quote_validity_days between 1 and 365),
  payment_terms text not null default 'Paiement à 30 jours à réception de facture',
  quote_footer text,
  -- Règles de métré par défaut (§11.4) : décimales, seuil de déduction des ouvertures.
  metre_rules jsonb not null default '{"decimals":2,"openingThreshold":0}'::jsonb,
  -- Méthode de calcul des prix (§14.4).
  pricing_method jsonb not null default '{"method":"additive","indirectPct":15,"marginPct":10,"marginBase":"cout","coefficient":1.3,"lossPct":0}'::jsonb,
  plan_id text not null default 'decouverte' references public.subscription_plans (id),
  plan_status text not null default 'essai' check (plan_status in ('essai', 'actif', 'expire', 'suspendu', 'annule')),
  plan_period text check (plan_period in ('mois', 'an')),
  plan_ends_at timestamptz not null default (now() + interval '30 days'),
  suspended_reason text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.org_role as enum (
  'proprietaire', 'administrateur', 'directeur', 'architecte', 'metreur', 'conducteur', 'comptable', 'commercial', 'lecteur'
);

create table public.members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index members_user_idx on public.members (user_id);

-- Matrice des permissions, configurable par entreprise (§3.2).
create table public.role_permissions (
  org_id uuid not null references public.organizations (id) on delete cascade,
  role public.org_role not null check (role <> 'proprietaire'),
  module text not null,
  actions text[] not null default '{}',
  primary key (org_id, role, module),
  check (actions <@ array['consulter','creer','modifier','supprimer','valider','exporter','partager','administrer'])
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.org_role not null check (role <> 'proprietaire'),
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create index invitations_org_idx on public.invitations (org_id);

-- Journal des opérations (§8.4, §27.4).
create table public.activity_log (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations (id) on delete cascade,
  project_id uuid,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  label text,
  detail jsonb,
  at timestamptz not null default now()
);
create index activity_org_idx on public.activity_log (org_id, at desc);
create index activity_project_idx on public.activity_log (project_id, at desc);

-- ---------------------------------------------------------------- permissions par défaut
create or replace function public.default_permissions(r public.org_role) returns jsonb
language sql immutable set search_path = '' as $$
  with all_ as (select '["consulter","creer","modifier","supprimer","valider","exporter","partager","administrer"]'::jsonb a),
       std as (select '["consulter","creer","modifier","exporter"]'::jsonb a),
       ro as (select '["consulter","exporter"]'::jsonb a)
  select case r
    when 'administrateur' then jsonb_build_object(
      'clients',(select a from all_),'projets',(select a from all_),'documents',(select a from all_),'prix',(select a from all_),
      'metres',(select a from all_),'dqe',(select a from all_),'devis',(select a from all_),'factures',(select a from all_),
      'depenses',(select a from all_),'achats',(select a from all_),'stocks',(select a from all_),'planning',(select a from all_),
      'plans',(select a from all_),'rapports',(select a from all_),'equipe',(select a from all_),'entreprise',(select a from all_),
      'abonnement',(select a from all_))
    when 'directeur' then jsonb_build_object(
      'clients',(select a from std),'projets','["consulter","creer","modifier","valider","exporter","partager"]'::jsonb,
      'documents','["consulter","creer","modifier","valider","exporter","partager"]'::jsonb,'prix',(select a from std),
      'metres','["consulter","creer","modifier","valider","exporter"]'::jsonb,'dqe','["consulter","creer","modifier","valider","exporter"]'::jsonb,
      'devis','["consulter","creer","modifier","valider","exporter","partager"]'::jsonb,'factures',(select a from ro),
      'depenses','["consulter","creer","modifier","valider","exporter"]'::jsonb,'achats','["consulter","creer","modifier","valider","exporter"]'::jsonb,
      'stocks',(select a from std),'planning','["consulter","creer","modifier","valider","exporter"]'::jsonb,'plans',(select a from std),
      'rapports',(select a from std),'equipe','["consulter"]'::jsonb,'entreprise','["consulter"]'::jsonb)
    when 'architecte' then jsonb_build_object(
      'clients','["consulter"]'::jsonb,'projets','["consulter"]'::jsonb,'documents',(select a from std),'plans','["consulter","creer","modifier","valider","exporter"]'::jsonb,
      'metres',(select a from std),'dqe','["consulter","exporter"]'::jsonb,'prix','["consulter"]'::jsonb,'rapports','["consulter"]'::jsonb,'equipe','["consulter"]'::jsonb)
    when 'metreur' then jsonb_build_object(
      'clients','["consulter"]'::jsonb,'projets','["consulter"]'::jsonb,'documents',(select a from std),'plans',(select a from std),
      'metres','["consulter","creer","modifier","supprimer","exporter"]'::jsonb,'dqe','["consulter","creer","modifier","supprimer","exporter"]'::jsonb,
      'prix','["consulter","creer","modifier","exporter"]'::jsonb,'devis','["consulter","creer","modifier","exporter"]'::jsonb,'equipe','["consulter"]'::jsonb)
    when 'conducteur' then jsonb_build_object(
      'clients','["consulter"]'::jsonb,'projets','["consulter","modifier"]'::jsonb,'documents',(select a from std),'plans','["consulter","exporter"]'::jsonb,
      'metres','["consulter"]'::jsonb,'dqe','["consulter"]'::jsonb,'depenses',(select a from std),'achats',(select a from std),
      'stocks',(select a from std),'planning','["consulter","creer","modifier","valider","exporter"]'::jsonb,'rapports',(select a from std),'equipe','["consulter"]'::jsonb)
    when 'comptable' then jsonb_build_object(
      'clients',(select a from std),'projets','["consulter"]'::jsonb,'documents','["consulter","creer","exporter"]'::jsonb,
      'devis','["consulter","exporter"]'::jsonb,'factures','["consulter","creer","modifier","valider","exporter"]'::jsonb,
      'depenses','["consulter","creer","modifier","valider","exporter"]'::jsonb,'achats','["consulter","exporter"]'::jsonb,
      'rapports',(select a from std),'prix','["consulter"]'::jsonb,'equipe','["consulter"]'::jsonb)
    when 'commercial' then jsonb_build_object(
      'clients','["consulter","creer","modifier","exporter","partager"]'::jsonb,'projets','["consulter","creer","modifier"]'::jsonb,
      'documents','["consulter","creer","exporter"]'::jsonb,'prix','["consulter"]'::jsonb,'dqe','["consulter","exporter"]'::jsonb,
      'devis','["consulter","creer","modifier","exporter","partager"]'::jsonb,'equipe','["consulter"]'::jsonb)
    when 'lecteur' then jsonb_build_object(
      'clients','["consulter"]'::jsonb,'projets','["consulter"]'::jsonb,'documents','["consulter"]'::jsonb,'prix','["consulter"]'::jsonb,
      'metres','["consulter"]'::jsonb,'dqe','["consulter"]'::jsonb,'devis','["consulter"]'::jsonb,'plans','["consulter"]'::jsonb,
      'planning','["consulter"]'::jsonb,'equipe','["consulter"]'::jsonb)
    else '{}'::jsonb
  end
$$;

create or replace function public.seed_role_permissions(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.org_role; m record;
begin
  foreach r in array enum_range(null::public.org_role) loop
    continue when r = 'proprietaire';
    for m in select key, value from jsonb_each(public.default_permissions(r)) loop
      insert into public.role_permissions (org_id, role, module, actions)
      values (p_org, r, m.key, array(select jsonb_array_elements_text(m.value)))
      on conflict (org_id, role, module) do nothing;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------- fonctions d'accès
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join public.platform_admins pa on lower(pa.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  )
$$;

create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.org_id = p_org and m.user_id = auth.uid())
$$;

create or replace function public.org_active(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_org and o.plan_status in ('essai', 'actif') and o.plan_ends_at > now()
  )
$$;

-- Droit d'effectuer une action dans un module (§3.2) :
--  - le propriétaire a tous les droits ; les autres rôles suivent la matrice de l'entreprise ;
--  - « consulter » et « exporter » restent possibles quand l'abonnement est échu (§23.5) ;
--  - les autres actions exigent un abonnement valide et un module inclus dans l'offre
--    (sauf équipe, entreprise, abonnement).
create or replace function public.can(p_org uuid, p_module text, p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.members m
    join public.organizations o on o.id = m.org_id
    join public.subscription_plans sp on sp.id = o.plan_id
    where m.org_id = p_org and m.user_id = auth.uid()
      and (
        m.role = 'proprietaire'
        or exists (select 1 from public.role_permissions rp
                   where rp.org_id = m.org_id and rp.role = m.role and rp.module = p_module and p_action = any (rp.actions))
      )
      and (
        p_action in ('consulter', 'exporter')
        or p_module = 'abonnement'
        or (
          o.plan_status in ('essai', 'actif') and o.plan_ends_at > now()
          and (p_module in ('equipe', 'entreprise') or p_module = any (sp.modules))
        )
      )
  )
$$;

create or replace function public.log_activity(p_org uuid, p_project uuid, p_action text, p_entity text, p_entity_id text, p_label text, p_detail jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.activity_log (org_id, project_id, user_id, action, entity, entity_id, label, detail)
  values (p_org, p_project, auth.uid(), p_action, p_entity, p_entity_id, left(p_label, 300), p_detail)
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.subscription_plans enable row level security;
alter table public.platform_admins enable row level security;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.members enable row level security;
alter table public.role_permissions enable row level security;
alter table public.invitations enable row level security;
alter table public.activity_log enable row level security;

create policy "offres visibles du public" on public.subscription_plans for select to anon using (active);
create policy "offres visibles" on public.subscription_plans for select to authenticated
  using (active or public.is_platform_admin());
create policy "offres modifiées par la plateforme" on public.subscription_plans for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "offres créées par la plateforme" on public.subscription_plans for insert to authenticated
  with check (public.is_platform_admin());

create policy "administrateurs visibles par eux-mêmes" on public.platform_admins for select to authenticated
  using (public.is_platform_admin());

create policy "profils visibles" on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_platform_admin()
  or exists (select 1 from public.members a join public.members b on a.org_id = b.org_id
             where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy "profil modifiable" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (first_name, last_name, phone) on public.profiles to authenticated;

create policy "entreprise visible" on public.organizations for select to authenticated
  using (public.is_member(id) or public.is_platform_admin());
create policy "entreprise modifiable" on public.organizations for update to authenticated
  using (public.can(id, 'entreprise', 'modifier')) with check (public.can(id, 'entreprise', 'modifier'));
revoke insert, update, delete on public.organizations from anon, authenticated;
grant update (name, legal_name, country, currency, city, address, phone, email, website, logo_path, legal_ids,
  bank_details, default_taxes, quote_validity_days, payment_terms, quote_footer, metre_rules, pricing_method)
  on public.organizations to authenticated;

create policy "membres visibles" on public.members for select to authenticated
  using (public.is_member(org_id) or public.is_platform_admin());
revoke insert, update, delete on public.members from anon, authenticated;

create policy "permissions visibles" on public.role_permissions for select to authenticated
  using (public.is_member(org_id));
create policy "permissions administrées" on public.role_permissions for update to authenticated
  using (public.can(org_id, 'equipe', 'administrer')) with check (public.can(org_id, 'equipe', 'administrer'));
revoke insert, delete on public.role_permissions from anon, authenticated;
revoke update on public.role_permissions from anon, authenticated;
grant update (actions) on public.role_permissions to authenticated;

create policy "invitations visibles" on public.invitations for select to authenticated
  using (public.can(org_id, 'equipe', 'creer') or public.can(org_id, 'equipe', 'administrer'));
create policy "invitations créées" on public.invitations for insert to authenticated
  with check ((public.can(org_id, 'equipe', 'creer') or public.can(org_id, 'equipe', 'administrer'))
              and accepted_at is null and invited_by = auth.uid());
create policy "invitations supprimées" on public.invitations for delete to authenticated
  using (public.can(org_id, 'equipe', 'supprimer') or public.can(org_id, 'equipe', 'administrer'));
revoke update on public.invitations from anon, authenticated;

create policy "journal visible" on public.activity_log for select to authenticated
  using ((org_id is not null and public.is_member(org_id)) or public.is_platform_admin());
revoke insert, update, delete on public.activity_log from anon, authenticated;

-- ---------------------------------------------------------------- fonctions métier
create or replace function public.create_organization(p_name text, p_country text default 'BJ', p_city text default null, p_phone text default null, p_legal_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_trial integer; v_currency text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if (select count(*) from public.members where user_id = auth.uid() and role = 'proprietaire') >= 5 then
    raise exception 'Limite atteinte : 5 entreprises par compte';
  end if;
  select trial_days into v_trial from public.subscription_plans where id = 'decouverte';
  v_currency := case upper(coalesce(p_country, 'BJ')) when 'CM' then 'XAF' when 'GA' then 'XAF' when 'CG' then 'XAF' when 'TD' then 'XAF' when 'CF' then 'XAF' when 'GQ' then 'XAF' else 'XOF' end;
  insert into public.organizations (name, legal_name, country, currency, city, phone, created_by, plan_id, plan_status, plan_ends_at, legal_ids)
  values (btrim(p_name), nullif(btrim(coalesce(p_legal_name, '')), ''), upper(coalesce(p_country, 'BJ')), v_currency, p_city, p_phone, auth.uid(),
          'decouverte', 'essai', now() + make_interval(days => greatest(coalesce(v_trial, 30), 1)),
          case upper(coalesce(p_country, 'BJ'))
            when 'BJ' then '[{"label":"IFU","value":""},{"label":"RCCM","value":""}]'::jsonb
            when 'CI' then '[{"label":"NCC","value":""},{"label":"RCCM","value":""}]'::jsonb
            else '[{"label":"Identifiant fiscal","value":""},{"label":"Registre du commerce","value":""}]'::jsonb
          end)
  returning id into v_id;
  insert into public.members (org_id, user_id, role) values (v_id, auth.uid(), 'proprietaire');
  perform public.seed_role_permissions(v_id);
  perform public.log_activity(v_id, null, 'création', 'entreprise', v_id::text, btrim(p_name));
  return v_id;
end $$;

create or replace function public.invitation_preview(p_token text)
returns table (org_name text, role public.org_role, email text, expired boolean, accepted boolean)
language sql stable security definer set search_path = '' as $$
  select o.name, i.role, i.email, i.expires_at < now(), i.accepted_at is not null
  from public.invitations i join public.organizations o on o.id = i.org_id
  where i.token = p_token and length(p_token) >= 32
$$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations; v_email text; v_max integer; v_count integer;
begin
  select u.email into v_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'Adresse e-mail non confirmée'; end if;
  select * into inv from public.invitations where token = p_token for update;
  if inv.id is null then raise exception 'Invitation introuvable'; end if;
  if inv.accepted_at is not null then raise exception 'Invitation déjà utilisée'; end if;
  if inv.expires_at < now() then raise exception 'Invitation expirée'; end if;
  if lower(inv.email) <> lower(v_email) then raise exception 'Cette invitation a été envoyée à une autre adresse e-mail'; end if;
  if not exists (select 1 from public.members where org_id = inv.org_id and user_id = auth.uid()) then
    select sp.max_users into v_max from public.organizations o join public.subscription_plans sp on sp.id = o.plan_id where o.id = inv.org_id;
    select count(*) into v_count from public.members where org_id = inv.org_id;
    if v_max is not null and v_count >= v_max then
      raise exception 'Nombre maximal d''utilisateurs atteint pour l''offre de cette entreprise (%)', v_max;
    end if;
    insert into public.members (org_id, user_id, role) values (inv.org_id, auth.uid(), inv.role);
  end if;
  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  perform public.log_activity(inv.org_id, null, 'arrivée', 'membre', auth.uid()::text, v_email, jsonb_build_object('role', inv.role));
  return inv.org_id;
end $$;

create or replace function public.set_member_role(p_org uuid, p_user uuid, p_role public.org_role) returns void
language plpgsql security definer set search_path = '' as $$
declare v_target public.org_role; v_me public.org_role;
begin
  if not public.can(p_org, 'equipe', 'administrer') then raise exception 'Droit « administrer l''équipe » requis'; end if;
  select role into v_me from public.members where org_id = p_org and user_id = auth.uid();
  select role into v_target from public.members where org_id = p_org and user_id = p_user;
  if v_target is null then raise exception 'Membre introuvable'; end if;
  if (v_target = 'proprietaire' or p_role = 'proprietaire') and v_me <> 'proprietaire' then
    raise exception 'Seul un propriétaire peut nommer ou modifier un propriétaire';
  end if;
  if v_target = 'proprietaire' and p_role <> 'proprietaire'
     and (select count(*) from public.members where org_id = p_org and role = 'proprietaire') <= 1 then
    raise exception 'L''entreprise doit garder au moins un propriétaire';
  end if;
  update public.members set role = p_role where org_id = p_org and user_id = p_user;
  perform public.log_activity(p_org, null, 'changement de rôle', 'membre', p_user::text, null, jsonb_build_object('avant', v_target, 'après', p_role));
end $$;

create or replace function public.remove_member(p_org uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_target public.org_role; v_me public.org_role;
begin
  select role into v_me from public.members where org_id = p_org and user_id = auth.uid();
  select role into v_target from public.members where org_id = p_org and user_id = p_user;
  if v_target is null then raise exception 'Membre introuvable'; end if;
  if p_user <> auth.uid() and not public.can(p_org, 'equipe', 'administrer') then raise exception 'Droit « administrer l''équipe » requis'; end if;
  if v_target = 'proprietaire' and p_user <> auth.uid() and v_me <> 'proprietaire' then
    raise exception 'Seul un propriétaire peut retirer un propriétaire';
  end if;
  if v_target = 'proprietaire' and (select count(*) from public.members where org_id = p_org and role = 'proprietaire') <= 1 then
    raise exception 'L''entreprise doit garder au moins un propriétaire';
  end if;
  delete from public.members where org_id = p_org and user_id = p_user;
  perform public.log_activity(p_org, null, 'retrait', 'membre', p_user::text, null, jsonb_build_object('role', v_target));
end $$;

-- Matrice : rétablir les droits par défaut d'un rôle.
create or replace function public.reset_role_permissions(p_org uuid, p_role public.org_role) returns void
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  if not public.can(p_org, 'equipe', 'administrer') then raise exception 'Droit « administrer l''équipe » requis'; end if;
  delete from public.role_permissions where org_id = p_org and role = p_role;
  for m in select key, value from jsonb_each(public.default_permissions(p_role)) loop
    insert into public.role_permissions (org_id, role, module, actions)
    values (p_org, p_role, m.key, array(select jsonb_array_elements_text(m.value)));
  end loop;
  perform public.log_activity(p_org, null, 'permissions par défaut', 'rôle', p_role::text, null);
end $$;

create or replace function public.log_permission_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.actions is distinct from old.actions then
    perform public.log_activity(new.org_id, null, 'modification des permissions', 'rôle', new.role::text, new.module,
      jsonb_build_object('avant', old.actions, 'après', new.actions));
  end if;
  return new;
end $$;
create trigger role_permissions_log after update on public.role_permissions
  for each row execute function public.log_permission_change();

-- Administration de la plateforme (§24) : abonnement d'une entreprise.
create or replace function public.admin_set_subscription(p_org uuid, p_plan text, p_status text, p_period text, p_ends_at timestamptz, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Réservé à l''administration de PLANORA BTP'; end if;
  update public.organizations
     set plan_id = p_plan, plan_status = p_status, plan_period = p_period, plan_ends_at = p_ends_at,
         suspended_reason = case when p_status = 'suspendu' then p_reason end
   where id = p_org;
  perform public.log_activity(p_org, null, 'abonnement modifié par la plateforme', 'abonnement', p_org::text, p_plan,
    jsonb_build_object('statut', p_status, 'periode', p_period, 'echeance', p_ends_at, 'motif', p_reason));
end $$;

-- Statistiques de la plateforme (§24.1), sans accès au contenu des documents.
create or replace function public.admin_overview()
returns table (accounts bigint, organizations bigint, active_subscriptions bigint, expired bigint, trials bigint, storage_mb numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Réservé à l''administration de PLANORA BTP'; end if;
  return query select
    (select count(*) from auth.users),
    (select count(*) from public.organizations),
    (select count(*) from public.organizations where plan_status = 'actif' and plan_ends_at > now()),
    (select count(*) from public.organizations where plan_status in ('expire') or (plan_status in ('essai','actif') and plan_ends_at <= now())),
    (select count(*) from public.organizations where plan_status = 'essai' and plan_ends_at > now()),
    (select coalesce(round(sum((o.metadata ->> 'size')::numeric) / 1048576, 1), 0) from storage.objects o where o.bucket_id = 'documents');
end $$;

-- Fonctions : jamais exécutables par un visiteur anonyme (sauf l'aperçu d'invitation).
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon;
alter default privileges in schema public revoke execute on functions from public;
