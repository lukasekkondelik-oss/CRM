-- ==============================================================================
-- Vlož celý tento soubor do Supabase → SQL Editor a spusť (jednou).
-- Obsahuje: (1) Fáze 6 – pozvánky, správa členů, rychlé hledání; (2) API klíče; (3) OAuth pro claude.ai.
-- Je to jen složení souborů z supabase/migrations (stejný obsah, správné pořadí).
-- ==============================================================================

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


-- =====================================================================
-- API klíče (REST API a MCP). V DB je jen SHA-256 otisk, celý klíč se zobrazí jednou při vytvoření.
-- Klíč jedná jménem svého uživatele; server ho ověřuje přes service role a vždy omezuje na workspace.
-- =====================================================================

create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null default public.current_workspace_id()
                references public.workspaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name          text not null check (btrim(name) <> ''),
  key_prefix    text not null,                         -- začátek klíče pro rozpoznání v seznamu
  key_hash      text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes        text[] not null default array['read', 'write']
                check (cardinality(scopes) > 0 and scopes <@ array['read', 'write']),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz
);
create index api_keys_user_idx on public.api_keys (user_id);
create index api_keys_workspace_idx on public.api_keys (workspace_id);

alter table public.api_keys enable row level security;

-- každý vidí a spravuje jen své klíče ve svém workspace
create policy api_keys_select on public.api_keys for select to authenticated
  using (user_id = (select auth.uid()) and workspace_id = (select public.current_workspace_id()));
create policy api_keys_insert on public.api_keys for insert to authenticated
  with check (user_id = (select auth.uid()) and workspace_id = (select public.current_workspace_id()));
create policy api_keys_update on public.api_keys for update to authenticated
  using (user_id = (select auth.uid()) and workspace_id = (select public.current_workspace_id()))
  with check (user_id = (select auth.uid()) and workspace_id = (select public.current_workspace_id()));
create policy api_keys_delete on public.api_keys for delete to authenticated
  using (user_id = (select auth.uid()) and workspace_id = (select public.current_workspace_id()));

-- klient smí klíč vytvořit a přejmenovat/odvolat, ale nesmí měnit otisk, oprávnění ani časy použití
revoke all on public.api_keys from anon;
revoke insert, update on public.api_keys from authenticated;
grant insert (name, key_prefix, key_hash, scopes, expires_at) on public.api_keys to authenticated;
grant update (name, revoked_at) on public.api_keys to authenticated;


-- =====================================================================
-- OAuth 2.1 pro MCP konektory (claude.ai a další): klienti (dynamická registrace), autorizační kódy, tokeny.
-- V DB jsou jen SHA-256 otisky kódů a tokenů. Zapisuje výhradně server (service role); uživatel vidí a odvolává své přístupy.
-- =====================================================================

create table public.oauth_clients (
  client_id      text primary key,
  client_name    text not null check (char_length(client_name) between 1 and 100),
  redirect_uris  text[] not null check (cardinality(redirect_uris) between 1 and 5),
  created_at     timestamptz not null default now()
);

create table public.oauth_codes (
  code_hash       text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  client_id       text not null references public.oauth_clients (client_id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  redirect_uri    text not null,
  code_challenge  text not null,
  scopes          text[] not null check (cardinality(scopes) > 0 and scopes <@ array['read', 'write']),
  resource        text,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index oauth_codes_expires_idx on public.oauth_codes (expires_at);

create table public.oauth_tokens (
  id                 uuid primary key default gen_random_uuid(),
  client_id          text not null references public.oauth_clients (client_id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  scopes             text[] not null check (cardinality(scopes) > 0 and scopes <@ array['read', 'write']),
  resource           text,
  access_hash        text not null unique check (access_hash ~ '^[0-9a-f]{64}$'),
  refresh_hash       text not null unique check (refresh_hash ~ '^[0-9a-f]{64}$'),
  prev_refresh_hash  text,                        -- pro detekci znovupoužití starého refresh tokenu
  access_expires_at  timestamptz not null,
  refresh_expires_at timestamptz not null,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz,
  revoked_at         timestamptz
);
create index oauth_tokens_user_idx on public.oauth_tokens (user_id);
create index oauth_tokens_client_idx on public.oauth_tokens (client_id);

alter table public.oauth_clients enable row level security;
alter table public.oauth_codes   enable row level security;
alter table public.oauth_tokens  enable row level security;

-- Název a redirect URI klienta nejsou tajné (zobrazují se při souhlasu)
create policy oauth_clients_select on public.oauth_clients for select to authenticated using (true);

-- Uživatel vidí, odvolává a maže jen své přístupy (otisky tokenů nevidí)
create policy oauth_tokens_select on public.oauth_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy oauth_tokens_update on public.oauth_tokens for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy oauth_tokens_delete on public.oauth_tokens for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.oauth_clients, public.oauth_codes, public.oauth_tokens from anon, authenticated;
grant select on public.oauth_clients to authenticated;
grant select (id, client_id, user_id, workspace_id, scopes, resource, access_expires_at, refresh_expires_at, created_at, last_used_at, revoked_at)
  on public.oauth_tokens to authenticated;
grant update (revoked_at) on public.oauth_tokens to authenticated;
grant delete on public.oauth_tokens to authenticated;




-- ===== person_web =====
alter table public.persons add column if not exists web text;
