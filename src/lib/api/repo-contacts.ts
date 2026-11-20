import "server-only";
import type { z } from "zod";
import { ORG_SEARCH_COLUMNS, PERSON_SEARCH_COLUMNS } from "@/lib/contacts/search-util";
import { ApiError, notFound } from "./errors";
import { LABEL_COLORS } from "@/lib/deals/helpers";
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

// ---------------------------------------------------------------------------- štítky (sdílené s dealy)

type LabelTarget = { table: "person_labels"; fk: "person_id"; entity: "persons"; name: "Osoba" } | { table: "organization_labels"; fk: "organization_id"; entity: "organizations"; name: "Firma" };
const PERSON_L: LabelTarget = { table: "person_labels", fk: "person_id", entity: "persons", name: "Osoba" };
const ORG_L: LabelTarget = { table: "organization_labels", fk: "organization_id", entity: "organizations", name: "Firma" };
export interface LabelOut { id: string; name: string; color: string }

async function labelsFor(ctx: Ctx, t: LabelTarget, ids: string[]): Promise<Map<string, LabelOut[]>> {
  const out = new Map<string, LabelOut[]>();
  if (!ids.length) return out;
  const links = must(await ctx.db.from(t.table).select(`${t.fk}, label_id`).in(t.fk, ids)) as unknown as Record<string, string>[];
  if (!links.length) return out;
  const labels = must(await ctx.db.from("labels").select("id, name, color").eq("workspace_id", ctx.workspaceId).in("id", [...new Set(links.map((l) => l.label_id))])) as LabelOut[];
  const byId = new Map(labels.map((l) => [l.id, l]));
  for (const l of links) { const lab = byId.get(l.label_id); if (lab) out.set(l[t.fk], [...(out.get(l[t.fk]) ?? []), lab]); }
  return out;
}

/** Id záznamů se štítkem (pro filtr seznamu). */
async function idsWithLabel(ctx: Ctx, t: LabelTarget, labelId: string): Promise<string[] | null> {
  const ok = must(await ctx.db.from("labels").select("id").eq("workspace_id", ctx.workspaceId).eq("id", labelId).maybeSingle());
  if (!ok) throw new ApiError(422, "label_not_found", "Štítek neexistuje v tomhle workspace.");
  const links = must(await ctx.db.from(t.table).select(t.fk).eq("label_id", labelId).limit(1000)) as unknown as Record<string, string>[];
  return links.length ? links.map((l) => l[t.fk]) : null;
}

async function setLabels(ctx: Ctx, t: LabelTarget, id: string, labelIds: string[]) {
  const ent = must(await ctx.db.from(t.entity).select("id").eq("workspace_id", ctx.workspaceId).eq("id", id).maybeSingle());
  if (!ent) throw notFound(t.name);
  const unique = [...new Set(labelIds)];
  if (unique.length) {
    const ok = must(await ctx.db.from("labels").select("id").eq("workspace_id", ctx.workspaceId).in("id", unique)) as { id: string }[];
    if (ok.length !== unique.length) throw new ApiError(422, "label_not_found", "Některý štítek neexistuje v tomhle workspace.");
  }
  must(await ctx.db.from(t.table).delete().eq(t.fk, id));
  if (unique.length) must(await ctx.db.from(t.table).insert(unique.map((label_id) => ({ [t.fk]: id, label_id }))));
  return { id, label_ids: unique };
}
export const setPersonLabels = (ctx: Ctx, id: string, labelIds: string[]) => setLabels(ctx, PERSON_L, id, labelIds);
export const setOrgLabels = (ctx: Ctx, id: string, labelIds: string[]) => setLabels(ctx, ORG_L, id, labelIds);

/** Názvy štítků → id; chybějící se založí (pro nástroje bez znalosti UUID). */
export async function resolveLabelNames(ctx: Ctx, names: string[]): Promise<string[]> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const existing = must(await ctx.db.from("labels").select("id, name").eq("workspace_id", ctx.workspaceId)) as { id: string; name: string }[];
  const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l.id]));
  const ids: string[] = [];
  for (const n of wanted) {
    let lid = byName.get(n.toLowerCase());
    if (!lid) {
      const row = must(await ctx.db.from("labels").insert({ workspace_id: ctx.workspaceId, name: n.slice(0, 50), color: LABEL_COLORS[(existing.length + ids.length) % LABEL_COLORS.length] }).select("id").single()) as { id: string };
      lid = row.id;
    }
    ids.push(lid);
  }
  return ids;
}

