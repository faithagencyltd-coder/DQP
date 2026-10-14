-- PLANORA BTP — 8. Achats, commandes fournisseurs, réceptions et stocks (§18).
-- Le stock d'un article dans un dépôt = somme de ses mouvements (jamais saisi directement).
-- Chaque mouvement est tracé (qui, quand, pourquoi) ; aucun stock ne devient négatif.
-- Une commande validée est figée ; les réceptions totales ou partielles alimentent le stock.

-- ---------------------------------------------------------------- dépôts
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  location text,
  project_id uuid references public.projects (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

-- Stock minimum par article et par dépôt (alerte de réapprovisionnement).
create table public.stock_thresholds (
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.price_items (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  min_qty numeric(16, 3) not null check (min_qty >= 0),
  primary key (item_id, warehouse_id)
);

-- ---------------------------------------------------------------- demandes d'achat
create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  reference text not null default '',
  project_id uuid references public.projects (id) on delete set null,
  lot text,
  item_id uuid references public.price_items (id) on delete set null,
  designation text not null check (length(btrim(designation)) between 1 and 300),
  qty numeric(16, 3) not null check (qty > 0),
  unit text not null,
  needed_by date,
  supplier_id uuid references public.contacts (id) on delete set null,
  justification text,
  status text not null default 'soumise' check (status in ('soumise', 'approuvee', 'refusee', 'commandee')),
  decision_note text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  order_id uuid,
  requested_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, reference)
);

-- ---------------------------------------------------------------- commandes fournisseurs
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  reference text not null default '',
  supplier_id uuid references public.contacts (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  warehouse_id uuid references public.warehouses (id) on delete set null,
  status text not null default 'brouillon' check (status in ('brouillon', 'validee', 'envoyee', 'partielle', 'recue', 'annulee')),
  order_date date not null default current_date,
  expected_date date,
  -- Lignes : [{id, item_id?, designation, unit, qty, unit_price, received_qty}]
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  currency text not null default 'XOF',
  total_ht numeric(18, 2) not null default 0,
  notes text,
  -- Rapprochement avec la facture du fournisseur (§18.2).
  supplier_invoice_ref text,
  supplier_invoice_amount numeric(18, 2) check (supplier_invoice_amount is null or supplier_invoice_amount >= 0),
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference)
);
alter table public.purchase_requests add constraint purchase_requests_order_fk foreign key (order_id) references public.purchase_orders (id) on delete set null;
alter table public.expenses add constraint expenses_order_fk foreign key (purchase_order_id) references public.purchase_orders (id) on delete set null;

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.purchase_orders (id) on delete restrict,
  received_on date not null default current_date,
  warehouse_id uuid references public.warehouses (id) on delete set null,
  -- [{line_id, qty}]
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  note text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- mouvements de stock
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.price_items (id) on delete restrict,
  warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  kind text not null check (kind in ('entree', 'sortie', 'transfert', 'inventaire', 'ajustement', 'reception')),
  -- Quantité signée dans l'unité de l'article (+ entrée, − sortie).
  qty numeric(16, 3) not null check (qty <> 0),
  unit_cost numeric(16, 2) check (unit_cost is null or unit_cost >= 0),
  project_id uuid references public.projects (id) on delete set null,
  lot text,
  order_id uuid references public.purchase_orders (id) on delete set null,
  receipt_id uuid references public.purchase_receipts (id) on delete set null,
  transfer_group uuid,
  reason text,
  moved_on date not null default current_date,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind not in ('inventaire', 'ajustement') or length(btrim(coalesce(reason, ''))) > 0)
);
create index stock_movements_idx on public.stock_movements (org_id, item_id, warehouse_id);
create index stock_movements_date_idx on public.stock_movements (org_id, moved_on desc);

create or replace view public.stock_levels with (security_invoker = true) as
  select m.org_id, m.item_id, m.warehouse_id, sum(m.qty) as qty,
         (select t.min_qty from public.stock_thresholds t where t.item_id = m.item_id and t.warehouse_id = m.warehouse_id) as min_qty,
         max(m.moved_on) as last_move
  from public.stock_movements m
  group by m.org_id, m.item_id, m.warehouse_id;

