import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ORG_SEARCH_COLUMNS, PERSON_SEARCH_COLUMNS, wordFilters } from "@/lib/contacts/search-util";
import type { Member } from "@/lib/deals/helpers";
import type { Activity, Deal, Note, Organization, Person, Pipeline, Stage } from "@/lib/types";
import { fetchByIds } from "./pipeline";

export const PAGE_SIZE = 25;

export interface ListParams { q: string; sort: string; dir: "asc" | "desc"; page: number }

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseListParams(sp: SP, sorts: string[], defaultSort: string): ListParams {
  const sort = sorts.includes(one(sp.sort)) ? one(sp.sort) : defaultSort;
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);
  return { q: one(sp.q).slice(0, 100), sort, dir: one(sp.dir) === "desc" ? "desc" : "asc", page };
}

async function members(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Member[]> {
  const { data } = await supabase.from("profiles").select("id, full_name, avatar_url").order("full_name");
  return (data ?? []) as Member[];
}

export interface PersonRow extends Person { orgName: string | null; openDeals: number }
export interface OrgRow extends Organization { personCount: number; openDeals: number }

export async function listPersons(p: ListParams) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let query = supabase.from("persons").select("*", { count: "exact" });
  for (const f of wordFilters(p.q, PERSON_SEARCH_COLUMNS)) query = query.or(f);
  const asc = p.dir === "asc";
  if (p.sort === "name") query = query.order("last_name", { ascending: asc }).order("first_name", { ascending: asc });
  else query = query.order(p.sort, { ascending: asc, nullsFirst: false }).order("last_name");
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, count } = await query.range(from, from + PAGE_SIZE - 1);
  const persons = (data ?? []) as Person[];
  const ids = persons.map((x) => x.id);

  const [orgs, dealsRes, mem] = await Promise.all([
    fetchByIds<{ id: string; name: string }>(supabase, "organizations", "id, name", persons.map((x) => x.organization_id)),
    ids.length ? supabase.from("deals").select("person_id").eq("status", "open").in("person_id", ids) : { data: [] },
    members(supabase),
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const open = new Map<string, number>();
  for (const d of (dealsRes.data ?? []) as { person_id: string }[]) open.set(d.person_id, (open.get(d.person_id) ?? 0) + 1);

  const rows: PersonRow[] = persons.map((x) => ({
    ...x, orgName: x.organization_id ? (orgName.get(x.organization_id) ?? null) : null, openDeals: open.get(x.id) ?? 0,
  }));
  return { rows, total: count ?? 0, members: mem, userId: user?.id ?? "" };
}

export async function listOrgs(p: ListParams) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let query = supabase.from("organizations").select("*", { count: "exact" });
  for (const f of wordFilters(p.q, ORG_SEARCH_COLUMNS)) query = query.or(f);
  query = query.order(p.sort, { ascending: p.dir === "asc", nullsFirst: false }).order("name");
  const from = (p.page - 1) * PAGE_SIZE;
  const { data, count } = await query.range(from, from + PAGE_SIZE - 1);
  const orgs = (data ?? []) as Organization[];
  const ids = orgs.map((o) => o.id);

  const [personsRes, mem] = await Promise.all([
    ids.length ? supabase.from("persons").select("id, organization_id").in("organization_id", ids) : { data: [] },
    members(supabase),
  ]);
  const persons = (personsRes.data ?? []) as { id: string; organization_id: string }[];
  const personOrg = new Map(persons.map((x) => [x.id, x.organization_id]));
  const dealsRes = ids.length
    ? await supabase.from("deals").select("id, organization_id, person_id").eq("status", "open")
        .or(`organization_id.in.(${ids.join(",")})${persons.length ? `,person_id.in.(${persons.map((x) => x.id).join(",")})` : ""}`)
    : { data: [] };

  const people = new Map<string, number>();
  for (const x of persons) people.set(x.organization_id, (people.get(x.organization_id) ?? 0) + 1);
  const open = new Map<string, Set<string>>();
  for (const d of (dealsRes.data ?? []) as { id: string; organization_id: string | null; person_id: string | null }[]) {
    const org = d.organization_id ?? (d.person_id ? personOrg.get(d.person_id) : undefined);
    if (org) open.set(org, (open.get(org) ?? new Set()).add(d.id));
  }
  const rows: OrgRow[] = orgs.map((o) => ({ ...o, personCount: people.get(o.id) ?? 0, openDeals: open.get(o.id)?.size ?? 0 }));
  return { rows, total: count ?? 0, members: mem, userId: user?.id ?? "" };
}

/** Společné pro detail osoby i firmy: dealy, aktivity, poznámky, fáze, členové. */
async function relatedData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealFilter: string,
  contactFilter: (dealIds: string[]) => string,
) {
  const [dealsRes, stagesRes, pipelinesRes, mem] = await Promise.all([
    supabase.from("deals").select("*").or(dealFilter).order("created_at", { ascending: false }).limit(500),
    supabase.from("stages").select("*"),
    supabase.from("pipelines").select("id, workspace_id, name, position").order("position"),
    members(supabase),
  ]);
  const deals = ((dealsRes.data ?? []) as Deal[]).map((d) => ({ ...d, value: Number(d.value) }));
  const filter = contactFilter(deals.map((d) => d.id));
  const [actsRes, notesRes] = await Promise.all([
    supabase.from("activities").select("*").or(filter).order("due_date", { nullsFirst: false }).limit(500),
    supabase.from("notes").select("*").or(filter).order("created_at", { ascending: false }).limit(500),
  ]);
  return {
    deals,
    stages: (stagesRes.data ?? []) as Stage[],
    pipelines: (pipelinesRes.data ?? []) as Pipeline[],
    members: mem,
    activities: (actsRes.data ?? []) as Activity[],
    notes: (notesRes.data ?? []) as Note[],
  };
}

export async function loadPerson(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: person } = await supabase.from("persons").select("*").eq("id", id).maybeSingle();
  if (!person || !user) return null;
  const org = person.organization_id
    ? (await supabase.from("organizations").select("id, name").eq("id", person.organization_id).maybeSingle()).data
    : null;
  const related = await relatedData(
    supabase,
    `person_id.eq.${id}`,
    (dealIds) => `person_id.eq.${id}${dealIds.length ? `,deal_id.in.(${dealIds.join(",")})` : ""}`,
  );
  return { userId: user.id, now: Date.now(), person: person as Person, org: org as { id: string; name: string } | null, ...related };
}

export async function loadOrg(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: org } = await supabase.from("organizations").select("*").eq("id", id).maybeSingle();
  if (!org || !user) return null;
  const { data: people } = await supabase.from("persons").select("*").eq("organization_id", id).order("last_name");
  const persons = (people ?? []) as Person[];
  const pIds = persons.map((p) => p.id);
  const related = await relatedData(
    supabase,
    `organization_id.eq.${id}${pIds.length ? `,person_id.in.(${pIds.join(",")})` : ""}`,
    (dealIds) =>
      [`organization_id.eq.${id}`, pIds.length ? `person_id.in.(${pIds.join(",")})` : "", dealIds.length ? `deal_id.in.(${dealIds.join(",")})` : ""]
        .filter(Boolean).join(","),
  );
  return { userId: user.id, now: Date.now(), org: org as Organization, persons, ...related };
}
