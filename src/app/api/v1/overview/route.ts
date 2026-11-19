import { z } from "zod";
import { parseQuery, route } from "@/lib/api/http";
import { getOverview } from "@/lib/api/repo-overview";
import { id } from "@/lib/api/schemas";

const query = z.object({ owner_id: z.union([id, z.literal("me")]).optional() });

export const GET = route("read", (ctx, req) => getOverview(ctx, parseQuery(req, query).owner_id));
