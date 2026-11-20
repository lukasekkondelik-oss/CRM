import type { NextRequest } from "next/server";
import { json, preflight, publicOrigin } from "@/lib/oauth/server";

// RFC 9728 – popis chráněného zdroje (MCP endpoint) a toho, kdo vydává tokeny.
export function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  return json({
    resource: `${origin}/api/mcp`,
    resource_name: "nexdeals CRM",
    authorization_servers: [origin],
    scopes_supported: ["read", "write"],
    bearer_methods_supported: ["header"],
  }, 200, { "Cache-Control": "public, max-age=300" });
}
export const OPTIONS = preflight;
export const dynamic = "force-dynamic";
