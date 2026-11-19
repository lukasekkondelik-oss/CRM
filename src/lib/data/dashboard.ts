import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DDeal, DStage } from "@/lib/dashboard";
import type { Member } from "@/lib/deals/helpers";
import type { ActivityType, Pipeline } from "@/lib/types";

const LIMIT = 5000;

export interface DashActivity {
  id: string; deal_id: string | null; subject: string; type: ActivityType;
  due_date: string | null; due_time: string | null; assigned_to: string | null;
}

export async function loadDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [dealsRes, stagesRes, pipelinesRes, membersRes, actsRes] = await Promise.all([
    supabase.from("deals").select("id, title, value, status, stage_id, pipeline_id, owner_id, won_at, lost_at, stage_changed_at").limit(LIMIT),
    supabase.from("stages").select("id, pipeline_id, name, position, probability, rotting_days").order("position"),
    supabase.from("pipelines").select("id, workspace_id, name, position").order("position"),
    supabase.from("profiles").select("id, full_name, avatar_url").order("full_name"),
    supabase.from("activities").select("id, deal_id, subject, type, due_date, due_time, assigned_to").eq("done", false).limit(LIMIT * 4),
  ]);

  const activities = (actsRes.data ?? []) as DashActivity[];
  const openCount = new Map<string, number>();
  for (const a of activities) if (a.deal_id) openCount.set(a.deal_id, (openCount.get(a.deal_id) ?? 0) + 1);

  const deals: DDeal[] = (dealsRes.data ?? []).map((d) => ({
    ...(d as Omit<DDeal, "openActivities" | "value"> & { value: number | string }),
    value: Number(d.value),
    openActivities: openCount.get(d.id) ?? 0,
  }));

  return {
    userId: user.id,
    now: Date.now(),
    deals,
    stages: (stagesRes.data ?? []) as DStage[],
    pipelines: (pipelinesRes.data ?? []) as Pipeline[],
    members: (membersRes.data ?? []) as Member[],
    activities,
  };
}
