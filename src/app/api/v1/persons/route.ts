import { parseBody, parseQuery, route } from "@/lib/api/http";
import { createPerson, listPersons } from "@/lib/api/repo-contacts";
import { personCreate, personListQuery } from "@/lib/api/schemas";

export const GET = route("read", (ctx, req) => listPersons(ctx, parseQuery(req, personListQuery)));
export const POST = route("write", async (ctx, req) => createPerson(ctx, await parseBody(req, personCreate)), 201);
