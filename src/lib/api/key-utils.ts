// Sdílené mezi prohlížečem (vytvoření klíče) a serverem (ověření). Používá Web Crypto.
export const KEY_PREFIX = "nxd_";
const KEY_RE = /^nxd_[A-Za-z0-9_-]{43}$/;

/** `nxd_` + 32 náhodných bajtů v base64url (256 bitů entropie). */
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return KEY_PREFIX + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const looksLikeApiKey = (s: string) => KEY_RE.test(s);

/** SHA-256 jako hex (v DB je jen tento otisk, ne klíč). */
export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Co z klíče uložíme pro zobrazení v seznamu (nestačí k použití). */
export const keyDisplayPrefix = (key: string) => key.slice(0, KEY_PREFIX.length + 6);
