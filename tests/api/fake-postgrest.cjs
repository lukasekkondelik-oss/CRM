// Mini PostgREST: in-memory tabulky, filtry (eq/neq/in/ilike/lt/lte/gt/gte/is/or), order, limit/offset, count, insert/patch/delete.
const http = require('http'), fs = require('fs'), crypto = require('crypto');
const seed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const LOG = process.argv[3]; const PORT = +process.argv[4];
const T = seed.tables;
const uuid = () => crypto.randomUUID();
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const like = (v, pat) => { if (v == null) return false; const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\\([%_])/g, '$1') + '$', 'i'); return re.test(String(v)); };
function cond(row, col, expr) {
  let neg = false; if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const i = expr.indexOf('.'); const op = expr.slice(0, i), val = expr.slice(i + 1); const v = row[col]; let r;
  if (op === 'eq') r = String(v) === val; else if (op === 'neq') r = String(v) !== val;
  else if (op === 'in') r = val.slice(1, -1).split(',').includes(String(v));
  else if (op === 'ilike' || op === 'like') r = like(v, val);
  else if (op === 'lt') r = v != null && v < val; else if (op === 'lte') r = v != null && v <= val; else if (op === 'gt') r = v != null && v > val; else if (op === 'gte') r = v != null && v >= val;
  else if (op === 'is') r = val === 'null' ? v == null : v != null; else r = true;
  return neg ? !r : r;
}
function orMatch(row, inner) { // "a.ilike.*x*,b.ilike.*x*"
  return inner.split(/,(?=[a-z_]+\.)/).some((c) => { const j = c.indexOf('.'); return cond(row, c.slice(0, j), c.slice(j + 1)); });
}
function filter(rows, params) {
  return rows.filter((r) => { for (const [k, v] of params) { if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue; if (k === 'or') { if (!orMatch(r, v.slice(1, -1))) return false; } else if (!cond(r, k, v)) return false; } return true; });
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const send = (res, code, body, h = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...CORS, ...h }); res.end(body === undefined ? undefined : JSON.stringify(body)); };
function applyTriggers(table, row, old) {
  if (table === 'deals') { const now = new Date().toISOString(); row.updated_at = now;
    if (old && row.status !== old.status) { if (row.status === 'won') { row.won_at = now; row.lost_at = null; row.lost_reason = null; row.delivery_status = row.delivery_status || 'in_progress'; } else if (row.status === 'lost') { row.lost_at = now; row.won_at = null; row.delivery_status = null; } else { row.won_at = null; row.lost_at = null; row.lost_reason = null; row.delivery_status = null; } }
    if (row.status !== 'won') row.delivery_status = null; if (row.delivery_status !== 'ongoing') row.delivery_ends_on = null; if (row.delivery_status === 'done') row.delivered_at = row.delivered_at || now; else row.delivered_at = null; }
  if (table === 'activities') { if (row.done) row.done_at = row.done_at || new Date().toISOString(); else row.done_at = null; }
}
const defaults = { deals: { currency: 'CZK', status: 'open', value: 0, stage_changed_at: () => new Date().toISOString(), created_at: () => new Date().toISOString(), updated_at: () => new Date().toISOString(), won_at: null, lost_at: null, lost_reason: null },
  activities: { done: false, done_at: null, created_at: () => new Date().toISOString() }, persons: { created_at: () => new Date().toISOString() }, organizations: { created_at: () => new Date().toISOString() }, notes: { created_at: () => new Date().toISOString() } };

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/auth/v1/user') { return seed.authUser ? send(res, 200, seed.authUser) : send(res, 401, { message: 'no user' }); }
    const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    const entry = { m: req.method, t: m && m[1], u: decodeURIComponent(url.search), b: body ? JSON.parse(body) : null }; fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
    if (!m) return send(res, 404, { message: 'nenalezeno' });
    const table = m[1]; if (!T[table]) T[table] = [];
    const prefer = req.headers.prefer || ''; const wantRep = prefer.includes('return=representation'); const wantsObj = (req.headers.accept || '').includes('vnd.pgrst.object');
    const params = [...url.searchParams.entries()];
    const finish = (rows, code = 200, extra = {}) => {
      if (wantsObj) { if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }); return send(res, code, rows[0], extra); }
      return send(res, code, rows, extra);
    };
    try {
      if (req.method === 'GET') {
        let rows = filter(T[table], params);
        const total = rows.length; const ord = url.searchParams.get('order');
        if (ord) for (const o of ord.split(',').reverse()) { const [c, ...f] = o.split('.'); const desc = f.includes('desc'); const nf = f.includes('nullsfirst'); rows = [...rows].sort((a, b) => { const av = a[c], bv = b[c]; if (av == null && bv == null) return 0; if (av == null) return nf ? -1 : 1; if (bv == null) return nf ? 1 : -1; return desc ? -cmp(av, bv) : cmp(av, bv); }); }
        const off = +(url.searchParams.get('offset') || 0), lim = url.searchParams.get('limit'); rows = rows.slice(off, lim ? off + +lim : undefined);
        const h = prefer.includes('count=exact') ? { 'content-range': `${rows.length ? off : '*'}-${off + Math.max(rows.length - 1, 0)}/${total}` } : {};
        return finish(rows, 200, h);
      }
      if (req.method === 'POST') {
        const items = (Array.isArray(entry.b) ? entry.b : [entry.b]).map((r) => { const o = { id: uuid(), ...Object.fromEntries(Object.entries(defaults[table] || {}).map(([k, v]) => [k, typeof v === 'function' ? v() : v])), ...r }; applyTriggers(table, o, null); return o; });
        T[table].push(...items); return wantRep ? finish(items, 201) : send(res, 201);
      }
      if (req.method === 'PATCH') {
        const rows = filter(T[table], params); for (const r of rows) { const old = { ...r }; Object.assign(r, entry.b); applyTriggers(table, r, old); }
        return wantRep ? finish(rows, 200) : send(res, 204);
      }
      if (req.method === 'DELETE') {
        const rows = filter(T[table], params); T[table] = T[table].filter((r) => !rows.includes(r)); return wantRep ? finish(rows, 200) : send(res, 204);
      }
      send(res, 405, {});
    } catch (e) { send(res, 500, { message: String(e) }); }
  });
}).listen(PORT);
