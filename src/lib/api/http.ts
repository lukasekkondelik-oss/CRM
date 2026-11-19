import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { authenticate, type ApiContext, type Scope } from "./auth";
import { badRequest, errorResponse } from "./errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ověří, že `id` z URL je UUID (jinak by Postgres vrátil neprůhlednou chybu). */
export function uuidParam(id: string): string {
  if (!UUID.test(id)) throw badRequest("Neplatný identifikátor (očekává se UUID).");
  return id;
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try { json = await req.json(); } catch { throw badRequest("Tělo požadavku musí být platný JSON."); }
  return schema.parse(json);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { obj[k] = v; });
  return schema.parse(obj);
}

type Handler<P> = (ctx: ApiContext, req: NextRequest, params: P) => Promise<unknown>;

/** Obalí handler: ověření klíče + oprávnění, JSON odpověď, jednotné chyby. `status` = kód úspěšné odpovědi. */
export function route<P = Record<string, never>>(scope: Scope, fn: Handler<P>, status = 200) {
  return async (req: NextRequest, extra: { params: Promise<P> }) => {
    try {
      const ctx = await authenticate(req, scope);
      const out = await fn(ctx, req, await extra.params);
      return NextResponse.json({ data: out }, { status, headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
