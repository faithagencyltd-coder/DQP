-- PLANORA BTP — 9. Planning, suivi journalier, réserves et avancement (§19).
-- Une tâche appartient à un chantier ; ses dépendances restent dans le même chantier, sans boucle.
-- « Validé » est réservé au droit « valider » du planning et ne s'atteint que depuis « Terminé ».
-- Un rapport journalier validé et une réserve validée sont figés.
-- L'avancement d'un chantier est calculé par le moteur (src/engine/planning.ts) selon une méthode
-- choisie et affichée : tâches terminées, quantités exécutées ou pondération.

alter table public.projects
  add column progress_method text not null default 'taches' check (progress_method in ('taches', 'quantites', 'ponderation'));
grant update (progress_method) on public.projects to authenticated;

-- ---------------------------------------------------------------- tâches
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  lot text,
  assignee_id uuid references auth.users (id) on delete set null,
  assignee_label text check (assignee_label is null or length(assignee_label) <= 120),
  start_date date not null,
  end_date date not null,
  status text not null default 'a_faire' check (status in ('a_faire', 'en_cours', 'en_attente', 'bloque', 'termine', 'valide')),
  priority text not null default 'normale' check (priority in ('basse', 'normale', 'haute', 'urgente')),
  depends_on uuid[] not null default '{}',
  planned_qty numeric(16, 3) check (planned_qty is null or planned_qty > 0),
  done_qty numeric(16, 3) check (done_qty is null or done_qty >= 0),
  unit text,
  weight numeric(10, 2) check (weight is null or weight > 0),
  progress_pct numeric(5, 2) check (progress_pct is null or progress_pct between 0 and 100),
  observations text,
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index tasks_project_idx on public.tasks (org_id, project_id, start_date);

create or replace function public.tasks_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_bad integer; v_cycle boolean;
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.org_id = new.org_id) then raise exception 'Chantier inconnu'; end if;
  if tg_op = 'UPDATE' and (new.org_id <> old.org_id or new.project_id <> old.project_id) then raise exception 'Une tâche ne change pas de chantier'; end if;
  if new.assignee_id is not null and not exists (select 1 from public.members m where m.org_id = new.org_id and m.user_id = new.assignee_id) then
    raise exception 'Le responsable doit être membre de l’entreprise';
  end if;
  new.depends_on := coalesce((select array_agg(distinct d) from unnest(new.depends_on) d), '{}');
  if new.id = any(new.depends_on) then raise exception 'Une tâche ne peut pas dépendre d’elle-même'; end if;
  select count(*) into v_bad from unnest(new.depends_on) d
  where not exists (select 1 from public.tasks t where t.id = d and t.project_id = new.project_id);
  if v_bad > 0 then raise exception 'Dépendance inconnue ou d’un autre chantier'; end if;
  if tg_op = 'UPDATE' and cardinality(new.depends_on) > 0 then
    with recursive walk(id) as (
      select unnest(new.depends_on)
      union
      select unnest(t.depends_on) from public.tasks t join walk w on t.id = w.id where t.id <> new.id
    ) select exists (select 1 from walk where id = new.id) into v_cycle;
    if v_cycle then raise exception 'Dépendances en boucle'; end if;
  end if;
  -- Statut « Validé » : droit « valider », depuis « Terminé » uniquement ; le quitter demande le même droit.
  if tg_op = 'INSERT' then
    if new.status = 'valide' then raise exception 'Une tâche se valide une fois terminée'; end if;
    new.validated_by := null; new.validated_at := null; new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
    if new.status = 'valide' and old.status <> 'valide' then
      if not public.can(new.org_id, 'planning', 'valider') then raise exception 'Droit « valider » sur le planning requis'; end if;
      if old.status <> 'termine' then raise exception 'Une tâche se valide une fois terminée'; end if;
      new.validated_by := auth.uid(); new.validated_at := now();
    elsif old.status = 'valide' and new.status <> 'valide' then
      if not public.can(new.org_id, 'planning', 'valider') then raise exception 'Droit « valider » sur le planning requis'; end if;
      new.validated_by := null; new.validated_at := null;
    else
      new.validated_by := old.validated_by; new.validated_at := old.validated_at;
    end if;
  end if;
  return new;
end $$;
create trigger tasks_before before insert or update on public.tasks for each row execute function public.tasks_before();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger tasks_audit after insert or delete or update of status on public.tasks for each row execute function public.audit_row();

-- Une tâche supprimée disparaît des dépendances des autres.
create or replace function public.tasks_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set depends_on = array_remove(depends_on, old.id) where project_id = old.project_id and old.id = any(depends_on);
  return old;
end $$;
create trigger tasks_after_delete after delete on public.tasks for each row execute function public.tasks_after_delete();

