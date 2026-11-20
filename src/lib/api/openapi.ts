import { z } from "zod";
import * as S from "./schemas.ts";

type Method = "get" | "post" | "patch" | "put" | "delete";
export interface Endpoint { method: Method; path: string; summary: string; scope: "read" | "write"; tag: string; query?: z.ZodObject; body?: z.ZodType; created?: boolean }

const ID = [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }];

export const ENDPOINTS: Endpoint[] = [
  { method: "get", path: "/me", summary: "Kdo jsem: uživatel, workspace a oprávnění klíče", scope: "read", tag: "Základ" },
  { method: "get", path: "/overview", summary: "Souhrn: KPI, funnel, aktivity k vyřízení, dealy bez kroku, hnijící", scope: "read", tag: "Základ", query: z.object({ owner_id: z.string().optional() }) },
  { method: "get", path: "/pipelines", summary: "Pipelines a jejich fáze", scope: "read", tag: "Základ" },
  { method: "get", path: "/members", summary: "Členové týmu", scope: "read", tag: "Základ" },
  { method: "get", path: "/labels", summary: "Labely workspace", scope: "read", tag: "Základ" },

  { method: "get", path: "/deals", summary: "Seznam dealů (filtry, hledání, stránkování)", scope: "read", tag: "Dealy", query: S.dealListQuery },
  { method: "post", path: "/deals", summary: "Vytvořit deal (firmu a osobu lze zadat jménem)", scope: "write", tag: "Dealy", body: S.dealCreate, created: true },
  { method: "get", path: "/deals/{id}", summary: "Detail dealu s aktivitami, poznámkami a historií", scope: "read", tag: "Dealy" },
  { method: "patch", path: "/deals/{id}", summary: "Upravit deal", scope: "write", tag: "Dealy", body: S.dealUpdate },
  { method: "delete", path: "/deals/{id}", summary: "Smazat deal (nevratné)", scope: "write", tag: "Dealy" },
  { method: "post", path: "/deals/{id}/move", summary: "Přesunout otevřený deal do jiné fáze", scope: "write", tag: "Dealy", body: S.dealMove },
  { method: "post", path: "/deals/{id}/status", summary: "Vyhráno / prohráno (s důvodem) / znovu otevřít", scope: "write", tag: "Dealy", body: S.dealStatus },
  { method: "put", path: "/deals/{id}/labels", summary: "Nahradit labely dealu", scope: "write", tag: "Dealy", body: S.dealLabels },

  { method: "get", path: "/persons", summary: "Seznam osob", scope: "read", tag: "Kontakty", query: S.personListQuery },
  { method: "post", path: "/persons", summary: "Vytvořit osobu", scope: "write", tag: "Kontakty", body: S.personCreate, created: true },
  { method: "get", path: "/persons/{id}", summary: "Detail osoby s dealy, aktivitami a poznámkami", scope: "read", tag: "Kontakty" },
  { method: "patch", path: "/persons/{id}", summary: "Upravit osobu", scope: "write", tag: "Kontakty", body: S.personUpdate },
  { method: "delete", path: "/persons/{id}", summary: "Smazat osobu", scope: "write", tag: "Kontakty" },
  { method: "put", path: "/persons/{id}/labels", summary: "Nahradit štítky osoby (stejná sada štítků jako u dealů)", scope: "write", tag: "Kontakty", body: S.contactLabels },
  { method: "get", path: "/organizations", summary: "Seznam firem", scope: "read", tag: "Kontakty", query: S.orgListQuery },
  { method: "post", path: "/organizations", summary: "Vytvořit firmu", scope: "write", tag: "Kontakty", body: S.orgCreate, created: true },
  { method: "get", path: "/organizations/{id}", summary: "Detail firmy s osobami, dealy a poznámkami", scope: "read", tag: "Kontakty" },
  { method: "patch", path: "/organizations/{id}", summary: "Upravit firmu", scope: "write", tag: "Kontakty", body: S.orgUpdate },
  { method: "delete", path: "/organizations/{id}", summary: "Smazat firmu", scope: "write", tag: "Kontakty" },
  { method: "put", path: "/organizations/{id}/labels", summary: "Nahradit štítky firmy (stejná sada štítků jako u dealů)", scope: "write", tag: "Kontakty", body: S.contactLabels },

  { method: "get", path: "/activities", summary: "Seznam aktivit (dnes, po termínu, týden, filtry)", scope: "read", tag: "Aktivity", query: S.activityListQuery },
  { method: "post", path: "/activities", summary: "Naplánovat aktivitu", scope: "write", tag: "Aktivity", body: S.activityCreate, created: true },
  { method: "patch", path: "/activities/{id}", summary: "Upravit aktivitu", scope: "write", tag: "Aktivity", body: S.activityUpdate },
  { method: "delete", path: "/activities/{id}", summary: "Smazat aktivitu", scope: "write", tag: "Aktivity" },
  { method: "post", path: "/activities/{id}/complete", summary: "Dokončit aktivitu; volitelně rovnou naplánovat další krok (next)", scope: "write", tag: "Aktivity", body: S.activityComplete },
  { method: "get", path: "/notes", summary: "Poznámky k dealu / osobě / firmě", scope: "read", tag: "Poznámky", query: S.noteListQuery },
  { method: "post", path: "/notes", summary: "Přidat poznámku", scope: "write", tag: "Poznámky", body: S.noteCreate, created: true },
];

const schemaOf = (s: z.ZodType) => z.toJSONSchema(s, { io: "input", unrepresentable: "any" });

export function buildOpenApi(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const op: Record<string, unknown> = {
      tags: [e.tag], summary: e.summary,
      description: `Vyžaduje oprávnění klíče: **${e.scope}**.`,
      security: [{ bearerAuth: [] }],
      parameters: [...(e.path.includes("{id}") ? ID : [])],
      responses: {
        [e.created ? "201" : "200"]: { description: "Úspěch – odpověď má tvar { data: … }" },
        "400": { description: "Neplatný vstup (validation_error / invalid_request)" },
        "401": { description: "Chybí nebo je neplatný API klíč" },
        "403": { description: "Klíč nemá potřebné oprávnění" },
        "404": { description: "Záznam nenalezen" },
        "429": { description: "Příliš mnoho požadavků" },
      },
    };
    if (e.query) {
      const sch = schemaOf(e.query) as { properties?: Record<string, unknown>; required?: string[] };
      (op.parameters as unknown[]).push(...Object.entries(sch.properties ?? {}).map(([name, schema]) => ({ name, in: "query", required: sch.required?.includes(name) ?? false, schema })));
    }
    if (e.body) op.requestBody = { required: true, content: { "application/json": { schema: schemaOf(e.body) } } };
    (paths[e.path] ??= {})[e.method] = op;
  }
  return {
    openapi: "3.1.0",
    info: { title: "nexdeals API", version: "1.0.0", description: "REST API CRM nexdeals. Autentizace: `Authorization: Bearer nxd_…` (klíč vytvoříš v Nastavení → API a Claude). Chyby mají tvar `{ error: { code, message } }`. Seznamy vrací `{ data: { items, total, limit, offset } }`." },
    servers: [{ url: `${origin}/api/v1` }],
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "nxd_…" } } },
    paths,
  };
}
