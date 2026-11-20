import "server-only";
import { computeFunnel, computeKpis, dealsWithoutNextStep, rottingDeals, type DDeal, type DStage } from "@/lib/dashboard";
import { must, TODAY, type Ctx } from "./repo-core";

/** Souhrn pro rychlou orientaci: KPI, funnel, dnešní/zpožděné aktivity, dealy bez kroku a hnijící. */
export async function getOverview(ctx: Ctx, ownerFilter?: string) {
  const today = TODAY();
  const [dealsRes, pipes, acts] = await Promise.all([
    ctx.db.from("deals").select("id, title, value, status, stage_id, pipeline_id, owner_id, won_at, lost_at, stage_changed_at, delivery_status").eq("workspace_id", ctx.workspaceId).limit(5000),
    ctx.db.from("pipelines").select("id, name, position").eq("workspace_id", ctx.workspaceId).order("position"),
    ctx.db.from("activities").select("id, deal_id, subject, type, due_date, due_time, assigned_to").eq("workspace_id", ctx.workspaceId).eq("done", false).limit(20000),
  ]);
  const pipelines = must(pipes) as { id: string; name: string; position: number }[];
  const stages = pipelines.length
    ? (must(await ctx.db.from("stages").select("id, pipeline_id, name, position, probability, rotting_days").in("pipeline_id", pipelines.map((p) => p.id)).order("position")) as DStage[])
    : [];
  const activities = must(acts) as { id: string; deal_id: string | null; subject: string; type: string; due_date: string | null; due_time: string | null; assigned_to: string | null }[];
  const openCount = new Map<string, number>();
  for (const a of activities) if (a.deal_id) openCount.set(a.deal_id, (openCount.get(a.deal_id) ?? 0) + 1);
  const deals: DDeal[] = (must(dealsRes) as (Omit<DDeal, "openActivities" | "value"> & { value: number | string })[]).map((d) => ({ ...d, value: Number(d.value), openActivities: openCount.get(d.id) ?? 0 }));

  const owner = ownerFilter === "me" ? ctx.userId : ownerFilter ?? "";
  const now = Date.now();
  const kpis = computeKpis(deals, stages, { period: "month", owner }, today);
  const mine = activities.filter((a) => a.assigned_to === (owner || ctx.userId) && a.due_date && a.due_date <= today);
  const title = new Map(deals.map((d) => [d.id, d.title]));
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const brief = (d: DDeal) => ({ id: d.id, title: d.title, value: d.value, stage: stageName.get(d.stage_id) ?? null });

  return {
    date: today,
    kpis: { open_deals: kpis.openCount, open_value: kpis.openValue, weighted_value: Math.round(kpis.weighted), won_this_month: kpis.wonCount, delivering_deals: deals.filter((d) => d.status === "won" && (d.delivery_status === "in_progress" || d.delivery_status === "ongoing")).length, won_value_this_month: kpis.wonValue, lost_this_month: kpis.lostCount, win_rate_percent: kpis.winRate },
    funnel: pipelines.map((p) => ({ pipeline: p.name, stages: computeFunnel(deals, stages, p.id, owner).map((r) => ({ stage: r.name, deals: r.count, value: r.value, probability: r.probability })) })),
    activities_due: {
      overdue: mine.filter((a) => a.due_date! < today).length,
      today: mine.filter((a) => a.due_date === today).length,
      items: mine.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")).slice(0, 15).map((a) => ({ id: a.id, subject: a.subject, type: a.type, due_date: a.due_date, due_time: a.due_time, deal: a.deal_id ? title.get(a.deal_id) ?? null : null, deal_id: a.deal_id })),
    },
    deals_without_next_step: dealsWithoutNextStep(deals, owner).slice(0, 15).map(brief),
    rotting_deals: rottingDeals(deals, stages, owner, now).slice(0, 15).map((r) => ({ ...brief(r.deal), days_in_stage: r.days, limit_days: r.stage?.rotting_days ?? null })),
  };
}
