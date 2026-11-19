import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { EmptyState } from "@/components/ui/empty-state";
import { loadDashboard } from "@/lib/data/dashboard";
import { todayInPrague } from "@/lib/deals/helpers";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const data = await loadDashboard();
  if (!data) return <EmptyState icon={BarChart3} title="Dashboard se nepodařilo načíst" description="Zkus stránku obnovit." />;
  return <DashboardView {...data} today={todayInPrague()} />;
}
