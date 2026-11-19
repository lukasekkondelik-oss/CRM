\set ON_ERROR_STOP on
\pset pager off
-- Admin A (workspace "Firma A"), člen Carl přidaný ručně
insert into auth.users (id,email,raw_user_meta_data) values ('11111111-1111-1111-1111-111111111111','a@x.cz','{"full_name":"Alice","workspace_name":"Firma A"}');
insert into auth.users (id,email,raw_user_meta_data) values ('22222222-2222-2222-2222-222222222222','b@x.cz','{"full_name":"Bob","workspace_name":"Firma B"}');

set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select '1) admin vytvoří pozvánku' as test;
insert into invitations(email, role) values ('novy@x.cz','member') returning email, role, workspace_id is not null as ws, accepted_at is null as pending;
do $$ begin insert into invitations(email) values ('Velke@X.cz'); raise exception 'MELO SELHAT'; exception when check_violation then raise notice 'OK: e-mail musí být malými písmeny'; end $$;
do $$ begin insert into invitations(email) values ('novy@x.cz'); raise exception 'MELO SELHAT'; exception when unique_violation then raise notice 'OK: duplicitní čekající pozvánka zamítnuta'; end $$;
reset role;
select '2) get_invitation (anon) vrací jen e-mail/roli/workspace' as test;
create temp table tk as select token from invitations where email='novy@x.cz'; grant select on tk to anon;
set role anon; select email, role, workspace_name from get_invitation((select token from tk)); select count(*) as neplatny_token from get_invitation('00000000-0000-0000-0000-000000000000');
do $$ begin perform 1 from invitations; raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: anon nesmí číst invitations'; end $$;
reset role;

select '3) registrace s pozvánkou -> připojí do workspace A jako member' as test;
insert into auth.users (id,email,raw_user_meta_data)
  select '33333333-3333-3333-3333-333333333333','novy@x.cz', jsonb_build_object('full_name','Nový','invite_token', token::text) from tk;
select p.full_name, p.role, w.name as workspace from profiles p join workspaces w on w.id=p.workspace_id where p.id='33333333-3333-3333-3333-333333333333';
select count(*) as workspaces_celkem from workspaces;
select accepted_at is not null as prijato from invitations where email='novy@x.cz';

select '4) pozvánku nejde použít znovu / s cizím e-mailem / neplatným tokenem' as test;
do $$ declare t uuid; begin select token into t from tk; insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'novy@x.cz', jsonb_build_object('invite_token', t::text)); raise exception 'MELO SELHAT'; exception when raise_exception then raise notice 'OK: použitá pozvánka odmítnuta (%)', sqlerrm; end $$;
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into invitations(email) values ('jiny@x.cz'); reset role;
do $$ declare t uuid; begin select token into t from invitations where email='jiny@x.cz'; insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'utocnik@x.cz', jsonb_build_object('invite_token', t::text)); raise exception 'MELO SELHAT'; exception when raise_exception then raise notice 'OK: cizí e-mail odmítnut'; end $$;
do $$ begin insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'t@x.cz', '{"invite_token":"neni-uuid"}'); exception when others then raise notice 'poznámka: špatný formát tokenu -> %', sqlerrm; end $$;
update invitations set expires_at = now() - interval '1 day' where email='jiny@x.cz';
do $$ declare t uuid; begin select token into t from invitations where email='jiny@x.cz'; insert into auth.users(id,email,raw_user_meta_data) values (gen_random_uuid(),'jiny@x.cz', jsonb_build_object('invite_token', t::text)); raise exception 'MELO SELHAT'; exception when raise_exception then raise notice 'OK: vypršelá pozvánka odmítnuta'; end $$;

select '5) člen (Carl) nevidí pozvánky, nemění role, neodebírá' as test;
set role authenticated; select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select count(*) as pozvanky_viditelne_clenovi from invitations;
do $$ begin perform set_member_role('33333333-3333-3333-3333-333333333333','admin'); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: člen nemůže povýšit sebe'; end $$;
do $$ begin perform remove_member('11111111-1111-1111-1111-111111111111'); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: člen nemůže odebrat admina'; end $$;
do $$ begin insert into invitations(email) values ('x@x.cz'); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: člen nemůže zvát'; end $$;

select '6) admin: role + poslední admin + odebrání + izolace' as test;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select set_member_role('33333333-3333-3333-3333-333333333333','admin');
select role from profiles where id='33333333-3333-3333-3333-333333333333';
select set_member_role('33333333-3333-3333-3333-333333333333','member');
do $$ begin perform set_member_role('11111111-1111-1111-1111-111111111111','member'); raise exception 'MELO SELHAT'; exception when raise_exception then raise notice 'OK: poslední admin nejde degradovat (%)', sqlerrm; end $$;
do $$ begin perform remove_member('22222222-2222-2222-2222-222222222222'); raise exception 'MELO SELHAT'; exception when others then raise notice 'OK: cizí workspace nejde ovlivnit (%)', sqlerrm; end $$;
do $$ begin perform remove_member('11111111-1111-1111-1111-111111111111'); raise exception 'MELO SELHAT'; exception when raise_exception then raise notice 'OK: sám sebe odebrat nelze'; end $$;
-- Carl vlastní deal, po odebrání zůstane deal bez ownera
reset role; insert into persons(workspace_id, first_name, last_name, owner_id) select workspace_id,'P','Q','33333333-3333-3333-3333-333333333333' from profiles where id='11111111-1111-1111-1111-111111111111';
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select remove_member('33333333-3333-3333-3333-333333333333');
select count(*) as clenu_po_odebrani from profiles where workspace_id=(select workspace_id from profiles where id='11111111-1111-1111-1111-111111111111');
select owner_id is null as osoba_zustala_bez_ownera from persons where last_name='Q';
reset role;
select '7) trigramové indexy existují' as test; select count(*) as trgm_indexu from pg_indexes where indexname like '%_trgm';
