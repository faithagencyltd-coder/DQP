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
grant usage on schema tests to authenticated, anon, service_role;
create table tests.ids (k text primary key, v text);
grant all on tests.ids to authenticated, anon, service_role;
create function tests.login(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false);
end $$;
create function tests.id(p text) returns text language sql as $$ select v from tests.ids where k = p $$;
grant execute on all functions in schema tests to authenticated, anon, service_role;

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
grant execute on all functions in schema tests to authenticated, anon, service_role;
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

-- ------------------------------------------------------------ plans et rendus IA
select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.check(not public.feature_enabled('rendu_plan_ia'), 'rendu IA désactivé par défaut');
select tests.fails('select public.admin_set_feature(''rendu_plan_ia'', true)', 'Réservé', 'seule la plateforme active une fonction IA');
select tests.fails('update public.platform_features set enabled = true', 'permission denied', 'le client ne réactive pas une fonction IA');
select tests.login('00000000-0000-0000-0000-00000000000b');
with x as (insert into public.plans (org_id, name, level, data) values (tests.id('org2')::uuid, 'Villa R+1', 'RDC', '{"v":1}') returning id)
insert into tests.ids select 'plan', id from x;
select tests.check((select reference from public.plans where id = tests.id('plan')::uuid) like 'PLN-____-0001', 'plan numéroté automatiquement');
select tests.fails(format('insert into public.plans (org_id, name, source_path) values (%L, ''Intrus'', %L)', tests.id('org2'), tests.id('org1') || '/plans-techniques/x.pdf'), 'check constraint', 'un plan ne pointe pas vers les fichiers d''une autre entreprise');
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.check((select count(*) from public.plans) = 0, 'isolation : A ne voit pas les plans de B');
select tests.fails(format('insert into public.plans (org_id, name) values (%L, ''Plan RDC'')', tests.id('org1')), 'row-level security', 'module Plans absent de l''offre Découverte');
select tests.fails(format('select * from public.request_plan_render(%L, ''rendu_fidele'', ''moderne'')', tests.id('plan')), 'introuvable', 'A ne peut pas demander de rendu sur le plan de B');
select tests.fails(format('insert into storage.objects (bucket_id, name) values (''documents'', %L)', tests.id('org1') || '/plans-techniques/p/source.pdf'), 'row-level security', 'fichiers de plans soumis au module Plans');

select tests.login('00000000-0000-0000-0000-00000000000b');
update public.plans set status = 'approuve' where id = tests.id('plan')::uuid;
select tests.fails(format('update public.plans set data = ''{"v":1,"walls":[]}'' where id = %L', tests.id('plan')), 'approuvé', 'dessin approuvé non modifiable');
update public.plans set status = 'travail' where id = tests.id('plan')::uuid;
select tests.fails(format('update public.plans set reference = ''X'' where id = %L', tests.id('plan')), 'permission denied', 'référence de plan non modifiable');
select tests.fails(format('select * from public.request_plan_render(%L, ''plan_importe'', ''moderne'')', tests.id('plan')), 'pas de fichier importé', 'rendu depuis le fichier importé : fichier requis');

