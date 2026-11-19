import { route } from "@/lib/api/http";
import { listMembers } from "@/lib/api/repo-core";

export const GET = route("read", (ctx) => listMembers(ctx));
