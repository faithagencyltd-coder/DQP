-- PLANORA BTP — 10. Notifications (§25), préférences, assistance (§24.2), historique des
-- abonnements et alertes d'échéance (§23.3), tableau de bord administrateur enrichi (§24.1).
-- Les notifications dans l'application sont créées par la base (déclencheurs et contrôle
-- quotidien idempotent) : un utilisateur ne peut pas en fabriquer. L'envoi par e-mail ou SMS
-- n'est pas actif tant qu'aucun service n'est branché : la préférence est enregistrée, c'est tout.

-- ---------------------------------------------------------------- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedup_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index notifications_dedup_idx on public.notifications (user_id, dedup_key) where dedup_key is not null;

create table public.notification_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  in_app boolean not null default true,
  email boolean not null default false,
  primary key (user_id, kind)
);

-- Événements configurables (§25).
create or replace function public.notification_kinds() returns text[]
language sql immutable set search_path = '' as $$
  select array['equipe', 'devis', 'facture_echeance', 'paiement', 'tache_retard', 'budget', 'stock', 'abonnement', 'quota_ia', 'echec', 'support']
$$;

-- Un membre peut-il consulter ce module (rôle seulement : l'offre ne bloque jamais la lecture) ?
create or replace function public.member_reads(p_org uuid, p_user uuid, p_module text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m where m.org_id = p_org and m.user_id = p_user
      and (m.role = 'proprietaire' or exists (select 1 from public.role_permissions rp where rp.org_id = m.org_id and rp.role = m.role and rp.module = p_module and 'consulter' = any (rp.actions)))
  )
$$;

-- Notifie chaque membre qui peut consulter le module et n'a pas désactivé ce type d'événement.
-- p_dedup : clé d'unicité par destinataire (un même événement n'est jamais notifié deux fois).
create or replace function public.notify_members(p_org uuid, p_module text, p_kind text, p_title text, p_body text, p_link text, p_dedup text default null, p_except uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.notifications (org_id, user_id, kind, title, body, link, dedup_key)
  select p_org, m.user_id, p_kind, p_title, p_body, p_link, p_dedup
  from public.members m
  where m.org_id = p_org and m.user_id is distinct from p_except
    and public.member_reads(p_org, m.user_id, p_module)
    and coalesce((select in_app from public.notification_prefs np where np.user_id = m.user_id and np.kind = p_kind), true)
  on conflict (user_id, dedup_key) where dedup_key is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.notify_user(p_org uuid, p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_dedup text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  if not coalesce((select in_app from public.notification_prefs np where np.user_id = p_user and np.kind = p_kind), true) then return; end if;
  insert into public.notifications (org_id, user_id, kind, title, body, link, dedup_key)
  values (p_org, p_user, p_kind, p_title, p_body, p_link, p_dedup)
  on conflict (user_id, dedup_key) where dedup_key is not null do nothing;
end $$;

-- ---------------------------------------------------------------- déclencheurs d'événements
create or replace function public.ntf_member_joined() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email) into v_name from public.profiles p where p.id = new.user_id;
  perform public.notify_members(new.org_id, 'equipe', 'equipe', 'Nouveau collaborateur', coalesce(v_name, 'Un utilisateur') || ' a rejoint l’entreprise (rôle : ' || new.role || ').', '/app/parametres', 'membre:' || new.org_id || ':' || new.user_id, new.user_id);
  return new;
end $$;
create trigger ntf_member_joined after insert on public.members for each row execute function public.ntf_member_joined();

create or replace function public.ntf_invitation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify_members(new.org_id, 'equipe', 'equipe', 'Invitation envoyée', 'Invitation de ' || new.email || ' (rôle : ' || new.role || ').', '/app/parametres', 'invitation:' || new.id, auth.uid());
  return new;
end $$;
create trigger ntf_invitation after insert on public.invitations for each row execute function public.ntf_invitation();

create or replace function public.ntf_quote_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'devis' and new.status is distinct from old.status and new.status in ('envoye', 'accepte', 'refuse') then
    perform public.notify_members(new.org_id, 'devis', 'devis',
      case new.status when 'envoye' then 'Devis envoyé' when 'accepte' then 'Devis accepté' else 'Devis refusé' end,
      new.reference || ' — ' || new.title, '/app/documents-chiffres/' || new.id, 'devis:' || new.id || ':' || new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger ntf_quote_status after update of status on public.quotes for each row execute function public.ntf_quote_status();

create or replace function public.ntf_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = new.invoice_id;
  perform public.notify_members(new.org_id, 'factures', 'paiement', 'Paiement enregistré',
    coalesce(i.reference, '') || ' : ' || new.amount || ' ' || coalesce(i.settings ->> 'currency', '') || ' (déclaré)', '/app/factures/' || new.invoice_id, 'paiement:' || new.id, auth.uid());
  return new;
end $$;
create trigger ntf_payment after insert on public.payments for each row execute function public.ntf_payment();

create or replace function public.ntf_render_failed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'echec' and old.status is distinct from 'echec' then
    perform public.notify_user(new.org_id, new.created_by, 'echec', 'Rendu IA en échec', coalesce(new.error, 'Le rendu n’a pas abouti ; les unités ont été restituées.'), '/app/plans/' || new.plan_id, 'rendu:' || new.id);
  end if;
  return new;
end $$;
create trigger ntf_render_failed after update of status on public.plan_renders for each row execute function public.ntf_render_failed();

create or replace function public.ntf_billing_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'refusee' and old.status = 'en_attente' then
    perform public.notify_members(new.org_id, 'abonnement', 'abonnement', 'Demande d’abonnement refusée', coalesce(new.admin_note, 'Le règlement n’a pas pu être confirmé.'), '/app/abonnement', 'demande:' || new.id || ':refus');
  elsif new.status = 'traitee' and old.status = 'en_attente' then
    perform public.notify_members(new.org_id, 'abonnement', 'abonnement', 'Abonnement activé', 'Offre ' || new.plan_id || ' activée après règlement.', '/app/abonnement', 'demande:' || new.id || ':ok');
  end if;
  return new;
end $$;
create trigger ntf_billing_request after update of status on public.billing_requests for each row execute function public.ntf_billing_request();

-- Contrôle quotidien (appelé à l'ouverture de l'application, idempotent grâce aux clés
-- d'unicité) : échéances de factures, tâches en retard, dépassements de budget, stocks bas,
-- quota IA, fin d'abonnement proche.
create or replace function public.refresh_notifications(p_org uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; v_before integer; o public.organizations; q record; d text := to_char(current_date, 'YYYY-MM-DD');
begin
  if not public.is_member(p_org) then raise exception 'Entreprise introuvable'; end if;
  select * into o from public.organizations where id = p_org;
  select coalesce(reminder_before_days, 7) into v_before from public.organizations where id = p_org;
  for r in select i.id, i.reference, i.due_date, i.total_ttc - i.amount_paid as rest from public.invoices i
           where i.org_id = p_org and i.kind <> 'avoir' and i.status in ('emise', 'partielle') and i.due_date <= current_date + v_before loop
    n := n + public.notify_members(p_org, 'factures', 'facture_echeance',
      case when r.due_date < current_date then 'Facture échue' else 'Facture proche de l’échéance' end,
      r.reference || ' : reste ' || r.rest || ', échéance le ' || to_char(r.due_date, 'DD/MM/YYYY'), '/app/factures/' || r.id,
      'echeance:' || r.id || ':' || case when r.due_date < current_date then 'echue' else 'proche' end);
  end loop;
  for r in select t.id, t.title, t.end_date, t.project_id from public.tasks t
           where t.org_id = p_org and t.status not in ('termine', 'valide') and t.end_date < current_date loop
    n := n + public.notify_members(p_org, 'planning', 'tache_retard', 'Tâche en retard', r.title || ' (fin prévue le ' || to_char(r.end_date, 'DD/MM/YYYY') || ')', '/app/planning?projet=' || r.project_id, 'retard:' || r.id || ':' || r.end_date);
  end loop;
  for r in select p.id, p.reference, p.name, coalesce(p.budget_revised, p.budget_validated, p.budget_estimate) as budget, sum(e.amount_ht) as spent
           from public.projects p join public.expenses e on e.project_id = p.id
           where p.org_id = p_org and p.archived_at is null group by p.id
           having sum(e.amount_ht) > coalesce(p.budget_revised, p.budget_validated, p.budget_estimate) loop
    n := n + public.notify_members(p_org, 'depenses', 'budget', 'Dépassement de budget', r.reference || ' — ' || r.name || ' : dépenses ' || r.spent || ' pour un budget de ' || r.budget, '/app/projets/' || r.id, 'budget:' || r.id || ':' || r.budget);
  end loop;
  for r in select l.item_id, l.warehouse_id, l.qty, l.min_qty, i.designation, w.name as wh from public.stock_levels l
           join public.price_items i on i.id = l.item_id join public.warehouses w on w.id = l.warehouse_id
           where l.org_id = p_org and l.min_qty is not null and l.qty < l.min_qty loop
    n := n + public.notify_members(p_org, 'stocks', 'stock', 'Stock insuffisant', r.designation || ' (' || r.wh || ') : ' || trim_scale(r.qty) || ' pour un minimum de ' || trim_scale(r.min_qty), '/app/stocks', 'stock:' || r.item_id || ':' || r.warehouse_id || ':' || d);
  end loop;
  select * into q from public.ai_quota_status(p_org);
  if q.quota > 0 and q.remaining < 10 then
    n := n + public.notify_members(p_org, 'plans', 'quota_ia', 'Quota IA atteint', 'Il reste ' || q.remaining || ' unité(s) sur ' || q.quota || ' ce mois-ci.', '/app/abonnement', 'quota:' || to_char(q.period_start, 'YYYY-MM'));
  end if;
  if o.plan_status in ('essai', 'actif') and o.plan_ends_at <= now() + interval '7 days' then
    n := n + public.notify_members(p_org, 'abonnement', 'abonnement',
      case when o.plan_ends_at <= now() then 'Abonnement échu' else 'Abonnement bientôt échu' end,
      'Échéance le ' || to_char(o.plan_ends_at, 'DD/MM/YYYY') || '. Vos données restent consultables ; renouvelez pour continuer à créer.', '/app/abonnement',
      'echeance-abonnement:' || to_char(o.plan_ends_at, 'YYYY-MM-DD') || ':' || case when o.plan_ends_at <= now() then 'echu' else 'proche' end);
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------- assistance
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  reference text not null default '',
  subject text not null check (length(btrim(subject)) between 3 and 200),
  category text not null default 'question' check (category in ('question', 'incident', 'abonnement', 'donnees', 'suggestion')),
  priority text not null default 'normale' check (priority in ('normale', 'haute', 'bloquante')),
  status text not null default 'ouvert' check (status in ('ouvert', 'en_cours', 'resolu', 'ferme')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_idx on public.support_tickets (org_id, created_at desc);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author uuid default auth.uid() references auth.users (id) on delete set null,
  from_platform boolean not null default false,
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index support_messages_idx on public.support_messages (ticket_id, created_at);

create or replace function public.open_ticket(p_org uuid, p_subject text, p_category text, p_priority text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ref text;
begin
  if not public.is_member(p_org) then raise exception 'Entreprise introuvable'; end if;
  v_ref := public.next_number(p_org, 'support', 'AST');
  insert into public.support_tickets (org_id, reference, subject, category, priority) values (p_org, v_ref, btrim(p_subject), p_category, p_priority) returning id into v_id;
  insert into public.support_messages (ticket_id, body) values (v_id, p_body);
  return v_id;
end $$;

create or replace function public.post_ticket_message(p_ticket uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets; v_admin boolean := public.is_platform_admin();
begin
  select * into t from public.support_tickets where id = p_ticket;
  if t.id is null or not (v_admin or public.is_member(t.org_id)) then raise exception 'Demande introuvable'; end if;
  if t.status = 'ferme' then raise exception 'Demande close : ouvrez-en une nouvelle'; end if;
  insert into public.support_messages (ticket_id, body, from_platform) values (p_ticket, p_body, v_admin and not public.is_member(t.org_id));
  update public.support_tickets set updated_at = now(),
    status = case when v_admin and not public.is_member(t.org_id) and status = 'ouvert' then 'en_cours' else status end where id = p_ticket;
  if v_admin and not public.is_member(t.org_id) then
    perform public.notify_user(t.org_id, t.created_by, 'support', 'Réponse de l’assistance PLANORA BTP', t.reference || ' — ' || t.subject, '/app/assistance?demande=' || t.id, null);
  end if;
end $$;

create or replace function public.set_ticket_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets;
begin
  select * into t from public.support_tickets where id = p_ticket;
  if t.id is null or not (public.is_platform_admin() or public.is_member(t.org_id)) then raise exception 'Demande introuvable'; end if;
  if p_status not in ('ouvert', 'en_cours', 'resolu', 'ferme') then raise exception 'Statut inconnu'; end if;
  if p_status = 'en_cours' and not public.is_platform_admin() then raise exception 'Réservé à l''assistance'; end if;
  update public.support_tickets set status = p_status, updated_at = now() where id = p_ticket;
  if public.is_platform_admin() and not public.is_member(t.org_id) and p_status in ('resolu', 'ferme') then
    perform public.notify_user(t.org_id, t.created_by, 'support', 'Demande d’assistance ' || case p_status when 'resolu' then 'résolue' else 'close' end, t.reference || ' — ' || t.subject, '/app/assistance?demande=' || t.id, 'ticket:' || t.id || ':' || p_status);
  end if;
end $$;

-- ---------------------------------------------------------------- historique des abonnements
create table public.subscription_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  plan_id text not null,
  status text not null,
  period text,
  ends_at timestamptz,
  amount integer,
  currency text,
  source text not null check (source in ('inscription', 'demande', 'administration')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index subscription_events_idx on public.subscription_events (org_id, created_at desc);

-- Toute modification d'offre, de statut ou d'échéance est historisée.
create or replace function public.org_subscription_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_req public.billing_requests;
begin
  if tg_op = 'INSERT' then
    insert into public.subscription_events (org_id, plan_id, status, period, ends_at, source) values (new.id, new.plan_id, new.plan_status, new.plan_period, new.plan_ends_at, 'inscription');
  elsif (new.plan_id, new.plan_status, coalesce(new.plan_period, ''), new.plan_ends_at) is distinct from (old.plan_id, old.plan_status, coalesce(old.plan_period, ''), old.plan_ends_at) then
    select * into v_req from public.billing_requests where org_id = new.id and status = 'en_attente' and plan_id = new.plan_id order by created_at desc limit 1;
    insert into public.subscription_events (org_id, plan_id, status, period, ends_at, amount, currency, source, note)
    values (new.id, new.plan_id, new.plan_status, new.plan_period, new.plan_ends_at, v_req.amount, v_req.currency, case when v_req.id is null then 'administration' else 'demande' end, new.suspended_reason);
  end if;
  return new;
end $$;
create trigger org_subscription_history after insert or update on public.organizations for each row execute function public.org_subscription_history();
insert into public.subscription_events (org_id, plan_id, status, period, ends_at, source, created_by, created_at)
  select id, plan_id, plan_status, plan_period, plan_ends_at, 'inscription', created_by, created_at from public.organizations;

-- ---------------------------------------------------------------- administration (§24.1)
create or replace function public.admin_overview2()
returns table (accounts bigint, active_users bigint, organizations bigint, active_subscriptions bigint, expired bigint, trials bigint, suspended bigint,
               storage_mb numeric, revenue_month numeric, revenue_total numeric, failed_payments bigint, pending_requests bigint,
               open_tickets bigint, incidents_30d bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Réservé à l''administration de PLANORA BTP'; end if;
  return query select
    (select count(*) from auth.users),
    (select count(distinct a.user_id) from public.activity_log a where a.at > now() - interval '30 days'),
    (select count(*) from public.organizations),
    (select count(*) from public.organizations where plan_status = 'actif' and plan_ends_at > now()),
    (select count(*) from public.organizations where plan_status in ('expire') or (plan_status in ('essai','actif') and plan_ends_at <= now())),
    (select count(*) from public.organizations where plan_status = 'essai' and plan_ends_at > now()),
    (select count(*) from public.organizations where plan_status = 'suspendu'),
    (select coalesce(round(sum((o.metadata ->> 'size')::numeric) / 1048576, 1), 0) from storage.objects o where o.bucket_id = 'documents'),
    (select coalesce(sum(amount), 0)::numeric from public.billing_requests where status = 'traitee' and handled_at >= date_trunc('month', now())),
    (select coalesce(sum(amount), 0)::numeric from public.billing_requests where status = 'traitee'),
    (select count(*) from public.billing_requests where status = 'refusee'),
    (select count(*) from public.billing_requests where status = 'en_attente'),
    (select count(*) from public.support_tickets where status in ('ouvert', 'en_cours')),
    (select count(*) from public.plan_renders where status = 'echec' and created_at > now() - interval '30 days');
end $$;

-- Journal technique de la plateforme : événements d'abonnement et échecs, sans contenu métier.
create or replace function public.admin_tech_log(p_limit integer default 100)
returns table (at timestamptz, org_name text, kind text, detail text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Réservé à l''administration de PLANORA BTP'; end if;
  return query
  select * from (
    select e.created_at, o.name, 'abonnement'::text, e.plan_id || ' · ' || e.status || coalesce(' · jusqu’au ' || to_char(e.ends_at, 'DD/MM/YYYY'), '') || coalesce(' · ' || e.note, '')
    from public.subscription_events e join public.organizations o on o.id = e.org_id
    union all
    select r.finished_at, o.name, 'rendu IA en échec', coalesce(r.error, 'erreur inconnue')
    from public.plan_renders r join public.organizations o on o.id = r.org_id where r.status = 'echec'
    union all
    select b.handled_at, o.name, 'demande ' || b.status, b.plan_id || ' · ' || b.amount || ' ' || b.currency || coalesce(' · ' || b.admin_note, '')
    from public.billing_requests b join public.organizations o on o.id = b.org_id where b.handled_at is not null
  ) x order by 1 desc nulls last limit greatest(1, least(p_limit, 500));
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.subscription_events enable row level security;

create policy "mes notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "marquer mes notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "effacer mes notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

create policy "mes préférences" on public.notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and kind = any (public.notification_kinds()));

create policy "demandes d'assistance lecture" on public.support_tickets for select to authenticated using (public.is_member(org_id) or public.is_platform_admin());
create policy "messages d'assistance lecture" on public.support_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (public.is_member(t.org_id) or public.is_platform_admin())));
revoke insert, update, delete on public.support_tickets, public.support_messages from authenticated, anon;

create policy "historique d'abonnement" on public.subscription_events for select to authenticated using (public.can(org_id, 'abonnement', 'consulter') or public.is_platform_admin());
revoke insert, update, delete on public.subscription_events from authenticated, anon;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon;
revoke execute on function public.next_number(uuid, text, text) from authenticated;
revoke execute on function public.finish_plan_render(uuid, boolean, text, text, text, text) from authenticated;
revoke execute on function public.expire_stale_renders(uuid) from authenticated;
revoke execute on function public.notify_members(uuid, text, text, text, text, text, text, uuid) from authenticated;
revoke execute on function public.notify_user(uuid, uuid, text, text, text, text, text) from authenticated;
