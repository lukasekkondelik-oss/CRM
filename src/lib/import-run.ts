import { createClient } from "@/lib/supabase/client";
import type { Stage } from "@/lib/types";
import { nameKey, splitName, type EntityKind, type ParsedRow } from "./import.ts";

export interface ImportMember { id: string; full_name: string; email: string | null }

export interface ImportContext {
  kind: EntityKind;
  rows: ParsedRow[]; // jen validní řádky
  members: ImportMember[];
  userId: string;
  pipelineId?: string;
  stages?: Stage[];
  skipDuplicates: boolean;
}

export interface ImportResult {
  created: number;
  skipped: number;
  createdOrgs: number;
  createdPersons: number;
  failed: { line: number; message: string }[];
  warnings: string[];
}

const BATCH = 200;
const sb = () => createClient();

/** Načte celou tabulku po stránkách (PostgREST vrací max. 1000 řádků na dotaz). */
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Row = Record<string, unknown>;

/** Vloží řádky po dávkách; když dávka selže, zkusí řádky jednotlivě a vrátí, které selhaly. */
async function insertBatches(table: string, items: { line: number; row: Row }[], onDone: (n: number) => void) {
  const failed: { line: number; message: string }[] = [];
  let created = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    const { error } = await sb().from(table).insert(chunk.map((c) => c.row));
    if (!error) created += chunk.length;
    else {
      for (const c of chunk) {
        const r = await sb().from(table).insert(c.row);
        if (r.error) failed.push({ line: c.line, message: r.error.message }); else created++;
      }
    }
    onDone(chunk.length);
  }
  return { created, failed };
}

