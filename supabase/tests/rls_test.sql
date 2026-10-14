-- Tests de sécurité et de règles métier (§33.2) exécutés sur la base réelle (migrations),
-- avec les rôles Supabase « authenticated » et « anon ». Chaque échec arrête le script.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned
\o /dev/null
set client_min_messages = warning;

-- Utilisateurs de test : A et B propriétaires de deux entreprises, C métreur invité,
-- D invité en trop (limite), U adresse non confirmée.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.bj', now(), '{"first_name":"Awa","last_name":"Adjovi","accepted_terms":"true"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.ci', now(), '{"first_name":"Bakary"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.bj', now(), '{"first_name":"Comlan"}'),
  ('00000000-0000-0000-0000-00000000000d', 'd@test.bj', now(), '{}'),
  ('00000000-0000-0000-0000-0000000000ee', 'u@test.bj', null, '{}');

create schema tests;
grant usage on schema tests to authenticated, anon;
create table tests.ids (k text primary key, v text);
grant all on tests.ids to authenticated, anon;
create function tests.login(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false);
end $$;
create function tests.id(p text) returns text language sql as $$ select v from tests.ids where k = p $$;
grant execute on all functions in schema tests to authenticated, anon;

-- Vérifie qu'une instruction échoue avec un message attendu.
create function tests.fails(p_sql text, p_pattern text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm !~* p_pattern then raise exception 'ÉCHEC (%): erreur inattendue « % »', p_msg, sqlerrm; end if;
    raise notice 'ok — %', p_msg;
    return;
  end;
  raise exception 'ÉCHEC (%): l''instruction aurait dû être refusée', p_msg;
end $$;
-- Vérifie qu'une mise à jour ne touche aucune ligne (filtrée par RLS).
create function tests.no_rows(p_sql text, p_msg text) returns void language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC (%): % ligne(s) modifiée(s)', p_msg, n; end if;
  raise notice 'ok — %', p_msg;
end $$;
create function tests.check(p bool, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p, false) then raise exception 'ÉCHEC : %', p_msg; end if;
  raise notice 'ok — %', p_msg;
end $$;
grant execute on all functions in schema tests to authenticated, anon;
set client_min_messages = notice;

select tests.check((select count(*) from public.profiles) = 5, 'profils créés à l''inscription');
select tests.check((select first_name || ' ' || last_name from public.profiles where email = 'a@test.bj') = 'Awa Adjovi' and
  (select accepted_terms_at is not null from public.profiles where email = 'a@test.bj'), 'nom et acceptation des conditions enregistrés');

-- ------------------------------------------------------------ entreprises
set role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000a');
insert into tests.ids values ('org1', public.create_organization('BTP Awa', 'BJ', 'Cotonou', '+229 01 00 00 00', 'BTP Awa SARL'));
select tests.check((select role from public.members where user_id = auth.uid()) = 'proprietaire', 'créateur propriétaire');
select tests.check((select count(*) from public.role_permissions where org_id = tests.id('org1')::uuid) > 40, 'matrice des permissions initialisée');
select tests.check((select legal_ids -> 0 ->> 'label' from public.organizations where id = tests.id('org1')::uuid) = 'IFU', 'champs légaux du Bénin (IFU, RCCM)');
select tests.check((select plan_id = 'decouverte' and plan_status = 'essai' and plan_ends_at > now() + interval '29 days' from public.organizations where id = tests.id('org1')::uuid), 'essai Découverte de 30 jours');
select tests.fails('insert into public.organizations (name) values (''Pirate'')', 'permission denied', 'création directe d''entreprise interdite');
select tests.fails('update public.organizations set plan_id = ''entreprise'' where id = tests.id(''org1'')::uuid', 'permission denied', 'le client ne peut pas changer son offre lui-même');
select tests.fails('update public.organizations set plan_ends_at = now() + interval ''10 years''', 'permission denied', 'le client ne peut pas prolonger son abonnement');

select tests.login('00000000-0000-0000-0000-00000000000b');
insert into tests.ids values ('org2', public.create_organization('Ivoire Construction', 'CI', 'Abidjan'));
select tests.check((select legal_ids -> 0 ->> 'label' from public.organizations where id = tests.id('org2')::uuid) = 'NCC', 'champs légaux de Côte d''Ivoire (NCC)');
select tests.check((select count(*) from public.organizations) = 1, 'B ne voit que son entreprise');

-- ------------------------------------------------------------ contacts et isolation
select tests.login('00000000-0000-0000-0000-00000000000a');
insert into public.contacts (org_id, kind, client_type, name, phone) values (tests.id('org1')::uuid, 'client', 'particulier', 'M. Hounkpè', '+229 97 00 00 01');
select tests.check((select count(*) from public.contacts) = 1, 'A voit son client');

select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.check((select count(*) from public.contacts) = 0, 'isolation : B ne voit pas les clients de A');
select tests.fails(format('insert into public.contacts (org_id, kind, name) values (%L, ''client'', ''Intrus'')', tests.id('org1')), 'row-level security', 'isolation : B ne peut pas écrire chez A');
select tests.no_rows('update public.contacts set name = ''Piraté''', 'isolation : B ne peut pas modifier chez A');
select tests.no_rows('delete from public.contacts', 'isolation : B ne peut pas supprimer chez A');
select tests.check((select count(*) from public.activity_log) = 1, 'isolation du journal : B ne voit que la création de son entreprise');

-- ------------------------------------------------------------ projets, numérotation, limites
select tests.login('00000000-0000-0000-0000-00000000000a');
insert into public.projects (org_id, name, project_type, budget_estimate) values (tests.id('org1')::uuid, 'Villa Fidjrossè', 'residentiel', 45000000);
insert into public.projects (org_id, name) values (tests.id('org1')::uuid, 'Boutique Ganhi');
select tests.check((select string_agg(reference, ',' order by reference) from public.projects) =
  'PRJ-' || extract(year from now()) || '-0001,PRJ-' || extract(year from now()) || '-0002', 'références de projet uniques et séquentielles');
insert into public.projects (org_id, name) values (tests.id('org1')::uuid, 'Clôture');
select tests.fails(format('insert into public.projects (org_id, name) values (%L, ''Quatrième'')', tests.id('org1')), 'Limite de l''offre', 'limite de 3 projets de l''offre Découverte');
update public.projects set archived_at = now() where name = 'Clôture';
insert into public.projects (org_id, name) values (tests.id('org1')::uuid, 'Quatrième');
select tests.check(true, 'un projet archivé libère une place');
select tests.fails('update public.projects set reference = ''X''', 'permission denied', 'la référence d''un projet est figée');
update public.projects set budget_validated = 43000000 where name = 'Villa Fidjrossè';
select tests.check((select count(*) from public.activity_log where action = 'modification du budget') = 1, 'modification de budget journalisée');
select tests.check((select count(*) from public.activity_log where action = 'archivage' and entity = 'projects') = 1, 'archivage journalisé');

-- ------------------------------------------------------------ invitations
insert into public.invitations (org_id, email, role) values (tests.id('org1')::uuid, 'c@test.bj', 'metreur');
insert into tests.ids select 'tokC', token from public.invitations where email = 'c@test.bj';
insert into public.invitations (org_id, email, role) values (tests.id('org1')::uuid, 'd@test.bj', 'lecteur');
insert into tests.ids select 'tokD', token from public.invitations where email = 'd@test.bj';
insert into public.invitations (org_id, email, role) values (tests.id('org1')::uuid, 'u@test.bj', 'lecteur');
insert into tests.ids select 'tokU', token from public.invitations where email = 'u@test.bj';
select tests.fails(format('insert into public.invitations (org_id, email, role) values (%L, ''x@y.bj'', ''proprietaire'')', tests.id('org1')), 'check constraint', 'on ne peut pas inviter un propriétaire');

reset role; set role anon;
select tests.check((select org_name from public.invitation_preview(tests.id('tokC'))) = 'BTP Awa', 'aperçu d''invitation par le lien');
select tests.check((select count(*) from public.invitation_preview('court')) = 0, 'jeton trop court refusé');
select tests.fails('select public.create_organization(''Anonyme'')', 'permission denied', 'un visiteur anonyme ne peut rien créer');
reset role; set role authenticated;

select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.fails(format('select public.accept_invitation(%L)', tests.id('tokC')), 'autre adresse', 'invitation réservée à l''adresse invitée');
select tests.check((select count(*) from public.invitations) = 0, 'B ne voit pas les invitations de A');
select tests.login('00000000-0000-0000-0000-0000000000ee');
select tests.fails(format('select public.accept_invitation(%L)', tests.id('tokU')), 'non confirmée', 'adresse non confirmée refusée');
select tests.login('00000000-0000-0000-0000-00000000000c');
select public.accept_invitation(tests.id('tokC'));
select tests.check((select role from public.members where user_id = auth.uid()) = 'metreur', 'C a rejoint l''entreprise comme métreur');
select tests.fails(format('select public.accept_invitation(%L)', tests.id('tokC')), 'déjà utilisée', 'une invitation ne sert qu''une fois');
select tests.login('00000000-0000-0000-0000-00000000000d');
select tests.fails(format('select public.accept_invitation(%L)', tests.id('tokD')), 'Nombre maximal', 'limite de 2 utilisateurs de l''offre Découverte');

-- ------------------------------------------------------------ permissions du métreur
select tests.login('00000000-0000-0000-0000-00000000000c');
select tests.check((select count(*) from public.contacts) = 1, 'le métreur consulte les clients');
select tests.fails(format('insert into public.contacts (org_id, kind, name) values (%L, ''client'', ''X'')', tests.id('org1')), 'row-level security', 'le métreur ne crée pas de client (matrice par défaut)');
select tests.fails(format('insert into public.projects (org_id, name) values (%L, ''Projet C'')', tests.id('org1')), 'row-level security', 'le métreur ne crée pas de projet');
select tests.no_rows('update public.organizations set name = ''Renommée''', 'le métreur ne modifie pas l''entreprise');
select tests.no_rows('update public.role_permissions set actions = array[''consulter'',''creer'',''modifier'',''supprimer'',''valider'',''exporter'',''partager'',''administrer'']', 'le métreur ne modifie pas les permissions');
select tests.fails(format('select public.set_member_role(%L, %L, ''administrateur'')', tests.id('org1'), '00000000-0000-0000-0000-00000000000c'), 'requis', 'le métreur ne peut pas s''attribuer un rôle');
insert into public.metres (org_id, title, lines) values (tests.id('org1')::uuid, 'Métré villa', '[{"id":"m1","designation":"Dalle","L":5,"l":4}]');
insert into public.quotes (org_id, kind, title, body) values (tests.id('org1')::uuid, 'dqe', 'DQE villa', '{"lots":[]}');
insert into public.quotes (org_id, kind, title) values (tests.id('org1')::uuid, 'devis', 'Devis villa');
select tests.check((select reference from public.quotes where kind = 'devis') = 'DEV-' || extract(year from now()) || '-0001', 'numérotation des devis');
select tests.check((select reference from public.metres) = 'MET-' || extract(year from now()) || '-0001', 'numérotation des métrés');
select tests.fails(format('select public.lock_quote(%L)', (select id from public.quotes where kind = 'devis')), 'valider', 'le métreur ne valide pas un devis');

-- La matrice est configurable par l'entreprise : A retire « créer » sur les DQE au métreur.
select tests.login('00000000-0000-0000-0000-00000000000a');
update public.role_permissions set actions = array['consulter','modifier','exporter'] where org_id = tests.id('org1')::uuid and role = 'metreur' and module = 'dqe';
select tests.check((select count(*) from public.activity_log where action = 'modification des permissions') = 1, 'changement de permissions journalisé');
select tests.login('00000000-0000-0000-0000-00000000000c');
select tests.fails(format('insert into public.quotes (org_id, kind, title) values (%L, ''dqe'', ''Refusé'')', tests.id('org1')), 'row-level security', 'permission retirée appliquée immédiatement');
select tests.login('00000000-0000-0000-0000-00000000000a');
select public.reset_role_permissions(tests.id('org1')::uuid, 'metreur');
select tests.check((select 'creer' = any(actions) from public.role_permissions where org_id = tests.id('org1')::uuid and role = 'metreur' and module = 'dqe'), 'droits par défaut rétablis');

-- ------------------------------------------------------------ versions verrouillées
insert into tests.ids select 'devis', id from public.quotes where kind = 'devis';
update public.quotes set body = '{"lots":[{"id":"L1","code":"LOT 01","name":"Gros œuvre","lines":[]}]}', total_ht = 1000 where id = tests.id('devis')::uuid;
select public.lock_quote(tests.id('devis')::uuid);
select tests.check((select locked and status = 'en_validation' and validated_by = auth.uid() from public.quotes where id = tests.id('devis')::uuid), 'devis validé et verrouillé');
select tests.fails(format('update public.quotes set body = ''{"lots":[]}'' where id = %L', tests.id('devis')), 'verrouillée', 'une version verrouillée ne se modifie pas');
select tests.fails(format('update public.quotes set locked = false where id = %L', tests.id('devis')), 'permission denied', 'on ne déverrouille pas directement');
update public.quotes set status = 'envoye' where id = tests.id('devis')::uuid;
select tests.check((select status from public.quotes where id = tests.id('devis')::uuid) = 'envoye', 'le statut commercial évolue sur une version verrouillée');
select tests.check(public.new_quote_version(tests.id('devis')::uuid, 'Remise accordée') = 2, 'nouvelle version créée');
select tests.check((select not locked and version = 2 from public.quotes where id = tests.id('devis')::uuid), 'la nouvelle version est modifiable');
select tests.check((select count(*) from public.quote_versions where quote_id = tests.id('devis')::uuid and version = 1) = 1, 'la version 1 reste consultable');
select tests.fails(format('delete from public.quote_versions where quote_id = %L', tests.id('devis')), 'permission denied', 'l''historique des versions ne se supprime pas');

-- ------------------------------------------------------------ métré approuvé
update public.metres set status = 'approuve';
select tests.fails('update public.metres set lines = ''[]''', 'approuvé', 'un métré approuvé ne se modifie pas');

-- ------------------------------------------------------------ prix et historique
insert into public.price_items (org_id, code, designation, unit, purchase_price, sale_price, country, price_date, source)
values (tests.id('org1')::uuid, 'CIM-50', 'Ciment CPJ 35 (sac 50 kg)', 'sac', 4800, 5200, 'BJ', current_date, 'Facture fournisseur');
update public.price_items set sale_price = 5400 where code = 'CIM-50';
select tests.check((select count(*) from public.price_history) = 2, 'historique des prix conservé');

-- ------------------------------------------------------------ abonnement échu : lecture seule
reset role;
update public.organizations set plan_ends_at = now() - interval '1 day' where id = (select v::uuid from tests.ids where k = 'org1');
set role authenticated;
select tests.check((select count(*) from public.contacts) = 1, 'abonnement échu : les données restent consultables');
select tests.fails(format('insert into public.contacts (org_id, kind, name) values (%L, ''client'', ''Après échéance'')', tests.id('org1')), 'row-level security', 'abonnement échu : plus de nouvelles opérations');
reset role;
update public.organizations set plan_ends_at = now() + interval '30 days' where id = (select v::uuid from tests.ids where k = 'org1');
set role authenticated;

-- ------------------------------------------------------------ rôles et propriétaire
select tests.fails(format('select public.set_member_role(%L, %L, ''lecteur'')', tests.id('org1'), '00000000-0000-0000-0000-00000000000a'), 'au moins un propriétaire', 'le dernier propriétaire reste propriétaire');
select public.set_member_role(tests.id('org1')::uuid, '00000000-0000-0000-0000-00000000000c', 'lecteur');
select tests.check((select role from public.members where user_id = '00000000-0000-0000-0000-00000000000c') = 'lecteur', 'le propriétaire change un rôle');

-- ------------------------------------------------------------ stockage des fichiers
insert into storage.objects (bucket_id, name, metadata) values ('documents', tests.id('org1') || '/plans/plan.pdf', '{"size": 1000}');
select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.check((select count(*) from storage.objects) = 0, 'isolation : B ne voit pas les fichiers de A');
select tests.fails(format('insert into storage.objects (bucket_id, name) values (''documents'', %L)', tests.id('org1') || '/x.pdf'), 'row-level security', 'isolation : B ne dépose pas chez A');
select tests.fails('insert into storage.objects (bucket_id, name) values (''documents'', ''sans-dossier.pdf'')', 'row-level security', 'un fichier hors dossier d''entreprise est refusé');
select tests.fails(format('insert into public.documents (org_id, name, storage_path, size_bytes, mime) values (%L, ''x'', %L, 1, ''application/pdf'')', tests.id('org2'), tests.id('org1') || '/x.pdf'), 'row-level security', 'un document ne peut pas pointer vers les fichiers d''une autre entreprise');

-- ------------------------------------------------------------ administration de la plateforme
select tests.fails('select * from public.admin_overview()', 'Réservé', 'statistiques réservées à la plateforme');
select tests.fails(format('select public.admin_set_subscription(%L, ''entreprise'', ''actif'', ''an'', now() + interval ''1 year'')', tests.id('org2')), 'Réservé', 'activation réservée à la plateforme');
reset role;
insert into public.platform_admins (email) values ('a@test.bj');
set role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.check((select organizations from public.admin_overview()) = 2, 'statistiques de la plateforme');
select public.admin_set_subscription(tests.id('org2')::uuid, 'pro', 'actif', 'mois', now() + interval '1 month');
select tests.check((select plan_id from public.organizations where id = tests.id('org2')::uuid) = 'pro', 'abonnement activé par l''administrateur');
select tests.check((select count(*) from public.organizations) = 2, 'l''administrateur voit les entreprises');
select tests.check((select count(*) from public.contacts where org_id = tests.id('org2')::uuid) = 0, 'l''administrateur ne lit pas le contenu des entreprises');


-- ------------------------------------------------------------ demandes d'abonnement
select tests.login('00000000-0000-0000-0000-00000000000b');
insert into tests.ids values ('req', public.request_subscription(tests.id('org2')::uuid, 'entreprise', 'an', 'mobile_money', '+225 07 00 00 00', null));
select tests.check((select amount from public.billing_requests) = 799000, 'montant de la demande tiré de l''offre (pas du client)');
select tests.fails(format('select public.request_subscription(%L, ''pro'', ''mois'', null, null, null)', tests.id('org2')), 'déjà en attente', 'une seule demande en attente');
select tests.fails(format('select public.admin_handle_request(%L, true, null)', tests.id('req')), 'Réservé', 'seule la plateforme traite les demandes');
select tests.fails('update public.billing_requests set status = ''traitee''', 'permission denied', 'le client ne valide pas sa propre demande');
select tests.login('00000000-0000-0000-0000-00000000000a');
select public.admin_handle_request(tests.id('req')::uuid, true, 'Mobile Money reçu');
select tests.check((select plan_id = 'entreprise' and plan_status = 'actif' and plan_ends_at > now() + interval '11 months' from public.organizations where id = tests.id('org2')::uuid), 'offre activée pour un an après traitement');
select tests.check((select count(*) from public.activity_log where org_id = tests.id('org2')::uuid and entity = 'abonnement') >= 2, 'l''administration voit les opérations d''abonnement');
select tests.check((select count(*) from public.activity_log where org_id = tests.id('org2')::uuid and entity = 'contacts') = 0, 'l''administration ne voit pas le journal métier des entreprises');

-- ------------------------------------------------------------ double authentification
reset role;
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-00000000000b', 'verified');
set role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.check((select count(*) from public.organizations) = 0, 'second facteur activé : rien n''est accessible sans le vérifier');
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated', 'aal', 'aal2')::text, false);
select tests.check((select count(*) from public.organizations) = 1, 'session vérifiée par le second facteur : accès rétabli');

\echo 'TOUS LES TESTS DE SÉCURITÉ SONT PASSÉS'
