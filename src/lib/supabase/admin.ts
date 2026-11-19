import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";

/**
 * Klient se service role – OBCHÁZÍ RLS. Smí se používat výhradně v lib/api (po ověření API klíče)
 * a každý dotaz tam musí být omezený na `workspace_id` klíče.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ApiError(503, "api_not_configured", "API není nakonfigurované: chybí SUPABASE_SERVICE_ROLE_KEY na serveru.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const isAdminConfigured = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
