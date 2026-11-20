import { parseBody, route, uuidParam } from "@/lib/api/http";
import { setOrgLabels } from "@/lib/api/repo-contacts";
import { contactLabels } from "@/lib/api/schemas";

export const PUT = route<{ id: string }>("write", async (ctx, req, { id }) => setOrgLabels(ctx, uuidParam(id), (await parseBody(req, contactLabels)).label_ids));
