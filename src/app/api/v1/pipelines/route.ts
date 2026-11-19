import { route } from "@/lib/api/http";
import { listPipelines } from "@/lib/api/repo-core";

export const GET = route("read", (ctx) => listPipelines(ctx));
