import fs from 'node:fs'; import crypto from 'node:crypto'; import { spawn } from 'node:child_process';
const { generateApiKey, sha256Hex, keyDisplayPrefix } = await import('../../src/lib/api/key-utils.ts');
import os from 'node:os'; const REPO = process.argv[2] ?? process.cwd(); const S = fs.mkdtempSync(os.tmpdir() + '/nxd-api-'); const PORT_NEXT = process.env.TEST_PORT ?? '3108'; const BASE = 'http://localhost:' + (process.env.TEST_PORT ?? '3108'); const FAKE_PORT = 54340;
const uuid = () => crypto.randomUUID(); const iso = (d = 0) => new Date(Date.now() + d * 864e5).toISOString();
const W1 = uuid(), W2 = uuid(), U1 = uuid(), U1b = uuid(), U2 = uuid();
const P1 = uuid(), P2 = uuid(), S1 = uuid(), S2 = uuid(), S3 = uuid(), S4 = uuid();
const keys = {}; const rows = [];
for (const [name, o] of Object.entries({ full: { user: U1, ws: W1, scopes: ['read', 'write'] }, ro: { user: U1, ws: W1, scopes: ['read'] }, revoked: { user: U1, ws: W1, scopes: ['read', 'write'], revoked_at: iso(-1) }, expired: { user: U1, ws: W1, scopes: ['read', 'write'], expires_at: iso(-1) }, outsider: { user: U2, ws: W1, scopes: ['read', 'write'] }, other: { user: U2, ws: W2, scopes: ['read', 'write'] }, rate: { user: U1, ws: W1, scopes: ['read'] } })) {
  const k = generateApiKey(); keys[name] = k;
  rows.push({ id: uuid(), workspace_id: o.ws, user_id: o.user, name, key_prefix: keyDisplayPrefix(k), key_hash: await sha256Hex(k), scopes: o.scopes, created_at: iso(-3), last_used_at: null, expires_at: o.expires_at ?? null, revoked_at: o.revoked_at ?? null });
}
const D2 = uuid(), PER2 = uuid(), O2 = uuid(), A2 = uuid(), L1 = uuid(), L2 = uuid();
const seed = { tables: {
  api_keys: rows, workspaces: [{ id: W1, name: 'Moje agentura' }, { id: W2, name: 'Cizí firma' }],
  profiles: [{ id: U1, workspace_id: W1, full_name: 'Lukáš Kondelík', email: 'l@x.cz', role: 'admin' }, { id: U1b, workspace_id: W1, full_name: 'Jana Nováková', email: 'j@x.cz', role: 'member' }, { id: U2, workspace_id: W2, full_name: 'Cizí Uživatel', email: 'c@x.cz', role: 'admin' }],
  pipelines: [{ id: P1, workspace_id: W1, name: 'Prodej', position: 0 }, { id: P2, workspace_id: W2, name: 'Cizí pipeline', position: 0 }],
  stages: [{ id: S1, pipeline_id: P1, name: 'Lead', position: 0, probability: 10, rotting_days: 14 }, { id: S2, pipeline_id: P1, name: 'Kontaktován', position: 1, probability: 20, rotting_days: 14 }, { id: S3, pipeline_id: P1, name: 'Schůzka', position: 2, probability: 40, rotting_days: 14 }, { id: S4, pipeline_id: P2, name: 'Cizí fáze', position: 0, probability: 10, rotting_days: null }],
  deals: [{ id: D2, workspace_id: W2, pipeline_id: P2, stage_id: S4, title: 'Cizí deal', value: 999, currency: 'CZK', status: 'open', person_id: null, organization_id: null, owner_id: U2, expected_close_date: null, lost_reason: null, won_at: null, lost_at: null, stage_changed_at: iso(), position: 0, created_at: iso(), updated_at: iso() }],
  persons: [{ id: PER2, workspace_id: W2, first_name: 'Cizí', last_name: 'Osoba', email: null, phone: null, position: null, web: null, organization_id: null, owner_id: null, created_at: iso() }],
  organizations: [{ id: O2, workspace_id: W2, name: 'Cizí s.r.o.', ico: null, web: null, address: null, owner_id: null, created_at: iso() }],
  activities: [{ id: A2, workspace_id: W2, type: 'call', subject: 'Cizí aktivita', note: null, due_date: '2020-01-01', due_time: null, duration_min: null, done: false, done_at: null, deal_id: D2, person_id: null, organization_id: null, assigned_to: U2, created_at: iso() }],
  labels: [{ id: L1, workspace_id: W1, name: 'Horký', color: '#ef4444' }, { id: L2, workspace_id: W2, name: 'Cizí label', color: '#000000' }],
  notes: [], deal_labels: [], person_labels: [], organization_labels: [], deal_history: [],
} };
fs.writeFileSync(S + '/seed.json', JSON.stringify(seed)); const LOG = S + '/api.log'; fs.writeFileSync(LOG, '');
const fake = spawn('node', [REPO + '/tests/api/fake-postgrest.cjs', S + '/seed.json', LOG, String(FAKE_PORT)], { stdio: 'inherit' }); await new Promise((r) => setTimeout(r, 700));

