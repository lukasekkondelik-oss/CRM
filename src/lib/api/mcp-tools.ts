import "server-only";
import { z } from "zod";
import type { Ctx } from "./repo-core";
import { listMembers, listPipelines } from "./repo-core";
import { completeActivity, createActivity, createNote, listActivities } from "./repo-activities";
import { createOrg, createPerson, getOrg, getPerson, listOrgs, listPersons } from "./repo-contacts";
import { createDeal, getDeal, listDeals, moveDeal, setDealStatus, updateDeal } from "./repo-deals";
import { getOverview } from "./repo-overview";
import { ApiError } from "./errors";
import { activityType, dealListQuery, id, isoDate, isoTime, orgCreate, personCreate } from "./schemas";
import { nameKey } from "@/lib/import";

export interface McpTool {
  name: string;
  description: string;
  schema: z.ZodObject;
  /** vyžaduje klíč s oprávněním „write“ */
  write: boolean;
  run: (ctx: Ctx, args: never) => Promise<unknown>;
}

function tool<S extends z.ZodObject>(t: { name: string; description: string; schema: S; write?: boolean; run: (ctx: Ctx, args: z.infer<S>) => Promise<unknown> }): McpTool {
  return { name: t.name, description: t.description, schema: t.schema, write: t.write ?? false, run: t.run as McpTool["run"] };
}

const limit = z.number().int().min(1).max(50).optional().describe("Max. počet výsledků (výchozí 20)");

async function stageIdByName(ctx: Ctx, name: string) {
  const pipes = await listPipelines(ctx);
  const s = pipes.flatMap((p) => p.stages).find((x) => nameKey(x.name) === nameKey(name));
  if (!s) throw new ApiError(422, "stage_not_found", `Fáze „${name}“ neexistuje.`, { available: pipes.flatMap((p) => p.stages.map((x) => x.name)) });
  return s.id;
}

export const MCP_INSTRUCTIONS =
  "nexdeals je CRM pro vedení prodejní pipeline (dealy, osoby, firmy, aktivity, poznámky). Částky jsou v CZK, data ve formátu YYYY-MM-DD. " +
  "Na začátku použij get_overview. Každý otevřený deal má mít naplánovaný další krok: po dokončení aktivity (complete_activity) rovnou naplánuj další (next_subject). " +
  "Při vytváření dealu stačí zadat názvy firmy a osoby (organization_name, person_name) – chybějící se vytvoří. Nástroje pro mazání záměrně neexistují.";

