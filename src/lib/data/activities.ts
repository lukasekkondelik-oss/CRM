import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Member, PersonLite } from "@/lib/deals/helpers";
import type { Activity } from "@/lib/types";
import { fetchByIds } from "./pipeline";

export interface DealLite {
  id: string;
  title: string;
  person_id: string | null;
  organization_id: string | null;
  status: "open" | "won" | "lost";
  delivery_status?: string | null;
}

/** Všechny nedokončené aktivity + hotové z posledních 30 dní (kalendář a „Vše“). */
export async function loadActivitiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [openRes, doneRes, membersRes] = await Promise.all([
    supabase.from("activities").select("*").eq("done", false)
      .order("due_date", { nullsFirst: false }).order("due_time", { nullsFirst: false }).limit(2000),
    supabase.from("activities").select("*").eq("done", true).gte("done_at", since)
      .order("done_at", { ascending: false }).limit(500),
    supabase.from("profiles").select("id, full_name, avatar_url").order("full_name"),
  ]);
  const activities = [...((openRes.data ?? []) as Activity[]), ...((doneRes.data ?? []) as Activity[])];

  const deals = await fetchByIds<DealLite>(supabase, "deals", "id, title, person_id, organization_id, status, delivery_status", activities.map((a) => a.deal_id));
  const persons = await fetchByIds<PersonLite>(supabase, "persons", "id, first_name, last_name, organization_id",
    [...activities.map((a) => a.person_id), ...deals.map((d) => d.person_id)]);

  return { userId: user.id, activities, deals, persons, members: (membersRes.data ?? []) as Member[] };
}
