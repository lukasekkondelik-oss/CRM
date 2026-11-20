import type { NextRequest } from "next/server";
import { json, preflight, publicOrigin } from "@/lib/oauth/server";

// RFC 8414 – metadata autorizačního serveru.
export function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read", "write"],
    service_documentation: `${origin}/nastaveni?tab=api`,
  }, 200, { "Cache-Control": "public, max-age=300" });
}
export const OPTIONS = preflight;
export const dynamic = "force-dynamic";