export const MCP_TOOLS: McpTool[] = [
  tool({ name: "get_overview", description: "Souhrn CRM: KPI (otevřená a vážená pipeline, výhry tento měsíc, win rate), funnel, moje dnešní a zpožděné aktivity, dealy bez dalšího kroku a hnijící dealy. Dobrý první krok.",
    schema: z.object({}), run: (ctx) => getOverview(ctx, "me") }),
  tool({ name: "list_pipelines", description: "Pipelines a jejich fáze (název, pravděpodobnost, po kolika dnech deal hnije). Názvy fází používej v create_deal a move_deal.",
    schema: z.object({}), run: (ctx) => listPipelines(ctx) }),
  tool({ name: "list_members", description: "Členové týmu (id, jméno, e-mail, role) – pro přiřazení vlastníka dealu nebo aktivity.",
    schema: z.object({}), run: (ctx) => listMembers(ctx) }),

  tool({ name: "search_deals", description: "Vyhledá dealy. Vrací název, hodnotu, fázi, firmu, osobu, vlastníka, další krok a příznak hnití.",
    schema: z.object({
      q: z.string().optional().describe("Hledaný text v názvu dealu"),
      status: z.enum(["open", "won", "lost", "all"]).optional().describe("Výchozí open"),
      stage_name: z.string().optional().describe("Omezit na fázi podle názvu"),
      mine: z.boolean().optional().describe("Jen moje dealy"),
      limit,
    }),
    run: async (ctx, a) => listDeals(ctx, dealListQuery.parse({ q: a.q, status: a.status, stage_id: a.stage_name ? await stageIdByName(ctx, a.stage_name) : undefined, owner_id: a.mine ? "me" : undefined, limit: a.limit ?? 20 })) }),
  tool({ name: "get_deal", description: "Detail dealu včetně aktivit, poznámek, historie změn a labelů.",
    schema: z.object({ id }), run: (ctx, a) => getDeal(ctx, a.id) }),
  tool({ name: "create_deal", description: "Vytvoří deal (výchozí fáze = první fáze první pipeline). Firmu a osobu zadej jménem – když neexistují, vytvoří se. Potom naplánuj první krok (create_activity).", write: true,
    schema: z.object({
      title: z.string().min(1), value: z.number().min(0).optional().describe("Hodnota v CZK"),
      stage_name: z.string().optional(), pipeline_name: z.string().optional(),
      organization_name: z.string().optional(), person_name: z.string().optional().describe("Celé jméno, např. „Jan Novák“"),
      expected_close_date: isoDate.optional(),
    }),
    run: (ctx, a) => createDeal(ctx, a) }),
  tool({ name: "update_deal", description: "Změní název, hodnotu, termín uzavření nebo vlastníka dealu. Fázi měň přes move_deal, výhru/prohru přes close_deal.", write: true,
    schema: z.object({ id, title: z.string().min(1).optional(), value: z.number().min(0).optional(), expected_close_date: isoDate.nullable().optional(), owner_id: id.nullable().optional() }),
    run: (ctx, { id: dealId, ...patch }) => updateDeal(ctx, dealId, patch as never) }),
  tool({ name: "move_deal", description: "Přesune otevřený deal do jiné fáze (podle názvu fáze).", write: true,
    schema: z.object({ id, stage_name: z.string().min(1), pipeline_name: z.string().optional() }),
    run: (ctx, a) => moveDeal(ctx, a.id, { stage_name: a.stage_name, pipeline_name: a.pipeline_name }) }),
  tool({ name: "close_deal", description: "Označí deal jako vyhraný (won), prohraný (lost, povinný lost_reason) nebo ho znovu otevře (open).", write: true,
    schema: z.object({ id, status: z.enum(["won", "lost", "open"]), lost_reason: z.string().optional().describe("Povinné u lost, např. „Cena“") }),
    run: (ctx, a) => { if (a.status === "lost" && !a.lost_reason?.trim()) throw new ApiError(400, "invalid_request", "U prohry zadej lost_reason."); return setDealStatus(ctx, a.id, a as never); } }),

  tool({ name: "search_contacts", description: "Vyhledá osoby a/nebo firmy podle jména, e-mailu, telefonu, IČO nebo webu.",
    schema: z.object({ q: z.string().min(1), type: z.enum(["person", "organization", "both"]).optional().describe("Výchozí both"), limit }),
    run: async (ctx, a) => {
      const l = a.limit ?? 10;
      const [persons, orgs] = await Promise.all([
        a.type === "organization" ? null : listPersons(ctx, { q: a.q, limit: l, offset: 0 }),
        a.type === "person" ? null : listOrgs(ctx, { q: a.q, limit: l, offset: 0 }),
      ]);
      return { persons: persons?.items ?? [], organizations: orgs?.items ?? [] };
    } }),
  tool({ name: "get_contact", description: "Detail osoby nebo firmy včetně dealů, aktivit a poznámek.",
    schema: z.object({ type: z.enum(["person", "organization"]), id }),
    run: (ctx, a) => (a.type === "person" ? getPerson(ctx, a.id) : getOrg(ctx, a.id)) }),
  tool({ name: "create_person", description: "Vytvoří osobu (firma se zadá jménem, chybějící se vytvoří).", write: true,
    schema: z.object({ first_name: z.string().optional(), last_name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), position: z.string().optional(), web: z.string().optional(), organization_name: z.string().optional() }),
    run: (ctx, a) => createPerson(ctx, personCreate.parse(a)) }),
  tool({ name: "create_organization", description: "Vytvoří firmu (IČO má 8 číslic).", write: true,
    schema: z.object({ name: z.string().min(1), ico: z.string().optional(), web: z.string().optional(), address: z.string().optional() }),
    run: (ctx, a) => createOrg(ctx, orgCreate.parse(a)) }),

  tool({ name: "list_activities", description: "Aktivity (hovory, schůzky, úkoly, e-maily, deadliny). Ve výchozím stavu moje nedokončené po termínu a dnešní.",
    schema: z.object({
      due: z.enum(["today", "overdue", "week", "all"]).optional().describe("Výchozí: dnes + po termínu se řeší dvěma voláními; „all“ = všechny"),
      done: z.boolean().optional(), deal_id: id.optional(), mine: z.boolean().optional().describe("Jen moje (výchozí true)"), limit,
    }),
    run: (ctx, a) => listActivities(ctx, { due: a.due ?? "all", done: a.done ?? false, deal_id: a.deal_id, assigned_to: a.mine === false ? undefined : "me", limit: a.limit ?? 30, offset: 0 }) }),
  tool({ name: "create_activity", description: "Naplánuje aktivitu (u dealu se osoba a firma doplní z dealu; přiřazeno mně, pokud neřekneš jinak).", write: true,
    schema: z.object({ subject: z.string().min(1), type: activityType.optional(), due_date: isoDate.optional(), due_time: isoTime.optional(), deal_id: id.optional(), note: z.string().optional() }),
    run: (ctx, a) => createActivity(ctx, a) }),
  tool({ name: "complete_activity", description: "Označí aktivitu jako hotovou. Pokud uvedeš next_subject, rovnou naplánuje navazující krok na stejný deal (doporučeno).", write: true,
    schema: z.object({ id, next_subject: z.string().optional(), next_type: activityType.optional(), next_due_date: isoDate.optional() }),
    run: (ctx, a) => completeActivity(ctx, a.id, { next: a.next_subject ? { subject: a.next_subject, type: a.next_type, due_date: a.next_due_date } : undefined }) }),
  tool({ name: "add_note", description: "Přidá poznámku k dealu, osobě nebo firmě (právě jedno z deal_id, person_id, organization_id).", write: true,
    schema: z.object({ content: z.string().min(1), deal_id: id.optional(), person_id: id.optional(), organization_id: id.optional() }),
    run: async (ctx, a) => { const { noteCreate } = await import("./schemas"); return createNote(ctx, noteCreate.parse(a)); } }),
];
