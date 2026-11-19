-- =====================================================================
-- Fáze 6: pozvánky do workspace, správa členů (jen admin), trigramové indexy pro hledání
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rychlé hledání (ilike '%…%') přes pg_trgm
-- ---------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

create index persons_first_name_trgm on public.persons using gin (first_name extensions.gin_trgm_ops);
create index persons_last_name_trgm  on public.persons using gin (last_name extensions.gin_trgm_ops);
create index persons_email_trgm      on public.persons using gin (email extensions.gin_trgm_ops);
create index persons_phone_trgm      on public.persons using gin (phone extensions.gin_trgm_ops);
create index persons_position_trgm   on public.persons using gin (position extensions.gin_trgm_ops);
create index organizations_name_trgm on public.organizations using gin (name extensions.gin_trgm_ops);
create index organizations_ico_trgm  on public.organizations using gin (ico extensions.gin_trgm_ops);
create index organizations_web_trgm  on public.organizations using gin (web extensions.gin_trgm_ops);
create index deals_title_trgm        on public.deals using gin (title extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Pozvánky
-- ---------------------------------------------------------------------
create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null default public.current_workspace_id()
                references public.workspaces (id) on delete cascade,
  email         text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  role          text not null default 'member' check (role in ('admin', 'member')),
  token         uuid not null unique default gen_random_uuid(),
  invited_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '14 days',
  accepted_at   timestamptz
);
create unique index invitations_pending_email_idx on public.invitations (workspace_id, email) where accepted_at is null;
create index invitations_workspace_idx on public.invitations (workspace_id);

alter table public.invitations enable row level security;
create policy invitations_admin on public.invitations for all to authenticated
  using (workspace_id = (select public.current_workspace_id()) and (select public.is_workspace_admin()))
  with check (workspace_id = (select public.current_workspace_id()) and (select public.is_workspace_admin()));

-- Veřejné ověření pozvánky (registrační stránka vidí jen e-mail, roli a název workspace)
create function public.get_invitation(p_token uuid)
returns table (email text, role text, workspace_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.email, i.role, w.name
  from public.invitations i
  join public.workspaces w on w.id = i.workspace_id
  where i.token = p_token and i.accepted_at is null and i.expires_at > now();
$$;
revoke all on function public.get_invitation(uuid) from public;
grant execute on function public.get_invitation(uuid) to anon, authenticated;

-- Registrace: s platnou pozvánkou se uživatel připojí do cizího workspace, jinak vznikne vlastní
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tok uuid;
  inv public.invitations%rowtype;
begin
  begin
    tok := nullif(new.raw_user_meta_data ->> 'invite_token', '')::uuid;
  exception when others then
    tok := null;
  end;

  if tok is not null then
    select * into inv from public.invitations
    where token = tok and accepted_at is null and expires_at > now() and lower(email) = lower(new.email)
    for update;
    if not found then
      raise exception 'Pozvánka je neplatná, vypršela nebo patří jinému e-mailu' using errcode = 'P0001';
    end if;
    insert into public.profiles (id, workspace_id, full_name, email, role)
    values (
      new.id, inv.workspace_id,
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
      new.email, inv.role
    );
    update public.invitations set accepted_at = now() where id = inv.id;
    return new;
  end if;

  perform public.bootstrap_workspace(
    new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'workspace_name'
  );
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Správa členů (jen admin vlastního workspace)
-- ---------------------------------------------------------------------
create function public.set_member_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid := public.current_workspace_id();
  target public.profiles%rowtype;
begin
  if not public.is_workspace_admin() then
    raise exception 'Jen admin může měnit role' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Neplatná role' using errcode = '22023';
  end if;
  select * into target from public.profiles where id = p_user and workspace_id = ws;
  if not found then
    raise exception 'Člen nenalezen' using errcode = 'P0002';
  end if;
  if target.role = 'admin' and p_role = 'member'
     and (select count(*) from public.profiles where workspace_id = ws and role = 'admin') <= 1 then
    raise exception 'Workspace musí mít aspoň jednoho admina' using errcode = 'P0001';
  end if;
  update public.profiles set role = p_role where id = p_user;
end;
$$;

create function public.remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid := public.current_workspace_id();
  target public.profiles%rowtype;
begin
  if not public.is_workspace_admin() then
    raise exception 'Jen admin může odebírat členy' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Sám sebe odebrat nelze' using errcode = 'P0001';
  end if;
  select * into target from public.profiles where id = p_user and workspace_id = ws;
  if not found then
    raise exception 'Člen nenalezen' using errcode = 'P0002';
  end if;
  -- dealy, osoby, firmy i aktivity zůstávají (vlastník se nastaví na null díky FK)
  delete from public.profiles where id = p_user;
end;
$$;

revoke all on function public.set_member_role(uuid, text) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
revoke all on public.invitations from anon;
