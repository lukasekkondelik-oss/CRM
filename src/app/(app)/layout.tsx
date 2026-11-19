import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { todayInPrague } from "@/lib/deals/helpers";

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

  // Odznak u „Aktivity“: moje nedokončené aktivity dnes a po termínu
  const today = todayInPrague();
  const [overdueRes, todayRes] = await Promise.all([
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("done", false).eq("assigned_to", user.id).lt("due_date", today),
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("done", false).eq("assigned_to", user.id).eq("due_date", today),
  ]);

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
      activityBadge={{ today: todayRes.count ?? 0, overdue: overdueRes.count ?? 0 }}
    >
      {children}
    </AppShell>
  );
}
