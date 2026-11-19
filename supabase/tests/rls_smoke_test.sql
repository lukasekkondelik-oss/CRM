\set ON_ERROR_STOP on
\pset pager off
-- dva uživatelé -> dva workspace
insert into auth.users (id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','a@x.cz','{"full_name":"Alice","workspace_name":"Firma A"}'),
 ('22222222-2222-2222-2222-222222222222','b@x.cz','{"full_name":"Bob","workspace_name":"Firma B"}');
select '1) workspaces+profily' as test; select w.name, p.full_name, p.role from workspaces w join profiles p on p.workspace_id=w.id order by 1;
select '2) stages Firma A' as test; select s.name, s.probability, s.rotting_days from stages s join pipelines p on p.id=s.pipeline_id join workspaces w on w.id=p.workspace_id where w.name='Firma A' order by s.position;

-- jako Alice
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select '3) Alice vidí jen svůj workspace' as test; select count(*) as ws_visible from workspaces; select count(*) as profiles_visible from profiles;
insert into persons(first_name,last_name) values ('Jan','Novák');
insert into organizations(name) values ('ACME');
insert into deals (pipeline_id, stage_id, title, value, owner_id, person_id)
  select p.id, s.id, 'Deal 1', 50000, auth.uid(), (select id from persons limit 1) from pipelines p join stages s on s.pipeline_id=p.id where s.position=0;
update deals set stage_id=(select s.id from stages s join deals d on d.pipeline_id=s.pipeline_id where s.position=2 limit 1), value=75000;
update deals set status='lost', lost_reason='Cena';
update deals set status='open';
select '4) historie dealu' as test; select field, old_value, new_value from deal_history order by changed_at, field;
select '5) stav' as test; select status, won_at is null as won_null, lost_at is null as lost_null, lost_reason from deals;
insert into activities(subject,type,deal_id,assigned_to,due_date) select 'Zavolat','call',id,auth.uid(),current_date from deals;
update activities set done=true; select '6) done_at' as test; select done, done_at is not null as has_done_at from activities;

-- Alice se pokusí o eskalaci
select '7) eskalace role' as test;
do $$ begin update profiles set role='admin' where id=auth.uid(); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: role update zamítnut'; end $$;
do $$ begin update profiles set workspace_id='00000000-0000-0000-0000-000000000000' where id=auth.uid(); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: workspace update zamítnut'; end $$;
do $$ begin insert into deal_history(deal_id,field) select id,'x' from deals; raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: zápis historie zamítnut'; end $$;
update profiles set full_name='Alice N.' where id=auth.uid();

-- Bob: izolace
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select '8) Bob nevidí data Alice' as test;
select (select count(*) from deals) deals, (select count(*) from persons) persons, (select count(*) from deal_history) hist, (select count(*) from activities) acts, (select count(*) from workspaces) ws;
-- Bob se pokusí odkázat na cizí (Alicin) person/pipeline/stage
reset role;
create table zz_ids as select (select id from persons limit 1) person_a, (select pipeline_id from stages limit 1) pipe_a, (select id from stages limit 1) stage_a;
set role authenticated; select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select '9) cross-tenant reference' as test;
do $$ declare r record; begin
  select * into r from zz_ids;
  begin insert into notes(content, person_id) values ('x', r.person_a); raise exception 'MELO SELHAT';
  exception when foreign_key_violation then raise notice 'OK: note -> cizi person zamitnuto'; end;
  begin insert into deals(pipeline_id,stage_id,title) values (r.pipe_a, r.stage_a, 'hack'); raise exception 'MELO SELHAT';
  exception when foreign_key_violation or insufficient_privilege or check_violation then raise notice 'OK: deal -> cizi pipeline zamitnut (%)', sqlstate; end;
end $$;
select '10) insert bez workspace_id dostane default' as test; insert into labels(name) values ('VIP') returning workspace_id is not null as has_ws;
reset role;
-- ne-admin člen: přidáme profil do workspace A jako member
insert into auth.users(id,email) values ('33333333-3333-3333-3333-333333333333','c@x.cz');
delete from profiles where id='33333333-3333-3333-3333-333333333333'; -- (vznikl vlastní WS z triggeru)
insert into profiles(id, workspace_id, full_name, role) select '33333333-3333-3333-3333-333333333333', workspace_id, 'Carl', 'member' from profiles where id='11111111-1111-1111-1111-111111111111';
set role authenticated; select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select '11) member nesmí spravovat pipelines' as test;
do $$ begin insert into pipelines(name) values ('X'); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK (privilege)'; when others then raise notice 'OK: %', sqlerrm; end $$;
update stages set probability=99; select count(*) filter (where probability=99) as zmeneno from stages;
update workspaces set name='hack'; select name from workspaces;
select count(*) as member_vidi_dealy from deals;
reset role;
-- ensure_workspace pro uživatele bez profilu (trigger vypnut)
alter table auth.users disable trigger on_auth_user_created;
insert into auth.users(id,email,raw_user_meta_data) values ('44444444-4444-4444-4444-444444444444','d@x.cz','{"full_name":"Dana"}');
alter table auth.users enable trigger on_auth_user_created;
set role authenticated; select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
select '12) ensure_workspace' as test; select public.ensure_workspace('Dana s.r.o.') is not null as created; select public.ensure_workspace('x') = (select workspace_id from profiles where id=auth.uid()) as idempotent;
do $$ begin perform public.bootstrap_workspace(auth.uid(),'x','x','x'); raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: bootstrap_workspace nevolatelný'; end $$;
reset role;
-- mazání: smazání workspace kaskáduje
select '13) delete workspace cascade' as test;
delete from workspaces where name='Firma A'; select count(*) as zbyva_dealu from deals;
