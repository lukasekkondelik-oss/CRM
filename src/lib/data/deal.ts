import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Member, OrgLite, PersonLite } from "@/lib/deals/helpers";
import type { Activity, Deal, DealHistory, Label, Note, Pipeline, Stage } from "@/lib/types";

export async function loadDealData(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: deal } = await supabase.from("deals").select("*").eq("id", id).maybeSingle();
  if (!deal || !user) return null;

  const [pipelineRes, stagesRes, membersRes, labelsRes, dealLabelsRes, personsRes, orgsRes, actsRes, notesRes, histRes] =
    await Promise.all([
      supabase.from("pipelines").select("id, workspace_id, name, position").eq("id", deal.pipeline_id).single(),
      supabase.from("stages").select("*").eq("pipeline_id", deal.pipeline_id).order("position"),
      supabase.from("profiles").select("id, full_name, avatar_url").order("full_name"),
      supabase.from("labels").select("*").order("name"),
      supabase.from("deal_labels").select("label_id").eq("deal_id", id),
      supabase.from("persons").select("id, first_name, last_name, organization_id").order("last_name").limit(5000),
      supabase.from("organizations").select("id, name").order("name").limit(5000),
      supabase.from("activities").select("*").eq("deal_id", id).order("due_date", { nullsFirst: false }),
      supabase.from("notes").select("*").eq("deal_id", id).order("created_at", { ascending: false }),
      supabase.from("deal_history").select("*").eq("deal_id", id).order("changed_at", { ascending: false }),
    ]);

  return {
    now: Date.now(),
    userId: user.id,
    deal: { ...(deal as Deal), value: Number(deal.value) },
    pipeline: pipelineRes.data as Pipeline,
    stages: (stagesRes.data ?? []) as Stage[],
    members: (membersRes.data ?? []) as Member[],
    labels: (labelsRes.data ?? []) as Label[],
    labelIds: (dealLabelsRes.data ?? []).map((r) => r.label_id as string),
    persons: (personsRes.data ?? []) as PersonLite[],
    orgs: (orgsRes.data ?? []) as OrgLite[],
    activities: (actsRes.data ?? []) as Activity[],
    notes: (notesRes.data ?? []) as Note[],
    history: (histRes.data ?? []) as DealHistory[],
  };
}
