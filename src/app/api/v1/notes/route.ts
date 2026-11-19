import { parseBody, parseQuery, route } from "@/lib/api/http";
import { createNote, listNotes } from "@/lib/api/repo-activities";
import { noteCreate, noteListQuery } from "@/lib/api/schemas";

export const GET = route("read", (ctx, req) => listNotes(ctx, parseQuery(req, noteListQuery)));
export const POST = route("write", async (ctx, req) => createNote(ctx, await parseBody(req, noteCreate)), 201);
