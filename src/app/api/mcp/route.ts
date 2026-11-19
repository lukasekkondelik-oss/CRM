import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, type ApiContext } from "@/lib/api/auth";
import { ApiError, describeError, errorResponse } from "@/lib/api/errors";
import { MCP_INSTRUCTIONS, MCP_TOOLS } from "@/lib/api/mcp-tools";

// MCP (Model Context Protocol) přes Streamable HTTP – bezstavově, odpovědi jako JSON.
// Připojení: Authorization: Bearer nxd_… (stejný API klíč jako pro REST).
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

type Rpc = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };

async function handle(msg: Rpc, ctx: ApiContext): Promise<unknown | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Neplatný požadavek JSON-RPC.");
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return rpcResult(msg.id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "nexdeals", version: "1.0.0" },
        instructions: MCP_INSTRUCTIONS,
      });
    }
    case "ping": return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.schema) })) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = MCP_TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(msg.id, -32602, `Neznámý nástroj: ${name}`);
      try {
        if (tool.write && !ctx.scopes.includes("write")) throw new ApiError(403, "forbidden", "Klíč nemá oprávnění „write“ (je jen pro čtení).");
        const args = tool.schema.parse(msg.params?.arguments ?? {});
        const out = await tool.run(ctx, args as never);
        return rpcResult(msg.id, { content: [{ type: "text", text: JSON.stringify(out) }] });
      } catch (e) {
        const d = describeError(e);
        return rpcResult(msg.id, { isError: true, content: [{ type: "text", text: `${d.body.error.code}: ${d.body.error.message}${d.body.error.details ? ` ${JSON.stringify(d.body.error.details)}` : ""}` }] });
      }
    }
    default:
      if (isNotification || msg.method.startsWith("notifications/")) return null;
      return rpcError(msg.id, -32601, `Metoda není podporována: ${msg.method}`);
  }
}

export async function POST(req: NextRequest) {
  // Ověření klíče na úrovni transportu (neplatný klíč = HTTP 401 s WWW-Authenticate)
  let ctx: ApiContext;
  try { ctx = await authenticate(req, "read"); } catch (e) { return errorResponse(e); }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json(rpcError(null, -32700, "Neplatný JSON."), { status: 400 }); }
  const batch = Array.isArray(body);
  const out: unknown[] = [];
  for (const m of batch ? (body as Rpc[]) : [body as Rpc]) {
    const r = await handle(m, ctx);
    if (r !== null) out.push(r);
  }
  if (out.length === 0) return new NextResponse(null, { status: 202 });
  return NextResponse.json(batch ? out : out[0], { headers: { "Cache-Control": "no-store" } });
}

const notAllowed = () => new NextResponse("Použij POST (JSON-RPC).", { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
