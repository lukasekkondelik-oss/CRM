import "server-only";
import { z } from "zod";
import { wordFilters } from "@/lib/contacts/search-util";
import { nameKey } from "@/lib/import";
import { ApiError, notFound } from "./errors";
import type { ApiContext } from "./auth";

export type Ctx = ApiContext;
export type Row = Record<string, unknown>;

export const chunks = <T>(a: T[], n = 100): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

/** Vrátí data, nebo vyhodí chybu z PostgREST (ta se pak převede na čistou odpověď). */
export function must<D>(res: { data: D; error: unknown }): NonNullable<D> {
  if (res.error) throw res.error;
  return res.data as NonNullable<D>;
}

/** Načte řádky podle id po dávkách; vždy jen z workspace klíče. */
export async function byIds<T = Row>(ctx: Ctx, table: string, columns: string, ids: (string | null | undefined)[]): Promise<T[]> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const res = await Promise.all(chunks(unique).map((c) => ctx.db.from(table).select(columns).eq("workspace_id", ctx.workspaceId).in("id", c)));
  return res.flatMap((r) => must(r) as unknown as T[]);
}

/** `me` → id uživatele klíče. */
export const me = (ctx: Ctx, v: string | undefined) => (v === "me" ? ctx.userId : v);

/** Escape pro ilike bez zástupných znaků (přesná shoda bez ohledu na velikost písmen). */
export const likeExact = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const emptyToNull = <T>(v: T): T | null => (typeof v === "string" && v.trim() === "" ? null : v);

export const personName = (p: { first_name?: unknown; last_name?: unknown }) => `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();

// ---------------------------------------------------------------------------- identita, členové, pipelines

export async function getMe(ctx: Ctx) {
  const p = must(await ctx.db.from("profiles").select("id, full_name, email, role, workspace_id").eq("id", ctx.userId).eq("workspace_id", ctx.workspaceId).single());
  const w = must(await ctx.db.from("workspaces").select("id, name").eq("id", ctx.workspaceId).single());
  return { user: { id: p.id, full_name: p.full_name, email: p.email, role: p.role }, workspace: w, scopes: ctx.scopes };
}

export async function listMembers(ctx: Ctx) {
  return must(await ctx.db.from("profiles").select("id, full_name, email, role").eq("workspace_id", ctx.workspaceId).order("full_name"));
}

export interface StageRow { id: string; pipeline_id: string; name: string; position: number; probability: number; rotting_days: number | null }
export interface PipelineRow { id: string; name: string; position: number; stages: StageRow[] }

export async function listPipelines(ctx: Ctx): Promise<PipelineRow[]> {
  const pipes = must(await ctx.db.from("pipelines").select("id, name, position").eq("workspace_id", ctx.workspaceId).order("position")) as { id: string; name: string; position: number }[];
  if (pipes.length === 0) return [];
  const stages = must(await ctx.db.from("stages").select("id, pipeline_id, name, position, probability, rotting_days").in("pipeline_id", pipes.map((p) => p.id)).order("position")) as StageRow[];
  return pipes.map((p) => ({ ...p, stages: stages.filter((s) => s.pipeline_id === p.id) }));
}

/** Najde pipeline a fázi podle id nebo názvu; bez zadání vezme první fázi první pipeline. */
export async function resolveStage(ctx: Ctx, ref: { pipeline_id?: string; pipeline_name?: string; stage_id?: string; stage_name?: string }) {
  const pipes = await listPipelines(ctx);
  if (pipes.length === 0) throw new ApiError(422, "no_pipeline", "Workspace nemá žádnou pipeline.");
  let candidates = pipes;
  if (ref.pipeline_id) candidates = pipes.filter((p) => p.id === ref.pipeline_id);
  else if (ref.pipeline_name) candidates = pipes.filter((p) => nameKey(p.name) === nameKey(ref.pipeline_name!));
  if (candidates.length === 0) throw new ApiError(422, "pipeline_not_found", "Pipeline nenalezena.", { available: pipes.map((p) => p.name) });

  let found: { pipeline: PipelineRow; stage: StageRow } | undefined;
  if (ref.stage_id) for (const p of candidates) { const s = p.stages.find((x) => x.id === ref.stage_id); if (s) { found = { pipeline: p, stage: s }; break; } }
  else if (ref.stage_name) for (const p of candidates) { const s = p.stages.find((x) => nameKey(x.name) === nameKey(ref.stage_name!)); if (s) { found = { pipeline: p, stage: s }; break; } }
  else { const p = candidates[0]; if (p.stages[0]) found = { pipeline: p, stage: p.stages[0] }; }
  if (!found) throw new ApiError(422, "stage_not_found", "Fáze nenalezena.", { available: candidates.flatMap((p) => p.stages.map((s) => `${p.name} › ${s.name}`)) });
  return { pipeline_id: found.pipeline.id, stage_id: found.stage.id, pipelines: pipes };
}

// ---------------------------------------------------------------------------- hledání / vytvoření podle jména

/**
 * Přesná shoda bez ohledu na velikost písmen. PostgREST bere `*` jako zástupný znak a nejde ho escapovat,
 * takže hodnota s `*` se porovnává přesně (rozlišuje velikost) – jinak by „A*B“ mohlo najít cizí záznam.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const exact = (q: any, col: string, v: string) => (v.includes("*") ? q.eq(col, v) : q.ilike(col, likeExact(v)));

export async function resolveOrg(ctx: Ctx, name: string) {
  const n = name.trim();
  const found = must(await exact(ctx.db.from("organizations").select("id, name").eq("workspace_id", ctx.workspaceId), "name", n).limit(1)) as { id: string; name: string }[];
  if (found[0]) return { ...found[0], created: false };
  const row = must(await ctx.db.from("organizations").insert({ workspace_id: ctx.workspaceId, name: n, owner_id: ctx.userId }).select("id, name").single()) as { id: string; name: string };
  return { ...row, created: true };
}

export async function resolvePerson(ctx: Ctx, fullName: string, organizationId?: string | null) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  const found = must(await exact(exact(ctx.db.from("persons").select("id, first_name, last_name").eq("workspace_id", ctx.workspaceId), "first_name", first), "last_name", last).limit(1)) as { id: string; first_name: string; last_name: string }[];
  if (found[0]) return { id: found[0].id, name: personName(found[0]), created: false };
  const row = must(await ctx.db.from("persons").insert({ workspace_id: ctx.workspaceId, first_name: first, last_name: last, organization_id: organizationId ?? null, owner_id: ctx.userId }).select("id, first_name, last_name").single()) as { id: string; first_name: string; last_name: string };
  return { id: row.id, name: personName(row), created: true };
}

export const searchWords = (q: string | undefined, columns: string[]) => (q ? wordFilters(q, columns) : []);

export const assertFound = <T>(row: T | null | undefined, what?: string): T => { if (!row) throw notFound(what); return row; };

export const TODAY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());

export type Infer<S extends z.ZodType> = z.infer<S>;