-- ---------------------------------------------------------------- règles
create or replace function public.purchase_requests_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not public.can(new.org_id, 'achats', 'creer') then return new; end if;
    if coalesce(new.reference, '') = '' then new.reference := public.next_number(new.org_id, 'demande_achat', 'DA'); end if;
    new.status := 'soumise'; new.decided_by := null; new.decided_at := null; new.order_id := null;
    new.requested_by := auth.uid();
  else
    if new.org_id <> old.org_id or new.reference <> old.reference then raise exception 'Modification interdite'; end if;
    if coalesce(current_setting('planora.server_change', true), '') <> 'on' then
      new.status := old.status; new.decided_by := old.decided_by; new.decided_at := old.decided_at; new.order_id := old.order_id;
      if old.status <> 'soumise' and (new.qty <> old.qty or new.designation <> old.designation or new.item_id is distinct from old.item_id) then
        raise exception 'Demande déjà traitée : elle ne se modifie plus';
      end if;
    end if;
    new.requested_by := old.requested_by;
  end if;
  return new;
end $$;
create trigger purchase_requests_before before insert or update on public.purchase_requests for each row execute function public.purchase_requests_before();

-- Approbation ou refus : droit « valider » sur les achats.
create or replace function public.decide_purchase_request(p_request uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.purchase_requests;
begin
  select * into r from public.purchase_requests where id = p_request for update;
  if r.id is null or not public.can(r.org_id, 'achats', 'valider') then raise exception 'Droit « valider » sur les achats requis'; end if;
  if r.status <> 'soumise' then raise exception 'Demande déjà traitée'; end if;
  perform set_config('planora.server_change', 'on', true);
  update public.purchase_requests set status = case when p_approve then 'approuvee' else 'refusee' end, decision_note = p_note,
    decided_by = auth.uid(), decided_at = now() where id = r.id;
  perform set_config('planora.server_change', 'off', true);
  insert into public.activity_log (org_id, project_id, user_id, action, entity, entity_id, label)
  values (r.org_id, r.project_id, auth.uid(), case when p_approve then 'demande d''achat approuvée' else 'demande d''achat refusée' end, 'purchase_requests', r.id::text, left(r.reference || ' — ' || r.designation, 300));
end $$;

-- Total HT d'une commande recalculé par la base : Σ arrondi(qté × PU).
create or replace function public.order_total(p_lines jsonb, p_cur text) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce(sum(public.money_round(coalesce((l ->> 'qty')::numeric, 0) * coalesce((l ->> 'unit_price')::numeric, 0), p_cur)), 0)
  from jsonb_array_elements(p_lines) l
$$;

create or replace function public.purchase_orders_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare server boolean := coalesce(current_setting('planora.server_change', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not public.can(new.org_id, 'achats', 'creer') then return new; end if;
    if coalesce(new.reference, '') = '' then new.reference := public.next_number(new.org_id, 'commande', 'BC'); end if;
    new.status := 'brouillon'; new.validated_by := null; new.validated_at := null;
    -- Quantités reçues : toujours 0 à la création.
    new.lines := coalesce((select jsonb_agg(l || '{"received_qty":0}'::jsonb) from jsonb_array_elements(new.lines) l), '[]'::jsonb);
    new.created_by := auth.uid();
  else
    if new.org_id <> old.org_id or new.reference <> old.reference then raise exception 'Modification interdite'; end if;
    if not server then
      new.status := old.status; new.validated_by := old.validated_by; new.validated_at := old.validated_at;
      if old.status <> 'brouillon' and (new.lines <> old.lines or new.supplier_id is distinct from old.supplier_id or new.currency <> old.currency) then
        raise exception 'Commande % validée : lignes et fournisseur ne se modifient plus', old.reference;
      end if;
      if old.status = 'brouillon' then
        -- Le client ne peut pas déclarer de quantités reçues.
        new.lines := coalesce((select jsonb_agg(l || '{"received_qty":0}'::jsonb) from jsonb_array_elements(new.lines) l), '[]'::jsonb);
      end if;
    end if;
    new.created_by := old.created_by;
  end if;
  new.total_ht := public.order_total(new.lines, new.currency);
  return new;
end $$;
create trigger purchase_orders_before before insert or update on public.purchase_orders for each row execute function public.purchase_orders_before();
create trigger purchase_orders_touch before update on public.purchase_orders for each row execute function public.touch_updated_at();
create trigger purchase_orders_audit after insert or update or delete on public.purchase_orders for each row execute function public.audit_row();
create trigger purchase_requests_audit after insert or delete on public.purchase_requests for each row execute function public.audit_row();

-- Changement de statut contrôlé : validation (droit « valider »), envoi, annulation.
create or replace function public.set_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.purchase_orders;
begin
  select * into o from public.purchase_orders where id = p_order for update;
  if o.id is null or not public.can(o.org_id, 'achats', 'consulter') then raise exception 'Commande introuvable'; end if;
  if p_status = 'validee' then
    if not public.can(o.org_id, 'achats', 'valider') then raise exception 'Droit « valider » sur les achats requis'; end if;
    if o.status <> 'brouillon' then raise exception 'Seul un brouillon se valide'; end if;
    if o.supplier_id is null then raise exception 'Choisissez le fournisseur'; end if;
    if jsonb_array_length(o.lines) = 0 then raise exception 'Commande sans ligne'; end if;
    if exists (select 1 from jsonb_array_elements(o.lines) l where coalesce((l ->> 'qty')::numeric, 0) <= 0 or l ->> 'unit_price' is null) then
      raise exception 'Chaque ligne doit avoir une quantité et un prix unitaire';
    end if;
  elsif p_status = 'envoyee' then
    if not public.can(o.org_id, 'achats', 'modifier') or o.status <> 'validee' then raise exception 'Seule une commande validée peut être marquée envoyée'; end if;
  elsif p_status = 'annulee' then
    if not public.can(o.org_id, 'achats', 'valider') then raise exception 'Droit « valider » requis'; end if;
    if o.status in ('partielle', 'recue') then raise exception 'Commande déjà (partiellement) reçue : annulation impossible'; end if;
  else
    raise exception 'Statut non autorisé';
  end if;
  perform set_config('planora.server_change', 'on', true);
  update public.purchase_orders set status = p_status,
    validated_by = case when p_status = 'validee' then auth.uid() else validated_by end,
    validated_at = case when p_status = 'validee' then now() else validated_at end
  where id = o.id;
  perform set_config('planora.server_change', 'off', true);
end $$;

-- Réception (totale ou partielle) : met à jour les quantités reçues, le statut et le stock.
create or replace function public.receive_order(p_order uuid, p_lines jsonb, p_warehouse uuid, p_date date, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o public.purchase_orders; v_receipt uuid; l jsonb; r jsonb; v_lines jsonb; v_rest numeric; v_all boolean := true; v_any boolean := false;
begin
  select * into o from public.purchase_orders where id = p_order for update;
  if o.id is null or not public.can(o.org_id, 'achats', 'creer') then raise exception 'Droit « créer » sur les achats requis'; end if;
  if o.status not in ('validee', 'envoyee', 'partielle') then raise exception 'Commande non validée ou déjà soldée'; end if;
  if p_warehouse is not null and not exists (select 1 from public.warehouses w where w.id = p_warehouse and w.org_id = o.org_id) then raise exception 'Dépôt inconnu'; end if;
  v_lines := '[]'::jsonb;
  for l in select * from jsonb_array_elements(o.lines) loop
    r := (select x from jsonb_array_elements(p_lines) x where x ->> 'line_id' = l ->> 'id' limit 1);
    if r is not null and coalesce((r ->> 'qty')::numeric, 0) <> 0 then
      if (r ->> 'qty')::numeric < 0 then raise exception 'Quantité reçue négative'; end if;
      v_rest := (l ->> 'qty')::numeric - coalesce((l ->> 'received_qty')::numeric, 0);
      if (r ->> 'qty')::numeric > v_rest then raise exception 'Ligne « % » : % reçus pour un reste à recevoir de %', l ->> 'designation', r ->> 'qty', v_rest; end if;
      l := jsonb_set(l, '{received_qty}', to_jsonb(coalesce((l ->> 'received_qty')::numeric, 0) + (r ->> 'qty')::numeric));
      v_any := true;
    end if;
    if coalesce((l ->> 'received_qty')::numeric, 0) < (l ->> 'qty')::numeric then v_all := false; end if;
    v_lines := v_lines || l;
  end loop;
  if not v_any then raise exception 'Aucune quantité reçue'; end if;
  insert into public.purchase_receipts (org_id, order_id, received_on, warehouse_id, lines, note, created_by)
  values (o.org_id, o.id, coalesce(p_date, current_date), p_warehouse, p_lines, p_note, auth.uid()) returning id into v_receipt;
  -- Entrée en stock des articles de la bibliothèque, si un dépôt est choisi.
  if p_warehouse is not null then
    insert into public.stock_movements (org_id, item_id, warehouse_id, kind, qty, unit_cost, project_id, order_id, receipt_id, reason, moved_on, created_by)
    select o.org_id, (ol ->> 'item_id')::uuid, p_warehouse, 'reception', (x ->> 'qty')::numeric, (ol ->> 'unit_price')::numeric, o.project_id, o.id, v_receipt,
           'Réception ' || o.reference, coalesce(p_date, current_date), auth.uid()
    from jsonb_array_elements(p_lines) x join jsonb_array_elements(o.lines) ol on ol ->> 'id' = x ->> 'line_id'
    where coalesce((x ->> 'qty')::numeric, 0) > 0 and ol ->> 'item_id' is not null
      and exists (select 1 from public.price_items pi where pi.id = (ol ->> 'item_id')::uuid and pi.org_id = o.org_id);
  end if;
  perform set_config('planora.server_change', 'on', true);
  update public.purchase_orders set lines = v_lines, status = case when v_all then 'recue' else 'partielle' end where id = o.id;
  perform set_config('planora.server_change', 'off', true);
  insert into public.activity_log (org_id, project_id, user_id, action, entity, entity_id, label)
  values (o.org_id, o.project_id, auth.uid(), case when v_all then 'réception complète' else 'réception partielle' end, 'purchase_orders', o.id::text, o.reference);
  return v_receipt;
end $$;

-- Conversion de demandes approuvées en commande (même fournisseur).
create or replace function public.order_from_requests(p_requests uuid[], p_supplier uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid; v_project uuid;
begin
  select org_id, min(project_id::text)::uuid into v_org, v_project from public.purchase_requests where id = any(p_requests) group by org_id;
  if v_org is null or (select count(distinct org_id) from public.purchase_requests where id = any(p_requests)) <> 1 then raise exception 'Demandes introuvables'; end if;
  if not public.can(v_org, 'achats', 'creer') then raise exception 'Droit « créer » sur les achats requis'; end if;
  if exists (select 1 from public.purchase_requests where id = any(p_requests) and status <> 'approuvee') then raise exception 'Seules des demandes approuvées peuvent être commandées'; end if;
  insert into public.purchase_orders (org_id, supplier_id, project_id, lines, currency)
  select v_org, p_supplier, v_project,
         jsonb_agg(jsonb_build_object('id', 'l' || substr(r.id::text, 1, 8), 'item_id', r.item_id, 'designation', r.designation, 'unit', r.unit, 'qty', r.qty,
           'unit_price', (select pi.purchase_price from public.price_items pi where pi.id = r.item_id), 'request_id', r.id)),
         (select currency from public.organizations where id = v_org)
  from public.purchase_requests r where r.id = any(p_requests)
  returning id into v_id;
  perform set_config('planora.server_change', 'on', true);
  update public.purchase_requests set status = 'commandee', order_id = v_id where id = any(p_requests);
  perform set_config('planora.server_change', 'off', true);
  return v_id;
end $$;

-- Mouvements : pas de stock négatif ; un transfert = une sortie + une entrée liées.
create or replace function public.stock_movements_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_qty numeric;
begin
  if not exists (select 1 from public.price_items i where i.id = new.item_id and i.org_id = new.org_id) then raise exception 'Article inconnu'; end if;
  if not exists (select 1 from public.warehouses w where w.id = new.warehouse_id and w.org_id = new.org_id) then raise exception 'Dépôt inconnu'; end if;
  if new.kind = 'sortie' and new.qty > 0 then new.qty := -new.qty; end if;
  perform pg_advisory_xact_lock(hashtext('stock:' || new.item_id::text || new.warehouse_id::text));
  if new.qty < 0 then
    select coalesce(sum(qty), 0) into v_qty from public.stock_movements where item_id = new.item_id and warehouse_id = new.warehouse_id;
    if v_qty + new.qty < 0 then raise exception 'Stock insuffisant : % disponible(s), % demandé(s)', replace(trim_scale(v_qty)::text, '.', ','), replace(trim_scale(-new.qty)::text, '.', ','); end if;
  end if;
  if new.kind in ('entree', 'reception') and new.qty < 0 then raise exception 'Une entrée est positive'; end if;
  new.created_by := auth.uid();
  return new;
end $$;
create trigger stock_movements_before before insert on public.stock_movements for each row execute function public.stock_movements_before();

create or replace function public.transfer_stock(p_item uuid, p_from uuid, p_to uuid, p_qty numeric, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; g uuid := gen_random_uuid();
begin
  select org_id into v_org from public.warehouses where id = p_from;
  if v_org is null or not public.can(v_org, 'stocks', 'creer') then raise exception 'Droit « créer » sur les stocks requis'; end if;
  if p_from = p_to then raise exception 'Dépôts identiques'; end if;
  if p_qty <= 0 then raise exception 'Quantité positive attendue'; end if;
  insert into public.stock_movements (org_id, item_id, warehouse_id, kind, qty, transfer_group, reason, created_by) values (v_org, p_item, p_from, 'transfert', -p_qty, g, p_reason, auth.uid());
  insert into public.stock_movements (org_id, item_id, warehouse_id, kind, qty, transfer_group, reason, created_by) values (v_org, p_item, p_to, 'transfert', p_qty, g, p_reason, auth.uid());
end $$;

-- Inventaire : la quantité comptée remplace le stock calculé ; l'écart est tracé avec son motif.
create or replace function public.count_stock(p_item uuid, p_warehouse uuid, p_counted numeric, p_reason text) returns numeric
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_qty numeric; v_diff numeric;
begin
  select org_id into v_org from public.warehouses where id = p_warehouse;
  if v_org is null or not public.can(v_org, 'stocks', 'modifier') then raise exception 'Droit « modifier » sur les stocks requis'; end if;
  if p_counted < 0 then raise exception 'Quantité comptée négative'; end if;
  select coalesce(sum(qty), 0) into v_qty from public.stock_movements where item_id = p_item and warehouse_id = p_warehouse;
  v_diff := p_counted - v_qty;
  if v_diff <> 0 then
    insert into public.stock_movements (org_id, item_id, warehouse_id, kind, qty, reason, created_by) values (v_org, p_item, p_warehouse, 'inventaire', v_diff, coalesce(nullif(btrim(p_reason), ''), 'Inventaire'), auth.uid());
  end if;
  return v_diff;
end $$;

-- ---------------------------------------------------------------- stockage
-- Bons de commande signés, bons de livraison : « <entreprise>/achats/… » (module Achats, migration 7).

-- ---------------------------------------------------------------- RLS
alter table public.warehouses enable row level security;
alter table public.stock_thresholds enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.stock_movements enable row level security;

create policy "dépôts lecture" on public.warehouses for select to authenticated using (public.can(org_id, 'stocks', 'consulter') or public.can(org_id, 'achats', 'consulter'));
create policy "dépôts écriture" on public.warehouses for all to authenticated using (public.can(org_id, 'stocks', 'administrer') or public.can(org_id, 'stocks', 'creer')) with check (public.can(org_id, 'stocks', 'creer'));
create policy "seuils lecture" on public.stock_thresholds for select to authenticated using (public.can(org_id, 'stocks', 'consulter'));
create policy "seuils écriture" on public.stock_thresholds for all to authenticated using (public.can(org_id, 'stocks', 'modifier')) with check (public.can(org_id, 'stocks', 'modifier'));

create policy "demandes d'achat lecture" on public.purchase_requests for select to authenticated using (public.can(org_id, 'achats', 'consulter'));
create policy "demandes d'achat création" on public.purchase_requests for insert to authenticated with check (public.can(org_id, 'achats', 'creer'));
create policy "demandes d'achat modification" on public.purchase_requests for update to authenticated using (public.can(org_id, 'achats', 'modifier')) with check (public.can(org_id, 'achats', 'modifier'));
create policy "demandes d'achat suppression" on public.purchase_requests for delete to authenticated using (status = 'soumise' and public.can(org_id, 'achats', 'supprimer'));

create policy "commandes lecture" on public.purchase_orders for select to authenticated using (public.can(org_id, 'achats', 'consulter'));
create policy "commandes création" on public.purchase_orders for insert to authenticated with check (public.can(org_id, 'achats', 'creer'));
create policy "commandes modification" on public.purchase_orders for update to authenticated using (public.can(org_id, 'achats', 'modifier')) with check (public.can(org_id, 'achats', 'modifier'));
create policy "commandes suppression" on public.purchase_orders for delete to authenticated using (status = 'brouillon' and public.can(org_id, 'achats', 'supprimer'));

create policy "réceptions lecture" on public.purchase_receipts for select to authenticated using (public.can(org_id, 'achats', 'consulter'));

create policy "mouvements lecture" on public.stock_movements for select to authenticated using (public.can(org_id, 'stocks', 'consulter'));
create policy "mouvements création" on public.stock_movements for insert to authenticated
  with check (public.can(org_id, 'stocks', case when kind in ('inventaire', 'ajustement') then 'modifier' else 'creer' end) and kind in ('entree', 'sortie', 'ajustement'));

revoke update, delete on public.stock_movements from authenticated;
revoke insert, update, delete on public.purchase_receipts from authenticated;
revoke update on public.purchase_requests from authenticated;
grant update (project_id, lot, item_id, designation, qty, unit, needed_by, supplier_id, justification) on public.purchase_requests to authenticated;
revoke update on public.purchase_orders from authenticated;
grant update (supplier_id, project_id, warehouse_id, order_date, expected_date, lines, currency, notes, supplier_invoice_ref, supplier_invoice_amount) on public.purchase_orders to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon;
revoke execute on function public.next_number(uuid, text, text) from authenticated;
revoke execute on function public.finish_plan_render(uuid, boolean, text, text, text, text) from authenticated;
revoke execute on function public.expire_stale_renders(uuid) from authenticated;
