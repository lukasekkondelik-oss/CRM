import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "./errors";
import { looksLikeApiKey, sha256Hex } from "./key-utils";
import { looksLikeOAuthToken } from "@/lib/oauth/pure";
import { publicOrigin } from "@/lib/oauth/server";

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

/** Výzva podle RFC 6750 + 9728: klient z `resource_metadata` zjistí, kde se přihlásit (OAuth discovery). */
const challenge = (req: Request, error?: string) =>
  `Bearer realm="nexdeals", resource_metadata="${publicOrigin(req)}/.well-known/oauth-protected-resource"${error ? `, error="${error}"` : ""}`;

const unauthorized = (req: Request, msg = "Chybí nebo je neplatný přístupový token. Pošli hlavičku Authorization: Bearer …", error?: string) =>
  new ApiError(401, "unauthorized", msg, undefined, { "WWW-Authenticate": challenge(req, error) });

/** Ověří API klíč (nxd_…) nebo OAuth access token (nxo_…), členství uživatele ve workspace a oprávnění. */
export async function authenticate(req: Request, need: Scope): Promise<ApiContext> {
  const token = bearerToken(req);
  if (!token) throw unauthorized(req);
  const oauth = looksLikeOAuthToken(token);
  if (!oauth && !looksLikeApiKey(token)) throw unauthorized(req, undefined, "invalid_token");

  const db = createAdminClient();
  const hash = await sha256Hex(token);
  const principal = oauth ? await oauthPrincipal(db, hash, req) : await apiKeyPrincipal(db, hash, req);

  // uživatel musí být pořád členem workspace (po odebrání z týmu přístup přestane fungovat)
  const { data: profile } = await db.from("profiles").select("id").eq("id", principal.userId).eq("workspace_id", principal.workspaceId).maybeSingle();
  if (!profile) throw unauthorized(req, "Vlastník přístupu už není členem workspace.", "invalid_token");

  if (!principal.scopes.includes(need)) throw new ApiError(403, "forbidden", `Přístup nemá oprávnění „${need}“.`, undefined, { "WWW-Authenticate": challenge(req, "insufficient_scope") });
  rateLimit(principal.id);

  if (!principal.lastUsedAt || Date.now() - new Date(principal.lastUsedAt).getTime() > 60_000) {
    await db.from(oauth ? "oauth_tokens" : "api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", principal.id);
  }
  return { db, workspaceId: principal.workspaceId, userId: principal.userId, keyId: principal.id, scopes: principal.scopes };
}

interface Principal { id: string; workspaceId: string; userId: string; scopes: Scope[]; lastUsedAt: string | null }

async function apiKeyPrincipal(db: SupabaseClient, hash: string, req: Request): Promise<Principal> {
  const { data: key, error } = await db.from("api_keys").select("id, workspace_id, user_id, scopes, expires_at, revoked_at, last_used_at").eq("key_hash", hash).maybeSingle();
  if (error) throw error;
  if (!key || key.revoked_at || (key.expires_at && new Date(key.expires_at) < new Date())) throw unauthorized(req, "API klíč je neplatný, odvolaný nebo vypršel.", "invalid_token");
  return { id: key.id, workspaceId: key.workspace_id, userId: key.user_id, scopes: key.scopes as Scope[], lastUsedAt: key.last_used_at };
}

async function oauthPrincipal(db: SupabaseClient, hash: string, req: Request): Promise<Principal> {
  const { data: t, error } = await db.from("oauth_tokens").select("id, workspace_id, user_id, scopes, access_expires_at, revoked_at, last_used_at").eq("access_hash", hash).maybeSingle();
  if (error) throw error;
  if (!t || t.revoked_at) throw unauthorized(req, "Přístup byl odvolán nebo token není platný.", "invalid_token");
  if (new Date(t.access_expires_at) < new Date()) throw unauthorized(req, "Přístupový token vypršel. Obnov ho refresh tokenem.", "invalid_token");
  return { id: t.id, workspaceId: t.workspace_id, userId: t.user_id, scopes: t.scopes as Scope[], lastUsedAt: t.last_used_at };
}
