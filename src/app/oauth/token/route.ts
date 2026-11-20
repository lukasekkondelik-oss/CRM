import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACCESS_TTL_S, REFRESH_TTL_S, hashToken, isValidVerifier, randomToken, verifyPkce } from "@/lib/oauth/pure";
import { json, limited, oauthError, preflight, readParams } from "@/lib/oauth/server";

const iso = (secFromNow: number) => new Date(Date.now() + secFromNow * 1000).toISOString();

interface CodeRow { client_id: string; user_id: string; workspace_id: string; redirect_uri: string; code_challenge: string; scopes: string[]; resource: string | null; expires_at: string }
interface TokenRow { id: string; client_id: string; user_id: string; workspace_id: string; scopes: string[]; revoked_at: string | null; refresh_expires_at: string }

function tokenResponse(access: string, refresh: string, scopes: string[]) {
  return json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(" ") });
}

export async function POST(req: NextRequest) {
  if (limited(req, "token", 120, 60_000)) return oauthError("temporarily_unavailable", "Příliš mnoho požadavků.", 429, { "Retry-After": "30" });
  const p = await readParams(req);
  const db = createAdminClient();
  const clientId = p.client_id ?? "";
  if (!clientId) return oauthError("invalid_client", "Chybí client_id.", 401);
  const { data: client } = await db.from("oauth_clients").select("client_id").eq("client_id", clientId).maybeSingle();
  if (!client) return oauthError("invalid_client", "Neznámý klient.", 401);

  // úklid prošlých kódů (občas, ať tabulka neroste)
  if (Math.random() < 0.05) await db.from("oauth_codes").delete().lt("expires_at", iso(-86_400));

  if (p.grant_type === "authorization_code") {
    if (!p.code || !p.redirect_uri || !p.code_verifier) return oauthError("invalid_request", "Chybí code, redirect_uri nebo code_verifier.");
    if (!isValidVerifier(p.code_verifier)) return oauthError("invalid_grant", "Neplatný code_verifier.");
    // jednorázové použití: kód se „spotřebuje“ atomicky ještě před ověřením (neúspěšný pokus ho zneplatní)
    const { data: rows, error } = await db.from("oauth_codes").update({ used_at: new Date().toISOString() })
      .eq("code_hash", await hashToken(p.code)).is("used_at", null).select("client_id, user_id, workspace_id, redirect_uri, code_challenge, scopes, resource, expires_at");
    if (error) { console.error("[oauth] kód", error); return oauthError("server_error", "Chyba serveru.", 500); }
    const row = (rows?.[0] ?? null) as CodeRow | null;
    if (!row) return oauthError("invalid_grant", "Kód je neplatný nebo už byl použit.");
    if (row.client_id !== clientId || row.redirect_uri !== p.redirect_uri || new Date(row.expires_at) < new Date()) return oauthError("invalid_grant", "Kód nepatří tomuto klientovi / redirect URI, nebo vypršel.");
    if (!(await verifyPkce(p.code_verifier, row.code_challenge))) return oauthError("invalid_grant", "Ověření PKCE selhalo.");
    if (p.resource && row.resource && p.resource !== row.resource) return oauthError("invalid_target", "Požadovaný resource neodpovídá autorizaci.");

    // uživatel musí být pořád členem workspace
    const { data: prof } = await db.from("profiles").select("id").eq("id", row.user_id).eq("workspace_id", row.workspace_id).maybeSingle();
    if (!prof) return oauthError("invalid_grant", "Uživatel už není členem workspace.");

    const access = randomToken("nxo_"), refresh = randomToken("nxr_");
    const { error: insErr } = await db.from("oauth_tokens").insert({
      client_id: clientId, user_id: row.user_id, workspace_id: row.workspace_id, scopes: row.scopes, resource: row.resource,
      access_hash: await hashToken(access), refresh_hash: await hashToken(refresh), access_expires_at: iso(ACCESS_TTL_S), refresh_expires_at: iso(REFRESH_TTL_S),
    });
    if (insErr) { console.error("[oauth] token", insErr); return oauthError("server_error", "Token se nepodařilo vydat.", 500); }
    return tokenResponse(access, refresh, row.scopes);
  }

  if (p.grant_type === "refresh_token") {
    if (!p.refresh_token) return oauthError("invalid_request", "Chybí refresh_token.");
    const h = await hashToken(p.refresh_token);
    const cols = "id, client_id, user_id, workspace_id, scopes, revoked_at, refresh_expires_at";
    const { data: cur } = await db.from("oauth_tokens").select(cols).eq("refresh_hash", h).maybeSingle();
    if (!cur) {
      // starý (už rotovaný) refresh token = podezření na únik → celý přístup se odvolá
      const { data: reused } = await db.from("oauth_tokens").select("id").eq("prev_refresh_hash", h).maybeSingle();
      if (reused) await db.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", reused.id).is("revoked_at", null);
      return oauthError("invalid_grant", "Refresh token je neplatný.");
    }
    const t = cur as TokenRow;
    if (t.client_id !== clientId) return oauthError("invalid_grant", "Refresh token nepatří tomuto klientovi.");
    if (t.revoked_at || new Date(t.refresh_expires_at) < new Date()) return oauthError("invalid_grant", "Přístup byl odvolán nebo vypršel. Přihlas se znovu.");
    const { data: prof } = await db.from("profiles").select("id").eq("id", t.user_id).eq("workspace_id", t.workspace_id).maybeSingle();
    if (!prof) return oauthError("invalid_grant", "Uživatel už není členem workspace.");

    const access = randomToken("nxo_"), refresh = randomToken("nxr_");
    // rotace s optimistickým zámkem (refresh_hash = původní) – dva souběžné požadavky nemohou uspět oba
    const { data: upd, error } = await db.from("oauth_tokens").update({
      prev_refresh_hash: h, refresh_hash: await hashToken(refresh), access_hash: await hashToken(access),
      access_expires_at: iso(ACCESS_TTL_S), refresh_expires_at: iso(REFRESH_TTL_S),
    }).eq("id", t.id).eq("refresh_hash", h).is("revoked_at", null).select("id");
    if (error) { console.error("[oauth] refresh", error); return oauthError("server_error", "Chyba serveru.", 500); }
    if (!upd?.length) return oauthError("invalid_grant", "Refresh token už byl použit.");
    return tokenResponse(access, refresh, t.scopes);
  }

  return oauthError("unsupported_grant_type", "Podporované: authorization_code, refresh_token.");
}
export const OPTIONS = preflight;