select tests.fails(format('select * from public.request_plan_render(%L, ''rendu_fidele'', ''moderne'')', tests.id('plan')), 'désactivé', 'rendu IA refusé tant que la plateforme ne l''a pas ouvert');
select tests.login('00000000-0000-0000-0000-00000000000a');
select public.admin_set_feature('rendu_plan_ia', true);
select tests.login('00000000-0000-0000-0000-00000000000b');
insert into tests.ids select 'r1', render_id from public.request_plan_render(tests.id('plan')::uuid, 'rendu_fidele', 'moderne', '{"width":1536}');
select tests.check((select used = 10 and remaining = quota - 10 from public.ai_quota_status(tests.id('org2')::uuid)), 'unités IA réservées à la demande');
select tests.check((select status = 'en_attente' and input_path like tests.id('org2') || '/plans-techniques/%/ia/%' from public.plan_renders where id = tests.id('r1')::uuid), 'demande de rendu enregistrée en attente');
select tests.fails(format('insert into public.plan_renders (org_id, plan_id, source, input_path) values (%L, %L, ''rendu_fidele'', %L)', tests.id('org2'), tests.id('plan'), tests.id('org2') || '/plans-techniques/x/ia/y.png'), 'permission denied', 'le client ne crée pas de rendu sans passer par le quota');
select tests.fails(format('update public.plan_renders set status = ''termine'' where id = %L', tests.id('r1')), 'permission denied', 'le client ne déclare pas un rendu terminé');
select tests.fails(format('select public.finish_plan_render(%L, true, null, null, null, null)', tests.id('r1')), 'permission denied', 'seul le serveur clôt un rendu');
select tests.fails('insert into public.ai_usage (org_id, feature, units) values (tests.id(''org2'')::uuid, ''x'', 1)', 'permission denied', 'le client n''écrit pas sa consommation IA');
insert into storage.objects (bucket_id, name, metadata) values ('documents', (select input_path from public.plan_renders where id = tests.id('r1')::uuid), '{"size": 2000}');
select tests.fails(format('insert into storage.objects (bucket_id, name) values (''documents'', %L)', tests.id('org2') || '/plans-techniques/x/ia/autre.png'), 'row-level security', 'aucun dépôt IA hors d''une demande en attente');

reset role; set role service_role;
select public.finish_plan_render(tests.id('r1')::uuid, true, tests.id('org2') || '/plans-techniques/p/ia/r1.png', 'openai', 'gpt-image-1', null);
reset role; set role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.check((select status = 'termine' and finished_at is not null from public.plan_renders where id = tests.id('r1')::uuid), 'rendu terminé par le serveur');
select tests.check((select status from public.ai_usage where ref_id = tests.id('r1')::uuid) = 'consomme', 'unités consommées au succès');
insert into tests.ids select 'r2', render_id from public.request_plan_render(tests.id('plan')::uuid, 'rendu_fidele', 'luxe');
reset role; set role service_role;
select public.finish_plan_render(tests.id('r2')::uuid, false, null, 'openai', 'gpt-image-1', 'Fournisseur indisponible');
reset role; set role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.check((select status from public.ai_usage where ref_id = tests.id('r2')::uuid) = 'rembourse', 'unités restituées en cas d''échec');
select tests.check((select used from public.ai_quota_status(tests.id('org2')::uuid)) = 10, 'un échec ne compte pas dans le quota');

reset role;
update public.subscription_plans set ai_quota_month = 25 where id = 'entreprise';
set role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000b');
insert into tests.ids select 'r3', render_id from public.request_plan_render(tests.id('plan')::uuid, 'rendu_fidele', 'epure');
select tests.fails(format('select * from public.request_plan_render(%L, ''rendu_fidele'', ''moderne'')', tests.id('plan')), 'Quota IA du mois atteint', 'quota IA mensuel appliqué');
reset role;
update public.subscription_plans set ai_quota_month = 1500 where id = 'entreprise';
set role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000b');
select public.request_plan_render(tests.id('plan')::uuid, 'rendu_fidele', 'moderne');
select public.request_plan_render(tests.id('plan')::uuid, 'rendu_fidele', 'moderne');
select tests.fails(format('select * from public.request_plan_render(%L, ''rendu_fidele'', ''moderne'')', tests.id('plan')), 'déjà en cours', 'au plus trois rendus IA simultanés');
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.fails(format('select public.cancel_plan_render(%L)', tests.id('r3')), 'introuvable', 'on n''annule que ses propres demandes');
select tests.login('00000000-0000-0000-0000-00000000000b');
reset role;
update public.plan_renders set created_at = now() - interval '1 hour' where status = 'en_attente';
set role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000b');
select public.request_plan_render(tests.id('plan')::uuid, 'rendu_fidele', 'moderne');
select tests.check((select status = 'echec' and error like '%restituées%' from public.plan_renders where id = tests.id('r3')::uuid), 'demande abandonnée close après délai');
select tests.check((select status from public.ai_usage where ref_id = tests.id('r3')::uuid) = 'rembourse', 'unités d''une demande abandonnée restituées');
insert into tests.ids select 'r4', render_id from public.request_plan_render(tests.id('plan')::uuid, 'rendu_fidele', 'moderne');
select public.cancel_plan_render(tests.id('r4')::uuid, 'Service injoignable.');
select tests.check((select status = 'echec' from public.plan_renders where id = tests.id('r4')::uuid) and (select status from public.ai_usage where ref_id = tests.id('r4')::uuid) = 'rembourse', 'demande annulée par son auteur : unités restituées');
select tests.check((select count(*) from public.activity_log where entity = 'plans' and action = 'demande de rendu IA') >= 3, 'demandes de rendu IA tracées au journal');
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.check((select units_month from public.admin_ai_overview()) = 10, 'consommation IA visible par la plateforme');
select tests.check((select count(*) from public.plan_renders) = 0, 'l''administration ne voit pas les rendus des entreprises');

