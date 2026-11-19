import { parseBody, route, uuidParam } from "@/lib/api/http";
import { setDealStatus } from "@/lib/api/repo-deals";
import { dealStatus } from "@/lib/api/schemas";

export const POST = route<{ id: string }>("write", async (ctx, req, { id }) => setDealStatus(ctx, uuidParam(id), await parseBody(req, dealStatus)));
