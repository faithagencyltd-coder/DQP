-- PLANORA BTP — 11. Bibliothèque des travaux construite à partir des DQE de l'entreprise (§D).
-- Chaque ouvrage garde son corps d'état, sa place dans le DQE d'origine, sa méthode de métré,
-- sa source exacte (fichier, feuille, cellule) et un statut de validation : un ouvrage importé
-- reste « à vérifier » tant qu'une personne habilitée ne l'a pas validé.

alter table public.price_items
  add column trade text,                                   -- corps d'état (ex. « MACONNERIE - BETON »)
  add column section text,                                 -- place dans le DQE (ex. « Bâtiment principal › F - Élévation »)
  add column metre_method text,                            -- méthode de métré (texte libre ou formule nommée)
  add column formula text,                                 -- formule paramétrable (ex. « L × l », variables L, l, H, N)
  add column observations text,
  add column validation_status text not null default 'valide' check (validation_status in ('a_verifier', 'valide', 'rejete')),
  add column validated_by uuid references auth.users (id) on delete set null,
  add column validated_at timestamptz,
  add column source_ref jsonb check (source_ref is null or jsonb_typeof(source_ref) = 'object'),
  add column import_id uuid;
create index price_items_trade_idx on public.price_items (org_id, trade);
-- Colonnes modifiables par les utilisateurs (la source et l'import restent figés).
grant update (trade, section, metre_method, formula, observations, validation_status) on public.price_items to authenticated;

-- Journal des imports de bibliothèque : fichier, statistiques et anomalies relevées.
create table public.library_imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  file_name text not null,
  stats jsonb not null default '{}'::jsonb,
  alerts jsonb not null default '[]'::jsonb check (jsonb_typeof(alerts) = 'array'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index library_imports_idx on public.library_imports (org_id, created_at desc);
alter table public.price_items add constraint price_items_import_fk foreign key (import_id) references public.library_imports (id) on delete set null;

-- La validation est tracée (qui, quand) et réservée au droit « valider » sur les prix.
create or replace function public.price_items_validation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.validation_status = 'valide' and new.import_id is null then
      new.validated_by := auth.uid(); new.validated_at := now();
    elsif new.validation_status <> 'valide' then
      new.validated_by := null; new.validated_at := null;
    end if;
    return new;
  end if;
  if new.validation_status is distinct from old.validation_status then
    if not public.can(new.org_id, 'prix', 'valider') then raise exception 'Droit « valider » sur la bibliothèque requis'; end if;
    new.validated_by := case when new.validation_status = 'valide' then auth.uid() end;
    new.validated_at := case when new.validation_status = 'valide' then now() end;
  else
    new.validated_by := old.validated_by; new.validated_at := old.validated_at;
  end if;
  new.source_ref := old.source_ref; new.import_id := old.import_id;
  return new;
end $$;
create trigger price_items_validation before insert or update on public.price_items for each row execute function public.price_items_validation();

alter table public.library_imports enable row level security;
create policy "imports bibliothèque lecture" on public.library_imports for select to authenticated using (public.can(org_id, 'prix', 'consulter'));
create policy "imports bibliothèque création" on public.library_imports for insert to authenticated with check (public.can(org_id, 'prix', 'creer'));
revoke update, delete on public.library_imports from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon;
revoke execute on function public.next_number(uuid, text, text) from authenticated;
revoke execute on function public.finish_plan_render(uuid, boolean, text, text, text, text) from authenticated;
revoke execute on function public.expire_stale_renders(uuid) from authenticated;
revoke execute on function public.notify_members(uuid, text, text, text, text, text, text, uuid) from authenticated;
revoke execute on function public.notify_user(uuid, uuid, text, text, text, text, text) from authenticated;
