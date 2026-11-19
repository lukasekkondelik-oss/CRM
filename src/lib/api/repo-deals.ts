import "server-only";
import type { z } from "zod";
import { ApiError, notFound } from "./errors";
import { byIds, chunks, emptyToNull, me, must, personName, resolveOrg, resolvePerson, resolveStage, searchWords, listPipelines, type Ctx, type Row } from "./repo-core";
import type { dealCreate, dealListQuery, dealMove, dealStatus, dealUpdate } from "./schemas";

const COLS = "id, title, value, currency, status, pipeline_id, stage_id, person_id, organization_id, owner_id, expected_close_date, lost_reason, won_at, lost_at, stage_changed_at, position, created_at, updated_at";

interface DealRow extends Row {
  id: string; title: string; value: number | string; pipeline_id: string; stage_id: string; status: string; stage_changed_at: string;
  person_id: string | null; organization_id: string | null; owner_id: string | null;
}

/** Přidá čitelná jména (fáze, firma, osoba, vlastník) a stav dalšího kroku. */
async function decorate(ctx: Ctx, rows: DealRow[]) {
  if (rows.length === 0) return [];
  const [pipes, people, orgs, members, acts] = await Promise.all([
    listPipelines(ctx),
    byIds<{ id: string; first_name: string; last_name: string; organization_id: string | null }>(ctx, "persons", "id, first_name, last_name, organization_id", rows.map((r) => r.person_id)),
    byIds<{ id: string; name: string }>(ctx, "organizations", "id, name", rows.map((r) => r.organization_id)),
    ctx.db.from("profiles").select("id, full_name").eq("workspace_id", ctx.workspaceId).then((r) => must(r) as { id: string; full_name: string }[]),
    Promise.all(chunks(rows.map((r) => r.id)).map((c) => ctx.db.from("activities").select("deal_id, subject, type, due_date, due_time").eq("workspace_id", ctx.workspaceId).eq("done", false).in("deal_id", c)))
      .then((rs) => rs.flatMap((r) => must(r) as { deal_id: string; subject: string; type: string; due_date: string | null; due_time: string | null }[])),
  ]);
  const stage = new Map(pipes.flatMap((p) => p.stages.map((s) => [s.id, { ...s, pipeline: p.name }] as const)));
  const person = new Map(people.map((p) => [p.id, p]));
  const org = new Map(orgs.map((o) => [o.id, o.name]));
  const member = new Map(members.map((m) => [m.id, m.full_name]));
  const next = new Map<string, { count: number; first?: (typeof acts)[number] }>();
  for (const a of acts) {
    const cur = next.get(a.deal_id) ?? { count: 0 };
    cur.count++;
    if (!cur.first || (a.due_date && (!cur.first.due_date || a.due_date < cur.first.due_date))) cur.first = a;
    next.set(a.deal_id, cur);
  }
  const now = Date.now();
  return rows.map((r) => {
    const st = stage.get(r.stage_id);
    const days = Math.floor((now - new Date(r.stage_changed_at).getTime()) / 86_400_000);
    const n = next.get(r.id);
    return {
      ...r,
      value: Number(r.value),
      stage_name: st?.name ?? null, pipeline_name: st?.pipeline ?? null, probability: st?.probability ?? null,
      person_name: r.person_id && person.get(r.person_id) ? personName(person.get(r.person_id)!) : null,
      organization_name: r.organization_id ? org.get(r.organization_id) ?? null : null,
      owner_name: r.owner_id ? member.get(r.owner_id) ?? null : null,
      days_in_stage: days,
      rotting: r.status === "open" && !!st?.rotting_days && days > st.rotting_days,
      open_activities: n?.count ?? 0,
      next_activity: n?.first ? { subject: n.first.subject, type: n.first.type, due_date: n.first.due_date, due_time: n.first.due_time } : null,
    };
  });
}

export async function listDeals(ctx: Ctx, q: z.infer<typeof dealListQuery>) {
  let query = ctx.db.from("deals").select(COLS, { count: "exact" }).eq("workspace_id", ctx.workspaceId);
  if (q.status !== "all") query = query.eq("status", q.status);
  if (q.pipeline_id) query = query.eq("pipeline_id", q.pipeline_id);
  if (q.stage_id) query = query.eq("stage_id", q.stage_id);
  const owner = me(ctx, q.owner_id);
  if (owner) query = query.eq("owner_id", owner);
  if (q.person_id) query = query.eq("person_id", q.person_id);
  if (q.organization_id) query = query.eq("organization_id", q.organization_id);
  for (const f of searchWords(q.q, ["title"])) query = query.or(f);
  const res = await query.order(q.sort, { ascending: q.dir === "asc" }).order("id").range(q.offset, q.offset + q.limit - 1);
  if (res.error) throw res.error;
  return { items: await decorate(ctx, (res.data ?? []) as DealRow[]), total: res.count ?? 0, limit: q.limit, offset: q.offset };
}

async function loadDeal(ctx: Ctx, id: string): Promise<DealRow> {
  const row = must(await ctx.db.from("deals").select(COLS).eq("workspace_id", ctx.workspaceId).eq("id", id).maybeSingle());
  if (!row) throw notFound("Deal");
  return row as unknown as DealRow;
}

