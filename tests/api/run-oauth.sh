#!/usr/bin/env bash
# E2E test OAuth 2.1 (discovery, registrace klienta, souhlas v prohlížeči, PKCE, rotace refresh tokenů, odvolání).
# Použití:  bash tests/api/run-oauth.sh   (potřebuje Playwright s Chromiem; nepotřebuje Supabase ani internet)
set -euo pipefail
cd "$(dirname "$0")/../.."
PORT="${TEST_PORT:-3109}"
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54341 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy \
  npx next dev -p "$PORT" >/tmp/nexdeals-oauth-test.log 2>&1 &
DEV=$!
trap 'kill $DEV 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -fs "localhost:$PORT/.well-known/oauth-authorization-server" >/dev/null 2>&1 && break; sleep 1; done
TEST_PORT="$PORT" node --experimental-strip-types --no-warnings tests/api/oauth.e2e.mjs "$(pwd)"