export async function labelIdByName(ctx: Ctx, name: string): Promise<string> {
  const row = must(await ctx.db.from("labels").select("id, name").eq("workspace_id", ctx.workspaceId)) as { id: string; name: string }[];
  const f = row.find((l) => l.name.toLowerCase() === name.trim().toLowerCase());
  if (!f) throw new ApiError(422, "label_not_found", `Štítek „${name}“ neexistuje.`, { available: row.map((l) => l.name) });
  return f.id;
}

// ---------------------------------------------------------------------------- osoby

export async function listPersons(ctx: Ctx, q: z.infer<typeof personListQuery>) {
  let query = ctx.db.from("persons").select(PERSON_COLS, { count: "exact" }).eq("workspace_id", ctx.workspaceId);
  if (q.organization_id) query = query.eq("organization_id", q.organization_id);
  const owner = me(ctx, q.owner_id);
  if (owner) query = query.eq("owner_id", owner);
  for (const f of searchWords(q.q, PERSON_SEARCH_COLUMNS)) query = query.or(f);
  if (q.label_id) {
    const ids = await idsWithLabel(ctx, PERSON_L, q.label_id);
    if (!ids) return { items: [], total: 0, limit: q.limit, offset: q.offset };
    query = query.in("id", ids);
  }
  const res = await query.order("last_name").order("first_name").order("id").range(q.offset, q.offset + q.limit - 1);
  if (res.error) throw res.error;
  const rows = (await withOrgNames(ctx, (res.data ?? []) as Row[])) as unknown as (Row & { id: string })[];
  const labels = await labelsFor(ctx, PERSON_L, rows.map((r) => String(r.id)));
  return { items: rows.map((r) => ({ ...r, labels: labels.get(String(r.id)) ?? [] })), total: res.count ?? 0, limit: q.limit, offset: q.offset };
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
  const labels = (await labelsFor(ctx, PERSON_L, [id])).get(id) ?? [];
  return { ...person, labels, deals, activities: acts, notes };
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
  if (q.label_id) {
    const ids = await idsWithLabel(ctx, ORG_L, q.label_id);
    if (!ids) return { items: [], total: 0, limit: q.limit, offset: q.offset };
    query = query.in("id", ids);
  }
  const res = await query.order("name").order("id").range(q.offset, q.offset + q.limit - 1);
  if (res.error) throw res.error;
  const rows = (res.data ?? []) as Row[];
  const labels = await labelsFor(ctx, ORG_L, rows.map((r) => String(r.id)));
  return { items: rows.map((r) => ({ ...r, labels: labels.get(String(r.id)) ?? [] })), total: res.count ?? 0, limit: q.limit, offset: q.offset };
}

export async function getOrg(ctx: Ctx, id: string) {
  const org = must(await ctx.db.from("organizations").select(ORG_COLS).eq("workspace_id", ctx.workspaceId).eq("id", id).maybeSingle());
  if (!org) throw notFound("Firma");
  const [persons, deals, notes] = await Promise.all([
    ctx.db.from("persons").select("id, first_name, last_name, email, phone, position").eq("workspace_id", ctx.workspaceId).eq("organization_id", id).order("last_name").limit(200).then((r) => must(r)),
    ctx.db.from("deals").select("id, title, value, status, stage_id, created_at").eq("workspace_id", ctx.workspaceId).eq("organization_id", id).order("created_at", { ascending: false }).limit(100).then((r) => must(r)),
    ctx.db.from("notes").select("id, content, created_at").eq("workspace_id", ctx.workspaceId).eq("organization_id", id).order("created_at", { ascending: false }).limit(50).then((r) => must(r)),
  ]);
  const labels = (await labelsFor(ctx, ORG_L, [id])).get(id) ?? [];
  return { ...(org as Row), labels, persons, deals, notes };
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
