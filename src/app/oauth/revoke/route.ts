import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/oauth/pure";
import { json, preflight, readParams } from "@/lib/oauth/server";

// RFC 7009 – odvolání access nebo refresh tokenu. Vždy 200 (neprozrazuje, jestli token existoval).
export async function POST(req: NextRequest) {
  const p = await readParams(req);
  if (p.token) {
    const h = await hashToken(p.token);
    const db = createAdminClient();
    const now = new Date().toISOString();
    await db.from("oauth_tokens").update({ revoked_at: now }).eq("access_hash", h).is("revoked_at", null);
    await db.from("oauth_tokens").update({ revoked_at: now }).eq("refresh_hash", h).is("revoked_at", null);
  }
  return json({});
}
export const OPTIONS = preflight;
