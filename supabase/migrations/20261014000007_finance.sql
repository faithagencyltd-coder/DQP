-- PLANORA BTP — 7. Facturation, encaissements, relances, dépenses et budget (§16, §17).
-- Les totaux des factures sont recalculés PAR LA BASE à partir des lignes (mêmes règles
-- d'arrondi que le moteur src/engine/dqe.ts) : un client ne peut pas enregistrer un total faux.
-- Une facture émise est numérotée dans l'ordre, figée, et ne se corrige que par un avoir.
-- Un paiement saisi à la main est « déclaré » : il n'est jamais présenté comme confirmé par
-- un système de paiement (aucune intégration n'est active).

-- ---------------------------------------------------------------- budget du projet
alter table public.projects
  add column budget_revised numeric(16, 2) check (budget_revised is null or budget_revised >= 0),
  add column margin_target_pct numeric(5, 2) check (margin_target_pct is null or margin_target_pct between -100 and 100);
grant update (budget_revised, margin_target_pct) on public.projects to authenticated;

alter table public.project_lots add column budget numeric(16, 2) check (budget is null or budget >= 0);

-- ---------------------------------------------------------------- calcul des totaux
create or replace function public.money_round(v numeric, cur text) returns numeric
language sql immutable set search_path = '' as $$
  select round(v, case when upper(coalesce(cur, 'XOF')) in ('XOF', 'XAF') then 0 else 2 end)
$$;

-- Même calcul que computeDoc (src/engine/dqe.ts) : ligne = arrondi(qté × PU), sous-total de lot
-- arrondi, remise, net HT, taxes arrondies une à une, TTC. Une ligne sans quantité ou sans prix
-- n'est pas comptée et est signalée (incomplete).
create or replace function public.doc_totals(p_body jsonb, p_settings jsonb,
  out total_ht numeric, out net_ht numeric, out total_ttc numeric, out incomplete integer)
language plpgsql immutable set search_path = '' as $$
declare
  cur text := coalesce(p_settings ->> 'currency', 'XOF');
  lot jsonb; ln jsonb; sub numeric; tax jsonb; taxsum numeric := 0; disc numeric;
begin
  total_ht := 0; incomplete := 0;
  for lot in select * from jsonb_array_elements(coalesce(p_body -> 'lots', '[]'::jsonb)) loop
    sub := 0;
    for ln in select * from jsonb_array_elements(coalesce(lot -> 'lines', '[]'::jsonb)) loop
      continue when ln ->> 'kind' = 'titre';
      if jsonb_typeof(ln -> 'qty') is distinct from 'number' or jsonb_typeof(ln -> 'unitPrice') is distinct from 'number' then
        incomplete := incomplete + 1;
      else
        sub := sub + public.money_round((ln ->> 'qty')::numeric * (ln ->> 'unitPrice')::numeric, cur);
      end if;
    end loop;
    total_ht := total_ht + public.money_round(sub, cur);
  end loop;
  total_ht := public.money_round(total_ht, cur);
  disc := public.money_round(total_ht * coalesce((p_settings ->> 'discountPct')::numeric, 0) / 100, cur);
  net_ht := public.money_round(total_ht - disc, cur);
  for tax in select * from jsonb_array_elements(coalesce(p_settings -> 'taxes', '[]'::jsonb)) loop
    continue when coalesce((tax ->> 'rate')::numeric, 0) = 0 and coalesce(tax ->> 'label', '') = '';
    taxsum := taxsum + public.money_round(net_ht * coalesce((tax ->> 'rate')::numeric, 0) / 100, cur);
  end loop;
  total_ttc := public.money_round(net_ht + taxsum, cur);
end $$;

-- ---------------------------------------------------------------- factures
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  client_id uuid references public.contacts (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  credit_for uuid references public.invoices (id) on delete restrict,
  -- Numéro attribué à l'émission seulement (suite continue, sans trou).
  reference text,
  kind text not null default 'simple' check (kind in ('simple', 'acompte', 'situation', 'finale', 'avoir')),
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'brouillon' check (status in ('brouillon', 'emise', 'partielle', 'payee', 'annulee')),
  issue_date date,
  due_date date,
  body jsonb not null default '{"lots":[]}'::jsonb,
  settings jsonb not null default '{"currency":"XOF","taxes":[{"label":"TVA","rate":18}],"discountPct":0}'::jsonb,
  total_ht numeric(18, 2) not null default 0,
  net_ht numeric(18, 2) not null default 0,
  total_ttc numeric(18, 2) not null default 0,
  incomplete_lines integer not null default 0,
  amount_paid numeric(18, 2) not null default 0,
  payment_terms text,
  notes text,
  cancel_reason text,
  issued_at timestamptz,
  issued_by uuid references auth.users (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference),
  check (kind <> 'avoir' or credit_for is not null)
);
create index invoices_org_idx on public.invoices (org_id, status, due_date);
create index invoices_project_idx on public.invoices (project_id);
create index invoices_client_idx on public.invoices (client_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount numeric(18, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null check (method in ('especes', 'virement', 'cheque', 'mobile_money', 'carte', 'autre')),
  reference text,
  note text,
  -- Toujours faux pour une saisie manuelle : seule une intégration de paiement pourra confirmer.
  verified boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_org_idx on public.payments (org_id, paid_on desc);

create table public.invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'telephone', 'courrier', 'autre')),
  note text,
  sent_by uuid default auth.uid() references auth.users (id) on delete set null,
  sent_at timestamptz not null default now()
);

-- Paramètres de relance de l'entreprise (§16.3) : délai de paiement par défaut, alertes.
alter table public.organizations
  add column payment_days integer not null default 30 check (payment_days between 0 and 365),
  add column reminder_before_days integer not null default 7 check (reminder_before_days between 0 and 90),
  add column reminder_every_days integer not null default 15 check (reminder_every_days between 1 and 180);
grant update (payment_days, reminder_before_days, reminder_every_days) on public.organizations to authenticated;

create or replace function public.invoices_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t record; server boolean := coalesce(current_setting('planora.server_change', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not public.can(new.org_id, 'factures', 'creer') then return new; end if;
    new.status := 'brouillon';
    new.reference := null;
    new.amount_paid := 0;
    new.issued_at := null;
    new.issued_by := null;
    new.created_by := auth.uid();
    if new.client_id is null and new.project_id is not null then
      select p.client_id into new.client_id from public.projects p where p.id = new.project_id and p.org_id = new.org_id;
    end if;
  else
    if new.org_id <> old.org_id then raise exception 'Changement d''entreprise interdit'; end if;
    if not server then
      if old.status <> 'brouillon' then
        -- Facture émise : seules les notes internes peuvent encore changer.
        if new.body <> old.body or new.settings <> old.settings or new.client_id is distinct from old.client_id or new.project_id is distinct from old.project_id
           or new.title <> old.title or new.issue_date is distinct from old.issue_date or new.due_date is distinct from old.due_date
           or new.payment_terms is distinct from old.payment_terms or new.kind <> old.kind then
          raise exception 'Facture % émise : elle ne se modifie plus. Établissez un avoir pour la corriger.', old.reference;
        end if;
      end if;
      new.status := old.status; new.reference := old.reference; new.amount_paid := old.amount_paid;
      new.issued_at := old.issued_at; new.issued_by := old.issued_by; new.cancel_reason := old.cancel_reason;
    end if;
    new.created_by := old.created_by;
    new.updated_by := auth.uid();
  end if;
  select * into t from public.doc_totals(new.body, new.settings);
  new.total_ht := t.total_ht; new.net_ht := t.net_ht; new.total_ttc := t.total_ttc; new.incomplete_lines := t.incomplete;
  return new;
end $$;
create trigger invoices_before before insert or update on public.invoices for each row execute function public.invoices_before();
create trigger invoices_touch before update on public.invoices for each row execute function public.touch_updated_at();
create trigger invoices_audit after insert or update or delete on public.invoices for each row execute function public.audit_row();

-- Émission : numéro définitif, dates, figement. Exige le droit « valider ».
create or replace function public.issue_invoice(p_invoice uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare i public.invoices; o public.organizations; v_ref text; v_issue date;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if i.id is null or not public.can(i.org_id, 'factures', 'consulter') then raise exception 'Facture introuvable'; end if;
  if not public.can(i.org_id, 'factures', 'valider') then raise exception 'Droit « valider » requis pour émettre une facture'; end if;
  if i.status <> 'brouillon' then raise exception 'Facture déjà émise'; end if;
  if i.client_id is null then raise exception 'Choisissez le client avant d''émettre la facture'; end if;
  if i.incomplete_lines > 0 then raise exception '% ligne(s) sans quantité ou sans prix : complétez-les avant d''émettre', i.incomplete_lines; end if;
  if i.kind = 'avoir' and i.total_ttc >= 0 then raise exception 'Un avoir doit avoir un montant négatif'; end if;
  if i.kind <> 'avoir' and i.total_ttc <= 0 then raise exception 'Le montant de la facture doit être positif'; end if;
  select * into o from public.organizations where id = i.org_id;
  v_ref := public.next_number(i.org_id, case when i.kind = 'avoir' then 'avoir' else 'facture' end, case when i.kind = 'avoir' then 'AVO' else 'FAC' end);
  v_issue := coalesce(i.issue_date, current_date);
  perform set_config('planora.server_change', 'on', true);
  update public.invoices set reference = v_ref, status = case when kind = 'avoir' then 'payee' else 'emise' end,
    issue_date = v_issue, due_date = case when kind = 'avoir' then v_issue else coalesce(due_date, v_issue + o.payment_days) end,
    issued_at = now(), issued_by = auth.uid()
  where id = i.id;
  perform set_config('planora.server_change', 'off', true);
  insert into public.activity_log (org_id, project_id, user_id, action, entity, entity_id, label, detail)
  values (i.org_id, i.project_id, auth.uid(), 'émission', 'invoices', i.id::text, left(v_ref || ' — ' || i.title, 300), jsonb_build_object('TTC', i.total_ttc));
  return v_ref;
end $$;

-- Annulation d'une facture émise sans encaissement (la règle recommandée reste l'avoir).
create or replace function public.cancel_invoice(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if i.id is null or not public.can(i.org_id, 'factures', 'valider') then raise exception 'Droit « valider » requis'; end if;
  if i.status not in ('emise') then raise exception 'Seule une facture émise sans encaissement peut être annulée'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Motif d''annulation obligatoire'; end if;
  perform set_config('planora.server_change', 'on', true);
  update public.invoices set status = 'annulee', cancel_reason = p_reason where id = i.id;
  perform set_config('planora.server_change', 'off', true);
end $$;

-- Paiements : uniquement sur une facture émise, sans dépasser le solde ; statut recalculé.
create or replace function public.payments_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare i public.invoices; v_paid numeric;
begin
  select * into i from public.invoices where id = new.invoice_id for update;
  if i.id is null or i.org_id <> new.org_id then raise exception 'Facture introuvable'; end if;
  if i.kind = 'avoir' then raise exception 'Un avoir ne reçoit pas de paiement'; end if;
  if i.status not in ('emise', 'partielle') then raise exception 'Paiement impossible : facture %', case i.status when 'brouillon' then 'non émise' when 'payee' then 'déjà soldée' else 'annulée' end; end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = i.id and id <> new.id;
  if v_paid + new.amount > i.total_ttc then
    raise exception 'Le paiement dépasse le solde de la facture (reste à payer : %)', i.total_ttc - v_paid;
  end if;
  new.verified := false;
  new.created_by := auth.uid();
  return new;
end $$;
create trigger payments_before before insert on public.payments for each row execute function public.payments_before();

create or replace function public.payments_after() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_inv uuid := coalesce(new.invoice_id, old.invoice_id); v_paid numeric; i public.invoices;
begin
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = v_inv;
  select * into i from public.invoices where id = v_inv;
  perform set_config('planora.server_change', 'on', true);
  update public.invoices set amount_paid = v_paid,
    status = case when status in ('annulee', 'brouillon') then status when v_paid >= total_ttc then 'payee' when v_paid > 0 then 'partielle' else 'emise' end
  where id = v_inv;
  perform set_config('planora.server_change', 'off', true);
  insert into public.activity_log (org_id, project_id, user_id, action, entity, entity_id, label, detail)
  values (i.org_id, i.project_id, auth.uid(), case when tg_op = 'DELETE' then 'suppression d''un paiement' else 'paiement enregistré' end, 'invoices', v_inv::text,
          left(coalesce(i.reference, '') || ' — ' || i.title, 300), jsonb_build_object('montant', coalesce(new.amount, old.amount), 'mode', coalesce(new.method, old.method)));
  return null;
end $$;
create trigger payments_after after insert or delete on public.payments for each row execute function public.payments_after();

-- ---------------------------------------------------------------- dépenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  lot text,
  supplier_id uuid references public.contacts (id) on delete set null,
  category text not null check (category in ('materiaux', 'main_oeuvre', 'transport', 'location', 'sous_traitance', 'carburant', 'deplacement', 'administratif', 'autre')),
  label text not null check (length(btrim(label)) between 1 and 200),
  expense_date date not null default current_date,
  amount_ht numeric(18, 2) not null check (amount_ht >= 0),
  tax_amount numeric(18, 2) not null default 0 check (tax_amount >= 0),
  amount_ttc numeric(18, 2) generated always as (amount_ht + tax_amount) stored,
  -- Engagée (commandée), facturée par le fournisseur, payée (§17.3).
  status text not null default 'engagee' check (status in ('engagee', 'facturee', 'payee')),
  paid_on date,
  payment_method text check (payment_method is null or payment_method in ('especes', 'virement', 'cheque', 'mobile_money', 'carte', 'autre')),
  supplier_invoice_ref text,
  receipt_path text,
  note text,
  purchase_order_id uuid,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (receipt_path is null or receipt_path like org_id::text || '/depenses/%'),
  check (status <> 'payee' or paid_on is not null)
);
create index expenses_org_idx on public.expenses (org_id, expense_date desc);
create index expenses_project_idx on public.expenses (project_id, lot);

create or replace function public.expenses_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_by := auth.uid();
  else
    if new.org_id <> old.org_id then raise exception 'Changement d''entreprise interdit'; end if;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger expenses_before before insert or update on public.expenses for each row execute function public.expenses_before();
create trigger expenses_touch before update on public.expenses for each row execute function public.touch_updated_at();
create trigger expenses_audit after insert or update or delete on public.expenses for each row execute function public.audit_row();

-- ---------------------------------------------------------------- stockage par module
create or replace function public.storage_module(p_name text) returns text
language sql immutable set search_path = '' as $$
  select case (storage.foldername(p_name))[2]
    when 'plans-techniques' then 'plans'
    when 'depenses' then 'depenses'
    when 'achats' then 'achats'
    when 'suivi' then 'planning'
    else 'documents' end
$$;

-- ---------------------------------------------------------------- RLS
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.invoice_reminders enable row level security;
alter table public.expenses enable row level security;

create policy "factures lecture" on public.invoices for select to authenticated using (public.can(org_id, 'factures', 'consulter'));
create policy "factures création" on public.invoices for insert to authenticated with check (public.can(org_id, 'factures', 'creer'));
create policy "factures modification" on public.invoices for update to authenticated using (public.can(org_id, 'factures', 'modifier')) with check (public.can(org_id, 'factures', 'modifier'));
-- Seul un brouillon se supprime ; une facture émise est conservée (suite de numéros).
create policy "factures suppression" on public.invoices for delete to authenticated using (status = 'brouillon' and public.can(org_id, 'factures', 'supprimer'));

create policy "paiements lecture" on public.payments for select to authenticated using (public.can(org_id, 'factures', 'consulter'));
create policy "paiements création" on public.payments for insert to authenticated with check (public.can(org_id, 'factures', 'creer'));
create policy "paiements suppression" on public.payments for delete to authenticated using (public.can(org_id, 'factures', 'supprimer'));

create policy "relances lecture" on public.invoice_reminders for select to authenticated using (public.can(org_id, 'factures', 'consulter'));
create policy "relances création" on public.invoice_reminders for insert to authenticated with check (public.can(org_id, 'factures', 'creer'));

create policy "dépenses lecture" on public.expenses for select to authenticated using (public.can(org_id, 'depenses', 'consulter'));
create policy "dépenses création" on public.expenses for insert to authenticated with check (public.can(org_id, 'depenses', 'creer'));
create policy "dépenses modification" on public.expenses for update to authenticated using (public.can(org_id, 'depenses', 'modifier')) with check (public.can(org_id, 'depenses', 'modifier'));
create policy "dépenses suppression" on public.expenses for delete to authenticated using (public.can(org_id, 'depenses', 'supprimer'));

revoke update on public.invoices from authenticated;
grant update (project_id, client_id, title, issue_date, due_date, body, settings, payment_terms, notes) on public.invoices to authenticated;
revoke update on public.payments, public.invoice_reminders from authenticated;
revoke update on public.expenses from authenticated;
grant update (project_id, lot, supplier_id, category, label, expense_date, amount_ht, tax_amount, status, paid_on, payment_method, supplier_invoice_ref, receipt_path, note) on public.expenses to authenticated;
grant update (budget) on public.project_lots to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon;
revoke execute on function public.next_number(uuid, text, text) from authenticated;
revoke execute on function public.finish_plan_render(uuid, boolean, text, text, text, text) from authenticated;
revoke execute on function public.expire_stale_renders(uuid) from authenticated;
