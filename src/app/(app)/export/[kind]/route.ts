import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { exportRows } from "@/lib/data/export";

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!["osoby", "firmy", "dealy"].includes(kind)) return new NextResponse("Neznámý export", { status: 404 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  let result;
  try {
    result = await exportRows(kind, q);
  } catch {
    return new NextResponse("Export se nepodařilo vytvořit", { status: 500 });
  }
  if (!result) return new NextResponse("Nepřihlášen", { status: 401 });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
  return new NextResponse(toCsv([result.header, ...result.rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexdeals-${kind}-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
