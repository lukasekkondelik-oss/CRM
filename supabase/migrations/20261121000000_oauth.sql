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
