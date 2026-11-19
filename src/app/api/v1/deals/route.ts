import { parseBody, parseQuery, route } from "@/lib/api/http";
import { createDeal, listDeals } from "@/lib/api/repo-deals";
import { dealCreate, dealListQuery } from "@/lib/api/schemas";

export const GET = route("read", (ctx, req) => listDeals(ctx, parseQuery(req, dealListQuery)));
export const POST = route("write", async (ctx, req) => createDeal(ctx, await parseBody(req, dealCreate)), 201);
