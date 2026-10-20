-- PLANORA BTP — 13. Un document chiffré ne peut pas être validé (verrouillé) tant qu'il reprend
-- un prix de la bibliothèque encore « à vérifier » : l'ouvrage doit d'abord être validé par une
-- personne habilitée, ou le prix ressaisi (il devient alors un prix saisi, sous la responsabilité
-- de celui qui valide). Le statut lu est celui de la bibliothèque au moment de la validation.

create or replace function public.lock_quote(p_quote uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quotes; v_module text; v_codes text; v_n int;
begin
  select * into q from public.quotes where id = p_quote for update;
  if q.id is null then raise exception 'Document introuvable'; end if;
  v_module := case q.kind when 'devis' then 'devis' else 'dqe' end;
  if not public.can(q.org_id, v_module, 'valider') then raise exception 'Droit « valider » requis'; end if;
  select count(distinct pi.id), string_agg(distinct coalesce(nullif(pi.code, ''), pi.designation), ', ')
    into v_n, v_codes
  from jsonb_array_elements(coalesce(q.body -> 'lots', '[]'::jsonb)) lot
  cross join lateral jsonb_array_elements(coalesce(lot -> 'lines', '[]'::jsonb)) ln
  join public.price_items pi on pi.id::text = ln -> 'priceSource' ->> 'id' and pi.org_id = q.org_id
  where coalesce(ln ->> 'kind', 'ouvrage') = 'ouvrage'
    and ln -> 'priceSource' ->> 'kind' in ('bibliotheque', 'deboursé')
    and pi.validation_status = 'a_verifier';
  if v_n > 0 then
    raise exception 'Validation impossible : % prix de la bibliothèque encore « à vérifier » (%). Validez ces ouvrages dans la bibliothèque ou ressaisissez leur prix.', v_n, v_codes;
  end if;
  insert into public.quote_versions (org_id, quote_id, version, title, status, body, settings, total_ht, total_ttc, reason)
  values (q.org_id, q.id, q.version, q.title, q.status, q.body, q.settings, q.total_ht, q.total_ttc, 'Version validée et verrouillée')
  on conflict (quote_id, version) do update set body = excluded.body, settings = excluded.settings, total_ht = excluded.total_ht, total_ttc = excluded.total_ttc, reason = excluded.reason;
  update public.quotes set locked = true, validated_by = auth.uid(), validated_at = now(),
    status = case when q.kind = 'devis' then (case when q.status in ('brouillon', 'en_validation') then 'en_validation' else q.status end) else 'approuve' end
  where id = q.id;
end $$;

revoke execute on function public.lock_quote(uuid) from public, anon;
grant execute on function public.lock_quote(uuid) to authenticated, service_role;
