import type { Metadata } from "next";
import { PipelineView } from "@/components/pipeline/pipeline-view";
import { EmptyState } from "@/components/ui/empty-state";
import { loadPipelineData } from "@/lib/data/pipeline";
import { todayInPrague } from "@/lib/deals/helpers";
import { Kanban } from "lucide-react";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ pipeline?: string }> }) {
  const { pipeline: requested } = await searchParams;
  const data = await loadPipelineData(requested);
  if (!data) {
    return <EmptyState icon={Kanban} title="Žádná pipeline" description="V tomhle workspace zatím žádná pipeline není." />;
  }
  return (
    <PipelineView
      key={data.pipeline.id}
      pipelines={data.pipelines}
      pipeline={data.pipeline}
      stages={data.stages}
      initialDeals={data.deals}
      members={data.members}
      labels={data.labels}
      initialPersons={data.persons}
      initialOrgs={data.orgs}
      currentUserId={data.userId}
      now={data.now}
      today={todayInPrague()}
    />
  );
}
