import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Osoby" };

export default function Page() {
  return (
    <>
      <PageHeader title="Osoby" description="Kontaktní osoby napříč firmami." />
      <EmptyState icon={Users} title="Tahle sekce je na cestě" description="Tabulka osob s vyhledáváním a detailem přijde ve Fázi 3." />
    </>
  );
}
