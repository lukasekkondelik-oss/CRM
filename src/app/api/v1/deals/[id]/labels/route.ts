import { parseBody, route, uuidParam } from "@/lib/api/http";
import { setDealLabels } from "@/lib/api/repo-deals";
import { dealLabels } from "@/lib/api/schemas";

export const PUT = route<{ id: string }>("write", async (ctx, req, { id }) => setDealLabels(ctx, uuidParam(id), (await parseBody(req, dealLabels)).label_ids));
