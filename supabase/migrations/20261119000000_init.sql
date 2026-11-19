-- =====================================================================
-- CRM – Fáze 1: schéma, RLS, triggery, onboarding workspace
-- Vyžaduje Supabase (schéma `auth`, role anon/authenticated, auth.uid()).
-- Postgres 15+ (ON DELETE SET NULL (sloupec)).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pomocné funkce pro RLS (plpgsql => tělo se neváliduje před vznikem tabulek)
-- ---------------------------------------------------------------------

create function public.current_workspace_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (select p.workspace_id from public.profiles p where p.id = auth.uid());
end;
$$;

create function public.is_workspace_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Tabulky
-- Cizí klíče na workspace_id jsou složené: záznam nikdy nemůže odkazovat
-- na řádek z jiného workspace (obrana do hloubky vedle RLS).
-- ---------------------------------------------------------------------

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  full_name     text not null default '',
  email         text,
  role          text not null default 'member' check (role in ('admin', 'member')),
  avatar_url    text,
  created_at    timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.pipelines (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null default public.current_workspace_id()
                references public.workspaces (id) on delete cascade,
  name          text not null check (btrim(name) <> ''),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.stages (
  id            uuid primary key default gen_random_uuid(),
  pipeline_id   uuid not null references public.pipelines (id) on delete cascade,
  name          text not null check (btrim(name) <> ''),
  position      integer not null default 0,
  probability   integer not null default 0 check (probability between 0 and 100),
  rotting_days  integer check (rotting_days is null or rotting_days > 0),
  created_at    timestamptz not null default now(),
  unique (pipeline_id, id)
);

create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null default public.current_workspace_id()
                references public.workspaces (id) on delete cascade,
  name          text not null check (btrim(name) <> ''),
  ico           text,
  web           text,
  address       text,
  owner_id      uuid,
  created_at    timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, owner_id) references public.profiles (workspace_id, id)
    on delete set null (owner_id)
);

create table public.persons (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null default public.current_workspace_id()
                   references public.workspaces (id) on delete cascade,
  organization_id  uuid,
  first_name       text not null default '',
  last_name        text not null default '',
  email            text,
  phone            text,
  position         text,
  owner_id         uuid,
  created_at       timestamptz not null default now(),
  check (btrim(first_name || last_name) <> ''),
  unique (workspace_id, id),
  foreign key (workspace_id, organization_id) references public.organizations (workspace_id, id)
    on delete set null (organization_id),
  foreign key (workspace_id, owner_id) references public.profiles (workspace_id, id)
    on delete set null (owner_id)
);

create table public.deals (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null default public.current_workspace_id()
                       references public.workspaces (id) on delete cascade,
  pipeline_id          uuid not null,
  stage_id             uuid not null,
  title                text not null check (btrim(title) <> ''),
  value                numeric(14, 2) not null default 0 check (value >= 0),
  currency             text not null default 'CZK',
  person_id            uuid,
  organization_id      uuid,
  owner_id             uuid,
  expected_close_date  date,
  status               text not null default 'open' check (status in ('open', 'won', 'lost')),
  lost_reason          text,
  won_at               timestamptz,
  lost_at              timestamptz,
  stage_changed_at     timestamptz not null default now(),
  position             double precision not null default 0,  -- zlomkové řazení uvnitř sloupce
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, pipeline_id) references public.pipelines (workspace_id, id),
  foreign key (pipeline_id, stage_id) references public.stages (pipeline_id, id),
  foreign key (workspace_id, person_id) references public.persons (workspace_id, id)
    on delete set null (person_id),
  foreign key (workspace_id, organization_id) references public.organizations (workspace_id, id)
    on delete set null (organization_id),
  foreign key (workspace_id, owner_id) references public.profiles (workspace_id, id)
    on delete set null (owner_id)
);

