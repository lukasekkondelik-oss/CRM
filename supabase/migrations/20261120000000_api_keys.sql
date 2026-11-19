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
