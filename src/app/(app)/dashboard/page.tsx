import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Přehled pipeline, výkonu a dnešních úkolů." />
      <EmptyState
        icon={BarChart3}
        title="Dashboard se zaplní, jakmile přibydou dealy"
        description="KPI, funnel a grafy výhra/prohra přijdou ve Fázi 5. Zatím je připravený workspace a výchozí pipeline."
      />
    </>
  );
}
