import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomToken, validateRedirectUri } from "@/lib/oauth/pure";
import { json, limited, oauthError, preflight } from "@/lib/oauth/server";

// RFC 7591 – dynamická registrace klientů (veřejní klienti s PKCE, bez client secret).
export async function POST(req: NextRequest) {
  if (limited(req, "register", 30, 60 * 60_000)) return oauthError("temporarily_unavailable", "Příliš mnoho registrací, zkus to později.", 429);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return oauthError("invalid_client_metadata", "Tělo musí být JSON."); }
  if (!body || typeof body !== "object") return oauthError("invalid_client_metadata", "Tělo musí být JSON objekt.");

  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 5) return oauthError("invalid_redirect_uri", "redirect_uris musí obsahovat 1 až 5 adres.");
  const valid = uris.map((u) => validateRedirectUri(String(u)));
  if (valid.some((u) => !u)) return oauthError("invalid_redirect_uri", "Redirect URI musí být https (nebo http na localhost/127.0.0.1) bez fragmentu.");
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") return oauthError("invalid_client_metadata", "Podporovaní jsou jen veřejní klienti (token_endpoint_auth_method = none) s PKCE.");

  const name = String(body.client_name ?? "").trim().slice(0, 100) || "MCP klient";
  const client_id = randomToken("nxcid_", 18);
  try {
    const { error } = await createAdminClient().from("oauth_clients").insert({ client_id, client_name: name, redirect_uris: valid });
    if (error) throw error;
  } catch (e) {
    console.error("[oauth] registrace klienta selhala", e);
    return oauthError("server_error", "Registrace se nepodařila.", 500);
  }
  return json({
    client_id, client_name: name, redirect_uris: valid, client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
  }, 201);
}
export const OPTIONS = preflight;