create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null default public.current_workspace_id()
                   references public.workspaces (id) on delete cascade,
  type             text not null default 'task'
                   check (type in ('call', 'meeting', 'task', 'email', 'deadline')),
  subject          text not null check (btrim(subject) <> ''),
  note             text,
  due_date         date,
  due_time         time,
  duration_min     integer check (duration_min is null or duration_min > 0),
  done             boolean not null default false,
  done_at          timestamptz,
  deal_id          uuid,
  person_id        uuid,
  organization_id  uuid,
  assigned_to      uuid,
  created_at       timestamptz not null default now(),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id)
    on delete cascade,
  foreign key (workspace_id, person_id) references public.persons (workspace_id, id)
    on delete set null (person_id),
  foreign key (workspace_id, organization_id) references public.organizations (workspace_id, id)
    on delete set null (organization_id),
  foreign key (workspace_id, assigned_to) references public.profiles (workspace_id, id)
    on delete set null (assigned_to)
);

create table public.notes (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null default public.current_workspace_id()
                   references public.workspaces (id) on delete cascade,
  content          text not null check (btrim(content) <> ''),
  deal_id          uuid,
  person_id        uuid,
  organization_id  uuid,
  author_id        uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id)
    on delete cascade,
  foreign key (workspace_id, person_id) references public.persons (workspace_id, id)
    on delete cascade,
  foreign key (workspace_id, organization_id) references public.organizations (workspace_id, id)
    on delete cascade,
  foreign key (workspace_id, author_id) references public.profiles (workspace_id, id)
    on delete set null (author_id)
);

create table public.labels (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null default public.current_workspace_id()
                references public.workspaces (id) on delete cascade,
  name          text not null check (btrim(name) <> ''),
  color         text not null default '#6366f1',
  unique (workspace_id, id),
  unique (workspace_id, name)
);

create table public.deal_labels (
  deal_id   uuid not null references public.deals (id) on delete cascade,
  label_id  uuid not null references public.labels (id) on delete cascade,
  primary key (deal_id, label_id)
);

create table public.deal_history (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id) on delete cascade,
  field       text not null,   -- created | stage_id | value | owner_id | status | lost_reason
  old_value   text,            -- u stage_id / owner_id čitelný název (ne UUID)
  new_value   text,
  changed_by  uuid references public.profiles (id) on delete set null,
  changed_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Indexy
-- ---------------------------------------------------------------------

create index profiles_workspace_idx       on public.profiles (workspace_id);
create index pipelines_workspace_idx      on public.pipelines (workspace_id, position);
create index stages_pipeline_idx          on public.stages (pipeline_id, position);

create index organizations_workspace_idx  on public.organizations (workspace_id);
create index organizations_owner_idx      on public.organizations (owner_id);

create index persons_workspace_idx        on public.persons (workspace_id);
create index persons_organization_idx     on public.persons (organization_id);
create index persons_owner_idx            on public.persons (owner_id);

create index deals_workspace_idx          on public.deals (workspace_id);
create index deals_stage_idx              on public.deals (stage_id, position);
create index deals_pipeline_idx           on public.deals (pipeline_id);
create index deals_owner_idx              on public.deals (owner_id);
create index deals_person_idx             on public.deals (person_id);
create index deals_organization_idx       on public.deals (organization_id);
create index deals_status_idx             on public.deals (workspace_id, status);

create index activities_workspace_idx     on public.activities (workspace_id);
create index activities_deal_idx          on public.activities (deal_id);
create index activities_due_date_idx      on public.activities (due_date);
create index activities_assignee_open_idx on public.activities (assigned_to, due_date) where not done;
create index activities_deal_open_idx     on public.activities (deal_id, due_date) where not done;
create index activities_person_idx        on public.activities (person_id);
create index activities_organization_idx  on public.activities (organization_id);

create index notes_workspace_idx          on public.notes (workspace_id);
create index notes_deal_idx               on public.notes (deal_id);
create index notes_person_idx             on public.notes (person_id);
create index notes_organization_idx       on public.notes (organization_id);

create index labels_workspace_idx         on public.labels (workspace_id);
create index deal_labels_label_idx        on public.deal_labels (label_id);
create index deal_history_deal_idx        on public.deal_history (deal_id, changed_at desc);

-- ---------------------------------------------------------------------
-- Triggery: deals (časová razítka, stav won/lost, deal_history)
-- ---------------------------------------------------------------------

