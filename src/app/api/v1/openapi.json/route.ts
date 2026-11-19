import { NextResponse, type NextRequest } from "next/server";
import { buildOpenApi } from "@/lib/api/openapi";

// Veřejný popis API (neobsahuje žádná data) – použitelný v Postmanu, Swagger UI, generátorech klientů.
export function GET(req: NextRequest) {
  return NextResponse.json(buildOpenApi(req.nextUrl.origin), { headers: { "Cache-Control": "public, max-age=300" } });
}
