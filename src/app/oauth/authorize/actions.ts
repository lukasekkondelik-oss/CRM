"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CODE_TTL_S, addParams, hashToken, parseScopes, randomToken } from "@/lib/oauth/pure";
import { validateAuthRequest } from "./validate";

/** Rozhodnutí uživatele na stránce souhlasu. Vše se znovu ověřuje na serveru (skrytá pole jsou jen přenos). */
export async function decide(formData: FormData) {
  const raw: Record<string, string> = {};
  formData.forEach((v, k) => { if (typeof v === "string") raw[k] = v; });
  raw.response_type = "code";
  raw.code_challenge_method = "S256";

  const v = await validateAuthRequest(raw);
  if (!v.ok) {
    if ("redirect" in v) redirect(addParams(v.redirect.uri, { error: v.redirect.error, error_description: v.redirect.description, state: v.redirect.state }));
    redirect("/pipeline");
  }
  const { req } = v;

  if (raw.decision !== "approve") {
    redirect(addParams(req.redirectUri, { error: "access_denied", error_description: "Uživatel přístup zamítl.", state: req.state }));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("id, workspace_id").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  // oprávnění volí uživatel (nikdy víc, než sám povolí); výchozí je jen čtení, pokud nic nevybral
  const granted = parseScopes(raw.grant);
  // klient, který žádal jen o čtení, zápis nedostane ani při ručně upraveném formuláři
  const writeAllowed = req.scopes.length === 0 || req.scopes.includes("write");
  const scopes = granted.includes("write") && writeAllowed ? ["read", "write"] : ["read"];

  const code = randomToken("nxc_");
  const { error } = await createAdminClient().from("oauth_codes").insert({
    code_hash: await hashToken(code), client_id: req.clientId, user_id: user.id, workspace_id: profile.workspace_id,
    redirect_uri: req.redirectUri, code_challenge: req.codeChallenge, scopes, resource: req.resource ?? null,
    expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  });
  if (error) {
    console.error("[oauth] uložení kódu selhalo", error);
    redirect(addParams(req.redirectUri, { error: "server_error", error_description: "Kód se nepodařilo vytvořit.", state: req.state }));
  }
  redirect(addParams(req.redirectUri, { code, state: req.state }));
}
