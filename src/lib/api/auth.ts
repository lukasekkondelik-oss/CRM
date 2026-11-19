import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "./errors";
import { looksLikeApiKey, sha256Hex } from "./key-utils";

export type Scope = "read" | "write";

export interface ApiContext {
  db: SupabaseClient;
  workspaceId: string;
  userId: string;
  keyId: string;
  scopes: Scope[];
}

const LIMIT_PER_MIN = 120;
const hits = new Map<string, { count: number; start: number }>();

/** Jednoduchý okénkový limit na klíč. Na serverless je per instance (ochrana před smyčkou, ne tvrdá kvóta). */
function rateLimit(keyId: string) {
  const now = Date.now();
  const h = hits.get(keyId);
  if (!h || now - h.start > 60_000) { hits.set(keyId, { count: 1, start: now }); return; }
  h.count++;
  if (h.count > LIMIT_PER_MIN) {
    const retry = Math.max(1, Math.ceil((60_000 - (now - h.start)) / 1000));
    throw new ApiError(429, "rate_limited", `Příliš mnoho požadavků (limit ${LIMIT_PER_MIN}/min). Zkus to za ${retry} s.`, undefined, { "Retry-After": String(retry) });
  }
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > 60_000) hits.delete(k);
}

export function bearerToken(req: Request): string | null {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

const unauthorized = (msg = "Chybí nebo je neplatný API klíč. Pošli hlavičku Authorization: Bearer nxd_…") =>
  new ApiError(401, "unauthorized", msg, undefined, { "WWW-Authenticate": 'Bearer realm="nexdeals"' });

/** Ověří klíč (SHA-256 otisk), jeho platnost, příslušnost uživatele k workspace a oprávnění. */
export async function authenticate(req: Request, need: Scope): Promise<ApiContext> {
  const token = bearerToken(req);
  if (!token || !looksLikeApiKey(token)) throw unauthorized();

  const db = createAdminClient();
  const { data: key, error } = await db.from("api_keys").select("id, workspace_id, user_id, scopes, expires_at, revoked_at, last_used_at")
    .eq("key_hash", await sha256Hex(token)).maybeSingle();
  if (error) throw error;
  if (!key || key.revoked_at || (key.expires_at && new Date(key.expires_at) < new Date())) throw unauthorized("API klíč je neplatný, odvolaný nebo vypršel.");

  // uživatel musí být pořád členem workspace klíče (po odebrání z týmu klíč přestane fungovat)
  const { data: profile } = await db.from("profiles").select("id").eq("id", key.user_id).eq("workspace_id", key.workspace_id).maybeSingle();
  if (!profile) throw unauthorized("Vlastník klíče už není členem workspace.");

  const scopes = key.scopes as Scope[];
  if (!scopes.includes(need)) throw new ApiError(403, "forbidden", `Klíč nemá oprávnění „${need}“.`);
  rateLimit(key.id);

  if (!key.last_used_at || Date.now() - new Date(key.last_used_at).getTime() > 60_000) {
    await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  }
  return { db, workspaceId: key.workspace_id, userId: key.user_id, keyId: key.id, scopes };
}
