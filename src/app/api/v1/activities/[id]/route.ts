import { parseBody, route, uuidParam } from "@/lib/api/http";
import { deleteActivity, updateActivity } from "@/lib/api/repo-activities";
import { activityUpdate } from "@/lib/api/schemas";

type P = { id: string };

export const PATCH = route<P>("write", async (ctx, req, { id }) => updateActivity(ctx, uuidParam(id), await parseBody(req, activityUpdate)));
export const DELETE = route<P>("write", (ctx, _req, { id }) => deleteActivity(ctx, uuidParam(id)));
