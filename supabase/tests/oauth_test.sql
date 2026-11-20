\set ON_ERROR_STOP on
\pset pager off
insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','a@x.cz','{"full_name":"Alice","workspace_name":"Firma A"}'),
 ('22222222-2222-2222-2222-222222222222','b@x.cz','{"full_name":"Bob","workspace_name":"Firma B"}');
-- server (service role / postgres) vytvoří klienta, kód a token
insert into oauth_clients(client_id, client_name, redirect_uris) values ('cid1','Claude', array['https://claude.ai/api/mcp/auth_callback']);
do $$ begin insert into oauth_clients(client_id, client_name, redirect_uris) values ('x','x', array[]::text[]); raise exception 'MELO SELHAT'; exception when check_violation then raise notice 'OK: klient bez redirect URI odmítnut'; end $$;
insert into oauth_codes(code_hash, client_id, user_id, workspace_id, redirect_uri, code_challenge, scopes, expires_at)
  select repeat('a',64),'cid1',id,workspace_id,'https://claude.ai/api/mcp/auth_callback','chal',array['read'], now()+interval '10 min' from profiles where id='11111111-1111-1111-1111-111111111111';
insert into oauth_tokens(client_id,user_id,workspace_id,scopes,access_hash,refresh_hash,access_expires_at,refresh_expires_at)
  select 'cid1',id,workspace_id,array['read','write'],repeat('b',64),repeat('c',64),now()+interval '1 hour',now()+interval '30 days' from profiles where id='11111111-1111-1111-1111-111111111111';
insert into oauth_tokens(client_id,user_id,workspace_id,scopes,access_hash,refresh_hash,access_expires_at,refresh_expires_at)
  select 'cid1',id,workspace_id,array['read'],repeat('d',64),repeat('e',64),now()+interval '1 hour',now()+interval '30 days' from profiles where id='22222222-2222-2222-2222-222222222222';
do $$ begin insert into oauth_tokens(client_id,user_id,workspace_id,scopes,access_hash,refresh_hash,access_expires_at,refresh_expires_at) select 'cid1',id,workspace_id,array['admin'],repeat('f',64),repeat('9',64),now(),now() from profiles limit 1; raise exception 'MELO SELHAT'; exception when check_violation then raise notice 'OK: neznámý scope odmítnut'; end $$;
do $$ begin insert into oauth_tokens(client_id,user_id,workspace_id,scopes,access_hash,refresh_hash,access_expires_at,refresh_expires_at) select 'cid1',id,workspace_id,array['read'],repeat('b',64),repeat('8',64),now(),now() from profiles limit 1; raise exception 'MELO SELHAT'; exception when unique_violation then raise notice 'OK: duplicitní otisk tokenu odmítnut'; end $$;

set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select '1) Alice vidí jen své přístupy a klienty' as test;
select count(*) as moje_pristupy from oauth_tokens; select client_name from oauth_clients;
do $$ begin perform access_hash from oauth_tokens; raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: otisky tokenů klient nevidí'; end $$;
do $$ begin perform 1 from oauth_codes; raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: autorizační kódy klient nevidí'; end $$;
do $$ begin insert into oauth_tokens(client_id,user_id,workspace_id,scopes,access_hash,refresh_hash,access_expires_at,refresh_expires_at) select 'cid1',id,workspace_id,array['read'],repeat('7',64),repeat('6',64),now(),now() from profiles limit 1; raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: token si klient nevyrobí'; end $$;
do $$ begin insert into oauth_clients(client_id,client_name,redirect_uris) values ('evil','Evil',array['https://evil.example']); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: klienta si uživatel neregistruje (jen server)'; end $$;
do $$ begin update oauth_tokens set scopes = array['read','write']; raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: scopes nejdou měnit'; end $$;
select '2) odvolání a mazání jen vlastních' as test;
update oauth_tokens set revoked_at = now(); select count(*) filter (where revoked_at is not null) as odvolano from oauth_tokens;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select count(*) as bob_vidi from oauth_tokens; select count(*) filter (where revoked_at is not null) as bobuv_odvolan from oauth_tokens;
delete from oauth_tokens where user_id='11111111-1111-1111-1111-111111111111'; reset role;
select count(*) as pristupy_po_pokusu_o_cizi_delete from oauth_tokens;
set role anon; do $$ begin perform 1 from oauth_tokens; raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: anon nemá přístup'; end $$;
reset role;
select '3) kaskáda: smazání klienta smaže kódy i tokeny' as test;
delete from oauth_clients where client_id='cid1'; select (select count(*) from oauth_codes) as kody, (select count(*) from oauth_tokens) as tokeny;
