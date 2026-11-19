import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PersonDetail } from "@/components/contacts/person-detail";
import { loadPerson } from "@/lib/data/contacts";
import { todayInPrague } from "@/lib/deals/helpers";

export const metadata: Metadata = { title: "Detail" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadPerson(id);
  if (!data) notFound();
  return <PersonDetail key={id} data={data} today={todayInPrague()} />;
}
