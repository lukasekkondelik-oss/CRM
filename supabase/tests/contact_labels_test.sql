\set ON_ERROR_STOP on
\pset pager off
insert into auth.users (id,email,raw_user_meta_data) values
 ('a1a1a1a1-0000-0000-0000-000000000001','la@x.cz','{"full_name":"LA","workspace_name":"Labels A"}'),
 ('b2b2b2b2-0000-0000-0000-000000000002','lb@x.cz','{"full_name":"LB","workspace_name":"Labels B"}');
set role authenticated; select set_config('request.jwt.claim.sub','a1a1a1a1-0000-0000-0000-000000000001',false);
insert into labels(name,color) values ('VIP','#ef4444');
insert into persons(first_name,last_name) values ('Jan','Štítkový');
insert into organizations(name) values ('Štítková s.r.o.');
select '1) štítek na osobu a firmu' as test;
insert into person_labels select p.id, l.id from persons p, labels l where p.last_name='Štítkový' and l.name='VIP';
insert into organization_labels select o.id, l.id from organizations o, labels l where o.name='Štítková s.r.o.' and l.name='VIP';
select (select count(*) from person_labels) as osoby, (select count(*) from organization_labels) as firmy;
do $$ begin insert into person_labels select p.id, l.id from persons p, labels l where p.last_name='Štítkový' and l.name='VIP'; raise exception 'MELO SELHAT'; exception when unique_violation then raise notice 'OK: duplicita odmítnuta'; end $$;
select set_config('request.jwt.claim.sub','b2b2b2b2-0000-0000-0000-000000000002',false);
select '2) cizí workspace nic nevidí' as test;
select (select count(*) from person_labels) as b_vidi_osoby, (select count(*) from organization_labels) as b_vidi_firmy;
insert into persons(first_name,last_name) values ('Bob','Vlastní');
insert into labels(name,color) values ('B-štítek','#0ea5e9');
reset role;
select id as a_person from persons where last_name='Štítkový' \gset
select id as a_label from labels where name='VIP' \gset
select id as b_person from persons where last_name='Vlastní' \gset
select id as b_label from labels where name='B-štítek' \gset
set role authenticated; select set_config('request.jwt.claim.sub','b2b2b2b2-0000-0000-0000-000000000002',false);
select '3) B nemůže tagovat cizí osobu ani použít cizí štítek' as test;
\set ON_ERROR_STOP off
-- obě následující vložení MUSÍ skončit chybou row-level security (očekávané ERROR řádky)
insert into person_labels values (:'a_person', :'a_label');
insert into person_labels values (:'b_person', :'a_label');
\set ON_ERROR_STOP on
insert into person_labels values (:'b_person', :'b_label');
select count(*) as b_ma_vlastni from person_labels;
delete from person_labels where person_id = :'a_person';
reset role;
select count(*) as a_vazba_prezila from person_labels where person_id = :'a_person';
select '4) smazání osoby smaže vazbu' as test;
delete from persons where last_name='Štítkový'; select count(*) as vazeb_po_smazani from person_labels where person_id = :'a_person';
set role anon; do $$ begin perform 1 from person_labels; raise exception 'MELO SELHAT'; exception when insufficient_privilege then raise notice 'OK: anon nemá přístup'; end $$;
reset role;
