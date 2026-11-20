-- Dodání vyhraných dealů: „pracuje se na tom“ / „běží (předplatné)“ / „dodáno“.
alter table public.deals
  add column delivery_status text check (delivery_status in ('in_progress', 'ongoing', 'done')),
  add column delivery_ends_on date,
  add column delivered_at timestamptz;

-- dosavadní výhry považujeme za dodané
update public.deals set delivery_status = 'done', delivered_at = coalesce(won_at, now()) where status = 'won';

alter table public.deals add constraint deals_delivery_only_when_won
  check (delivery_status is null or status = 'won');

create index deals_delivery_idx on public.deals (workspace_id, delivery_status) where delivery_status is not null;

create or replace function public.deals_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.stage_id is distinct from old.stage_id then
      new.stage_changed_at := now();
    end if;
    if new.status is distinct from old.status then
      if new.status = 'won' then
        new.won_at := now(); new.lost_at := null; new.lost_reason := null;
        new.delivery_status := coalesce(new.delivery_status, 'in_progress');
      elsif new.status = 'lost' then
        new.lost_at := now(); new.won_at := null;
        new.delivery_status := null;
      else  -- znovu otevřeno
        new.won_at := null; new.lost_at := null; new.lost_reason := null;
        new.delivery_status := null;
      end if;
    end if;
  else
    if new.status = 'won' and new.won_at is null then new.won_at := now(); end if;
    if new.status = 'won' then new.delivery_status := coalesce(new.delivery_status, 'in_progress'); end if;
    if new.status = 'lost' and new.lost_at is null then new.lost_at := now(); end if;
  end if;
  -- dodání: jen u vyhraného dealu; datum konce jen u předplatného; delivered_at hlídá stav „dodáno“
  if new.status <> 'won' then new.delivery_status := null; end if;
  if new.delivery_status is distinct from 'ongoing' then new.delivery_ends_on := null; end if;
  if new.delivery_status = 'done' then
    if new.delivered_at is null then new.delivered_at := now(); end if;
  else
    new.delivered_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.deals_log_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.deal_history (deal_id, field, old_value, new_value, changed_by)
    values (new.id, 'created', null, new.title, uid);
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    insert into public.deal_history (deal_id, field, old_value, new_value, changed_by)
    values (
      new.id, 'stage_id',
      (select s.name from public.stages s where s.id = old.stage_id),
      (select s.name from public.stages s where s.id = new.stage_id),
      uid
    );
  end if;

  if new.value is distinct from old.value then
    insert into public.deal_history (deal_id, field, old_value, new_value, changed_by)
    values (new.id, 'value', old.value::text, new.value::text, uid);
  end if;

  if new.owner_id is distinct from old.owner_id then
    insert into public.deal_history (deal_id, field, old_value, new_value, changed_by)
    values (
      new.id, 'owner_id',
      (select p.full_name from public.profiles p where p.id = old.owner_id),
      (select p.full_name from public.profiles p where p.id = new.owner_id),
      uid
    );
  end if;

  if new.status is distinct from old.status then
    insert into public.deal_history (deal_id, field, old_value, new_value, changed_by)
    values (new.id, 'status', old.status, new.status, uid);
  end if;

  if new.lost_reason is distinct from old.lost_reason and new.lost_reason is not null then
    insert into public.deal_history (deal_id, field, old_value, new_value, changed_by)
    values (new.id, 'lost_reason', old.lost_reason, new.lost_reason, uid);
  end if;

  if new.delivery_status is distinct from old.delivery_status and (new.status = old.status or new.delivery_status is not null) then
    insert into public.deal_history (deal_id, field, old_value, new_value, changed_by)
    values (new.id, 'delivery_status', old.delivery_status, new.delivery_status, uid);
  end if;

  return new;
end;
$$;
