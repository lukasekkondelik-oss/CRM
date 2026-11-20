\set ON_ERROR_STOP on
\pset pager off
insert into auth.users (id,email,raw_user_meta_data) values
 ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0','cyril@x.cz','{"full_name":"Cyril","workspace_name":"Firma C"}');
set role authenticated; select set_config('request.jwt.claim.sub','d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',false);
create temp table t(id uuid);
insert into deals(pipeline_id, stage_id, title)
  select pl.id, (select st.id from stages st where st.pipeline_id = pl.id order by st.position limit 1), 'Test dodání' from pipelines pl limit 1;
insert into t select id from deals where title = 'Test dodání';
select '1) výhra → pracuje se na tom' as test;
update deals set status='won' where id=(select id from t);
do $$ declare d deals; begin select * into d from deals where title='Test dodání';
  if d.delivery_status <> 'in_progress' or d.delivered_at is not null then raise exception 'MELO SELHAT %', d.delivery_status; end if; raise notice 'OK: po výhře in_progress'; end $$;
select '2) předplatné s datem konce' as test;
update deals set delivery_status='ongoing', delivery_ends_on='2027-11-20' where title='Test dodání';
do $$ declare d deals; begin select * into d from deals where title='Test dodání';
  if d.delivery_status <> 'ongoing' or d.delivery_ends_on is null then raise exception 'MELO SELHAT'; end if; raise notice 'OK: ongoing + datum'; end $$;
select '3) dodáno → delivered_at, konec se smaže' as test;
update deals set delivery_status='done' where title='Test dodání';
do $$ declare d deals; begin select * into d from deals where title='Test dodání';
  if d.delivered_at is null or d.delivery_ends_on is not null then raise exception 'MELO SELHAT'; end if; raise notice 'OK: done'; end $$;
select '4) vrácení z dodáno' as test;
update deals set delivery_status='in_progress' where title='Test dodání';
do $$ declare d deals; begin select * into d from deals where title='Test dodání';
  if d.delivered_at is not null then raise exception 'MELO SELHAT'; end if; raise notice 'OK: delivered_at smazáno'; end $$;
select '5) nelze dodání u nevyhraného dealu' as test;
update deals set status='open' where title='Test dodání';
do $$ declare d deals; begin select * into d from deals where title='Test dodání';
  if d.delivery_status is not null then raise exception 'MELO SELHAT'; end if; raise notice 'OK: znovuotevřením se dodání vynuluje'; end $$;
update deals set delivery_status='done' where title='Test dodání';
do $$ declare d deals; begin select * into d from deals where title='Test dodání';
  if d.delivery_status is not null then raise exception 'MELO SELHAT'; end if; raise notice 'OK: u otevřeného dealu se dodání ignoruje'; end $$;
update deals set status='won' where title='Test dodání';
do $$ begin update deals set delivery_status='nonsense' where title='Test dodání'; raise exception 'MELO SELHAT'; exception when check_violation then raise notice 'OK: neplatný stav odmítnut'; end $$;
select '6) historie' as test;
select field, old_value, new_value from deal_history where deal_id=(select id from t) and field in ('status','delivery_status') order by changed_at, field;
reset role;
