#!/usr/bin/env bash
# E2E test REST API a MCP: spustí falešný PostgREST (in-memory) a dev server proti němu a projde ~115 kontrol
# včetně auditu izolace workspace. Nepotřebuje Supabase ani internet.   Použití:  bash tests/api/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PORT="${TEST_PORT:-3108}"
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54340 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy \
  npx next dev -p "$PORT" >/tmp/nexdeals-api-test.log 2>&1 &
DEV=$!
trap 'kill $DEV 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -fs "localhost:$PORT/api/v1/openapi.json" >/dev/null 2>&1 && break; sleep 1; done
TEST_PORT="$PORT" node --experimental-strip-types --no-warnings tests/api/api.e2e.mjs "$(pwd)"
