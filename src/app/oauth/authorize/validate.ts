import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidChallenge, parseScopes, redirectUriMatches, type OAuthScope } from "@/lib/oauth/pure";

export interface AuthRequest {
  clientId: string; clientName: string; redirectUri: string; codeChallenge: string; state?: string; resource?: string; scopes: OAuthScope[];
}

export type Validation =
  | { ok: true; req: AuthRequest }
  /** chyba, kvůli které se NESMÍ přesměrovat zpět (neznámý klient / nesedí redirect URI) */
  | { ok: false; fatal: string }
  /** chyba, o které se informuje klient přesměrováním (RFC 6749 §4.1.2.1) */
  | { ok: false; redirect: { uri: string; error: string; description: string; state?: string } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Ověří autorizační požadavek proti databázi klientů. Používá se na stránce souhlasu i v akci (znovu, nikdy se nevěří skrytým polím). */
export async function validateAuthRequest(raw: Record<string, string | string[] | undefined>): Promise<Validation> {
  const clientId = one(raw.client_id), redirectUri = one(raw.redirect_uri);
  if (!clientId || !redirectUri) return { ok: false, fatal: "V požadavku chybí client_id nebo redirect_uri." };
  const { data: client } = await createAdminClient().from("oauth_clients").select("client_id, client_name, redirect_uris").eq("client_id", clientId).maybeSingle();
  if (!client) return { ok: false, fatal: "Neznámá aplikace (client_id). Zkus připojení spustit znovu." };
  if (!redirectUriMatches(client.redirect_uris as string[], redirectUri)) return { ok: false, fatal: "Adresa pro návrat (redirect_uri) nesouhlasí s registrací aplikace." };

  const state = one(raw.state) || undefined;
  const bad = (error: string, description: string) => ({ ok: false as const, redirect: { uri: redirectUri, error, description, state } });
  if (one(raw.response_type) !== "code") return bad("unsupported_response_type", "Podporovaný je jen response_type=code.");
  const challenge = one(raw.code_challenge);
  if (!isValidChallenge(challenge)) return bad("invalid_request", "Chybí platný code_challenge (PKCE je povinné).");
  if ((one(raw.code_challenge_method) || "plain") !== "S256") return bad("invalid_request", "Podporovaná je jen metoda code_challenge_method=S256.");
  return {
    ok: true,
    req: { clientId, clientName: client.client_name, redirectUri, codeChallenge: challenge, state, resource: one(raw.resource) || undefined, scopes: parseScopes(one(raw.scope)) },
  };
}