-- ------------------------------------------------------------ facturation, paiements, dépenses
select tests.login('00000000-0000-0000-0000-00000000000b');
insert into public.contacts (org_id, kind, name) values (tests.id('org2')::uuid, 'client', 'Client facturé');
with x as (insert into public.invoices (org_id, client_id, title, body, settings, total_ttc) values (
  tests.id('org2')::uuid, (select id from public.contacts where name = 'Client facturé'), 'Facture test',
  '{"lots":[{"id":"l1","code":"LOT 01","name":"Gros œuvre","lines":[{"id":"a","kind":"titre","designation":"Titre"},{"id":"b","kind":"ouvrage","qty":3,"unitPrice":1000.5},{"id":"c","kind":"ouvrage","qty":2.5,"unitPrice":333},{"id":"d","kind":"ouvrage","qty":null,"unitPrice":10}]}]}',
  '{"currency":"XOF","discountPct":5,"taxes":[{"label":"TVA","rate":18}]}', 1) returning id)
insert into tests.ids select 'inv', id from x;
select tests.check((select total_ht = 3835 and net_ht = 3643 and total_ttc = 4299 and incomplete_lines = 1 and reference is null and status = 'brouillon' from public.invoices where id = tests.id('inv')::uuid),
  'totaux recalculés par la base (3 × 1000,5 → 3 002 ; 2,5 × 333 → 833 ; remise 5 % ; TVA 18 % → 4 299), total envoyé ignoré');
select tests.fails(format('update public.invoices set total_ttc = 1 where id = %L', tests.id('inv')), 'permission denied', 'le total d''une facture ne se saisit pas');
select tests.fails(format('select public.issue_invoice(%L)', tests.id('inv')), 'sans quantité', 'émission refusée avec une ligne incomplète');
update public.invoices set body = jsonb_set(body, '{lots,0,lines,3,qty}', '1') where id = tests.id('inv')::uuid;
select tests.check((select total_ttc from public.invoices where id = tests.id('inv')::uuid) = 4311, 'totaux recalculés à chaque modification (3 845 − 192 = 3 653 ; TVA 658 ; 4 311)');
select public.issue_invoice(tests.id('inv')::uuid);
select tests.check((select reference like 'FAC-____-0001' and status = 'emise' and due_date = issue_date + 30 from public.invoices where id = tests.id('inv')::uuid), 'émission : numéro FAC continu, échéance à 30 jours');
select tests.fails(format('update public.invoices set title = ''Autre'' where id = %L', tests.id('inv')), 'émise', 'facture émise figée (correction par avoir)');
delete from public.invoices where id = tests.id('inv')::uuid;
select tests.check((select count(*) from public.invoices where id = tests.id('inv')::uuid) = 1, 'une facture émise ne se supprime pas');
select tests.fails(format('insert into public.payments (org_id, invoice_id, amount, method) values (%L, %L, 5000, ''especes'')', tests.id('org2'), tests.id('inv')), 'dépasse le solde', 'paiement supérieur au solde refusé');
insert into public.payments (org_id, invoice_id, amount, method, verified) values (tests.id('org2')::uuid, tests.id('inv')::uuid, 1310, 'mobile_money', true);
select tests.check((select status = 'partielle' and amount_paid = 1310 from public.invoices where id = tests.id('inv')::uuid), 'paiement partiel : facture partiellement payée');
select tests.check((select bool_and(not verified) from public.payments), 'un paiement saisi n''est jamais marqué « confirmé »');
insert into public.payments (org_id, invoice_id, amount, method) values (tests.id('org2')::uuid, tests.id('inv')::uuid, 3001, 'virement');
select tests.check((select status from public.invoices where id = tests.id('inv')::uuid) = 'payee', 'solde atteint : facture payée');
select tests.fails(format('insert into public.payments (org_id, invoice_id, amount, method) values (%L, %L, 1, ''especes'')', tests.id('org2'), tests.id('inv')), 'déjà soldée', 'pas de paiement sur une facture soldée');
with x as (insert into public.invoices (org_id, client_id, kind, credit_for, title, body) values (tests.id('org2')::uuid, (select id from public.contacts where name = 'Client facturé'), 'avoir', tests.id('inv')::uuid, 'Avoir partiel',
  '{"lots":[{"id":"l","code":"LOT 01","name":"Avoir","lines":[{"id":"z","kind":"ouvrage","qty":1,"unitPrice":-500}]}]}') returning id)
