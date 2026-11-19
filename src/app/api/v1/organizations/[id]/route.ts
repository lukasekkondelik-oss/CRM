import { parseBody, route, uuidParam } from "@/lib/api/http";
import { deleteOrg, getOrg, updateOrg } from "@/lib/api/repo-contacts";
import { orgUpdate } from "@/lib/api/schemas";

type P = { id: string };

export const GET = route<P>("read", (ctx, _req, { id }) => getOrg(ctx, uuidParam(id)));
export const PATCH = route<P>("write", async (ctx, req, { id }) => updateOrg(ctx, uuidParam(id), await parseBody(req, orgUpdate)));
export const DELETE = route<P>("write", (ctx, _req, { id }) => deleteOrg(ctx, uuidParam(id)));
