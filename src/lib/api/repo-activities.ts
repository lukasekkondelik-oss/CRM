import "server-only";
import type { z } from "zod";
import { addDays, weekStart } from "@/lib/dates";
import { ApiError, notFound } from "./errors";
import { emptyToNull, me, must, TODAY, type Ctx, type Row } from "./repo-core";
import type { activityComplete, activityCreate, activityListQuery, activityUpdate, noteCreate, noteListQuery } from "./schemas";

const COLS = "id, type, subject, note, due_date, due_time, duration_min, done, done_at, deal_id, person_id, organization_id, assigned_to, created_at";

export async function listActivities(ctx: Ctx, q: z.infer<typeof activityListQuery>) {
  let query = ctx.db.from("activities").select(COLS, { count: "exact" }).eq("workspace_id", ctx.workspaceId);
  const today = TODAY();
  const open = q.done === undefined && q.due !== "all" ? false : q.done;
  if (open !== undefined) query = query.eq("done", open);
  if (q.due === "today") query = query.eq("due_date", today);
  else if (q.due === "overdue") query = query.lt("due_date", today);
  else if (q.due === "week") query = query.gte("due_date", weekStart(today)).lte("due_date", addDays(weekStart(today), 6));
  if (q.from) query = query.gte("due_date", q.from);
  if (q.to) query = query.lte("due_date", q.to);
  const who = me(ctx, q.assigned_to);
  if (who) query = query.eq("assigned_to", who);
  if (q.deal_id) query = query.eq("deal_id", q.deal_id);
  if (q.person_id) query = query.eq("person_id", q.person_id);
  if (q.organization_id) query = query.eq("organization_id", q.organization_id);
  if (q.type) query = query.eq("type", q.type);
  const res = await query.order("due_date", { nullsFirst: false }).order("due_time", { nullsFirst: false }).order("id").range(q.offset, q.offset + q.limit - 1);
  if (res.error) throw res.error;
  return { items: (res.data ?? []) as Row[], total: res.count ?? 0, limit: q.limit, offset: q.offset };
}

/** Vazby na osobu/firmu se u aktivity s dealem doplní z dealu. */
async function dealLinks(ctx: Ctx, dealId: string | null | undefined) {
  if (!dealId) return { person_id: null, organization_id: null };
  const d = must(await ctx.db.from("deals").select("person_id, organization_id").eq("workspace_id", ctx.workspaceId).eq("id", dealId).maybeSingle());
  if (!d) throw new ApiError(422, "invalid_reference", "Deal neexistuje v tomhle workspace.");
  return d as { person_id: string | null; organization_id: string | null };
}

export async function createActivity(ctx: Ctx, input: z.infer<typeof activityCreate>) {
  const links = await dealLinks(ctx, input.deal_id);
  return must(await ctx.db.from("activities").insert({
    workspace_id: ctx.workspaceId, subject: input.subject, type: input.type ?? "task", note: emptyToNull(input.note) ?? null,
    due_date: input.due_date ?? null, due_time: input.due_time ?? null, duration_min: input.duration_min ?? null,
    deal_id: input.deal_id ?? null, person_id: input.person_id ?? links.person_id, organization_id: input.organization_id ?? links.organization_id,
    assigned_to: input.assigned_to === undefined ? ctx.userId : input.assigned_to,
  }).select(COLS).single());
}

export async function updateActivity(ctx: Ctx, id: string, patch: z.infer<typeof activityUpdate>) {
  const rows = must(await ctx.db.from("activities").update(patch).eq("workspace_id", ctx.workspaceId).eq("id", id).select(COLS)) as Row[];
  if (!rows[0]) throw notFound("Aktivita");
  return rows[0];
}

/** Dokončí aktivitu; volitelně hned naplánuje další krok na stejný deal (workflow „vždy další krok“). */
export async function completeActivity(ctx: Ctx, id: string, input: z.infer<typeof activityComplete>) {
  const rows = must(await ctx.db.from("activities").update({ done: true }).eq("workspace_id", ctx.workspaceId).eq("id", id).select(COLS)) as (Row & { deal_id: string | null; person_id: string | null; organization_id: string | null; type: string })[];
  const done = rows[0];
  if (!done) throw notFound("Aktivita");
  let next: Row | null = null;
  if (input.next) {
    next = (await createActivity(ctx, {
      subject: input.next.subject, type: (input.next.type ?? done.type) as "call", due_date: input.next.due_date, due_time: input.next.due_time, note: input.next.note,
      deal_id: done.deal_id, person_id: done.person_id, organization_id: done.organization_id,
    })) as Row;
  }
  let warning: string | undefined;
  if (!next && done.deal_id) {
    const deal = must(await ctx.db.from("deals").select("status").eq("workspace_id", ctx.workspaceId).eq("id", done.deal_id).maybeSingle()) as { status: string } | null;
    const left = must(await ctx.db.from("activities").select("id").eq("workspace_id", ctx.workspaceId).eq("deal_id", done.deal_id).eq("done", false).limit(1)) as Row[];
    if (deal?.status === "open" && left.length === 0) warning = "Deal teď nemá žádný naplánovaný další krok. Zvaž přidání další aktivity (pole next).";
  }
  return { completed: done, next_activity: next, ...(warning ? { warning } : {}) };
}

export async function deleteActivity(ctx: Ctx, id: string) {
  const rows = must(await ctx.db.from("activities").delete().eq("workspace_id", ctx.workspaceId).eq("id", id).select("id")) as Row[];
  if (!rows[0]) throw notFound("Aktivita");
  return { id, deleted: true };
}

// ---------------------------------------------------------------------------- poznámky

export async function listNotes(ctx: Ctx, q: z.infer<typeof noteListQuery>) {
  let query = ctx.db.from("notes").select("id, content, deal_id, person_id, organization_id, author_id, created_at", { count: "exact" }).eq("workspace_id", ctx.workspaceId);
  if (q.deal_id) query = query.eq("deal_id", q.deal_id);
  if (q.person_id) query = query.eq("person_id", q.person_id);
  if (q.organization_id) query = query.eq("organization_id", q.organization_id);
  const res = await query.order("created_at", { ascending: false }).range(q.offset, q.offset + q.limit - 1);
  if (res.error) throw res.error;
  return { items: (res.data ?? []) as Row[], total: res.count ?? 0, limit: q.limit, offset: q.offset };
}

export async function createNote(ctx: Ctx, input: z.infer<typeof noteCreate>) {
  return must(await ctx.db.from("notes").insert({
    workspace_id: ctx.workspaceId, content: input.content, deal_id: input.deal_id ?? null, person_id: input.person_id ?? null,
    organization_id: input.organization_id ?? null, author_id: ctx.userId,
  }).select("id, content, deal_id, person_id, organization_id, author_id, created_at").single());
}
