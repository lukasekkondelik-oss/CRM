import { parseBody, route, uuidParam } from "@/lib/api/http";
import { deletePerson, getPerson, updatePerson } from "@/lib/api/repo-contacts";
import { personUpdate } from "@/lib/api/schemas";

type P = { id: string };

export const GET = route<P>("read", (ctx, _req, { id }) => getPerson(ctx, uuidParam(id)));
export const PATCH = route<P>("write", async (ctx, req, { id }) => updatePerson(ctx, uuidParam(id), await parseBody(req, personUpdate)));
export const DELETE = route<P>("write", (ctx, _req, { id }) => deletePerson(ctx, uuidParam(id)));
