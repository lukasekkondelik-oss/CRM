import "server-only";
import { NextResponse } from "next/server";

/** Veřejná adresa aplikace (za proxy Vercelu podle forwarded hlaviček). */
export function publicOrigin(req: { headers: Headers; url: string }): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return new URL(req.url).origin;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host.split(",")[0].trim()}`;
}

/** Metadata a token endpointy volají i prohlížečové klienty (např. MCP Inspector). Cookies se nepoužívají → `*` je bezpečné. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache", ...extra } });
}

/** Chyba podle RFC 6749 §5.2. */
export const oauthError = (error: string, description: string, status = 400, extra: Record<string, string> = {}) =>
  json({ error, error_description: description }, status, extra);

const buckets = new Map<string, { n: number; start: number }>();
/** Okénkový limit na IP (per instance). Pravda: ochrana před zahlcením registrace/tokenů, ne tvrdá kvóta. */
export function limited(req: Request, bucket: string, max: number, windowMs: number): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) { buckets.set(key, { n: 1, start: now }); return false; }
  b.n++;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start > windowMs) buckets.delete(k);
  return b.n > max;
}

export async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(j)) if (typeof v === "string") out[k] = v;
  } else {
    const fd = new URLSearchParams(await req.text());
    fd.forEach((v, k) => { out[k] = v; });
  }
  return out;
}
