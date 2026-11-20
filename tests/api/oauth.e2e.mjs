// E2E OAuth 2.1 pro MCP konektory: reálný klientský kód z oficiálního MCP SDK (discovery, registrace, PKCE, výměna, refresh)
// + prohlížeč (Playwright) pro stránku souhlasu. Backend = falešný PostgREST (in-memory).
import fs from 'node:fs'; import os from 'node:os'; import crypto from 'node:crypto'; import { spawn } from 'node:child_process'; import { createRequire } from 'node:module';
import { discoverOAuthServerInfo, registerClient, startAuthorization, exchangeAuthorization, refreshAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const REPO = process.argv[2] ?? process.cwd(); const S = fs.mkdtempSync(os.tmpdir() + '/nxd-oauth-'); const PORT = process.env.TEST_PORT ?? '3109'; const BASE = `http://localhost:${PORT}`; const FAKE = 54341;
const uuid = () => crypto.randomUUID(); const b64u = (s) => Buffer.from(s).toString('base64url');
const W = uuid(), U = uuid(), P = uuid(), S1 = uuid(), S2 = uuid(); const iso = (d = 0) => new Date(Date.now() + d * 864e5).toISOString();
const authUser = { id: U, aud: 'authenticated', role: 'authenticated', email: 'lukas@x.cz', app_metadata: {}, user_metadata: {}, created_at: iso(-9) };
const seed = { authUser, tables: { api_keys: [], oauth_clients: [], oauth_codes: [], oauth_tokens: [], workspaces: [{ id: W, name: 'Moje agentura' }], profiles: [{ id: U, workspace_id: W, full_name: 'Lukáš Kondelík', email: 'lukas@x.cz', role: 'admin' }],
  pipelines: [{ id: P, workspace_id: W, name: 'Prodej', position: 0 }], stages: [{ id: S1, pipeline_id: P, name: 'Lead', position: 0, probability: 10, rotting_days: 14 }, { id: S2, pipeline_id: P, name: 'Nabídka', position: 1, probability: 60, rotting_days: 21 }],
  deals: [], persons: [], organizations: [], activities: [], notes: [], labels: [], deal_labels: [], deal_history: [] } };
fs.writeFileSync(S + '/seed.json', JSON.stringify(seed)); const LOG = S + '/log'; fs.writeFileSync(LOG, '');
const fake = spawn('node', [REPO + '/tests/api/fake-postgrest.cjs', S + '/seed.json', LOG, String(FAKE)], { stdio: 'inherit' }); await new Promise((r) => setTimeout(r, 700));
const fakeApi = (m, path, body) => fetch(`http://127.0.0.1:${FAKE}/rest/v1/${path}`, { method: m, headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const browser = await chromium.launch();
// přihlášený prohlížeč: cookie Supabase session (falešná JWT; server ji ověří přes /auth/v1/user)
const jwt = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub: U, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, email: 'lukas@x.cz' }))}.sig`;
const session = { access_token: jwt, refresh_token: 'r', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: authUser };
const cookie = { name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: 'localhost', path: '/' };

/** Projde stránku souhlasu v prohlížeči a vrátí URL, na kterou server přesměroval (callback klienta). */
async function consent(url, { grant, deny = false, logged = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } }); if (logged) await ctx.addCookies([cookie]);
  const page = await ctx.newPage(); let cb = null;
  ctx.on('request', (rq) => { if (rq.url().startsWith('https://claude.ai/')) cb ??= rq.url(); });
  await page.route(/^https:\/\/claude\.ai\//, (route) => { cb ??= route.request().url(); route.abort(); });
  await page.goto(url).catch(() => {}); await page.waitForTimeout(1500);
  if (!cb && logged) {
    if (!deny) { if (grant === 'read') await page.getByRole('radio', { name: /Jen čtení/ }).check(); await page.screenshot({ path: S + `/consent-${grant ?? 'write'}.png` }); }
    await page.getByRole('button', { name: deny ? 'Zamítnout' : 'Povolit' }).click().catch(() => {}); await page.waitForTimeout(1500);
  }
  const res = { cb, finalUrl: page.url(), body: await page.locator('body').innerText().catch(() => '') }; await ctx.close(); return res;
}
const tokenCall = (params) => fetch(BASE + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) }).then(async (r) => ({ s: r.status, j: await r.json(), h: r.headers }));

try {
  // ===== DISCOVERY (RFC 9728 + RFC 8414)
  let r = await fetch(BASE + '/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
  const www = r.headers.get('www-authenticate') ?? ''; ok(r.status === 401 && /resource_metadata="http:\/\/localhost:\d+\/\.well-known\/oauth-protected-resource"/.test(www), '401 z MCP obsahuje WWW-Authenticate s resource_metadata (spouštěč OAuth discovery)');
  const info = await discoverOAuthServerInfo(BASE + '/api/mcp'); const as = info.authorizationServerMetadata;
  ok(info.authorizationServerUrl.toString().replace(/\/$/, '') === BASE && info.resourceMetadata?.resource === BASE + '/api/mcp', 'SDK discovery: chráněný zdroj → autorizační server');
  ok(as.code_challenge_methods_supported.join() === 'S256' && as.grant_types_supported.includes('refresh_token') && as.registration_endpoint === BASE + '/oauth/register' && as.token_endpoint === BASE + '/oauth/token' && as.authorization_endpoint === BASE + '/oauth/authorize', 'metadata AS: S256, refresh, registrace, endpointy');
  r = await fetch(BASE + '/.well-known/oauth-protected-resource/api/mcp'); const prm = await r.json(); ok(r.status === 200 && prm.resource === BASE + '/api/mcp' && prm.scopes_supported.includes('write'), 'RFC 9728 i s příponou cesty (/api/mcp)');
  r = await fetch(BASE + '/oauth/token', { method: 'OPTIONS' }); ok(r.status === 204 && r.headers.get('access-control-allow-origin') === '*', 'CORS preflight na token endpointu');

  // ===== DYNAMICKÁ REGISTRACE (RFC 7591)
  const reg = (body) => fetch(BASE + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }).then(async (x) => ({ s: x.status, j: await x.json() }));
  let g = await reg({ redirect_uris: ['http://evil.example/cb'] }); ok(g.s === 400 && g.j.error === 'invalid_redirect_uri', 'registrace: http mimo localhost odmítnuta');
  g = await reg({ redirect_uris: ['javascript:alert(1)'] }); ok(g.s === 400, 'registrace: javascript: odmítnuto');
  g = await reg({ redirect_uris: [] }); ok(g.s === 400, 'registrace: prázdný seznam redirect URI');
  g = await reg({ redirect_uris: [CALLBACK], token_endpoint_auth_method: 'client_secret_basic' }); ok(g.s === 400 && g.j.error === 'invalid_client_metadata', 'registrace: důvěrní klienti nepodporováni');
  g = await reg('{rozbité'); ok(g.s === 400, 'registrace: rozbitý JSON');
  const clientInformation = await registerClient(BASE, { metadata: as, clientMetadata: { client_name: 'Claude', redirect_uris: [CALLBACK], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' } });
  ok(/^nxcid_/.test(clientInformation.client_id) && clientInformation.client_name === 'Claude', 'SDK registerClient → client_id');

  // ===== AUTORIZACE (prohlížeč) – CHYBY
  const mk = async (extra = {}) => { const a = await startAuthorization(BASE, { metadata: as, clientInformation, redirectUrl: CALLBACK, state: 'st4te', resource: new URL(BASE + '/api/mcp'), ...extra }); return a; };
  let a = await mk(); const loggedOut = await consent(a.authorizationUrl.toString(), { logged: false }); ok(/\/login\?next=/.test(loggedOut.finalUrl) && decodeURIComponent(loggedOut.finalUrl).includes('/oauth/authorize?'), 'nepřihlášený → /login?next=/oauth/authorize?… (po přihlášení návrat na souhlas)');
  const badClient = new URL(a.authorizationUrl); badClient.searchParams.set('client_id', 'neexistuje'); let x = await consent(badClient.toString()); ok(!x.cb && /Neznámá aplikace/.test(x.body), 'neznámý client_id: chybová stránka, žádný redirect');
  const badRedirect = new URL(a.authorizationUrl); badRedirect.searchParams.set('redirect_uri', 'https://evil.example/cb'); x = await consent(badRedirect.toString()); ok(!x.cb && /nesouhlasí s registrací/.test(x.body) && new URL(x.finalUrl).hostname === 'localhost', 'cizí redirect_uri: chybová stránka, na evil.example se nepřesměruje');
  const noPkce = new URL(a.authorizationUrl); noPkce.searchParams.delete('code_challenge'); x = await consent(noPkce.toString()); ok(x.cb && new URL(x.cb).searchParams.get('error') === 'invalid_request' && new URL(x.cb).searchParams.get('state') === 'st4te', 'chybí PKCE → redirect s error=invalid_request a state');
  const plain = new URL(a.authorizationUrl); plain.searchParams.set('code_challenge_method', 'plain'); x = await consent(plain.toString()); ok(x.cb && new URL(x.cb).searchParams.get('error') === 'invalid_request', 'PKCE metoda plain odmítnuta');
  const badType = new URL(a.authorizationUrl); badType.searchParams.set('response_type', 'token'); x = await consent(badType.toString()); ok(x.cb && new URL(x.cb).searchParams.get('error') === 'unsupported_response_type', 'response_type=token (implicit) odmítnut');
  x = await consent(a.authorizationUrl.toString(), { deny: true }); ok(x.cb && new URL(x.cb).searchParams.get('error') === 'access_denied' && new URL(x.cb).searchParams.get('state') === 'st4te', 'Zamítnout → error=access_denied + state');

  // ===== AUTORIZACE – ÚSPĚCH (čtení + zápis)
  a = await mk(); x = await consent(a.authorizationUrl.toString()); const cbUrl = new URL(x.cb);
  ok(cbUrl.origin + cbUrl.pathname === CALLBACK && cbUrl.searchParams.get('state') === 'st4te' && /^nxc_[A-Za-z0-9_-]{43}$/.test(cbUrl.searchParams.get('code')), 'Povolit → redirect na callback s code (nxc_…) a původním state');
  const code = cbUrl.searchParams.get('code');
  // ----- výměna kódu
  const bad = (over) => tokenCall({ grant_type: 'authorization_code', client_id: clientInformation.client_id, code, redirect_uri: CALLBACK, code_verifier: a.codeVerifier, ...over });
  let t = await tokenCall({ grant_type: 'authorization_code', client_id: 'neexistuje', code, redirect_uri: CALLBACK, code_verifier: a.codeVerifier }); ok(t.s === 401 && t.j.error === 'invalid_client', 'token: neznámý klient → invalid_client');
  t = await bad({ code_verifier: 'x'.repeat(43) }); ok(t.s === 400 && t.j.error === 'invalid_grant', 'token: špatný code_verifier → invalid_grant');
  t = await bad({}); ok(t.s === 400 && t.j.error === 'invalid_grant', 'kód se po neúspěšném pokusu spálil (nejde použít ani se správným verifierem)');
  // nový kód pro další pokusy
  a = await mk(); x = await consent(a.authorizationUrl.toString()); const code2 = new URL(x.cb).searchParams.get('code');
  t = await tokenCall({ grant_type: 'authorization_code', client_id: clientInformation.client_id, code: code2, redirect_uri: 'https://claude.ai/jina', code_verifier: a.codeVerifier }); ok(t.s === 400 && t.j.error === 'invalid_grant', 'token: jiná redirect_uri než při autorizaci → invalid_grant');
  a = await mk(); x = await consent(a.authorizationUrl.toString()); const code3 = new URL(x.cb).searchParams.get('code');
  const tokens = await exchangeAuthorization(BASE, { metadata: as, clientInformation, authorizationCode: code3, codeVerifier: a.codeVerifier, redirectUri: CALLBACK, resource: new URL(BASE + '/api/mcp') });
  ok(/^nxo_/.test(tokens.access_token) && /^nxr_/.test(tokens.refresh_token) && tokens.token_type.toLowerCase() === 'bearer' && tokens.expires_in === 3600 && tokens.scope === 'read write', 'SDK exchangeAuthorization → access (nxo_), refresh (nxr_), expires_in 3600, scope „read write“');
  t = await tokenCall({ grant_type: 'authorization_code', client_id: clientInformation.client_id, code: code3, redirect_uri: CALLBACK, code_verifier: a.codeVerifier }); ok(t.s === 400 && t.j.error === 'invalid_grant', 'kód je jednorázový (druhé použití → invalid_grant)');
  ok(t.h.get('cache-control') === 'no-store', 'odpovědi tokenu mají Cache-Control: no-store');

  // ===== POUŽITÍ TOKENU (MCP + REST)
  const mcp = async (token) => { const c = new Client({ name: 'oauth-test', version: '1' }); await c.connect(new StreamableHTTPClientTransport(new URL(BASE + '/api/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + token } } })); return c; };
  let client = await mcp(tokens.access_token); const tools = (await client.listTools()).tools; ok(tools.length === 17, 'MCP SDK klient s OAuth tokenem: 17 nástrojů');
  let res = await client.callTool({ name: 'create_deal', arguments: { title: 'Z claude.ai', value: 1000, stage_name: 'Nabídka' } }); ok(!res.isError && JSON.parse(res.content[0].text).stage_name === 'Nabídka', 'OAuth token (read+write): zápis funguje');
  await client.close();
  r = await fetch(BASE + '/api/v1/me', { headers: { Authorization: 'Bearer ' + tokens.access_token } }); const me = await r.json(); ok(r.status === 200 && me.data.user.id === U && me.data.scopes.join() === 'read,write', 'stejný token funguje i v REST API (/me)');
  const grantRow = (await fakeApi('GET', 'oauth_tokens'))[0]; ok(grantRow && !JSON.stringify(grantRow).includes(tokens.access_token) && /^[0-9a-f]{64}$/.test(grantRow.access_hash) && /^[0-9a-f]{64}$/.test(grantRow.refresh_hash), 'v DB je jen SHA-256 otisk tokenů, ne tokeny');

  // ===== JEN ČTENÍ
  a = await mk(); x = await consent(a.authorizationUrl.toString(), { grant: 'read' });
  const roTokens = await exchangeAuthorization(BASE, { metadata: as, clientInformation, authorizationCode: new URL(x.cb).searchParams.get('code'), codeVerifier: a.codeVerifier, redirectUri: CALLBACK });
  ok(roTokens.scope === 'read', 'uživatel zvolil „Jen čtení“ → token má scope read');
  client = await mcp(roTokens.access_token); res = await client.callTool({ name: 'create_deal', arguments: { title: 'nesmí' } }); ok(res.isError && /forbidden/.test(res.content[0].text), 'read-only OAuth token: zápis odmítnut');
  res = await client.callTool({ name: 'get_overview', arguments: {} }); ok(!res.isError, 'read-only OAuth token: čtení funguje'); await client.close();
  r = await fetch(BASE + '/api/v1/deals', { method: 'POST', headers: { Authorization: 'Bearer ' + roTokens.access_token, 'Content-Type': 'application/json' }, body: '{"title":"x"}' }); ok(r.status === 403 && /insufficient_scope/.test(r.headers.get('www-authenticate') ?? ''), 'REST POST s read-only tokenem → 403 + insufficient_scope');

  // ===== REFRESH A ROTACE
  const fresh = await refreshAuthorization(BASE, { metadata: as, clientInformation, refreshToken: tokens.refresh_token });
  ok(/^nxo_/.test(fresh.access_token) && fresh.access_token !== tokens.access_token && /^nxr_/.test(fresh.refresh_token) && fresh.refresh_token !== tokens.refresh_token && fresh.scope === 'read write', 'SDK refreshAuthorization: nový access i refresh token (rotace), scope zachován');
  r = await fetch(BASE + '/api/v1/me', { headers: { Authorization: 'Bearer ' + tokens.access_token } }); ok(r.status === 401, 'starý access token po rotaci přestal platit');
  r = await fetch(BASE + '/api/v1/me', { headers: { Authorization: 'Bearer ' + fresh.access_token } }); ok(r.status === 200, 'nový access token funguje');
  t = await tokenCall({ grant_type: 'refresh_token', client_id: clientInformation.client_id, refresh_token: tokens.refresh_token }); ok(t.s === 400 && t.j.error === 'invalid_grant', 'znovupoužití starého refresh tokenu → invalid_grant');
  r = await fetch(BASE + '/api/v1/me', { headers: { Authorization: 'Bearer ' + fresh.access_token } }); ok(r.status === 401, 'detekce úniku: po použití starého refresh tokenu je celý přístup odvolán (i nový access token)');
  t = await tokenCall({ grant_type: 'refresh_token', client_id: clientInformation.client_id, refresh_token: fresh.refresh_token }); ok(t.s === 400 && t.j.error === 'invalid_grant', 'odvolaný přístup nejde obnovit');
  t = await tokenCall({ grant_type: 'refresh_token', client_id: 'neexistuje', refresh_token: 'nxr_x' }); ok(t.s === 401, 'refresh s neznámým klientem → 401');
  t = await tokenCall({ grant_type: 'password', client_id: clientInformation.client_id }); ok(t.s === 400 && t.j.error === 'unsupported_grant_type', 'nepodporovaný grant_type');

  // ===== VYPRŠENÍ, REVOKE, ČLENSTVÍ
  a = await mk(); x = await consent(a.authorizationUrl.toString()); const t3 = await exchangeAuthorization(BASE, { metadata: as, clientInformation, authorizationCode: new URL(x.cb).searchParams.get('code'), codeVerifier: a.codeVerifier, redirectUri: CALLBACK });
  const h3 = crypto.createHash('sha256').update(t3.access_token).digest('hex');
  const tid = (await fakeApi('GET', 'oauth_tokens')).find((z) => z.access_hash === h3).id;
  await fakeApi('PATCH', `oauth_tokens?id=eq.${tid}`, { access_expires_at: iso(-0.01) });
  r = await fetch(BASE + '/api/v1/me', { headers: { Authorization: 'Bearer ' + t3.access_token } }); const ej = await r.json(); ok(r.status === 401 && /vypršel/.test(ej.error.message) && /error="invalid_token"/.test(r.headers.get('www-authenticate')), 'vypršený access token → 401 invalid_token (klient obnoví refresh tokenem)');
  const t3b = await refreshAuthorization(BASE, { metadata: as, clientInformation, refreshToken: t3.refresh_token }); r = await fetch(BASE + '/api/v1/me', { headers: { Authorization: 'Bearer ' + t3b.access_token } }); ok(r.status === 200, 'po refreshi zase funguje');
  r = await fetch(BASE + '/oauth/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t3b.access_token }) }); ok(r.status === 200, 'revoke endpoint → 200');
  r = await fetch(BASE + '/api/v1/me', { headers: { Authorization: 'Bearer ' + t3b.access_token } }); ok(r.status === 401, 'po revoke token nefunguje');
  r = await fetch(BASE + '/oauth/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: 'nxo_neexistuje' }) }); ok(r.status === 200, 'revoke neexistujícího tokenu taky 200 (RFC 7009)');
  a = await mk(); x = await consent(a.authorizationUrl.toString()); const t4 = await exchangeAuthorization(BASE, { metadata: as, clientInformation, authorizationCode: new URL(x.cb).searchParams.get('code'), codeVerifier: a.codeVerifier, redirectUri: CALLBACK });
  await fakeApi('DELETE', `profiles?id=eq.${U}`);
  r = await fetch(BASE + '/api/v1/me', { headers: { Authorization: 'Bearer ' + t4.access_token } }); ok(r.status === 401, 'uživatel odebraný z workspace: token přestane fungovat');
  t = await tokenCall({ grant_type: 'refresh_token', client_id: clientInformation.client_id, refresh_token: t4.refresh_token }); ok(t.s === 400 && t.j.error === 'invalid_grant', '…a nejde ani obnovit');

  // ===== REGRESE: API klíče dál fungují a nxo_ ≠ nxd_
  r = await fetch(BASE + '/api/v1/me', { headers: { Authorization: 'Bearer nxo_' + 'A'.repeat(43) } }); ok(r.status === 401, 'neexistující OAuth token → 401');
  r = await fetch(BASE + '/api/v1/me', { headers: { Authorization: 'Bearer neco' } }); ok(r.status === 401 && /invalid_token/.test(r.headers.get('www-authenticate')), 'nesmyslný token → 401 invalid_token');
} catch (e) { fail++; console.log('FAIL výjimka testu:', e.stack); }
await browser.close(); fake.kill();
console.log(`\nVÝSLEDEK OAuth: ${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
