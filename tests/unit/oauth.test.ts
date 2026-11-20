import assert from "node:assert/strict";
import { test } from "node:test";
import { addParams, hashToken, isValidChallenge, isValidVerifier, looksLikeOAuthToken, parseScopes, pkceChallenge, randomToken, redirectUriMatches, safeEqual, sanitizeNext, validateRedirectUri, verifyPkce } from "../../src/lib/oauth/pure.ts";

test("PKCE S256: vektor z RFC 7636 a ověření", async () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  assert.equal(await pkceChallenge(verifier), challenge);
  assert.ok(await verifyPkce(verifier, challenge));
  assert.ok(!(await verifyPkce(verifier + "x", challenge)));
  assert.ok(!(await verifyPkce("kratky", await pkceChallenge("kratky")))); // verifier musí mít 43–128 znaků
  assert.ok(isValidChallenge(challenge) && !isValidChallenge("moc-kratke") && !isValidChallenge(challenge + "="));
  assert.ok(isValidVerifier(verifier) && !isValidVerifier("a".repeat(129)) && !isValidVerifier("a".repeat(42)) && !isValidVerifier("a b".repeat(20)));
});

test("tokeny: formát, unikátnost, otisk, porovnání v konstantním čase", async () => {
  const t = randomToken("nxo_");
  assert.ok(looksLikeOAuthToken(t) && !looksLikeOAuthToken(t + "x") && !looksLikeOAuthToken("nxd_" + t.slice(4)));
  assert.notEqual(t, randomToken("nxo_"));
  assert.match(randomToken("nxr_"), /^nxr_[A-Za-z0-9_-]{43}$/);
  assert.equal((await hashToken(t)).length, 64);
  assert.ok(safeEqual("abc", "abc") && !safeEqual("abc", "abd") && !safeEqual("abc", "abcd"));
});

test("redirect URI: registrace (https / loopback) a přesná shoda", () => {
  assert.equal(validateRedirectUri("https://claude.ai/api/mcp/auth_callback"), "https://claude.ai/api/mcp/auth_callback");
  assert.ok(validateRedirectUri("http://localhost:8080/cb") && validateRedirectUri("http://127.0.0.1/cb"));
  for (const bad of ["http://evil.example/cb", "javascript:alert(1)", "https://a.cz/cb#frag", "https://user:pw@a.cz/cb", "ftp://a.cz", "neni-url", "https://a.cz/" + "x".repeat(500), "myapp://cb"]) assert.equal(validateRedirectUri(bad), null, bad);
  const reg = ["https://claude.ai/api/mcp/auth_callback", "http://localhost:3000/callback"];
  assert.ok(redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback"));
  assert.ok(!redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback/"));
  assert.ok(!redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback?x=1"));
  assert.ok(!redirectUriMatches(reg, "https://evil.claude.ai/api/mcp/auth_callback"));
  assert.ok(redirectUriMatches(reg, "http://localhost:51234/callback"), "loopback smí změnit port");
  assert.ok(!redirectUriMatches(reg, "http://localhost:51234/jina-cesta"));
  assert.ok(!redirectUriMatches(reg, "http://evil.example:3000/callback"));
});

test("scope, parametry v URL a bezpečné `next`", () => {
  assert.deepEqual(parseScopes("read write admin"), ["read", "write"]);
  assert.deepEqual(parseScopes("write"), ["write"]);
  assert.deepEqual(parseScopes(""), []);
  assert.deepEqual(parseScopes(undefined), []);
  assert.equal(addParams("https://a.cz/cb?x=1", { code: "c", state: "s", nic: undefined }), "https://a.cz/cb?x=1&code=c&state=s");
  assert.equal(sanitizeNext("/oauth/authorize?client_id=x&state=a%2Fb"), "/oauth/authorize?client_id=x&state=a%2Fb");
  for (const bad of ["https://evil.cz", "//evil.cz", "/\\evil.cz", "javascript:1", "", null, undefined, "/a\r\nSet-Cookie: x"]) assert.equal(sanitizeNext(bad as string), null, String(bad));
});
