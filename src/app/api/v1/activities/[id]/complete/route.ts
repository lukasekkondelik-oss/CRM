import { route, uuidParam } from "@/lib/api/http";
import { badRequest } from "@/lib/api/errors";
import { completeActivity } from "@/lib/api/repo-activities";
import { activityComplete } from "@/lib/api/schemas";

// Tělo je volitelné: bez těla se aktivita jen dokončí, s `next` se rovnou naplánuje další krok.
export const POST = route<{ id: string }>("write", async (ctx, req, { id }) => {
  const raw = await req.text();
  let body: unknown = {};
  if (raw.trim()) { try { body = JSON.parse(raw); } catch { throw badRequest("Tělo požadavku musí být platný JSON."); } }
  return completeActivity(ctx, uuidParam(id), activityComplete.parse(body));
});
