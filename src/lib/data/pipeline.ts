import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DealVM, Member, OrgLite, PersonLite } from "@/lib/deals/helpers";
import type { Deal, Label, Pipeline, Stage } from "@/lib/types";

const LIMIT = 5000;

/** `.in("id", ...)` po dávkách (limit délky URL). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchByIds<T>(supabase: any, table: string, columns: string, ids: (string | null)[]): Promise<T[]> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 100) chunks.push(unique.slice(i, i + 100));
  const results = await Promise.all(chunks.map((c) => supabase.from(table).select(columns).in("id", c)));
  return results.flatMap((r) => (r.data ?? []) as T[]);
}

/** Načte vše pro Pipeline obrazovku. Tabulky se čtou odděleně (bez embedů) a spojují v JS. */
export async function loadPipelineData(requestedPipelineId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [pipelinesRes, membersRes, labelsRes] = await Promise.all([
    supabase.from("pipelines").select("id, workspace_id, name, position").order("position"),
    supabase.from("profiles").select("id, full_name, avatar_url").order("full_name"),
    supabase.from("labels").select("*").order("name"),
  ]);

  const pipelines = (pipelinesRes.data ?? []) as Pipeline[];
  const pipeline = pipelines.find((p) => p.id === requestedPipelineId) ?? pipelines[0] ?? null;
  if (!pipeline || !user) return null;

  const [stagesRes, dealsRes, dealLabelsRes, activitiesRes] = await Promise.all([
    supabase.from("stages").select("*").eq("pipeline_id", pipeline.id).order("position"),
    supabase.from("deals").select("*").eq("pipeline_id", pipeline.id).order("position").limit(LIMIT),
    supabase.from("deal_labels").select("deal_id, label_id").limit(LIMIT * 4),
    supabase.from("activities").select("deal_id, due_date").eq("done", false).not("deal_id", "is", null).limit(LIMIT * 4),
  ]);

  const labelsByDeal = new Map<string, string[]>();
  for (const dl of dealLabelsRes.data ?? []) {
    labelsByDeal.set(dl.deal_id, [...(labelsByDeal.get(dl.deal_id) ?? []), dl.label_id]);
  }
  const act = new Map<string, { count: number; next: string | null }>();
  for (const a of activitiesRes.data ?? []) {
    const cur = act.get(a.deal_id) ?? { count: 0, next: null };
    cur.count += 1;
    if (a.due_date && (!cur.next || a.due_date < cur.next)) cur.next = a.due_date;
    act.set(a.deal_id, cur);
  }

  const deals: DealVM[] = ((dealsRes.data ?? []) as Deal[]).map((d) => ({
    ...d,
    value: Number(d.value),
    labelIds: labelsByDeal.get(d.id) ?? [],
    openActivities: act.get(d.id)?.count ?? 0,
    nextDue: act.get(d.id)?.next ?? null,
  }));

  // Kontakty načítáme jen ty, na které se dealy odkazují (zbytek řeší serverové hledání).
  const persons = await fetchByIds<PersonLite>(supabase, "persons", "id, first_name, last_name, organization_id",
    deals.map((d) => d.person_id));
  const orgs = await fetchByIds<OrgLite>(supabase, "organizations", "id, name",
    [...deals.map((d) => d.organization_id), ...persons.map((p) => p.organization_id)]);

  return {
    now: Date.now(),
    userId: user.id,
    pipelines,
    pipeline,
    stages: (stagesRes.data ?? []) as Stage[],
    deals,
    members: (membersRes.data ?? []) as Member[],
    labels: (labelsRes.data ?? []) as Label[],
    persons,
    orgs,
  };
}
