import { parseBody, route, uuidParam } from "@/lib/api/http";
import { moveDeal } from "@/lib/api/repo-deals";
import { dealMove } from "@/lib/api/schemas";

export const POST = route<{ id: string }>("write", async (ctx, req, { id }) => moveDeal(ctx, uuidParam(id), await parseBody(req, dealMove)));