insert into tests.ids select 'avo', id from x;
select tests.check(public.issue_invoice(tests.id('avo')::uuid) like 'AVO-____-0001', 'avoir numéroté dans sa propre suite');
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.check((select count(*) from public.invoices) = 0 and (select count(*) from public.payments) = 0, 'isolation : A ne voit ni les factures ni les paiements de B');
select tests.fails(format('select public.issue_invoice(%L)', tests.id('inv')), 'introuvable', 'A ne peut pas émettre une facture de B');

select tests.login('00000000-0000-0000-0000-00000000000b');
insert into public.expenses (org_id, category, label, amount_ht, tax_amount) values (tests.id('org2')::uuid, 'materiaux', 'Ciment 20 sacs', 100000, 18000);
select tests.check((select amount_ttc from public.expenses where label = 'Ciment 20 sacs') = 118000, 'dépense : TTC calculé par la base');
select tests.fails(format('insert into public.expenses (org_id, category, label, amount_ht, status) values (%L, ''transport'', ''Camion'', 5000, ''payee'')', tests.id('org2')), 'check constraint', 'dépense payée : date de paiement obligatoire');
select tests.fails(format('insert into public.expenses (org_id, category, label, amount_ht, receipt_path) values (%L, ''autre'', ''X'', 1, %L)', tests.id('org2'), tests.id('org1') || '/depenses/x.pdf'), 'check constraint', 'justificatif rangé chez une autre entreprise refusé');

