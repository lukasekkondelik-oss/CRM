import { createClient } from "@/lib/supabase/client";
import type { ComboOption } from "@/components/ui/combobox";
import { personName, type OrgLite, type PersonLite } from "@/lib/deals/helpers";
import { ORG_SEARCH_COLUMNS, PERSON_SEARCH_COLUMNS, wordFilters } from "./search-util";

/** Serverové hledání pro výběry (Combobox) – vrací max 20 výsledků, v `data` je celý záznam. */
export async function searchPersons(q: string): Promise<ComboOption[]> {
  let query = createClient().from("persons").select("id, first_name, last_name, organization_id");
  for (const f of wordFilters(q, PERSON_SEARCH_COLUMNS)) query = query.or(f);
  const { data } = await query.order("last_name").limit(20);
  const persons = (data ?? []) as PersonLite[];
  const orgIds = [...new Set(persons.map((p) => p.organization_id).filter((x): x is string => !!x))];
  const orgs = orgIds.length
    ? ((await createClient().from("organizations").select("id, name").in("id", orgIds)).data ?? [])
    : [];
  const names = new Map((orgs as OrgLite[]).map((o) => [o.id, o.name]));
  return persons.map((p) => ({
    id: p.id,
    label: personName(p),
    sub: p.organization_id ? names.get(p.organization_id) : undefined,
    data: p,
  }));
}

export async function searchOrgs(q: string): Promise<ComboOption[]> {
  let query = createClient().from("organizations").select("id, name");
  for (const f of wordFilters(q, ORG_SEARCH_COLUMNS)) query = query.or(f);
  const { data } = await query.order("name").limit(20);
  return ((data ?? []) as OrgLite[]).map((o) => ({ id: o.id, label: o.name, data: o }));
}

/** Hledání dealů (podle názvu) pro vazbu aktivity. */
export async function searchDeals(q: string): Promise<ComboOption[]> {
  let query = createClient().from("deals").select("id, title, person_id, organization_id, status");
  for (const f of wordFilters(q, ["title"])) query = query.or(f);
  const { data } = await query.eq("status", "open").order("created_at", { ascending: false }).limit(20);
  return ((data ?? []) as { id: string; title: string }[]).map((d) => ({ id: d.id, label: d.title, data: d }));
}

export interface GlobalResults { deals: ComboOption[]; persons: ComboOption[]; orgs: ComboOption[] }

/** Globální hledání: dealy (i uzavřené), osoby a firmy, po 6 výsledcích. */
export async function searchAll(q: string): Promise<GlobalResults> {
  let dq = createClient().from("deals").select("id, title, status, value");
  for (const f of wordFilters(q, ["title"])) dq = dq.or(f);
  const [deals, persons, orgs] = await Promise.all([dq.order("created_at", { ascending: false }).limit(6), searchPersons(q), searchOrgs(q)]);
  const status = { open: "", won: "Vyhráno", lost: "Prohráno" } as Record<string, string>;
  return {
    deals: ((deals.data ?? []) as { id: string; title: string; status: string }[]).map((d) => ({ id: d.id, label: d.title, sub: status[d.status] || undefined })),
    persons: persons.slice(0, 6),
    orgs: orgs.slice(0, 6),
  };
}
