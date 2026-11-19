import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Nastavení" };

export default function Page() {
  return (
    <>
      <PageHeader title="Nastavení" description="Workspace, pipelines, labely a tým." />
      <EmptyState icon={Settings} title="Tahle sekce je na cestě" description="Správa pipelines, labelů a pozvánek přijde ve Fázi 6." />
    </>
  );
}
