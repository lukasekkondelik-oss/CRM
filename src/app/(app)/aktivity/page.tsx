import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Aktivity" };

export default function Page() {
  return (
    <>
      <PageHeader title="Aktivity" description="Tvoje úkoly, hovory a schůzky." />
      <EmptyState icon={CalendarCheck} title="Tahle sekce je na cestě" description="Seznam aktivit, kalendář a workflow „naplánovat další krok“ přijdou ve Fázi 4." />
    </>
  );
}