-- ------------------------------------------------------------ achats et stocks
select tests.login('00000000-0000-0000-0000-00000000000b');
insert into public.contacts (org_id, kind, name) values (tests.id('org2')::uuid, 'fournisseur', 'Quincaillerie Dantokpa');
insert into public.price_items (org_id, kind, designation, unit, purchase_price) values (tests.id('org2')::uuid, 'article', 'Ciment CPJ 35', 'sac', 5200);
insert into public.warehouses (org_id, name) values (tests.id('org2')::uuid, 'Dépôt central'), (tests.id('org2')::uuid, 'Chantier Fidjrossè');
with x as (insert into public.purchase_requests (org_id, item_id, designation, qty, unit, status) values (tests.id('org2')::uuid, (select id from public.price_items where designation = 'Ciment CPJ 35'), 'Ciment CPJ 35', 100, 'sac', 'approuvee') returning id)
insert into tests.ids select 'da', id from x;
select tests.check((select status = 'soumise' and reference like 'DA-____-0001' from public.purchase_requests where id = tests.id('da')::uuid), 'demande d''achat numérotée, statut imposé « soumise »');
select tests.fails(format('select public.order_from_requests(array[%L]::uuid[], null)', tests.id('da')), 'approuvées', 'une demande non approuvée ne se commande pas');
select public.decide_purchase_request(tests.id('da')::uuid, true, 'OK chantier');
insert into tests.ids values ('bc', public.order_from_requests(array[tests.id('da')::uuid], (select id from public.contacts where name = 'Quincaillerie Dantokpa')));
select tests.check((select total_ht = 520000 and status = 'brouillon' and reference like 'BC-____-0001' from public.purchase_orders where id = tests.id('bc')::uuid), 'commande créée depuis la demande : 100 × 5 200 = 520 000 (total calculé par la base)');
select tests.check((select status from public.purchase_requests where id = tests.id('da')::uuid) = 'commandee', 'demande passée « commandée »');
update public.purchase_orders set lines = jsonb_set(lines, '{0,received_qty}', '100') where id = tests.id('bc')::uuid;
select tests.check((select (lines -> 0 ->> 'received_qty')::numeric = 0 from public.purchase_orders where id = tests.id('bc')::uuid), 'le client ne déclare pas de quantités reçues sur une commande');
select public.set_order_status(tests.id('bc')::uuid, 'validee');
select tests.fails(format('update public.purchase_orders set lines = ''[]'' where id = %L', tests.id('bc')), 'validée', 'commande validée figée');
select tests.fails(format('select public.receive_order(%L, %L::jsonb, null, null, null)', tests.id('bc'), '[{"line_id":"' || (select lines -> 0 ->> 'id' from public.purchase_orders where id = tests.id('bc')::uuid) || '","qty":150}]'), 'reste à recevoir', 'réception supérieure à la commande refusée');
select public.receive_order(tests.id('bc')::uuid, ('[{"line_id":"' || (select lines -> 0 ->> 'id' from public.purchase_orders where id = tests.id('bc')::uuid) || '","qty":60}]')::jsonb, (select id from public.warehouses where name = 'Dépôt central'), null, 'Livraison 1');
select tests.check((select status from public.purchase_orders where id = tests.id('bc')::uuid) = 'partielle', 'réception partielle');
select tests.check((select qty from public.stock_levels where warehouse_id = (select id from public.warehouses where name = 'Dépôt central')) = 60, 'stock alimenté par la réception (60 sacs)');
select public.receive_order(tests.id('bc')::uuid, ('[{"line_id":"' || (select lines -> 0 ->> 'id' from public.purchase_orders where id = tests.id('bc')::uuid) || '","qty":40}]')::jsonb, (select id from public.warehouses where name = 'Dépôt central'), null, null);
select tests.check((select status from public.purchase_orders where id = tests.id('bc')::uuid) = 'recue', 'réception complète');
insert into public.stock_movements (org_id, item_id, warehouse_id, kind, qty, project_id) values (tests.id('org2')::uuid, (select id from public.price_items where designation = 'Ciment CPJ 35'), (select id from public.warehouses where name = 'Dépôt central'), 'sortie', 30, null);
select tests.fails(format('insert into public.stock_movements (org_id, item_id, warehouse_id, kind, qty) values (%L, %L, %L, ''sortie'', 500)', tests.id('org2'), (select id from public.price_items where designation = 'Ciment CPJ 35'), (select id from public.warehouses where name = 'Dépôt central')), 'Stock insuffisant', 'pas de stock négatif');
select public.transfer_stock((select id from public.price_items where designation = 'Ciment CPJ 35'), (select id from public.warehouses where name = 'Dépôt central'), (select id from public.warehouses where name = 'Chantier Fidjrossè'), 20, 'Approvisionnement chantier');
select tests.check((select string_agg(qty::text, ',' order by qty) from public.stock_levels) = '20.000,50.000', 'transfert : 50 au dépôt, 20 sur le chantier');
select tests.check(public.count_stock((select id from public.price_items where designation = 'Ciment CPJ 35'), (select id from public.warehouses where name = 'Dépôt central'), 48, 'Sacs abîmés') = -2, 'inventaire : écart de −2 tracé');
select tests.fails(format('insert into public.stock_movements (org_id, item_id, warehouse_id, kind, qty) values (%L, %L, %L, ''ajustement'', 1)', tests.id('org2'), (select id from public.price_items where designation = 'Ciment CPJ 35'), (select id from public.warehouses where name = 'Dépôt central')), 'check constraint', 'ajustement sans motif refusé');
select tests.fails(format('insert into public.stock_movements (org_id, item_id, warehouse_id, kind, qty) values (%L, %L, %L, ''reception'', 1000)', tests.id('org2'), (select id from public.price_items where designation = 'Ciment CPJ 35'), (select id from public.warehouses where name = 'Dépôt central')), 'row-level security', 'une réception ne se déclare pas hors commande');
select tests.fails('delete from public.stock_movements', 'permission denied', 'les mouvements de stock ne s''effacent pas');
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.check((select count(*) from public.stock_levels) = 0 and (select count(*) from public.purchase_orders) = 0, 'isolation : A ne voit ni les stocks ni les commandes de B');

