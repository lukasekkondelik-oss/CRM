import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ORG_SEARCH_COLUMNS, PERSON_SEARCH_COLUMNS, wordFilters } from "@/lib/contacts/search-util";

type Sb = Awaited<ReturnType<typeof createClient>>;
const MAX = 20000;

/** Stránkované načtení všeho (limit PostgREST 1000 řádků na dotaz). */
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const date = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const lookup = async (sb: Sb, table: string, cols: string) => all<Record<string, string>>((f, t) => sb.from(table).select(cols).range(f, t));

export async function exportRows(kind: string, q: string): Promise<{ header: string[]; rows: (string | number | null)[][] } | null> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const members = new Map((await lookup(sb, "profiles", "id, full_name")).map((m) => [m.id, m.full_name]));

  if (kind === "osoby") {
    const orgs = new Map((await lookup(sb, "organizations", "id, name")).map((o) => [o.id, o.name]));
    const rows = await all<Record<string, string | null>>((f, t) => {
      let query = sb.from("persons").select("*");
      for (const w of wordFilters(q, PERSON_SEARCH_COLUMNS)) query = query.or(w);
      return query.order("last_name").order("id").range(f, t);
    });
    return {
      header: ["Jméno", "Příjmení", "E-mail", "Telefon", "Pozice", "Firma", "Vlastník", "Vytvořeno"],
      rows: rows.map((p) => [p.first_name, p.last_name, p.email, p.phone, p.position, p.organization_id ? orgs.get(p.organization_id) ?? "" : "", p.owner_id ? members.get(p.owner_id) ?? "" : "", date(p.created_at)]),
    };
  }
  if (kind === "firmy") {
    const rows = await all<Record<string, string | null>>((f, t) => {
      let query = sb.from("organizations").select("*");
      for (const w of wordFilters(q, ORG_SEARCH_COLUMNS)) query = query.or(w);
      return query.order("name").order("id").range(f, t);
    });
    return {
      header: ["Název", "IČO", "Web", "Adresa", "Vlastník", "Vytvořeno"],
      rows: rows.map((o) => [o.name, o.ico, o.web, o.address, o.owner_id ? members.get(o.owner_id) ?? "" : "", date(o.created_at)]),
    };
  }
  if (kind === "dealy") {
    const [orgs, persons, stages, pipelines] = await Promise.all([
      lookup(sb, "organizations", "id, name"), lookup(sb, "persons", "id, first_name, last_name"), lookup(sb, "stages", "id, name"), lookup(sb, "pipelines", "id, name"),
    ]);
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));
    const personName = new Map(persons.map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
    const stageName = new Map(stages.map((s) => [s.id, s.name]));
    const pipeName = new Map(pipelines.map((p) => [p.id, p.name]));
    const status = { open: "Otevřený", won: "Vyhráno", lost: "Prohráno" } as Record<string, string>;
    const rows = await all<Record<string, string | number | null>>((f, t) => sb.from("deals").select("*").order("created_at", { ascending: false }).order("id").range(f, t));
    return {
      header: ["Název", "Hodnota", "Měna", "Stav", "Pipeline", "Fáze", "Firma", "Osoba", "Vlastník", "Očekávané uzavření", "Důvod prohry", "Vytvořeno"],
      rows: rows.map((d) => [d.title, Number(d.value), d.currency, status[String(d.status)] ?? d.status, pipeName.get(String(d.pipeline_id)) ?? "", stageName.get(String(d.stage_id)) ?? "",
        d.organization_id ? orgName.get(String(d.organization_id)) ?? "" : "", d.person_id ? personName.get(String(d.person_id)) ?? "" : "",
        d.owner_id ? members.get(String(d.owner_id)) ?? "" : "", d.expected_close_date, d.lost_reason, date(String(d.created_at))]),
    };
  }
  return null;
}
