# nexdeals

CRM zaměřené na prodejní pipeline, dealy a aktivity (funkčně podobné Pipedrive). UI je česky, měna CZK.
Stack: Next.js 16 (App Router) + TypeScript, Supabase (Postgres, Auth, RLS), Tailwind CSS v4, @dnd-kit, Recharts.

## Rychlý start

1. **Supabase projekt** – vytvoř na [supabase.com](https://supabase.com).
2. **Schéma** – v Supabase → SQL Editor spusť obsah `supabase/migrations/20261119000000_init.sql`
   (nebo `supabase db push` přes Supabase CLI).
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

Testy: `npm test` (jednotkové testy výpočtů).

Roadmapa Fází 6–7 je v zadání projektu.
