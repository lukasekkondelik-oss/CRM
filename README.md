# nexdeals

CRM zaměřené na prodejní pipeline, dealy a aktivity (funkčně podobné Pipedrive). UI je česky, měna CZK.
Stack: Next.js 16 (App Router) + TypeScript, Supabase (Postgres, Auth, RLS), Tailwind CSS v4, @dnd-kit, Recharts.

## Rychlý start

1. **Supabase projekt** – vytvoř na [supabase.com](https://supabase.com).
2. **Schéma** – v Supabase → SQL Editor spusť postupně všechny soubory ze `supabase/migrations/` (podle pořadí v názvu):
   `…000000_init.sql`, `…000100_harden_functions.sql`, `…000200_phase6_invites_search.sql`
   (nebo `supabase db push` přes Supabase CLI). Každý soubor je jeden skript, který proběhne celý, nebo vůbec.
3. **Auth** – Authentication → URL Configuration: `Site URL` = `http://localhost:3000`
   a do `Redirect URLs` přidej `http://localhost:3000/auth/callback` (+ produkční URL z Vercelu).
   Pro rychlé testování můžeš v Authentication → Providers → Email vypnout „Confirm email“.
4. **Env** – `cp .env.example .env.local` a doplň `NEXT_PUBLIC_SUPABASE_URL` a `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. `npm install && npm run dev` → http://localhost:3000 → Registrace.

## Test databáze (bez Supabase)

`supabase/tests/` obsahuje napodobeninu Supabase `auth` schématu a smoke test RLS/triggerů pro čistý Postgres 15+:

```bash
createdb crm_test
psql crm_test -v ON_ERROR_STOP=1 -f supabase/tests/mock_supabase.sql
psql crm_test -v ON_ERROR_STOP=1 -f supabase/migrations/20261119000000_init.sql
psql crm_test -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke_test.sql
```

Hledej řádky `NOTICE: OK ...`; slovo `MELO SELHAT` se objeví jen při chybě.

## Stav

- **Fáze 1** – schéma, RLS, auth, onboarding, layout.
- **Fáze 2** – Pipeline Kanban (drag & drop, zóny Vyhráno/Prohráno, filtry, tabulkový pohled s hromadnými akcemi),
  CRUD dealů, detail dealu (`/dealy/[id]`).

- **Fáze 3** – Osoby a Firmy (hledání, řazení, stránkování), detaily s navázanými dealy, aktivitami a poznámkami,
  klikací `tel:`/`mailto:`, serverové hledání ve výběrech osob a firem.
- **Fáze 4** – Aktivity (Dnes / Po termínu / Tento týden / Vše, kalendář týden/měsíc), modal „Naplánovat další
  aktivitu?“, odznak v navigaci, další krok na kartě dealu.
- **Fáze 5** – Dashboard (KPI, funnel, výhry/prohry po měsících, seznamy, filtr období a vlastníka).
- **Fáze 6** – Nastavení (pipelines a fáze s drag & drop, labely, tým a pozvánky), globální hledání Ctrl/Cmd+K,
  import CSV s mapováním a náhledem, export CSV. Vyžaduje migraci `20261119000200_phase6_invites_search.sql`.

## API a Claude (MCP)

Aplikaci lze ovládat přes **REST API** (`/api/v1`) a **MCP server** (`/api/mcp`), takže s CRM umí pracovat Claude Code,
Claude Desktop, n8n, Make nebo vlastní skripty.

1. V Supabase spusť migraci `supabase/migrations/20261120000000_api_keys.sql`.
2. Ve Vercelu přidej tajnou proměnnou `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API Keys → *service_role / secret*,
   v nastavení proměnné zaškrtni *Sensitive*) a proveď nový deploy. Klíč nikdy nedávej do proměnné s `NEXT_PUBLIC_`.
3. V aplikaci: **Nastavení → API a Claude** → vytvoř klíč (jen čtení, nebo čtení + zápis) a zkopíruj hotový příkaz:

```bash
claude mcp add --transport http nexdeals https://TVOJE-DOMENA/api/mcp --header "Authorization: Bearer nxd_…"
```

- Dokumentace endpointů: `/api/v1/openapi.json` (OpenAPI 3.1, veřejné, bez dat).
- Klíč jedná jménem svého uživatele, vidí jen jeho workspace a po odebrání uživatele z týmu přestane fungovat. V DB je jen SHA-256 otisk.
- Server používá service role (obchází RLS), proto je **každý dotaz explicitně omezený na `workspace_id` klíče**
  a test `npm run test:api` to u všech dotazů automaticky kontroluje.
- MCP záměrně nenabízí mazání dealů, osob ani firem. Limit: 120 požadavků/min na klíč.

### claude.ai (webový konektor, OAuth)

Bez klíčů a terminálu: v claude.ai → **Nastavení → Konektory → Přidat vlastní konektor** zadej adresu
`https://TVOJE-DOMENA/api/mcp` (pole OAuth Client ID/Secret nech prázdná), klikni **Připojit**, přihlas se do nexdeals
a na stránce souhlasu zvol *Jen čtení* nebo *Čtení a zápis*. Přístup lze kdykoli odvolat v Nastavení → API a Claude.

- Implementace OAuth 2.1 podle MCP specifikace: discovery (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`),
  dynamická registrace klientů (`/oauth/register`), `/oauth/authorize` (souhlas), `/oauth/token`, `/oauth/revoke`.
- Jen veřejní klienti s **PKCE (S256)**; autorizační kód je jednorázový (10 min), access token platí 1 hodinu,
  refresh token se při každém použití **rotuje** a jeho znovupoužití odvolá celý přístup.
- Souhlas dává přihlášený uživatel a volí oprávnění; tokeny jednají jeho jménem. V DB jsou jen SHA-256 otisky.
- Vyžaduje migraci `20261121000000_oauth.sql` (je součástí `supabase/manual/apply_pending.sql`).

Testy: `npm test` (jednotkové), `npm run test:api` (e2e API a MCP proti falešnému PostgREST), `bash tests/api/run-oauth.sh` (e2e OAuth s prohlížečem a klientským kódem MCP SDK).


- **Fáze 7** – polish: skeletony všech sekcí, chybové stránky, tmavý toast, hlavičky zabezpečení, ikona, skip-link,
  výkon (líné načtení hledání a grafů, memoizované karty při tahu), kontrola mobilu a tmavého režimu.
