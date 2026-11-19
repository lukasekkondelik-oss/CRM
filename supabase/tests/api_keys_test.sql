\set ON_ERROR_STOP on
\pset pager off
insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','a@x.cz','{"full_name":"Alice","workspace_name":"Firma A"}'),
 ('22222222-2222-2222-2222-222222222222','b@x.cz','{"full_name":"Bob","workspace_name":"Firma B"}');
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select '1) Alice vytvoří klíč (workspace a user se doplní samy)' as test;
insert into api_keys(name, key_prefix, key_hash, scopes) values ('Claude','nxd_AbCdEf12', repeat('a',64), array['read']) returning name, scopes, workspace_id is not null as ws, user_id = auth.uid() as me;
do $$ begin insert into api_keys(name,key_prefix,key_hash) values ('x','nxd_x', 'neni-hash'); raise exception 'MELO SELHAT'; exception when check_violation then raise notice 'OK: neplatný hash odmítnut'; end $$;
do $$ begin insert into api_keys(name,key_prefix,key_hash,scopes) values ('x','nxd_x', repeat('b',64), array['admin']); raise exception 'MELO SELHAT'; exception when check_violation then raise notice 'OK: neznámý scope odmítnut'; end $$;
do $$ begin insert into api_keys(name,key_prefix,key_hash) values ('dup','nxd_x', repeat('a',64)); raise exception 'MELO SELHAT'; exception when unique_violation then raise notice 'OK: duplicitní hash odmítnut'; end $$;
do $$ begin insert into api_keys(name,key_prefix,key_hash,user_id) values ('podvrh','nxd_x', repeat('c',64), '22222222-2222-2222-2222-222222222222'); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: klíč za jiného uživatele nelze'; end $$;
select '2) odvolání a omezení sloupců' as test;
update api_keys set revoked_at = now(), name = 'Claude (odvolaný)'; select revoked_at is not null as odvolano from api_keys;
do $$ begin update api_keys set key_hash = repeat('d',64); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: hash nejde měnit'; end $$;
do $$ begin update api_keys set scopes = array['read','write']; raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: scopes nejdou měnit'; end $$;
do $$ begin update api_keys set last_used_at = now(); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: last_used_at nemůže měnit klient'; end $$;
select '3) izolace mezi uživateli' as test;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select count(*) as bob_vidi_klice from api_keys;
update api_keys set name = 'hack'; select count(*) as bob_zmenil from api_keys where name = 'hack';
delete from api_keys; reset role; select count(*) as klic_alice_prezil from api_keys;
set role anon; do $$ begin perform 1 from api_keys; raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: anon nemá přístup'; end $$;
reset role;
select '4) smazání uživatele smaže jeho klíče' as test;
delete from auth.users where id='11111111-1111-1111-1111-111111111111'; select count(*) as klicu_po_smazani from api_keys;
