-- PLANORA BTP — 4. Demandes d'abonnement (§23.3) : tant que le paiement en ligne n'est pas
-- intégré, l'entreprise demande une offre et l'administration de la plateforme l'active après
-- encaissement. Aucun paiement n'est présenté comme confirmé par l'application.

create table public.billing_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  plan_id text not null references public.subscription_plans (id),
  period text not null check (period in ('mois', 'an')),
  amount integer not null check (amount >= 0),
  currency text not null default 'XOF',
  payment_method text check (payment_method in ('mobile_money', 'virement', 'especes', 'cheque', 'carte', 'autre')),
  contact_phone text,
  note text,
  status text not null default 'en_attente' check (status in ('en_attente', 'traitee', 'refusee', 'annulee')),
  admin_note text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz
);
create index billing_requests_org_idx on public.billing_requests (org_id, created_at desc);
alter table public.billing_requests enable row level security;

create policy "demandes visibles" on public.billing_requests for select to authenticated
  using (public.can(org_id, 'abonnement', 'consulter') or public.is_platform_admin());

-- Le montant est recalculé depuis l'offre : le client ne fixe pas son prix.
create or replace function public.request_subscription(p_org uuid, p_plan text, p_period text, p_method text, p_phone text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_amount integer; v_cur text; v_id uuid;
begin
  if not public.can(p_org, 'abonnement', 'modifier') then raise exception 'Droit « abonnement » requis'; end if;
  select case p_period when 'an' then price_year else price_month end, currency into v_amount, v_cur
  from public.subscription_plans where id = p_plan and active;
  if v_amount is null then raise exception 'Offre inconnue'; end if;
  if exists (select 1 from public.billing_requests where org_id = p_org and status = 'en_attente') then
    raise exception 'Une demande est déjà en attente de traitement';
  end if;
  insert into public.billing_requests (org_id, plan_id, period, amount, currency, payment_method, contact_phone, note)
  values (p_org, p_plan, p_period, v_amount, v_cur, p_method, p_phone, p_note) returning id into v_id;
  perform public.log_activity(p_org, null, 'demande d''abonnement', 'abonnement', v_id::text, p_plan, jsonb_build_object('periode', p_period, 'montant', v_amount));
  return v_id;
end $$;

create or replace function public.cancel_subscription_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.billing_requests;
begin
  select * into r from public.billing_requests where id = p_request;
  if r.id is null or not public.can(r.org_id, 'abonnement', 'modifier') then raise exception 'Demande introuvable'; end if;
  update public.billing_requests set status = 'annulee' where id = p_request and status = 'en_attente';
end $$;

-- Traitement par l'administration : activation de l'offre (période à partir de l'échéance en
-- cours si elle n'est pas dépassée, sinon d'aujourd'hui) ou refus motivé.
create or replace function public.admin_handle_request(p_request uuid, p_accept boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.billing_requests; v_start timestamptz; v_end timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'Réservé à l''administration de PLANORA BTP'; end if;
  select * into r from public.billing_requests where id = p_request for update;
  if r.id is null or r.status <> 'en_attente' then raise exception 'Demande déjà traitée ou introuvable'; end if;
  if p_accept then
    select greatest(now(), case when plan_status in ('essai', 'actif') then plan_ends_at else now() end) into v_start from public.organizations where id = r.org_id;
    v_end := v_start + case r.period when 'an' then interval '1 year' else interval '1 month' end;
    perform public.admin_set_subscription(r.org_id, r.plan_id, 'actif', r.period, v_end, null);
  end if;
  update public.billing_requests set status = case when p_accept then 'traitee' else 'refusee' end, admin_note = p_note,
    handled_by = auth.uid(), handled_at = now() where id = p_request;
end $$;

revoke insert, update, delete on public.billing_requests from anon, authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon;
revoke execute on function public.next_number(uuid, text, text) from authenticated;
