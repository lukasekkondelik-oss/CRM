import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { ActivitiesView } from "@/components/activities/activities-view";
import { EmptyState } from "@/components/ui/empty-state";
import { loadActivitiesPage } from "@/lib/data/activities";
import { todayInPrague } from "@/lib/deals/helpers";

export const metadata: Metadata = { title: "Aktivity" };

export default async function ActivitiesPage() {
  const data = await loadActivitiesPage();
  if (!data) return <EmptyState icon={CalendarCheck} title="Aktivity se nepodařilo načíst" description="Zkus stránku obnovit." />;
  return (
    <ActivitiesView
      initial={data.activities}
      deals={data.deals}
      persons={data.persons}
      members={data.members}
      userId={data.userId}
      today={todayInPrague()}
    />
  );
}
