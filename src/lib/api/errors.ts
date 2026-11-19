import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown, public headers?: Record<string, string>) {
    super(message);
  }
}

export const notFound = (what = "Záznam") => new ApiError(404, "not_found", `${what} nebyl nalezen.`);
export const badRequest = (message: string, details?: unknown) => new ApiError(400, "invalid_request", message, details);

interface PgError { code?: string; message?: string; details?: string }

export interface Described { status: number; body: { error: { code: string; message: string; details?: unknown } }; headers?: Record<string, string> }

/** Převede libovolnou chybu na `{ status, error }`. Interní detaily nikdy neprozrazuje. */
export function describeError(e: unknown): Described {
  if (e instanceof ApiError) return { status: e.status, body: { error: { code: e.code, message: e.message, details: e.details } }, headers: e.headers };
  if (e instanceof ZodError) {
    return { status: 400, body: { error: { code: "validation_error", message: "Neplatný vstup.", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } } };
  }
  const pg = e as PgError;
  if (pg && typeof pg === "object" && typeof pg.code === "string") {
    const map: Record<string, [number, string, string]> = {
      "23503": [422, "invalid_reference", "Odkazovaný záznam (fáze, osoba, firma, vlastník…) neexistuje v tomhle workspace nebo se na něj ještě něco odkazuje."],
      "23505": [409, "conflict", "Záznam s touto hodnotou už existuje."],
      "23514": [422, "constraint_violation", "Hodnota porušuje omezení (prázdný název, záporná částka, neplatné IČO…)."],
      "22P02": [400, "invalid_id", "Neplatný formát identifikátoru nebo hodnoty."],
      "22007": [400, "invalid_date", "Neplatné datum."],
      "22008": [400, "invalid_date", "Neplatné datum."],
    };
    const hit = map[pg.code];
    if (hit) return { status: hit[0], body: { error: { code: hit[1], message: hit[2] } } };
  }
  console.error("[api] neočekávaná chyba", e);
  return { status: 500, body: { error: { code: "internal_error", message: "Interní chyba serveru." } } };
}

export function errorResponse(e: unknown): NextResponse {
  const d = describeError(e);
  return NextResponse.json(d.body, { status: d.status, headers: d.headers });
}
