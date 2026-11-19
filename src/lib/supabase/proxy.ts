import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

// /api si ověřuje API klíč samo (Authorization: Bearer), cookies session se tu nepoužívá
const PUBLIC_PREFIXES = ["/login", "/registrace", "/auth", "/api"];

/** Obnoví Supabase session v cookies a přesměruje nepřihlášené na /login. */
export async function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims ověří podpis JWT (nespoléhá se jen na cookie)
  const { data } = await supabase.auth.getClaims();
  const isAuthed = !!data?.claims;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

  const redirect = (to: string) => {
    const r = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!isAuthed && !isPublic) return redirect("/login");
  if (isAuthed && (path === "/login" || path === "/registrace")) return redirect("/pipeline");
  return response;
}
