import { parseBody, parseQuery, route } from "@/lib/api/http";
import { createActivity, listActivities } from "@/lib/api/repo-activities";
import { activityCreate, activityListQuery } from "@/lib/api/schemas";

export const GET = route("read", (ctx, req) => listActivities(ctx, parseQuery(req, activityListQuery)));
export const POST = route("write", async (ctx, req) => createActivity(ctx, await parseBody(req, activityCreate)), 201);
