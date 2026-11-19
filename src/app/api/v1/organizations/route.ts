import { parseBody, parseQuery, route } from "@/lib/api/http";
import { createOrg, listOrgs } from "@/lib/api/repo-contacts";
import { orgCreate, orgListQuery } from "@/lib/api/schemas";

export const GET = route("read", (ctx, req) => listOrgs(ctx, parseQuery(req, orgListQuery)));
export const POST = route("write", async (ctx, req) => createOrg(ctx, await parseBody(req, orgCreate)), 201);
