import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Member, OrgLite, PersonLite } from "@/lib/deals/helpers";
import type { ActivityType, Deal } from "@/lib/types";
import { fetchByIds } from "./pipeline";

export interface DeliveryDeal extends Deal {
  openActivities: number;
  nextDue: string | null;
  nextSubject: string | null;
  nextType: ActivityType | null;
}

/** Vyhrané dealy, na kterých se ještě pracuje (realizace) nebo běží jako předplatné. */
export async function loadDelivery() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [dealsRes, membersRes] = await Promise.all([
    supabase.from("deals").select("*").eq("status", "won").in("delivery_status", ["in_progress", "ongoing"]).order("won_at", { ascending: false }).limit(1000),
    supabase.from("profiles").select("id, full_name, avatar_url").order("full_name"),
  ]);
  const raw = ((dealsRes.data ?? []) as Deal[]).map((d) => ({ ...d, value: Number(d.value) }));
  const ids = raw.map((d) => d.id);

  const acts: { deal_id: string; due_date: string | null; due_time: string | null; subject: string; type: ActivityType }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from("activities").select("deal_id, due_date, due_time, subject, type").eq("done", false).in("deal_id", ids.slice(i, i + 100));
    acts.push(...((data ?? []) as typeof acts));
  }
  const next = new Map<string, { count: number; due: string | null; time: string; subject: string; type: ActivityType }>();
  for (const a of acts) {
    const cur = next.get(a.deal_id);
    const better = !cur || (a.due_date && (!cur.due || a.due_date < cur.due || (a.due_date === cur.due && (a.due_time ?? "") < cur.time)));
    next.set(a.deal_id, { count: (cur?.count ?? 0) + 1, ...(better ? { due: a.due_date, time: a.due_time ?? "", subject: a.subject, type: a.type } : { due: cur!.due, time: cur!.time, subject: cur!.subject, type: cur!.type }) });
  }
  const deals: DeliveryDeal[] = raw.map((d) => ({
    ...d, openActivities: next.get(d.id)?.count ?? 0, nextDue: next.get(d.id)?.due ?? null,
    nextSubject: next.get(d.id)?.subject ?? null, nextType: next.get(d.id)?.type ?? null,
  }));

  const persons = await fetchByIds<PersonLite>(supabase, "persons", "id, first_name, last_name, organization_id", deals.map((d) => d.person_id));
  const orgs = await fetchByIds<OrgLite>(supabase, "organizations", "id, name", [...deals.map((d) => d.organization_id), ...persons.map((p) => p.organization_id)]);

  return { deals, persons, orgs, members: (membersRes.data ?? []) as Member[] };
}
