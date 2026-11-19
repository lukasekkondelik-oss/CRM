import { route } from "@/lib/api/http";
import { getMe } from "@/lib/api/repo-core";

export const GET = route("read", (ctx) => getMe(ctx));