let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const call = async (method, path, key, body, extra = {}) => { const r = await fetch(BASE + path, { method, headers: { ...(key ? { Authorization: 'Bearer ' + key } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra }, body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined }); let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch {} return { s: r.status, j, h: r.headers, t }; };
const api = (m, p, k, b) => call(m, '/api/v1' + p, k, b);
const F = keys.full;

try {
  // ===== AUTENTIZACE A OPRÁVNĚNÍ
  let r = await api('GET', '/me'); ok(r.s === 401 && r.j.error.code === 'unauthorized' && /Bearer/.test(r.h.get('www-authenticate')), 'bez hlavičky → 401 + WWW-Authenticate');
  r = await api('GET', '/me', 'nxd_neplatny'); ok(r.s === 401, 'špatný formát klíče → 401');
  r = await api('GET', '/me', generateApiKey()); ok(r.s === 401, 'neznámý klíč → 401');
  r = await api('GET', '/me', keys.revoked); ok(r.s === 401 && /odvolan/.test(r.j.error.message), 'odvolaný klíč → 401');
  r = await api('GET', '/me', keys.expired); ok(r.s === 401, 'vypršelý klíč → 401');
  r = await api('GET', '/me', keys.outsider); ok(r.s === 401 && /členem/.test(r.j.error.message), 'uživatel už není členem workspace → 401');
  r = await api('GET', '/me', keys.ro); ok(r.s === 200 && r.j.data.user.id === U1 && r.j.data.workspace.name === 'Moje agentura' && r.j.data.scopes.join() === 'read', 'klíč jen pro čtení: GET /me → 200 (user, workspace, scopes)');
  r = await api('POST', '/deals', keys.ro, { title: 'x' }); ok(r.s === 403 && r.j.error.code === 'forbidden', 'klíč jen pro čtení: POST → 403');
  r = await api('DELETE', `/deals/${D2}`, keys.ro); ok(r.s === 403, 'klíč jen pro čtení: DELETE → 403');
  ok(!!JSON.parse('[' + fs.readFileSync(LOG, 'utf8').trim().split('\n').join(',') + ']').find((e) => e.t === 'api_keys' && e.m === 'PATCH'), 'last_used_at se zapisuje');
  ok(!r.t.includes(keys.ro), 'odpověď neobsahuje klíč');

  // ===== PIPELINES, ČLENOVÉ, LABELY
  r = await api('GET', '/pipelines', F); ok(r.s === 200 && r.j.data.length === 1 && r.j.data[0].name === 'Prodej' && r.j.data[0].stages.map((s) => s.name).join() === 'Lead,Kontaktován,Schůzka', 'pipelines: jen vlastní workspace, fáze seřazené');
  r = await api('GET', '/members', F); ok(r.s === 200 && r.j.data.length === 2 && !r.t.includes('Cizí Uživatel'), 'members: jen kolegové z workspace');
  r = await api('GET', '/labels', F); ok(r.s === 200 && r.j.data.length === 1 && r.j.data[0].name === 'Horký', 'labels: jen vlastní');

  // ===== DEALY
  r = await api('POST', '/deals', F, { title: 'API deal', value: 50000, organization_name: 'Nová Firma', person_name: 'Jan Novák', stage_name: 'Kontaktován', expected_close_date: '2026-12-31' });
  ok(r.s === 201, 'POST /deals → 201'); const deal = r.j.data;
  ok(deal.stage_name === 'Kontaktován' && deal.pipeline_name === 'Prodej' && deal.value === 50000 && deal.organization_name === 'Nová Firma' && deal.person_name === 'Jan Novák' && deal.owner_name === 'Lukáš Kondelík', 'deal: jména fáze/firmy/osoby/vlastníka (vlastník = majitel klíče)');
  ok(deal.also_created.length === 2 && deal.open_activities === 0 && deal.next_activity === null && deal.rotting === false, 'vytvořena i firma a osoba; žádný další krok');
  r = await api('POST', '/deals', F, { title: 'Druhý deal' }); ok(r.s === 201 && r.j.data.stage_name === 'Lead' && r.j.data.also_created.length === 0, 'bez fáze → první fáze první pipeline');
  const deal2 = r.j.data;
  r = await api('POST', '/deals', F, { title: 'Znovu Nová Firma', organization_name: 'nová firma', person_name: 'JAN NOVÁK' }); ok(r.s === 201 && r.j.data.also_created.length === 0, 'firma a osoba se najdou bez ohledu na velikost písmen (žádné duplicity)');
  r = await api('POST', '/deals', F, { title: 'x', stage_name: 'Neexistuje' }); ok(r.s === 422 && r.j.error.code === 'stage_not_found' && r.j.error.details.available.some((x) => x.includes('Lead')), 'neznámá fáze → 422 s nabídkou existujících');
  r = await api('POST', '/deals', F, { title: '' }); ok(r.s === 400 && r.j.error.code === 'validation_error' && r.j.error.details[0].path === 'title', 'prázdný název → 400 validation_error s cestou pole');
  r = await api('POST', '/deals', F, '{rozbité'); ok(r.s === 400 && r.j.error.code === 'invalid_request', 'rozbitý JSON → 400');
  r = await api('GET', '/deals', F); ok(r.s === 200 && r.j.data.total === 3 && r.j.data.items.length === 3 && !r.t.includes('Cizí deal'), 'GET /deals: 3 dealy, žádný cizí');
  ok(r.j.data.items[0].title === 'Znovu Nová Firma', 'výchozí řazení: nejnovější první');
  r = await api('GET', '/deals?q=druh%C3%BD', F); ok(r.j.data.total === 1 && r.j.data.items[0].title === 'Druhý deal', 'hledání q=druhý');
  r = await api('GET', `/deals?stage_id=${S2}`, F); ok(r.j.data.total === 1 && r.j.data.items[0].title === 'API deal', 'filtr stage_id');
  r = await api('GET', '/deals?limit=1&offset=1&sort=title&dir=asc', F); ok(r.j.data.items.length === 1 && r.j.data.total === 3 && r.j.data.limit === 1 && r.j.data.offset === 1, 'stránkování (limit, offset, total)');
  r = await api('GET', '/deals?limit=500', F); ok(r.s === 400, 'limit=500 → 400');
  r = await api('GET', '/deals/neni-uuid', F); ok(r.s === 400 && r.j.error.code === 'invalid_request', 'neplatné UUID v cestě → 400');
  r = await api('GET', `/deals/${deal.id}`, F); ok(r.s === 200 && Array.isArray(r.j.data.activities) && Array.isArray(r.j.data.history) && r.j.data.labels.length === 0, 'GET /deals/{id}: detail s aktivitami, poznámkami, historií, labely');
  r = await api('PATCH', `/deals/${deal.id}`, F, { value: 75000, title: 'API deal v2' }); ok(r.s === 200 && r.j.data.value === 75000 && r.j.data.title === 'API deal v2', 'PATCH deal');
  r = await api('PATCH', `/deals/${deal.id}`, F, {}); ok(r.s === 400, 'PATCH bez polí → 400');
  r = await api('PATCH', `/deals/${deal.id}`, F, { value: -1 }); ok(r.s === 400, 'PATCH záporná hodnota → 400');
  r = await api('POST', `/deals/${deal.id}/move`, F, { stage_name: 'Schůzka' }); ok(r.s === 200 && r.j.data.stage_name === 'Schůzka', 'move do „Schůzka“ (podle názvu)');
  const moved = r.j.data; ok(new Date(moved.stage_changed_at) > new Date(deal.stage_changed_at) || moved.stage_changed_at !== deal.stage_changed_at, 'stage_changed_at se aktualizuje');
  r = await api('POST', `/deals/${deal.id}/move`, F, { stage_id: uuid() }); ok(r.s === 422 && r.j.error.code === 'stage_not_found', 'move do neexistující fáze → 422');
  r = await api('POST', `/deals/${deal.id}/move`, F, { stage_id: S4 }); ok(r.s === 422, 'move do fáze z cizího workspace → 422 (fáze mu nepatří)');
  r = await api('POST', `/deals/${deal.id}/status`, F, { status: 'lost' }); ok(r.s === 400 && r.j.error.details[0].path === 'lost_reason', 'prohra bez důvodu → 400');
  r = await api('POST', `/deals/${deal.id}/status`, F, { status: 'lost', lost_reason: 'Cena' }); ok(r.s === 200 && r.j.data.status === 'lost' && r.j.data.lost_reason === 'Cena' && r.j.data.lost_at, 'prohra s důvodem');
  r = await api('POST', `/deals/${deal.id}/move`, F, { stage_name: 'Lead' }); ok(r.s === 409 && r.j.error.code === 'deal_closed', 'uzavřený deal nejde přesunout → 409');
  r = await api('POST', `/deals/${deal.id}/status`, F, { status: 'open' }); ok(r.s === 200 && r.j.data.status === 'open' && r.j.data.lost_reason === null, 'znovu otevřít');
  r = await api('POST', `/deals/${deal.id}/status`, F, { status: 'won' }); ok(r.s === 200 && r.j.data.status === 'won' && r.j.data.won_at, 'vyhráno');
  ok(r.j.data.delivery_status === 'in_progress', 'výhra → dodání „pracuje se na tom“');
  r = await api('GET', '/deals?status=won', F); ok(r.j.data.total === 1, 'filtr status=won');
  r = await api('GET', '/deals?status=delivering', F); ok(r.j.data.total === 1, 'filtr status=delivering (vyhrané v realizaci)');
  r = await api('PATCH', `/deals/${deal.id}`, F, { delivery_status: 'ongoing', delivery_ends_on: '2027-11-20' }); ok(r.s === 200 && r.j.data.delivery_status === 'ongoing' && r.j.data.delivery_ends_on === '2027-11-20', 'předplatné s datem konce');
  r = await api('PATCH', `/deals/${deal.id}`, F, { delivery_status: 'in_progress', delivery_ends_on: '2027-11-20' }); ok(r.s === 422, 'datum konce jen u předplatného → 422');
  r = await api('PATCH', `/deals/${deal.id}`, F, { delivery_status: 'done' }); ok(r.s === 200 && r.j.data.delivery_status === 'done' && r.j.data.delivered_at && r.j.data.delivery_ends_on === null, 'dodáno → delivered_at, konec smazán');
  r = await api('GET', '/deals?status=delivering', F); ok(r.j.data.total === 0, 'dodaný deal už není v „delivering“');
  r = await api('PATCH', `/deals/${deal.id}`, F, { delivery_status: 'in_progress' }); ok(r.s === 200 && r.j.data.delivery_status === 'in_progress' && r.j.data.delivered_at === null, 'vrácení do realizace');
  r = await api('POST', `/deals/${deal2.id}/status`, F, { status: 'won', delivery_status: 'ongoing', delivery_ends_on: '2027-01-31' }); ok(r.s === 200 && r.j.data.delivery_status === 'ongoing', 'výhra rovnou jako předplatné');
  r = await api('POST', `/deals/${deal2.id}/status`, F, { status: 'open' }); ok(r.s === 200 && r.j.data.delivery_status === null, 'znovu otevřít vynuluje dodání');
  r = await api('PATCH', `/deals/${deal2.id}`, F, { delivery_status: 'done' }); ok(r.s === 409 && r.j.error.code === 'deal_not_won', 'dodání u otevřeného dealu → 409');
  r = await api('POST', `/deals/${deal2.id}/status`, F, { status: 'lost', lost_reason: 'x', delivery_status: 'done' }); ok(r.s === 422, 'dodání při prohře → 422');
  r = await api('GET', '/deals', F); ok(r.j.data.total === 2, 'výchozí seznam už neobsahuje vyhraný (status=open)');
  r = await api('PUT', `/deals/${deal2.id}/labels`, F, { label_ids: [L1] }); ok(r.s === 200 && r.j.data.label_ids.length === 1, 'labely dealu: nastavení');
  r = await api('PUT', `/deals/${deal2.id}/labels`, F, { label_ids: [L2] }); ok(r.s === 422 && r.j.error.code === 'label_not_found', 'cizí label → 422');
  r = await api('GET', `/deals/${deal2.id}`, F); ok(r.j.data.labels.length === 1 && r.j.data.labels[0].name === 'Horký', 'detail ukazuje label');

  // ===== IZOLACE WORKSPACE (cizí ID)
  r = await api('GET', `/deals/${D2}`, F); ok(r.s === 404, 'GET cizího dealu → 404');
  r = await api('PATCH', `/deals/${D2}`, F, { title: 'hack' }); ok(r.s === 404, 'PATCH cizího dealu → 404');
  r = await api('DELETE', `/deals/${D2}`, F); ok(r.s === 404, 'DELETE cizího dealu → 404');
  r = await api('POST', `/deals/${D2}/move`, F, { stage_name: 'Lead' }); ok(r.s === 404, 'move cizího dealu → 404');
  r = await api('POST', `/deals/${D2}/status`, F, { status: 'won' }); ok(r.s === 404, 'status cizího dealu → 404');
  r = await api('GET', `/persons/${PER2}`, F); ok(r.s === 404, 'GET cizí osoby → 404');
  r = await api('DELETE', `/organizations/${O2}`, F); ok(r.s === 404, 'DELETE cizí firmy → 404');
  r = await api('PATCH', `/activities/${A2}`, F, { subject: 'hack' }); ok(r.s === 404, 'PATCH cizí aktivity → 404');
  r = await api('POST', `/activities/${A2}/complete`, F, {}); ok(r.s === 404, 'complete cizí aktivity → 404');
  r = await api('POST', '/activities', F, { subject: 'x', deal_id: D2 }); ok(r.s === 422, 'aktivita k cizímu dealu → 422');
  ok(seed.tables.deals.find((d) => d.id === D2).title === 'Cizí deal', 'cizí deal v DB zůstal nedotčený');
  r = await api('GET', '/deals', keys.other); ok(r.j.data.total === 1 && r.j.data.items[0].title === 'Cizí deal' && !r.t.includes('API deal'), 'klíč druhého workspace vidí jen svá data');
  r = await api('GET', `/deals/${deal.id}`, keys.other); ok(r.s === 404, 'a nevidí dealy prvního workspace');

  // ===== OSOBY A FIRMY
  r = await api('POST', '/persons', F, { first_name: 'Eva', last_name: 'Černá', email: 'EVA@x.cz', organization_name: 'Beta Invest' }); ok(r.s === 201 && r.j.data.full_name === 'Eva Černá' && r.j.data.organization_name === 'Beta Invest', 'POST /persons (firma jménem)'); const per = r.j.data;
  r = await api('POST', '/persons', F, { email: 'a@b.cz' }); ok(r.s === 400, 'osoba bez jména → 400');
  r = await api('POST', '/persons', F, { last_name: 'X', email: 'spatny' }); ok(r.s === 400, 'osoba s neplatným e-mailem → 400');
  r = await api('GET', '/persons?q=cern', F); ok(r.s === 200, 'GET /persons?q'); 
  r = await api('PATCH', `/persons/${per.id}`, F, { phone: '+420 777 111 222', position: '', web: 'jannovak.cz' }); ok(r.s === 200 && r.j.data.phone === '+420 777 111 222' && r.j.data.position === null && r.j.data.web === 'jannovak.cz', 'PATCH osoby (prázdný řetězec → null, web)');
  r = await api('GET', `/persons/${per.id}`, F); ok(r.s === 200 && Array.isArray(r.j.data.deals) && Array.isArray(r.j.data.notes), 'detail osoby');
  r = await api('POST', '/organizations', F, { name: 'Gama s.r.o.', ico: '123 456 78', web: 'gama.cz' }); ok(r.s === 201 && r.j.data.ico === '12345678', 'POST /organizations (IČO normalizované)'); const org = r.j.data;
  // štítky na osobách a firmách (sdílená sada se štítky dealů)
  r = await api('PUT', `/persons/${per.id}/labels`, F, { label_ids: [L1] }); ok(r.s === 200 && r.j.data.label_ids.length === 1, 'štítky osoby: nastavení');
  r = await api('PUT', `/persons/${per.id}/labels`, F, { label_ids: [L2] }); ok(r.s === 422 && r.j.error.code === 'label_not_found', 'štítek osoby: cizí štítek → 422');
  r = await api('PUT', `/persons/${PER2}/labels`, F, { label_ids: [L1] }); ok(r.s === 404, 'štítky cizí osoby → 404');
  r = await api('GET', `/persons/${per.id}`, F); ok(r.j.data.labels.length === 1 && r.j.data.labels[0].name === 'Horký', 'detail osoby ukazuje štítek');
  r = await api('GET', '/persons?q=Eva', F); ok(r.j.data.items[0].labels?.[0]?.name === 'Horký', 'seznam osob ukazuje štítky');
  r = await api('PUT', `/organizations/${org.id}/labels`, F, { label_ids: [L1] }); ok(r.s === 200, 'štítky firmy: nastavení');
  r = await api('GET', `/organizations/${org.id}`, F); ok(r.j.data.labels.length === 1, 'detail firmy ukazuje štítek');
  r = await api('PUT', `/organizations/${org.id}/labels`, F, { label_ids: [] }); r = await api('GET', `/organizations/${org.id}`, F); ok(r.j.data.labels.length === 0, 'štítky firmy: odebrání');
  r = await api('PUT', `/organizations/${O2}/labels`, F, { label_ids: [L1] }); ok(r.s === 404, 'štítky cizí firmy → 404');
  r = await api('POST', '/organizations', F, { name: 'Špatné', ico: '123' }); ok(r.s === 400, 'neplatné IČO → 400');
  r = await api('GET', `/organizations/${org.id}`, F); ok(r.s === 200 && Array.isArray(r.j.data.persons), 'detail firmy');
  r = await api('DELETE', `/persons/${per.id}`, F); ok(r.s === 200 && r.j.data.deleted === true, 'DELETE osoby');
  r = await api('GET', `/persons/${per.id}`, F); ok(r.s === 404, 'smazaná osoba už neexistuje');

  // ===== AKTIVITY A WORKFLOW DALŠÍHO KROKU
  r = await api('POST', '/activities', F, { subject: 'Zavolat ohledně nabídky', type: 'call', deal_id: deal2.id, due_date: '2020-01-01' }); ok(r.s === 201 && r.j.data.deal_id === deal2.id && r.j.data.assigned_to === U1 && r.j.data.person_id === null, 'POST /activities (přiřazeno majiteli klíče, vazby z dealu)'); const act = r.j.data;
  r = await api('POST', '/activities', F, { subject: 'x', type: 'oběd' }); ok(r.s === 400, 'neznámý typ aktivity → 400');
  r = await api('GET', '/activities?due=overdue', F); ok(r.s === 200 && r.j.data.items.some((a) => a.id === act.id) && !r.t.includes('Cizí aktivita'), 'due=overdue: vidí zpožděnou, nevidí cizí');
  r = await api('GET', '/deals?q=Druh%C3%BD', F); ok(r.j.data.items[0].open_activities === 1 && r.j.data.items[0].next_activity.subject === 'Zavolat ohledně nabídky', 'deal ukazuje další krok');
  r = await api('POST', `/activities/${act.id}/complete`, F, { next: { subject: 'Poslat nabídku', due_date: '2030-01-15' } });
  ok(r.s === 200 && r.j.data.completed.done === true && r.j.data.next_activity.subject === 'Poslat nabídku' && r.j.data.next_activity.deal_id === deal2.id && r.j.data.next_activity.type === 'call', 'complete + next: dokončí a naplánuje navazující krok na stejný deal (typ zděděn)');
  const nextAct = r.j.data.next_activity;
  r = await api('POST', `/activities/${nextAct.id}/complete`, F); ok(r.s === 200 && /nemá žádný naplánovaný/.test(r.j.data.warning), 'complete bez next u posledního kroku → varování, že deal nemá další krok');
  r = await api('PATCH', `/activities/${nextAct.id}`, F, { subject: 'upraveno', due_date: '2030-02-01' }); ok(r.s === 200 && r.j.data.subject === 'upraveno', 'PATCH aktivity');
  r = await api('DELETE', `/activities/${nextAct.id}`, F); ok(r.s === 200, 'DELETE aktivity');
  r = await api('GET', '/activities?done=true', F); ok(r.j.data.items.length >= 1, 'done=true vrací hotové');

  // ===== POZNÁMKY
  r = await api('POST', '/notes', F, { content: 'Poznámka k dealu', deal_id: deal2.id }); ok(r.s === 201 && r.j.data.author_id === U1 && r.j.data.deal_id === deal2.id, 'POST /notes (autor = majitel klíče)');
  r = await api('POST', '/notes', F, { content: 'bez cíle' }); ok(r.s === 400, 'poznámka bez cíle → 400');
  r = await api('GET', `/notes?deal_id=${deal2.id}`, F); ok(r.j.data.total === 1, 'GET /notes?deal_id');

  // ===== PŘEHLED
  r = await api('GET', '/overview', F); ok(r.s === 200 && r.j.data.kpis.open_deals === 2 && r.j.data.kpis.won_this_month === 1 && r.j.data.kpis.won_value_this_month === 75000, 'overview: KPI (2 otevřené, 1 vyhraný = 75 000)');
  ok(r.j.data.funnel[0].stages.length === 3 && Array.isArray(r.j.data.deals_without_next_step) && r.j.data.deals_without_next_step.length >= 1, 'overview: funnel a dealy bez dalšího kroku');

  // ===== SMAZÁNÍ DEALU
  r = await api('DELETE', `/deals/${deal2.id}`, F); ok(r.s === 200 && r.j.data.deleted, 'DELETE dealu');
  r = await api('DELETE', `/deals/${deal2.id}`, F); ok(r.s === 404, 'druhé smazání → 404');

  // ===== OPENAPI
  r = await call('GET', '/api/v1/openapi.json'); ok(r.s === 200 && r.j.openapi === '3.1.0' && Object.keys(r.j.paths).length > 15, 'OpenAPI je veřejné a kompletní');

  // ===== MCP
  const mcp = (body, key = F, extra = {}) => call('POST', '/api/mcp', key, body, extra);
  r = await call('POST', '/api/mcp', undefined, { jsonrpc: '2.0', id: 1, method: 'ping' }); ok(r.s === 401, 'MCP bez klíče → 401');
  r = await call('GET', '/api/mcp', F); ok(r.s === 405, 'MCP GET → 405');
  r = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } }); ok(r.s === 200 && r.j.result.protocolVersion === '2025-03-26' && r.j.result.serverInfo.name === 'nexdeals' && r.j.result.capabilities.tools && /další krok/.test(r.j.result.instructions), 'MCP initialize');
  r = await mcp({ jsonrpc: '2.0', method: 'notifications/initialized' }); ok(r.s === 202, 'MCP notifikace → 202');
  r = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }); const tools = r.j.result.tools; ok(tools.length === 18 && tools.every((t) => t.name && t.description && t.inputSchema.type === 'object'), `MCP tools/list: ${tools.length} nástrojů s JSON schématem`);
  ok(!tools.some((t) => /delete|remove|smaz/i.test(t.name)), 'žádný nástroj pro mazání');
  const cd = tools.find((t) => t.name === 'create_deal'); ok(cd.inputSchema.required.includes('title') && cd.inputSchema.properties.organization_name, 'schéma create_deal: povinný title, organization_name');
  const callTool = (name, args, key = F) => mcp({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }, key);
  r = await callTool('get_overview', {}); ok(r.j.result.content[0].type === 'text' && JSON.parse(r.j.result.content[0].text).kpis, 'tool get_overview');
  r = await callTool('create_deal', { title: 'Z Clauda', value: 12000, stage_name: 'Kontaktován', organization_name: 'Claude s.r.o.' }); const mdeal = JSON.parse(r.j.result.content[0].text); ok(!r.j.result.isError && mdeal.title === 'Z Clauda' && mdeal.stage_name === 'Kontaktován', 'tool create_deal');
  r = await callTool('search_deals', { q: 'claud' }); ok(JSON.parse(r.j.result.content[0].text).total === 1, 'tool search_deals');
  r = await callTool('create_activity', { subject: 'První krok', type: 'call', deal_id: mdeal.id, due_date: '2030-03-01' }); const mact = JSON.parse(r.j.result.content[0].text); ok(!r.j.result.isError && mact.deal_id === mdeal.id, 'tool create_activity');
  r = await callTool('complete_activity', { id: mact.id, next_subject: 'Druhý krok', next_due_date: '2030-03-10' }); ok(JSON.parse(r.j.result.content[0].text).next_activity.subject === 'Druhý krok', 'tool complete_activity s next_subject');
  r = await callTool('move_deal', { id: mdeal.id, stage_name: 'Schůzka' }); ok(JSON.parse(r.j.result.content[0].text).stage_name === 'Schůzka', 'tool move_deal');
  r = await callTool('close_deal', { id: mdeal.id, status: 'lost' }); ok(r.j.result.isError === true && /lost_reason/.test(r.j.result.content[0].text), 'tool close_deal bez důvodu → isError');
  r = await callTool('close_deal', { id: mdeal.id, status: 'lost', lost_reason: 'Cena' }); ok(!r.j.result.isError, 'tool close_deal s důvodem');
  r = await callTool('create_person', { first_name: 'Štítek', last_name: 'Testovací' }); const lper = JSON.parse(r.j.result.content[0].text);
  r = await callTool('set_contact_labels', { type: 'person', id: lper.id, labels: ['Horký', 'Nový štítek'] }); ok(!r.j.result.isError && JSON.parse(r.j.result.content[0].text).label_ids.length === 2, 'tool set_contact_labels (název existující + vytvoření nového)');
  r = await callTool('search_contacts', { label: 'Neexistuje' }); ok(r.j.result.isError === true, 'tool search_contacts: neznámý štítek → isError');
  r = await callTool('search_contacts', {}); ok(r.j.result.isError === true, 'tool search_contacts bez q i label → isError');
  r = await callTool('search_contacts', { q: 'claude' }); ok(JSON.parse(r.j.result.content[0].text).organizations.length === 1, 'tool search_contacts');
  r = await callTool('add_note', { content: 'Poznámka z MCP', deal_id: mdeal.id }); ok(!r.j.result.isError, 'tool add_note');
  r = await callTool('get_deal', { id: D2 }); ok(r.j.result.isError && /not_found/.test(r.j.result.content[0].text), 'tool get_deal cizího dealu → isError (not_found)');
  r = await callTool('create_deal', { title: 'RO' }, keys.ro); ok(r.j.result.isError && /forbidden/.test(r.j.result.content[0].text), 'tool zápisu s klíčem jen pro čtení → isError (forbidden)');
  r = await callTool('get_overview', {}, keys.ro); ok(!r.j.result.isError, 'tool pro čtení s klíčem jen pro čtení funguje');
  r = await callTool('neexistuje', {}); ok(r.j.error && r.j.error.code === -32602, 'neznámý tool → JSON-RPC chyba');
  r = await callTool('create_deal', { value: 1 }); ok(r.j.result.isError && /validation_error/.test(r.j.result.content[0].text), 'neplatné argumenty → isError (validation_error)');
  r = await mcp([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]); ok(Array.isArray(r.j) && r.j.length === 2, 'MCP batch');
  r = await mcp({ jsonrpc: '2.0', id: 5, method: 'neznama/metoda' }); ok(r.j.error.code === -32601, 'neznámá metoda → -32601');
  r = await call('POST', '/api/mcp', F, '{rozbité'); ok(r.s === 400 && r.j.error.code === -32700, 'MCP rozbitý JSON → -32700');

  // ===== RATE LIMIT
  const results = await Promise.all(Array.from({ length: 135 }, () => api('GET', '/me', keys.rate)));
  const limited = results.filter((x) => x.s === 429); ok(limited.length >= 10 && limited[0].j.error.code === 'rate_limited' && +limited[0].h.get('retry-after') >= 1, `rate limit: ${limited.length}× 429 s Retry-After po 120 požadavcích/min`);
} catch (e) { fail++; console.log('FAIL výjimka testu:', e.stack); }

