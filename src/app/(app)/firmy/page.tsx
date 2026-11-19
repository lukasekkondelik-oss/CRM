import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Firmy" };

export default function Page() {
  return (
    <>
      <PageHeader title="Firmy" description="Organizace a jejich dealy." />
      <EmptyState icon={Building2} title="Tahle sekce je na cestě" description="Tabulka firem s vyhledáváním a detailem přijde ve Fázi 3." />
    </>
  );
}
