import { parseBody, route, uuidParam } from "@/lib/api/http";
import { deleteDeal, getDeal, updateDeal } from "@/lib/api/repo-deals";
import { dealUpdate } from "@/lib/api/schemas";

type P = { id: string };

export const GET = route<P>("read", (ctx, _req, { id }) => getDeal(ctx, uuidParam(id)));
export const PATCH = route<P>("write", async (ctx, req, { id }) => updateDeal(ctx, uuidParam(id), await parseBody(req, dealUpdate)));
export const DELETE = route<P>("write", (ctx, _req, { id }) => deleteDeal(ctx, uuidParam(id)));
