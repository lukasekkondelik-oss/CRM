import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { ENDPOINTS } from "@/lib/api/openapi";
import { MCP_TOOLS } from "@/lib/api/mcp-tools";
import type { Label, Pipeline, Profile, Stage } from "@/lib/types";

export interface Invitation {
  id: string; email: string; role: "admin" | "member"; token: string; created_at: string; expires_at: string; accepted_at: string | null;
}

export interface ApiKeyRow {
  id: string; name: string; key_prefix: string; scopes: ("read" | "write")[]; created_at: string;
  last_used_at: string | null; expires_at: string | null; revoked_at: string | null;
}

export async function loadSettings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [meRes, membersRes, pipelinesRes, stagesRes, dealsRes, labelsRes, dealLabelsRes, invitesRes, apiKeysRes] = await Promise.all([
    supabase.from("profiles").select("*, workspaces(id, name)").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("pipelines").select("id, workspace_id, name, position").order("position"),
    supabase.from("stages").select("*").order("position"),
    supabase.from("deals").select("stage_id").limit(20000),
    supabase.from("labels").select("*").order("name"),
    supabase.from("deal_labels").select("label_id").limit(50000),
    supabase.from("invitations").select("*").is("accepted_at", null).order("created_at", { ascending: false }),
    supabase.from("api_keys").select("id, name, key_prefix, scopes, created_at, last_used_at, expires_at, revoked_at").order("created_at", { ascending: false }),
  ]);
  const me = meRes.data as (Profile & { workspaces: { id: string; name: string } | { id: string; name: string }[] | null }) | null;
  if (!me) return null;
  const ws = Array.isArray(me.workspaces) ? me.workspaces[0] : me.workspaces;

  const dealsByStage: Record<string, number> = {};
  for (const d of dealsRes.data ?? []) dealsByStage[d.stage_id] = (dealsByStage[d.stage_id] ?? 0) + 1;
  const labelUsage: Record<string, number> = {};
  for (const l of dealLabelsRes.data ?? []) labelUsage[l.label_id] = (labelUsage[l.label_id] ?? 0) + 1;

  return {
    userId: user.id,
    isAdmin: me.role === "admin",
    workspace: { id: ws?.id ?? me.workspace_id, name: ws?.name ?? "" },
    members: (membersRes.data ?? []) as Profile[],
    pipelines: (pipelinesRes.data ?? []) as Pipeline[],
    stages: (stagesRes.data ?? []) as Stage[],
    dealsByStage,
    labels: (labelsRes.data ?? []) as Label[],
    labelUsage,
    // tabulka vznikne migrací Fáze 6; bez ní stránka funguje, jen bez pozvánek
    invitesAvailable: !invitesRes.error,
    invitations: (invitesRes.data ?? []) as Invitation[],
    // API a MCP: klíče jsou osobní; tabulka vznikne migrací, service role klíč musí být na serveru
    apiKeysAvailable: !apiKeysRes.error,
    apiKeys: (apiKeysRes.data ?? []) as ApiKeyRow[],
    apiConfigured: isAdminConfigured(),
    endpoints: ENDPOINTS.map((e) => ({ method: e.method, path: e.path, summary: e.summary, scope: e.scope })),
    mcpTools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, write: t.write })),
  };
}