export async function getDeal(ctx: Ctx, id: string) {
  const deal = await loadDeal(ctx, id);
  const [[full], labelLinks, acts, notes, history] = await Promise.all([
    decorate(ctx, [deal]),
    ctx.db.from("deal_labels").select("label_id").eq("deal_id", id).then((r) => must(r) as { label_id: string }[]),
    ctx.db.from("activities").select("id, type, subject, note, due_date, due_time, duration_min, done, done_at, assigned_to").eq("workspace_id", ctx.workspaceId).eq("deal_id", id).order("due_date", { nullsFirst: false }).limit(200).then((r) => must(r)),
    ctx.db.from("notes").select("id, content, author_id, created_at").eq("workspace_id", ctx.workspaceId).eq("deal_id", id).order("created_at", { ascending: false }).limit(100).then((r) => must(r)),
    ctx.db.from("deal_history").select("id, field, old_value, new_value, changed_at").eq("deal_id", id).order("changed_at", { ascending: false }).limit(100).then((r) => must(r)),
  ]);
  const labels = labelLinks.length
    ? must(await ctx.db.from("labels").select("id, name, color").eq("workspace_id", ctx.workspaceId).in("id", labelLinks.map((l) => l.label_id)))
    : [];
  return { ...full, labels, activities: acts, notes, history };
}

/** Pozice nahoře ve sloupci (menší než všechny stávající). */
async function topPosition(ctx: Ctx, stageId: string): Promise<number> {
  const rows = must(await ctx.db.from("deals").select("position").eq("workspace_id", ctx.workspaceId).eq("stage_id", stageId).order("position").limit(1)) as { position: number }[];
  return rows.length ? Number(rows[0].position) - 1 : 0;
}

export async function createDeal(ctx: Ctx, input: z.infer<typeof dealCreate>) {
  const { pipeline_id, stage_id } = await resolveStage(ctx, input);
  let organization_id = input.organization_id ?? null;
  let person_id = input.person_id ?? null;
  const created: string[] = [];
  if (!organization_id && input.organization_name?.trim()) { const o = await resolveOrg(ctx, input.organization_name); organization_id = o.id; if (o.created) created.push(`firma „${o.name}“`); }
  if (!person_id && input.person_name?.trim()) { const p = await resolvePerson(ctx, input.person_name, organization_id); person_id = p.id; if (p.created) created.push(`osoba „${p.name}“`); }
  const row = must(await ctx.db.from("deals").insert({
    workspace_id: ctx.workspaceId, pipeline_id, stage_id, title: input.title, value: input.value ?? 0, currency: input.currency ?? "CZK",
    person_id, organization_id, owner_id: input.owner_id === undefined ? ctx.userId : input.owner_id,
    expected_close_date: input.expected_close_date ?? null, position: await topPosition(ctx, stage_id),
  }).select(COLS).single()) as unknown as DealRow;
  const [full] = await decorate(ctx, [row]);
  return { ...full, also_created: created };
}

export async function updateDeal(ctx: Ctx, id: string, patch: z.infer<typeof dealUpdate>) {
  const rows = must(await ctx.db.from("deals").update(patch).eq("workspace_id", ctx.workspaceId).eq("id", id).select(COLS)) as unknown as DealRow[];
  if (!rows[0]) throw notFound("Deal");
  return (await decorate(ctx, [rows[0]]))[0];
}

export async function moveDeal(ctx: Ctx, id: string, input: z.infer<typeof dealMove>) {
  const deal = await loadDeal(ctx, id);
  if (deal.status !== "open") throw new ApiError(409, "deal_closed", "Uzavřený deal nejde přesouvat. Nejdřív ho znovu otevři (status = open).");
  const target = await resolveStage(ctx, { pipeline_id: input.pipeline_id ?? (input.stage_id ? undefined : deal.pipeline_id), pipeline_name: input.pipeline_name, stage_id: input.stage_id, stage_name: input.stage_name });
  const sameStage = target.stage_id === deal.stage_id;
  const rows = must(await ctx.db.from("deals").update({
    pipeline_id: target.pipeline_id, stage_id: target.stage_id,
    position: input.position ?? (sameStage ? Number(deal.position) : await topPosition(ctx, target.stage_id)),
    ...(sameStage ? {} : { stage_changed_at: new Date().toISOString() }),
  }).eq("workspace_id", ctx.workspaceId).eq("id", id).select(COLS)) as unknown as DealRow[];
  if (!rows[0]) throw notFound("Deal");
  return (await decorate(ctx, [rows[0]]))[0];
}

export async function setDealStatus(ctx: Ctx, id: string, input: z.infer<typeof dealStatus>) {
  const patch = input.status === "lost" ? { status: "lost", lost_reason: input.lost_reason } : { status: input.status };
  const rows = must(await ctx.db.from("deals").update(patch).eq("workspace_id", ctx.workspaceId).eq("id", id).select(COLS)) as unknown as DealRow[];
  if (!rows[0]) throw notFound("Deal");
  return (await decorate(ctx, [rows[0]]))[0];
}

export async function deleteDeal(ctx: Ctx, id: string) {
  const rows = must(await ctx.db.from("deals").delete().eq("workspace_id", ctx.workspaceId).eq("id", id).select("id")) as { id: string }[];
  if (!rows[0]) throw notFound("Deal");
  return { id, deleted: true };
}

export async function setDealLabels(ctx: Ctx, id: string, labelIds: string[]) {
  await loadDeal(ctx, id);
  const unique = [...new Set(labelIds)];
  if (unique.length) {
    const ok = must(await ctx.db.from("labels").select("id").eq("workspace_id", ctx.workspaceId).in("id", unique)) as { id: string }[];
    if (ok.length !== unique.length) throw new ApiError(422, "label_not_found", "Některý label neexistuje v tomhle workspace.");
  }
  must(await ctx.db.from("deal_labels").delete().eq("deal_id", id));
  if (unique.length) must(await ctx.db.from("deal_labels").insert(unique.map((label_id) => ({ deal_id: id, label_id }))));
  return { id, label_ids: unique };
}

export async function listLabels(ctx: Ctx) {
  return must(await ctx.db.from("labels").select("id, name, color").eq("workspace_id", ctx.workspaceId).order("name"));
}

export { emptyToNull };
