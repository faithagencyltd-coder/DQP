-- PLANORA BTP — 6. Fonctions IA activables par la plateforme (§22.5 « possibilité de désactiver
-- certaines fonctions »). Chaque fonction IA est désactivée par défaut : l'administration de
-- PLANORA BTP décide de l'ouvrir, pour toutes les entreprises.

create table public.platform_features (
  key text primary key,
  label text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.platform_features (key, label, enabled) values
  ('rendu_plan_ia', 'Rendu des plans par IA', false),
  ('assistant_ia', 'Assistant IA PLANORA', false),
  ('lecture_plan_ia', 'Lecture assistée des plans par IA (OCR, cotes)', false);

alter table public.platform_features enable row level security;
create policy "fonctions lisibles" on public.platform_features for select to authenticated using (true);
revoke insert, update, delete on public.platform_features from anon, authenticated;

create or replace function public.feature_enabled(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.platform_features where key = p_key), false)
$$;

create or replace function public.admin_set_feature(p_key text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Réservé à l''administration de PLANORA BTP'; end if;
  update public.platform_features set enabled = p_enabled, updated_at = now(), updated_by = auth.jwt() ->> 'email' where key = p_key;
  if not found then raise exception 'Fonction inconnue'; end if;
end $$;

-- La demande de rendu IA vérifie désormais que la fonction est ouverte par la plateforme.
create or replace function public.check_ai_feature() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.feature_enabled('rendu_plan_ia') then
    raise exception 'Le rendu des plans par IA est désactivé par l''administration de PLANORA BTP.';
  end if;
  return new;
end $$;
create trigger plan_renders_feature before insert on public.plan_renders for each row execute function public.check_ai_feature();

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon;
revoke execute on function public.next_number(uuid, text, text) from authenticated;
revoke execute on function public.finish_plan_render(uuid, boolean, text, text, text, text) from authenticated;
revoke execute on function public.expire_stale_renders(uuid) from authenticated;