-- ------------------------------------------------------------ planning, suivi journalier, réserves
select tests.login('00000000-0000-0000-0000-00000000000b');
with x as (insert into public.projects (org_id, name) values (tests.id('org2')::uuid, 'Immeuble Ganhi') returning id) insert into tests.ids select 'prj', id from x;
with x as (insert into public.tasks (org_id, project_id, title, start_date, end_date) values (tests.id('org2')::uuid, tests.id('prj')::uuid, 'Fondations', '2026-11-02', '2026-11-13') returning id) insert into tests.ids select 't1', id from x;
with x as (insert into public.tasks (org_id, project_id, title, start_date, end_date, depends_on) values (tests.id('org2')::uuid, tests.id('prj')::uuid, 'Élévation', '2026-11-16', '2026-12-04', array[tests.id('t1')::uuid]) returning id) insert into tests.ids select 't2', id from x;
with x as (insert into public.tasks (org_id, project_id, title, start_date, end_date, depends_on) values (tests.id('org2')::uuid, tests.id('prj')::uuid, 'Dalle', '2026-12-07', '2026-12-18', array[tests.id('t2')::uuid]) returning id) insert into tests.ids select 't3', id from x;
select tests.check((select count(*) from public.tasks where project_id = tests.id('prj')::uuid) = 3, 'trois tâches enchaînées');
select tests.fails(format('update public.tasks set depends_on = array[%L]::uuid[] where id = %L', tests.id('t3'), tests.id('t1')), 'boucle', 'dépendances en boucle refusées');
select tests.fails(format('update public.tasks set depends_on = array[%L]::uuid[] where id = %L', tests.id('t1'), tests.id('t1')), 'elle-même', 'une tâche ne dépend pas d''elle-même');
select tests.fails(format('insert into public.tasks (org_id, project_id, title, start_date, end_date) values (%L, %L, ''X'', ''2026-11-10'', ''2026-11-01'')', tests.id('org2'), tests.id('prj')), 'check constraint', 'fin avant début refusée');
select tests.fails(format('insert into public.tasks (org_id, project_id, title, start_date, end_date, status) values (%L, %L, ''X'', ''2026-11-10'', ''2026-11-11'', ''valide'')', tests.id('org2'), tests.id('prj')), 'terminée', 'une tâche ne naît pas validée');
select tests.fails(format('update public.tasks set status = ''valide'' where id = %L', tests.id('t1')), 'terminée', 'validation seulement après « terminé »');
update public.tasks set status = 'termine' where id = tests.id('t1')::uuid;
update public.tasks set status = 'valide', validated_by = null where id = tests.id('t1')::uuid;
select tests.check((select validated_by = auth.uid() and validated_at is not null from public.tasks where id = tests.id('t1')::uuid), 'tâche validée : auteur et date posés par la base');
select tests.no_rows(format('delete from public.tasks where id = %L', tests.id('t1')), 'une tâche validée ne se supprime pas');
delete from public.tasks where id = tests.id('t2')::uuid;
select tests.check((select depends_on = '{}' from public.tasks where id = tests.id('t3')::uuid), 'tâche supprimée retirée des dépendances');

