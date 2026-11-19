import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_url, role, workspaces(name)")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const workspace = Array.isArray(profile.workspaces) ? profile.workspaces[0] : profile.workspaces;

  return (
    <AppShell
      user={{
        fullName: profile.full_name || user.email || "Uživatel",
        email: profile.email ?? user.email ?? null,
        avatarUrl: profile.avatar_url,
        role: profile.role as "admin" | "member",
      }}
      workspaceName={workspace?.name ?? "Workspace"}
    >
      {children}
    </AppShell>
  );
}