-- ---------------------------------------------------------------- rapports journaliers
create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  reference text not null default '',
  report_date date not null default current_date,
  weather text,
  conditions text,
  work_done text,
  workforce jsonb not null default '[]'::jsonb check (jsonb_typeof(workforce) = 'array'),
  materials text,
  equipment text,
  incidents text,
  delays text,
  observations text,
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  status text not null default 'brouillon' check (status in ('brouillon', 'soumis', 'valide')),
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  validation_note text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, report_date)
);
create index daily_reports_idx on public.daily_reports (org_id, project_id, report_date desc);

-- Effectifs : [{ "role": "Maçons", "count": 4 }] ; photos : [{ "path": "<org>/suivi/…", "caption": "…" }].
create or replace function public.check_photos(p_org uuid, p_photos jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare p jsonb;
begin
  if jsonb_array_length(p_photos) > 30 then raise exception '30 photos au plus'; end if;
  for p in select * from jsonb_array_elements(p_photos) loop
    if coalesce(p ->> 'path', '') not like p_org::text || '/suivi/%' then raise exception 'Photo hors du dossier de suivi de l’entreprise'; end if;
  end loop;
end $$;

create or replace function public.daily_reports_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w jsonb;
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.org_id = new.org_id) then raise exception 'Chantier inconnu'; end if;
  for w in select * from jsonb_array_elements(new.workforce) loop
    if coalesce(w ->> 'role', '') = '' or (w ->> 'count') is null or (w ->> 'count')::numeric < 0 or (w ->> 'count')::numeric <> trunc((w ->> 'count')::numeric) then
      raise exception 'Effectif invalide (fonction et nombre entier positif attendus)';
    end if;
  end loop;
  perform public.check_photos(new.org_id, new.photos);
  if tg_op = 'INSERT' then
    if coalesce(new.reference, '') = '' then new.reference := public.next_number(new.org_id, 'rapport_journalier', 'RJ'); end if;
    new.status := 'brouillon'; new.submitted_by := null; new.submitted_at := null; new.validated_by := null; new.validated_at := null; new.validation_note := null;
    new.created_by := auth.uid();
  else
    if new.org_id <> old.org_id or new.project_id <> old.project_id or new.reference <> old.reference then raise exception 'Modification interdite'; end if;
    new.created_by := old.created_by;
    if coalesce(current_setting('planora.server_change', true), '') <> 'on' then
      new.status := old.status; new.submitted_by := old.submitted_by; new.submitted_at := old.submitted_at;
      new.validated_by := old.validated_by; new.validated_at := old.validated_at; new.validation_note := old.validation_note;
      if old.status = 'valide' then raise exception 'Rapport validé : il ne se modifie plus'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger daily_reports_before before insert or update on public.daily_reports for each row execute function public.daily_reports_before();
create trigger daily_reports_touch before update on public.daily_reports for each row execute function public.touch_updated_at();
create trigger daily_reports_audit after insert or delete or update of status on public.daily_reports for each row execute function public.audit_row();

-- Soumission (droit « créer ») puis validation ou renvoi en brouillon (droit « valider »).
create or replace function public.set_report_status(p_report uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.daily_reports;
begin
  select * into r from public.daily_reports where id = p_report;
  if r.id is null or not public.can(r.org_id, 'planning', 'consulter') then raise exception 'Rapport introuvable'; end if;
  if p_status = 'soumis' then
    if not public.can(r.org_id, 'planning', 'creer') then raise exception 'Droit « créer » sur le planning requis'; end if;
    if r.status <> 'brouillon' then raise exception 'Seul un brouillon se soumet'; end if;
  elsif p_status = 'valide' then
    if not public.can(r.org_id, 'planning', 'valider') then raise exception 'Droit « valider » sur le planning requis'; end if;
    if r.status <> 'soumis' then raise exception 'Seul un rapport soumis se valide'; end if;
  elsif p_status = 'brouillon' then
    if not public.can(r.org_id, 'planning', 'valider') then raise exception 'Droit « valider » sur le planning requis'; end if;
    if r.status <> 'soumis' then raise exception 'Seul un rapport soumis se renvoie'; end if;
  else
    raise exception 'Statut inconnu';
  end if;
  perform set_config('planora.server_change', 'on', true);
  update public.daily_reports set status = p_status,
    submitted_by = case when p_status = 'soumis' then auth.uid() else submitted_by end,
    submitted_at = case when p_status = 'soumis' then now() else submitted_at end,
    validated_by = case when p_status = 'valide' then auth.uid() else null end,
    validated_at = case when p_status = 'valide' then now() else null end,
    validation_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = r.id;
  perform set_config('planora.server_change', 'off', true);
end $$;

-- ---------------------------------------------------------------- réserves
create table public.reserves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  reference text not null default '',
  title text not null check (length(btrim(title)) between 1 and 200),
  description text,
  location text,
  lot text,
  assignee_label text,
  due_date date,
  status text not null default 'ouverte' check (status in ('ouverte', 'en_cours', 'levee', 'validee')),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  raised_on date not null default current_date,
  lifted_on date,
  lift_note text,
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reserves_idx on public.reserves (org_id, project_id, status);

create or replace function public.reserves_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.org_id = new.org_id) then raise exception 'Chantier inconnu'; end if;
  perform public.check_photos(new.org_id, new.photos);
  if tg_op = 'INSERT' then
    if coalesce(new.reference, '') = '' then new.reference := public.next_number(new.org_id, 'reserve', 'RES'); end if;
    if new.status in ('levee', 'validee') then new.status := 'ouverte'; end if;
    new.lifted_on := null; new.validated_by := null; new.validated_at := null; new.created_by := auth.uid();
  else
    if new.org_id <> old.org_id or new.project_id <> old.project_id or new.reference <> old.reference then raise exception 'Modification interdite'; end if;
    new.created_by := old.created_by;
    if old.status = 'validee' then
      if new.status = 'validee' then raise exception 'Réserve levée et validée : elle ne se modifie plus'; end if;
      if not public.can(new.org_id, 'planning', 'valider') then raise exception 'Droit « valider » sur le planning requis'; end if;
    end if;
    if new.status = 'validee' and old.status <> 'validee' then
      if not public.can(new.org_id, 'planning', 'valider') then raise exception 'Droit « valider » sur le planning requis'; end if;
      if old.status <> 'levee' then raise exception 'Une réserve se valide une fois levée'; end if;
      new.validated_by := auth.uid(); new.validated_at := now();
    elsif new.status <> 'validee' then
      new.validated_by := null; new.validated_at := null;
    end if;
    if new.status = 'levee' and old.status <> 'levee' then new.lifted_on := coalesce(new.lifted_on, current_date); end if;
    if new.status in ('ouverte', 'en_cours') then new.lifted_on := null; end if;
  end if;
  return new;