with x as (insert into public.daily_reports (org_id, project_id, report_date, work_done, workforce, status) values (tests.id('org2')::uuid, tests.id('prj')::uuid, '2026-11-03', 'Fouilles en rigole', '[{"role":"Maçons","count":4},{"role":"Manœuvres","count":6}]', 'valide') returning id) insert into tests.ids select 'rj', id from x;
select tests.check((select status = 'brouillon' and reference like 'RJ-____-0001' from public.daily_reports where id = tests.id('rj')::uuid), 'rapport journalier numéroté, toujours créé en brouillon');
select tests.fails(format('insert into public.daily_reports (org_id, project_id, report_date) values (%L, %L, ''2026-11-03'')', tests.id('org2'), tests.id('prj')), 'duplicate key', 'un seul rapport par chantier et par jour');
select tests.fails(format('update public.daily_reports set photos = %L where id = %L', '[{"path":"' || tests.id('org1') || '/suivi/x.jpg"}]', tests.id('rj')), 'hors du dossier', 'photo rangée chez une autre entreprise refusée');
select tests.fails(format('update public.daily_reports set workforce = ''[{"role":"Maçons","count":2.5}]'' where id = %L', tests.id('rj')), 'Effectif invalide', 'effectif non entier refusé');
update public.daily_reports set status = 'valide' where id = tests.id('rj')::uuid;
select tests.check((select status from public.daily_reports where id = tests.id('rj')::uuid) = 'brouillon', 'le statut ne se change pas par une simple mise à jour');
select tests.fails(format('select public.set_report_status(%L, ''valide'')', tests.id('rj')), 'soumis', 'un brouillon ne se valide pas directement');
select public.set_report_status(tests.id('rj')::uuid, 'soumis');
select public.set_report_status(tests.id('rj')::uuid, 'valide', 'Conforme');
select tests.fails(format('update public.daily_reports set work_done = ''modifié'' where id = %L', tests.id('rj')), 'validé', 'rapport validé figé');
select tests.no_rows(format('delete from public.daily_reports where id = %L', tests.id('rj')), 'rapport validé non supprimable');

with x as (insert into public.reserves (org_id, project_id, title, location, status) values (tests.id('org2')::uuid, tests.id('prj')::uuid, 'Fissure enduit façade nord', 'Façade nord', 'levee') returning id) insert into tests.ids select 'res', id from x;
select tests.check((select status = 'ouverte' and reference like 'RES-____-0001' from public.reserves where id = tests.id('res')::uuid), 'réserve numérotée, créée ouverte');
select tests.fails(format('update public.reserves set status = ''validee'' where id = %L', tests.id('res')), 'levée', 'réserve validée seulement une fois levée');
update public.reserves set status = 'levee' where id = tests.id('res')::uuid;
select tests.check((select lifted_on = current_date from public.reserves where id = tests.id('res')::uuid), 'date de levée posée');
update public.reserves set status = 'validee' where id = tests.id('res')::uuid;
select tests.fails(format('update public.reserves set title = ''x'' where id = %L', tests.id('res')), 'ne se modifie plus', 'réserve validée figée');
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.check((select count(*) from public.tasks) = 0 and (select count(*) from public.daily_reports) = 0 and (select count(*) from public.reserves) = 0, 'isolation : A ne voit ni le planning, ni les rapports, ni les réserves de B');
select tests.fails(format('insert into public.tasks (org_id, project_id, title, start_date, end_date) values (%L, %L, ''X'', ''2026-11-10'', ''2026-11-11'')', tests.id('org2'), tests.id('prj')), 'row-level security', 'A ne crée pas de tâche chez B');
select tests.fails(format('insert into public.tasks (org_id, project_id, title, start_date, end_date) values (%L, (select id from public.projects where name = ''Villa Fidjrossè''), ''X'', ''2026-11-10'', ''2026-11-11'')', tests.id('org1')), 'row-level security', 'planning hors de l''offre Découverte : refusé');

-- ------------------------------------------------------------ double authentification
reset role;
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-00000000000b', 'verified');
set role authenticated;
select tests.login('00000000-0000-0000-0000-00000000000b');
select tests.check((select count(*) from public.organizations) = 0, 'second facteur activé : rien n''est accessible sans le vérifier');
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated', 'aal', 'aal2')::text, false);
select tests.check((select count(*) from public.organizations) = 1, 'session vérifiée par le second facteur : accès rétabli');

\echo 'TOUS LES TESTS DE SÉCURITÉ SONT PASSÉS'