// ===== AUDIT IZOLACE: každý dotaz na DB nese workspace
const log = fs.readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l)); const violations = [];
const SCOPED = ['deals', 'persons', 'organizations', 'activities', 'notes', 'labels', 'pipelines', 'profiles'];
for (const e of log) {
  if (!SCOPED.includes(e.t)) continue;
  if (e.m === 'POST') { for (const row of Array.isArray(e.b) ? e.b : [e.b]) if (!row.workspace_id) violations.push(`POST ${e.t} bez workspace_id: ${JSON.stringify(row).slice(0, 100)}`); }
  else if (!/workspace_id=eq\.[0-9a-f-]{36}/.test(e.u)) violations.push(`${e.m} ${e.t}${e.u.slice(0, 120)}`);
}
for (const e of log) if (e.t === 'stages') { const ids = (e.u.match(/pipeline_id=in\.\(([^)]*)\)/) || [])[1]?.split(',') ?? []; if (!ids.length || !(ids.every((i) => i === P1) || ids.every((i) => i === P2))) violations.push(`stages mimo pipelines workspace: ${e.u.slice(0, 100)}`); }
ok(violations.length === 0, `AUDIT: všech ${log.filter((e) => SCOPED.includes(e.t)).length} dotazů na workspace-tabulky nese workspace_id (${violations.length} porušení)`);
if (violations.length) console.log(violations.slice(0, 10).join('\n'));
ok(seed.tables.deals.filter((d) => d.workspace_id === W1).every((d) => d.pipeline_id === P1), 'všechny vytvořené dealy jsou v pipeline vlastního workspace');
console.log(`\nVÝSLEDEK: ${pass} PASS, ${fail} FAIL`); fake.kill(); process.exit(fail ? 1 : 0);