end $$;
create trigger reserves_before before insert or update on public.reserves for each row execute function public.reserves_before();
create trigger reserves_touch before update on public.reserves for each row execute function public.touch_updated_at();
create trigger reserves_audit after insert or delete or update of status on public.reserves for each row execute function public.audit_row();

-- ---------------------------------------------------------------- stockage
-- Photos de suivi : « <entreprise>/suivi/… » (module Planning, migration 7). Leur auteur peut les
-- retirer d'un brouillon avec le seul droit « modifier ».
create policy "photos de suivi retrait par l'auteur" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.storage_module(name) = 'planning' and owner = auth.uid()
         and public.can(public.storage_org(name), 'planning', 'modifier'));

-- ---------------------------------------------------------------- RLS
alter table public.tasks enable row level security;
alter table public.daily_reports enable row level security;
alter table public.reserves enable row level security;

create policy "tâches lecture" on public.tasks for select to authenticated using (public.can(org_id, 'planning', 'consulter'));
create policy "tâches création" on public.tasks for insert to authenticated with check (public.can(org_id, 'planning', 'creer'));
create policy "tâches modification" on public.tasks for update to authenticated using (public.can(org_id, 'planning', 'modifier')) with check (public.can(org_id, 'planning', 'modifier'));
create policy "tâches suppression" on public.tasks for delete to authenticated using (status <> 'valide' and public.can(org_id, 'planning', 'supprimer'));

create policy "rapports journaliers lecture" on public.daily_reports for select to authenticated using (public.can(org_id, 'planning', 'consulter'));
create policy "rapports journaliers création" on public.daily_reports for insert to authenticated with check (public.can(org_id, 'planning', 'creer'));
create policy "rapports journaliers modification" on public.daily_reports for update to authenticated using (public.can(org_id, 'planning', 'modifier')) with check (public.can(org_id, 'planning', 'modifier'));
create policy "rapports journaliers suppression" on public.daily_reports for delete to authenticated
  using (status = 'brouillon' and (public.can(org_id, 'planning', 'supprimer') or (created_by = auth.uid() and public.can(org_id, 'planning', 'creer'))));

create policy "réserves lecture" on public.reserves for select to authenticated using (public.can(org_id, 'planning', 'consulter'));
create policy "réserves création" on public.reserves for insert to authenticated with check (public.can(org_id, 'planning', 'creer'));
create policy "réserves modification" on public.reserves for update to authenticated using (public.can(org_id, 'planning', 'modifier')) with check (public.can(org_id, 'planning', 'modifier'));
create policy "réserves suppression" on public.reserves for delete to authenticated using (status = 'ouverte' and public.can(org_id, 'planning', 'supprimer'));

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon;
revoke execute on function public.next_number(uuid, text, text) from authenticated;
revoke execute on function public.finish_plan_render(uuid, boolean, text, text, text, text) from authenticated;
revoke execute on function public.expire_stale_renders(uuid) from authenticated;
