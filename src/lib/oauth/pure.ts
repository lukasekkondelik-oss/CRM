// Čisté funkce OAuth 2.1 (bez závislostí na Next/Supabase → testovatelné a použitelné všude).
import { sha256Hex } from "../api/key-utils.ts";

export const ACCESS_TTL_S = 60 * 60; // 1 hodina
export const REFRESH_TTL_S = 30 * 24 * 60 * 60; // 30 dní (při každém obnovení se posouvá)
export const CODE_TTL_S = 10 * 60; // autorizační kód: 10 minut, jednorázový
export const SCOPES = ["read", "write"] as const;
export type OAuthScope = (typeof SCOPES)[number];

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** `prefix` + 32 náhodných bajtů (256 bitů). Předpony: nxo_ access, nxr_ refresh, nxc_ kód, nxcid_ klient. */
export function randomToken(prefix: string, bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return prefix + b64url(a);
}

export const OAUTH_ACCESS_RE = /^nxo_[A-Za-z0-9_-]{43}$/;
export const looksLikeOAuthToken = (s: string) => OAUTH_ACCESS_RE.test(s);

export const hashToken = sha256Hex;

/** BASE64URL(SHA256(verifier)) – PKCE S256. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(buf));
}

/** Porovnání v konstantním čase (nezávisí na místě první odlišnosti). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const isValidVerifier = (v: string) => /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
export const isValidChallenge = (c: string) => /^[A-Za-z0-9_-]{43}$/.test(c);

export async function verifyPkce(verifier: string, challenge: string): Promise<boolean> {
  return isValidVerifier(verifier) && safeEqual(await pkceChallenge(verifier), challenge);
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Povolené redirect URI při registraci klienta: https, nebo http na loopbacku (nativní aplikace). Bez fragmentu. */
export function validateRedirectUri(uri: string): string | null {
  if (typeof uri !== "string" || uri.length > 500) return null;
  let u: URL;
  try { u = new URL(uri); } catch { return null; }
  if (u.hash || u.username || u.password) return null;
  if (u.protocol === "https:") return u.href;
  if (u.protocol === "http:" && LOOPBACK.has(u.hostname)) return u.href;
  return null;
}

/** Přesná shoda s registrovanými URI; u loopbacku se podle RFC 8252 smí lišit port. */
export function redirectUriMatches(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true;
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (u.protocol !== "http:" || !LOOPBACK.has(u.hostname)) return false;
  return registered.some((r) => {
    try {
      const x = new URL(r);
      return x.protocol === "http:" && x.hostname === u.hostname && x.pathname === u.pathname && x.search === u.search;
    } catch { return false; }
  });
}

export function parseScopes(raw: string | null | undefined): OAuthScope[] {
  const wanted = (raw ?? "").split(/\s+/).filter(Boolean);
  return SCOPES.filter((s) => wanted.includes(s));
}

export function addParams(uri: string, params: Record<string, string | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

/** `next` po přihlášení smí být jen cesta v rámci aplikace (ochrana před open redirectem). */
export function sanitizeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return null;
  return next;
}
