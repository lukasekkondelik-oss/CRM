import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DealDetail } from "@/components/deal/deal-detail";
import { loadDealData } from "@/lib/data/deal";
import { todayInPrague } from "@/lib/deals/helpers";

export const metadata: Metadata = { title: "Detail dealu" };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // neplatné UUID by Postgres odmítl chybou -> raději rovnou 404
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadDealData(id);
  if (!data) notFound();
  return <DealDetail key={id} data={data} now={data.now} today={todayInPrague()} />;
}
