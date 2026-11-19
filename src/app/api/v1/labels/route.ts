import { route } from "@/lib/api/http";
import { listLabels } from "@/lib/api/repo-deals";

export const GET = route("read", (ctx) => listLabels(ctx));
