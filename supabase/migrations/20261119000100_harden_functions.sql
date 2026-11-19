-- Zpřísnění po kontrole Supabase advisors
alter function public.deals_before_write()      set search_path = '';
alter function public.activities_before_write() set search_path = '';

-- RLS helpery potřebuje jen přihlášený uživatel
revoke execute on function public.current_workspace_id() from public, anon;
revoke execute on function public.is_workspace_admin()   from public, anon;