export async function runImport(ctx: ImportContext, onProgress: (done: number, total: number) => void): Promise<ImportResult> {
  const res: ImportResult = { created: 0, skipped: 0, createdOrgs: 0, createdPersons: 0, failed: [], warnings: [] };
  const total = ctx.rows.length;
  let done = 0;
  const tick = (n: number) => { done += n; onProgress(Math.min(done, total), total); };
  onProgress(0, total);

  // --- vlastník: podle e-mailu nebo jména, jinak importující uživatel
  let unknownOwners = 0;
  const byEmail = new Map(ctx.members.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m.id]));
  const byName = new Map(ctx.members.map((m) => [nameKey(m.full_name), m.id]));
  const owner = (raw: unknown) => {
    if (!raw) return ctx.userId;
    const s = String(raw);
    const id = byEmail.get(s.toLowerCase()) ?? byName.get(nameKey(s));
    if (!id) { unknownOwners++; return ctx.userId; }
    return id;
  };

  // --- firmy (načíst existující, chybějící vytvořit)
  const needsOrgs = ctx.kind !== "orgs" ? ctx.rows.some((r) => r.data.organization) : true;
  const orgIds = new Map<string, string>();
  const orgIcos = new Set<string>();
  if (needsOrgs) {
    for (const o of await fetchAll<{ id: string; name: string; ico: string | null }>("organizations", "id, name, ico")) {
      orgIds.set(nameKey(o.name), o.id);
      if (o.ico) orgIcos.add(o.ico);
    }
  }
  async function ensureOrgs(names: string[]) {
    const missing = [...new Map(names.filter((n) => n && !orgIds.has(nameKey(n))).map((n) => [nameKey(n), n.trim()])).values()];
    for (let i = 0; i < missing.length; i += BATCH) {
      const { data, error } = await sb().from("organizations").insert(missing.slice(i, i + BATCH).map((name) => ({ name, owner_id: ctx.userId }))).select("id, name");
      if (error) throw error;
      for (const o of data ?? []) { orgIds.set(nameKey(o.name), o.id); res.createdOrgs++; }
    }
  }

  if (ctx.kind === "orgs") {
    const seen = new Set<string>();
    const items: { line: number; row: Row }[] = [];
    for (const r of ctx.rows) {
      const name = String(r.data.name);
      const ico = r.data.ico ? String(r.data.ico) : null;
      const key = nameKey(name);
      if (ctx.skipDuplicates && ((ico && orgIcos.has(ico)) || orgIds.has(key) || seen.has(key))) { res.skipped++; tick(1); continue; }
      seen.add(key);
      items.push({ line: r.line, row: { name, ico, web: r.data.web, address: r.data.address, owner_id: owner(r.data.owner) } });
    }
    const out = await insertBatches("organizations", items, tick);
    res.created = out.created; res.failed = out.failed;
  }

  if (ctx.kind === "persons") {
    await ensureOrgs(ctx.rows.map((r) => String(r.data.organization ?? "")));
    const existing = new Set((await fetchAll<{ email: string | null }>("persons", "email")).map((p) => p.email?.toLowerCase()).filter(Boolean) as string[]);
    const seen = new Set<string>();
    const items: { line: number; row: Row }[] = [];
    for (const r of ctx.rows) {
      const email = r.data.email ? String(r.data.email) : null;
      if (ctx.skipDuplicates && email && (existing.has(email) || seen.has(email))) { res.skipped++; tick(1); continue; }
      if (email) seen.add(email);
      items.push({ line: r.line, row: {
        first_name: r.data.first_name ?? "", last_name: r.data.last_name ?? "", email, phone: r.data.phone, position: r.data.position, web: r.data.web,
        organization_id: r.data.organization ? orgIds.get(nameKey(String(r.data.organization))) ?? null : null, owner_id: owner(r.data.owner),
      } });
    }
    const out = await insertBatches("persons", items, tick);
    res.created = out.created; res.failed = out.failed;
  }

  if (ctx.kind === "deals") {
    const stages = [...(ctx.stages ?? [])].sort((a, b) => a.position - b.position);
    if (!ctx.pipelineId || stages.length === 0) throw new Error("Pipeline nemá žádné fáze.");
    const stageByName = new Map(stages.map((s) => [nameKey(s.name), s]));
    let unknownStages = 0;

    await ensureOrgs(ctx.rows.map((r) => String(r.data.organization ?? "")));
    const people = new Map<string, string>();
    if (ctx.rows.some((r) => r.data.person)) {
      for (const p of await fetchAll<{ id: string; first_name: string; last_name: string }>("persons", "id, first_name, last_name")) people.set(nameKey(`${p.first_name} ${p.last_name}`), p.id);
    }
    // chybějící osoby se vytvoří (i s firmou řádku)
    const newPeople = new Map<string, { first_name: string; last_name: string; organization_id: string | null }>();
    for (const r of ctx.rows) {
      const raw = String(r.data.person ?? "");
      if (!raw || people.has(nameKey(raw)) || newPeople.has(nameKey(raw))) continue;
      newPeople.set(nameKey(raw), { ...splitName(raw), organization_id: r.data.organization ? orgIds.get(nameKey(String(r.data.organization))) ?? null : null });
    }
    const toCreate = [...newPeople.entries()];
    for (let i = 0; i < toCreate.length; i += BATCH) {
      const chunk = toCreate.slice(i, i + BATCH);
      const { data, error } = await sb().from("persons").insert(chunk.map(([, p]) => ({ ...p, owner_id: ctx.userId }))).select("id, first_name, last_name");
      if (error) throw error;
      for (const p of data ?? []) { people.set(nameKey(`${p.first_name} ${p.last_name}`), p.id); res.createdPersons++; }
    }

    // pozice: nové dealy se řadí na konec sloupce
    const next = new Map<string, number>();
    for (const s of stages) {
      const { data } = await sb().from("deals").select("position").eq("stage_id", s.id).order("position", { ascending: false }).limit(1);
      next.set(s.id, data?.length ? Number(data[0].position) + 1 : 0);
    }
    const items: { line: number; row: Row }[] = [];
    for (const r of ctx.rows) {
      const wanted = r.data.stage ? stageByName.get(nameKey(String(r.data.stage))) : undefined;
      if (r.data.stage && !wanted) unknownStages++;
      const stage = wanted ?? stages[0];
      const position = next.get(stage.id)!; next.set(stage.id, position + 1);
      items.push({ line: r.line, row: {
        pipeline_id: ctx.pipelineId, stage_id: stage.id, title: r.data.title, value: r.data.value ?? 0, position,
        expected_close_date: r.data.expected_close_date, owner_id: owner(r.data.owner),
        organization_id: r.data.organization ? orgIds.get(nameKey(String(r.data.organization))) ?? null : null,
        person_id: r.data.person ? people.get(nameKey(String(r.data.person))) ?? null : null,
      } });
    }
    const out = await insertBatches("deals", items, tick);
    res.created = out.created; res.failed = out.failed;
    if (unknownStages) res.warnings.push(`${unknownStages}× nenalezena fáze podle názvu → deal je v první fázi (${stages[0].name}).`);
  }

  if (unknownOwners) res.warnings.push(`${unknownOwners}× nenalezen vlastník → přiřazeno tobě.`);
  if (res.createdOrgs) res.warnings.push(`Vytvořeno nových firem: ${res.createdOrgs}.`);
  if (res.createdPersons) res.warnings.push(`Vytvořeno nových osob: ${res.createdPersons}.`);
  onProgress(total, total);
  return res;
}
