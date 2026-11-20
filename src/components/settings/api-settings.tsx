"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { AlertTriangle, Bot, Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { generateApiKey, keyDisplayPrefix, sha256Hex } from "@/lib/api/key-utils";
import type { ApiKeyRow, OAuthGrantRow } from "@/lib/data/settings";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format";

interface Props {
  apiKeys: ApiKeyRow[];
  apiKeysAvailable: boolean;
  apiConfigured: boolean;
  oauthAvailable: boolean;
  oauthGrants: OAuthGrantRow[];
  endpoints: { method: string; path: string; summary: string; scope: string }[];
  mcpTools: { name: string; description: string; write: boolean }[];
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { toast.error("Kopírování se nepovedlo."); } }}
          className="flex items-center gap-1 text-xs text-accent-foreground hover:underline">{ok ? <Check className="size-3" /> : <Copy className="size-3" />} {ok ? "Zkopírováno" : "Kopírovat"}</button>
      </div>
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">{text}</pre>
    </div>
  );
}

const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
const EXPIRY: [string, number | null][] = [["Bez expirace", null], ["30 dní", 30], ["90 dní", 90], ["1 rok", 365]];

export function ApiSettings({ apiKeys: initial, apiKeysAvailable, apiConfigured, oauthAvailable, oauthGrants: initialGrants, endpoints, mcpTools }: Props) {
  const [keys, setKeys] = useState(initial);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"rw" | "r">("rw");
  const [expiry, setExpiry] = useState("0");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<ApiKeyRow | null>(null);
  const [grants, setGrants] = useState(initialGrants);
  const [revokeGrant, setRevokeGrant] = useState<OAuthGrantRow | null>(null);
  const sb = createClient();
  // na serveru prázdné, v prohlížeči skutečná adresa (bez hydration mismatch)
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const k = fresh ?? "nxd_VÁŠ_KLÍČ";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    // Klíč vzniká v prohlížeči a na server jde jen jeho SHA-256 otisk – plný klíč nikde jinde není.
    const key = generateApiKey();
    const days = EXPIRY[Number(expiry)][1];
    const { data, error } = await sb.from("api_keys").insert({
      name: name.trim(), key_prefix: keyDisplayPrefix(key), key_hash: await sha256Hex(key),
      scopes: scope === "rw" ? ["read", "write"] : ["read"], expires_at: days ? inDays(days) : null,
    }).select("id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at").single();
    setBusy(false);
    if (error || !data) return void toast.error("Klíč se nepodařilo vytvořit. Je spuštěná migrace API klíčů?");
    setKeys((ks) => [data as ApiKeyRow, ...ks]);
    setFresh(key);
    setName("");
  }

  async function doRevoke(key: ApiKeyRow) {
    const { error } = await sb.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", key.id);
    if (error) return void toast.error("Klíč se nepodařilo odvolat.");
    setKeys((ks) => ks.map((x) => (x.id === key.id ? { ...x, revoked_at: new Date().toISOString() } : x)));
    toast.success("Klíč odvolán – přestal fungovat okamžitě");
  }

  async function doRevokeGrant(g: OAuthGrantRow) {
    const { error } = await sb.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", g.id);
    if (error) return void toast.error("Přístup se nepodařilo odvolat.");
    setGrants((gs) => gs.map((x) => (x.id === g.id ? { ...x, revoked_at: new Date().toISOString() } : x)));
    toast.success("Přístup odvolán – aplikace ztratila přístup okamžitě");
  }

  async function removeGrant(g: OAuthGrantRow) {
    const { error } = await sb.from("oauth_tokens").delete().eq("id", g.id);
    if (error) return void toast.error("Záznam se nepodařilo smazat.");
    setGrants((gs) => gs.filter((x) => x.id !== g.id));
  }

  async function remove(key: ApiKeyRow) {
    const { error } = await sb.from("api_keys").delete().eq("id", key.id);
    if (error) return void toast.error("Klíč se nepodařilo smazat.");
    setKeys((ks) => ks.filter((x) => x.id !== key.id));
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {!apiConfigured && (
        <div role="alert" className="flex gap-3 rounded-xl bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">API na serveru zatím není zapnuté.</p>
            <p className="mt-1">Ve Vercelu (Settings → Environment Variables) přidej <code>SUPABASE_SERVICE_ROLE_KEY</code> s tajným klíčem <i>service_role</i> / <i>secret</i> ze Supabase (Project Settings → API Keys), zaškrtni „Sensitive“ a proveď nový deploy. Klíč nikdy nedávej do proměnné s <code>NEXT_PUBLIC_</code>.</p>
          </div>
        </div>
      )}
      {!apiKeysAvailable && (
        <div role="alert" className="flex gap-3 rounded-xl bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Chybí databázová tabulka klíčů. Spusť v Supabase SQL Editoru soubor <code>supabase/migrations/20261120000000_api_keys.sql</code>.</p>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> API klíče</CardTitle>
          <CardDescription>Klíč jedná tvým jménem a vidí jen tvůj workspace. Celý klíč se zobrazí jednou při vytvoření, v databázi je jen jeho otisk.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={create} className="grid items-end gap-3 sm:grid-cols-[1fr_190px_140px_auto]">
            <div className="flex flex-col gap-1.5"><Label htmlFor="key-name">Název</Label><Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Např. Claude Code" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="key-scope">Oprávnění</Label>
              <Select id="key-scope" value={scope} onChange={(e) => setScope(e.target.value as "rw" | "r")}><option value="rw">Čtení a zápis</option><option value="r">Jen čtení</option></Select></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="key-exp">Platnost</Label>
              <Select id="key-exp" value={expiry} onChange={(e) => setExpiry(e.target.value)}>{EXPIRY.map(([l], i) => <option key={l} value={i}>{l}</option>)}</Select></div>
            <Button type="submit" disabled={busy || !name.trim() || !apiKeysAvailable}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} Vytvořit</Button>
          </form>

          {fresh && (
            <div role="status" className="rounded-xl border-2 border-success/50 bg-success-soft/50 p-4">
              <p className="mb-2 text-sm font-semibold">Nový klíč – zkopíruj si ho teď, podruhé už ho neuvidíš</p>
              <CopyBlock label="API klíč" text={fresh} />
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setFresh(null)}>Zkopíroval jsem, skrýt</Button>
            </div>
          )}

          {keys.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Zatím nemáš žádný klíč. Vytvoř první a připoj Claude nebo vlastní skript.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {keys.map((key) => {
                const expired = !!key.expires_at && new Date(key.expires_at) < new Date();
                const dead = !!key.revoked_at || expired;
                return (
                  <li key={key.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                    <div className={`min-w-0 flex-1 ${dead ? "opacity-60" : ""}`}>
                      <p className="truncate text-sm font-medium">{key.name} <code className="ml-1 text-xs font-normal text-muted-foreground">{key.key_prefix}…</code></p>
                      <p className="text-xs text-muted-foreground">Vytvořen {formatDate(key.created_at)} · {key.last_used_at ? `naposledy použit ${formatDateTime(key.last_used_at)}` : "zatím nepoužit"}{key.expires_at && ` · platí do ${formatDate(key.expires_at)}`}</p>
                    </div>
                    <Badge variant={key.scopes.includes("write") ? "default" : "muted"}>{key.scopes.includes("write") ? "Čtení + zápis" : "Jen čtení"}</Badge>
                    {key.revoked_at ? <Badge variant="danger">Odvolán</Badge> : expired ? <Badge variant="danger">Vypršel</Badge> : <Badge variant="success">Aktivní</Badge>}
                    {dead
                      ? <button type="button" aria-label={`Smazat klíč ${key.name}`} onClick={() => remove(key)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 className="size-4" /></button>
                      : <Button variant="outline" size="sm" onClick={() => setRevoke(key)}>Odvolat</Button>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-4" /> claude.ai – webový konektor (OAuth)</CardTitle>
          <CardDescription>Nejjednodušší cesta: bez klíčů a terminálu. Claude se připojí přihlášením a ty schválíš, co smí dělat.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>V claude.ai otevři <b>Nastavení → Konektory → Přidat vlastní konektor</b>.</li>
            <li>Název: <code>nexdeals</code>, adresa serveru: <code>{origin}/api/mcp</code>. Pole pro OAuth Client ID a Secret nech prázdná.</li>
            <li>Klikni na <b>Připojit</b>, přihlas se do nexdeals a na stránce souhlasu zvol <b>Jen čtení</b>, nebo <b>Čtení a zápis</b>.</li>
          </ol>
          <CopyBlock label="Adresa serveru" text={`${origin}/api/mcp`} />
          {!oauthAvailable ? (
            <p role="alert" className="rounded-lg bg-warning-soft px-3 py-3 text-sm text-warning">OAuth zatím není zapnuté: spusť v Supabase SQL Editoru soubor <code>supabase/manual/apply_pending.sql</code> (obsahuje i OAuth migraci).</p>
          ) : grants.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Zatím není připojená žádná aplikace.</p>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium">Připojené aplikace</p>
              <ul className="divide-y rounded-lg border">
                {grants.map((g) => {
                  const expired = new Date(g.refresh_expires_at) < new Date();
                  const dead = !!g.revoked_at || expired;
                  return (
                    <li key={g.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                      <div className={`min-w-0 flex-1 ${dead ? "opacity-60" : ""}`}>
                        <p className="truncate text-sm font-medium">{g.client_name}</p>
                        <p className="text-xs text-muted-foreground">Připojeno {formatDate(g.created_at)} · {g.last_used_at ? `naposledy použito ${formatDateTime(g.last_used_at)}` : "zatím nepoužito"}</p>
                      </div>
                      <Badge variant={g.scopes.includes("write") ? "default" : "muted"}>{g.scopes.includes("write") ? "Čtení + zápis" : "Jen čtení"}</Badge>
                      {g.revoked_at ? <Badge variant="danger">Odvoláno</Badge> : expired ? <Badge variant="danger">Vypršelo</Badge> : <Badge variant="success">Aktivní</Badge>}
                      {dead
                        ? <button type="button" aria-label={`Smazat záznam ${g.client_name}`} onClick={() => removeGrant(g)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 className="size-4" /></button>
                        : <Button variant="outline" size="sm" onClick={() => setRevokeGrant(g)}>Odvolat</Button>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-4" /> Připojení Claude Code a Desktop (MCP + klíč)</CardTitle>
          <CardDescription>Claude pak umí číst a upravovat tvoje CRM: „Co mám dnes udělat?“, „Přidej deal Alfa Finance za 80 000 do fáze Kontaktován“, „Dokonči hovor a naplánuj další krok za týden“. Mazání dealů, osob a firem Claude nemá k dispozici.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CopyBlock label="Claude Code (terminál)" text={`claude mcp add --transport http nexdeals ${origin}/api/mcp --header "Authorization: Bearer ${k}"`} />
          <CopyBlock label="Claude Desktop – claude_desktop_config.json (přes mcp-remote)" text={JSON.stringify({ mcpServers: { nexdeals: { command: "npx", args: ["-y", "mcp-remote", `${origin}/api/mcp`, "--header", "Authorization:${NEXDEALS_AUTH}"], env: { NEXDEALS_AUTH: `Bearer ${k}` } } } }, null, 2)} />
          <p className="text-xs text-muted-foreground">Klíč vlož místo <code>nxd_VÁŠ_KLÍČ</code>{fresh ? " (právě vytvořený je už doplněný)" : ""}. Pro volné zkoumání dat doporučuju klíč <b>jen pro čtení</b>. Pro claude.ai ve webu použij konektor výše (bez klíče).</p>
          <details className="text-sm"><summary className="cursor-pointer font-medium">Nástroje, které Claude dostane ({mcpTools.length})</summary>
            <ul className="mt-2 divide-y rounded-lg border text-xs">{mcpTools.map((t) => (
              <li key={t.name} className="flex gap-3 px-3 py-2"><code className="w-40 shrink-0 font-medium">{t.name}</code><span className="flex-1 text-muted-foreground">{t.description}</span><Badge variant={t.write ? "warning" : "muted"}>{t.write ? "zápis" : "čtení"}</Badge></li>
            ))}</ul></details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>REST API</CardTitle><CardDescription>Pro vlastní skripty, n8n, Make a další. Základ: <code>{origin}/api/v1</code>. Odpovědi mají tvar <code>{"{ data: … }"}</code>, chyby <code>{"{ error: { code, message } }"}</code>. Limit 120 požadavků za minutu na klíč.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CopyBlock label="Příklad: dnešní a zpožděné aktivity" text={`curl "${origin}/api/v1/activities?assigned_to=me&due=overdue" \\\n  -H "Authorization: Bearer ${k}"`} />
          <CopyBlock label="Příklad: nový deal" text={`curl -X POST ${origin}/api/v1/deals \\\n  -H "Authorization: Bearer ${k}" -H "Content-Type: application/json" \\\n  -d '{"title":"Automatizace reportingu","value":80000,"organization_name":"Alfa Finance","stage_name":"Kontaktován"}'`} />
          <p className="text-sm">Kompletní popis: <a href="/api/v1/openapi.json" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-foreground hover:underline">OpenAPI (openapi.json)</a> – použitelný v Postmanu nebo Swagger UI.</p>
          <details className="text-sm"><summary className="cursor-pointer font-medium">Přehled endpointů ({endpoints.length})</summary>
            <ul className="mt-2 divide-y rounded-lg border font-mono text-xs">{endpoints.map((e) => (
              <li key={e.method + e.path} className="flex flex-wrap items-center gap-3 px-3 py-1.5"><span className="w-14 font-semibold uppercase">{e.method}</span><span className="min-w-0 flex-1 break-all">{e.path}</span><span className="font-sans text-muted-foreground">{e.summary}</span></li>
            ))}</ul></details>
        </CardContent>
      </Card>

      <ConfirmDialog open={!!revokeGrant} onOpenChange={(o) => !o && setRevokeGrant(null)} title={`Odvolat přístup aplikace ${revokeGrant?.client_name ?? ""}?`} confirmLabel="Odvolat"
        description="Aplikace ztratí přístup okamžitě. Pokud ji budeš chtít použít znovu, připojíš ji znovu a schválíš oprávnění."
        onConfirm={async () => { if (revokeGrant) await doRevokeGrant(revokeGrant); }} />

      <ConfirmDialog open={!!revoke} onOpenChange={(o) => !o && setRevoke(null)} title={`Odvolat klíč ${revoke?.name ?? ""}?`} confirmLabel="Odvolat"
        description="Všechno, co ho používá (Claude, skripty), přestane okamžitě fungovat. Odvolání nejde vrátit zpět, vytvoř nový klíč."
        onConfirm={async () => { if (revoke) await doRevoke(revoke); }} />
    </div>
  );
}
