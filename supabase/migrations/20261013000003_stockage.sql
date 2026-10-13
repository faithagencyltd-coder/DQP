-- PLANORA BTP — 3. Stockage privé des fichiers (§20, §27.3).
-- Un seul compartiment privé ; chaque fichier est rangé sous « <id entreprise>/… ».
-- Aucun accès public : les fichiers se téléchargent par des liens signés temporaires.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
  'image/vnd.dxf', 'application/dxf', 'application/octet-stream', 'text/plain'
])
on conflict (id) do nothing;

create or replace function public.storage_org(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return ((storage.foldername(p_name))[1])::uuid;
exception when others then
  return null;
end $$;

create policy "fichiers lecture" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can(public.storage_org(name), 'documents', 'consulter'));

create policy "fichiers dépôt" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.can(public.storage_org(name), 'documents', 'creer')
    and public.org_storage_bytes(public.storage_org(name)) <
        (select sp.max_storage_mb::bigint * 1048576 from public.organizations o join public.subscription_plans sp on sp.id = o.plan_id
         where o.id = public.storage_org(objects.name))
  );

create policy "fichiers suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can(public.storage_org(name), 'documents', 'supprimer'));

revoke execute on function public.storage_org(text) from public, anon;
grant execute on function public.storage_org(text) to authenticated, service_role;