create function public.deals_before_write()
returns trigger
language plpgsql
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
      elsif new.status = 'lost' then
        new.lost_at := now(); new.won_at := null;
      else  -- znovu otevřeno
        new.won_at := null; new.lost_at := null; new.lost_reason := null;
      end if;
    end if;
  else
    if new.status = 'won' and new.won_at is null then new.won_at := now(); end if;
    if new.status = 'lost' and new.lost_at is null then new.lost_at := now(); end if;
  end if;
  return new;
end;
$$;

create trigger deals_before_write
  before insert or update on public.deals
  for each row execute function public.deals_before_write();

create function public.deals_log_history()
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

  return new;
end;
$$;

create trigger deals_log_history
  after insert or update on public.deals
  for each row execute function public.deals_log_history();

-- Aktivita: done_at se plní automaticky
create function public.activities_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.done then
    if new.done_at is null then new.done_at := now(); end if;
  else
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger activities_before_write
  before insert or update on public.activities
  for each row execute function public.activities_before_write();

-- ---------------------------------------------------------------------
-- Onboarding: workspace + profil + výchozí pipeline
-- ---------------------------------------------------------------------

create function public.bootstrap_workspace(
  p_user_id         uuid,
  p_email           text,
  p_full_name       text,
  p_workspace_name  text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
  pl_id uuid;
begin
  insert into public.workspaces (name)
  values (coalesce(nullif(btrim(p_workspace_name), ''), 'Moje firma'))
  returning id into ws_id;

  insert into public.profiles (id, workspace_id, full_name, email, role)
  values (
    p_user_id, ws_id,
    coalesce(nullif(btrim(p_full_name), ''), split_part(coalesce(p_email, ''), '@', 1)),
    p_email, 'admin'
  );

  insert into public.pipelines (workspace_id, name, position)
  values (ws_id, 'Prodej', 0)
  returning id into pl_id;

  insert into public.stages (pipeline_id, name, position, probability, rotting_days) values
    (pl_id, 'Lead',               0, 10, 14),
    (pl_id, 'Kontaktován',        1, 20, 14),
    (pl_id, 'Schůzka domluvena',  2, 40, 14),
    (pl_id, 'Nabídka odeslána',   3, 60, 21),
    (pl_id, 'Vyjednávání',        4, 80, 30);

  return ws_id;
end;
$$;

-- Trigger na registraci (jméno a název workspace jdou přes user metadata)
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bootstrap_workspace(
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'workspace_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Záchranná cesta pro uživatele bez profilu (např. vytvoření přes Supabase dashboard)
create function public.ensure_workspace(p_workspace_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  u       auth.users%rowtype;
  ws_id   uuid;
begin
  if uid is null then
    raise exception 'Nepřihlášený uživatel' using errcode = '28000';
  end if;

  select workspace_id into ws_id from public.profiles where id = uid;
  if ws_id is not null then
    return ws_id;
  end if;

  select * into u from auth.users where id = uid;
  return public.bootstrap_workspace(
    uid, u.email, u.raw_user_meta_data ->> 'full_name', p_workspace_name
  );
end;
$$;

-- Tyto funkce nesmí volat nikdo zvenku kromě ensure_workspace
revoke all on function public.bootstrap_workspace(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.deals_log_history() from public, anon, authenticated;
revoke all on function public.ensure_workspace(text) from public, anon;
grant execute on function public.ensure_workspace(text) to authenticated;
grant execute on function public.current_workspace_id() to authenticated;
grant execute on function public.is_workspace_admin() to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.workspaces     enable row level security;
alter table public.profiles       enable row level security;
alter table public.pipelines      enable row level security;
alter table public.stages         enable row level security;
alter table public.organizations  enable row level security;
alter table public.persons        enable row level security;
alter table public.deals          enable row level security;
alter table public.activities     enable row level security;
alter table public.notes          enable row level security;
alter table public.labels         enable row level security;
alter table public.deal_labels    enable row level security;
alter table public.deal_history   enable row level security;

-- workspaces: člen čte, admin mění; vytváří se jen přes bootstrap_workspace
create policy workspaces_select on public.workspaces for select to authenticated
  using (id = (select public.current_workspace_id()));
create policy workspaces_update on public.workspaces for update to authenticated
  using (id = (select public.current_workspace_id()) and (select public.is_workspace_admin()))
  with check (id = (select public.current_workspace_id()) and (select public.is_workspace_admin()));

-- profiles: vidím kolegy z workspace, upravuji jen sebe (a jen jméno/avatar – viz GRANT níže)
create policy profiles_select on public.profiles for select to authenticated
  using (workspace_id = (select public.current_workspace_id()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and workspace_id = (select public.current_workspace_id()));

-- pipelines / stages: čtou všichni členové, spravuje admin
create policy pipelines_select on public.pipelines for select to authenticated
  using (workspace_id = (select public.current_workspace_id()));
create policy pipelines_insert on public.pipelines for insert to authenticated
  with check (workspace_id = (select public.current_workspace_id()) and (select public.is_workspace_admin()));
create policy pipelines_update on public.pipelines for update to authenticated
  using (workspace_id = (select public.current_workspace_id()) and (select public.is_workspace_admin()))
  with check (workspace_id = (select public.current_workspace_id()) and (select public.is_workspace_admin()));
create policy pipelines_delete on public.pipelines for delete to authenticated
  using (workspace_id = (select public.current_workspace_id()) and (select public.is_workspace_admin()));

create policy stages_select on public.stages for select to authenticated
  using (exists (
    select 1 from public.pipelines p
    where p.id = stages.pipeline_id and p.workspace_id = (select public.current_workspace_id())
  ));
create policy stages_insert on public.stages for insert to authenticated
  with check ((select public.is_workspace_admin()) and exists (
    select 1 from public.pipelines p
    where p.id = stages.pipeline_id and p.workspace_id = (select public.current_workspace_id())
  ));
create policy stages_update on public.stages for update to authenticated
  using ((select public.is_workspace_admin()) and exists (
    select 1 from public.pipelines p
    where p.id = stages.pipeline_id and p.workspace_id = (select public.current_workspace_id())
  ))
  with check ((select public.is_workspace_admin()) and exists (
    select 1 from public.pipelines p
    where p.id = stages.pipeline_id and p.workspace_id = (select public.current_workspace_id())
  ));
create policy stages_delete on public.stages for delete to authenticated
  using ((select public.is_workspace_admin()) and exists (
    select 1 from public.pipelines p
    where p.id = stages.pipeline_id and p.workspace_id = (select public.current_workspace_id())
  ));

-- Datové tabulky: každý člen workspace čte i píše
do $$
declare
  t text;
begin
  foreach t in array array['organizations', 'persons', 'deals', 'activities', 'notes', 'labels']
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (workspace_id = (select public.current_workspace_id()))
         with check (workspace_id = (select public.current_workspace_id()))',
      t || '_workspace', t
    );
  end loop;
end;
$$;

-- deal_labels: přes dealy a štítky vlastního workspace
create policy deal_labels_workspace on public.deal_labels for all to authenticated
  using (exists (
    select 1 from public.deals d
    where d.id = deal_labels.deal_id and d.workspace_id = (select public.current_workspace_id())
  ))
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_labels.deal_id and d.workspace_id = (select public.current_workspace_id())
    )
    and exists (
      select 1 from public.labels l
      where l.id = deal_labels.label_id and l.workspace_id = (select public.current_workspace_id())
    )
  );

-- deal_history: jen čtení; zapisuje výhradně trigger
create policy deal_history_select on public.deal_history for select to authenticated
  using (exists (
    select 1 from public.deals d
    where d.id = deal_history.deal_id and d.workspace_id = (select public.current_workspace_id())
  ));

-- ---------------------------------------------------------------------
-- Oprávnění na úrovni sloupců/tabulek (vedle RLS)
-- ---------------------------------------------------------------------

revoke all on all tables in schema public from anon;

-- profil si uživatel nemůže změnit roli ani workspace; vkládání/mazání jen přes funkce
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

revoke insert, update, delete on public.workspaces from authenticated;
grant update (name) on public.workspaces to authenticated;

revoke insert, update, delete on public.deal_history from authenticated;
