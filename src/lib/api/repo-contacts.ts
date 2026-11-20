import "server-only";
import type { z } from "zod";
import { ORG_SEARCH_COLUMNS, PERSON_SEARCH_COLUMNS } from "@/lib/contacts/search-util";
import { notFound } from "./errors";
import { byIds, emptyToNull, me, must, personName, resolveOrg, searchWords, type Ctx, type Row } from "./repo-core";
import type { orgCreate, orgListQuery, orgUpdate, personCreate, personListQuery, personUpdate } from "./schemas";

const PERSON_COLS = "id, first_name, last_name, email, phone, position, web, organization_id, owner_id, created_at";
const ORG_COLS = "id, name, ico, web, address, owner_id, created_at";

const clean = (o: Row) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, emptyToNull(v)]));

async function withOrgNames(ctx: Ctx, rows: (Row & { organization_id?: string | null; first_name?: unknown; last_name?: unknown })[]) {
  const orgs = await byIds<{ id: string; name: string }>(ctx, "organizations", "id, name", rows.map((r) => r.organization_id));
  const names = new Map(orgs.map((o) => [o.id, o.name]));
  return rows.map((r) => ({ ...r, full_name: personName(r), organization_name: r.organization_id ? names.get(r.organization_id) ?? null : null }));
}

// ---------------------------------------------------------------------------- osoby

export async function listPersons(ctx: Ctx, q: z.infer<typeof personListQuery>) {
  let query = ctx.db.from("persons").select(PERSON_COLS, { count: "exact" }).eq("workspace_id", ctx.workspaceId);
  if (q.organization_id) query = query.eq("organization_id", q.organization_id);
  const owner = me(ctx, q.owner_id);
  if (owner) query = query.eq("owner_id", owner);
  for (const f of searchWords(q.q, PERSON_SEARCH_COLUMNS)) query = query.or(f);
  const res = await query.order("last_name").order("first_name").order("id").range(q.offset, q.offset + q.limit - 1);
  if (res.error) throw res.error;
  return { items: await withOrgNames(ctx, (res.data ?? []) as Row[]), total: res.count ?? 0, limit: q.limit, offset: q.offset };
}

export async function getPerson(ctx: Ctx, id: string) {
  const row = must(await ctx.db.from("persons").select(PERSON_COLS).eq("workspace_id", ctx.workspaceId).eq("id", id).maybeSingle());
  if (!row) throw notFound("Osoba");
  const [[person], deals, acts, notes] = await Promise.all([
    withOrgNames(ctx, [row as Row]),
    ctx.db.from("deals").select("id, title, value, status, stage_id, created_at").eq("workspace_id", ctx.workspaceId).eq("person_id", id).order("created_at", { ascending: false }).limit(100).then((r) => must(r)),
    ctx.db.from("activities").select("id, type, subject, due_date, due_time, done, deal_id").eq("workspace_id", ctx.workspaceId).eq("person_id", id).order("due_date", { nullsFirst: false }).limit(100).then((r) => must(r)),
    ctx.db.from("notes").select("id, content, created_at").eq("workspace_id", ctx.workspaceId).eq("person_id", id).order("created_at", { ascending: false }).limit(50).then((r) => must(r)),
  ]);
  return { ...person, deals, activities: acts, notes };
}

export async function createPerson(ctx: Ctx, input: z.infer<typeof personCreate>) {
  let organization_id = input.organization_id ?? null;
  if (!organization_id && input.organization_name?.trim()) organization_id = (await resolveOrg(ctx, input.organization_name)).id;
  const { organization_name: _n, ...rest } = input;
  void _n;
  const row = must(await ctx.db.from("persons").insert({
    ...clean(rest), workspace_id: ctx.workspaceId, first_name: input.first_name ?? "", last_name: input.last_name ?? "",
    organization_id, owner_id: input.owner_id === undefined ? ctx.userId : input.owner_id,
  }).select(PERSON_COLS).single());
  return (await withOrgNames(ctx, [row as Row]))[0];
}

export async function updatePerson(ctx: Ctx, id: string, patch: z.infer<typeof personUpdate>) {
  const rows = must(await ctx.db.from("persons").update(clean(patch)).eq("workspace_id", ctx.workspaceId).eq("id", id).select(PERSON_COLS)) as Row[];
  if (!rows[0]) throw notFound("Osoba");
  return (await withOrgNames(ctx, [rows[0]]))[0];
}

export async function deletePerson(ctx: Ctx, id: string) {
  const rows = must(await ctx.db.from("persons").delete().eq("workspace_id", ctx.workspaceId).eq("id", id).select("id")) as Row[];
  if (!rows[0]) throw notFound("Osoba");
  return { id, deleted: true };
}

// ---------------------------------------------------------------------------- firmy

export async function listOrgs(ctx: Ctx, q: z.infer<typeof orgListQuery>) {
  let query = ctx.db.from("organizations").select(ORG_COLS, { count: "exact" }).eq("workspace_id", ctx.workspaceId);
  const owner = me(ctx, q.owner_id);
  if (owner) query = query.eq("owner_id", owner);
  for (const f of searchWords(q.q, ORG_SEARCH_COLUMNS)) query = query.or(f);
  const res = await query.order("name").order("id").range(q.offset, q.offset + q.limit - 1);
  if (res.error) throw res.error;
  return { items: (res.data ?? []) as Row[], total: res.count ?? 0, limit: q.limit, offset: q.offset };
}

export async function getOrg(ctx: Ctx, id: string) {
  const org = must(await ctx.db.from("organizations").select(ORG_COLS).eq("workspace_id", ctx.workspaceId).eq("id", id).maybeSingle());
  if (!org) throw notFound("Firma");
  const [persons, deals, notes] = await Promise.all([
    ctx.db.from("persons").select("id, first_name, last_name, email, phone, position").eq("workspace_id", ctx.workspaceId).eq("organization_id", id).order("last_name").limit(200).then((r) => must(r)),
    ctx.db.from("deals").select("id, title, value, status, stage_id, created_at").eq("workspace_id", ctx.workspaceId).eq("organization_id", id).order("created_at", { ascending: false }).limit(100).then((r) => must(r)),
    ctx.db.from("notes").select("id, content, created_at").eq("workspace_id", ctx.workspaceId).eq("organization_id", id).order("created_at", { ascending: false }).limit(50).then((r) => must(r)),
  ]);
  return { ...(org as Row), persons, deals, notes };
}

export async function createOrg(ctx: Ctx, input: z.infer<typeof orgCreate>) {
  return must(await ctx.db.from("organizations").insert({ ...clean(input), workspace_id: ctx.workspaceId, name: input.name, owner_id: input.owner_id === undefined ? ctx.userId : input.owner_id }).select(ORG_COLS).single());
}

export async function updateOrg(ctx: Ctx, id: string, patch: z.infer<typeof orgUpdate>) {
  const rows = must(await ctx.db.from("organizations").update(clean(patch)).eq("workspace_id", ctx.workspaceId).eq("id", id).select(ORG_COLS)) as Row[];
  if (!rows[0]) throw notFound("Firma");
  return rows[0];
}

export async function deleteOrg(ctx: Ctx, id: string) {
  const rows = must(await ctx.db.from("organizations").delete().eq("workspace_id", ctx.workspaceId).eq("id", id).select("id")) as Row[];
  if (!rows[0]) throw notFound("Firma");
  return { id, deleted: true };
}
