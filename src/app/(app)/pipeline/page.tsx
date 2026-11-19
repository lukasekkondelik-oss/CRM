import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCZK } from "@/lib/format";
import type { Stage } from "@/lib/types";

export const metadata: Metadata = { title: "Pipeline" };

// Fáze 1: jen čtení výchozí pipeline z DB (ověřuje onboarding + RLS). Kanban s dealy přijde ve Fázi 2.
export default async function PipelinePage() {
  const supabase = await createClient();
  const { data: pipelines } = await supabase
    .from("pipelines")
    .select("id, name, stages(id, name, position, probability, rotting_days)")
    .order("position")
    .limit(1);

  const pipeline = pipelines?.[0];
  const stages = ((pipeline?.stages ?? []) as Stage[]).sort((a, b) => a.position - b.position);

  return (
    <>
      <PageHeader
        title={pipeline?.name ?? "Pipeline"}
        description="Kanban s dealy a drag & drop přijde ve Fázi 2. Níže jsou sloupce tvé výchozí pipeline."
      />
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {stages.map((s) => (
          <Card key={s.id} className="w-72 shrink-0 snap-start bg-muted/40 p-3 shadow-none">
            <div className="flex items-center justify-between px-1 pb-2">
              <h2 className="text-sm font-semibold">{s.name}</h2>
              <Badge variant="muted">{s.probability} %</Badge>
            </div>
            <p className="px-1 text-xs text-muted-foreground">0 dealů · {formatCZK(0)}</p>
            <div className="mt-3 rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
              {s.rotting_days ? `Hnije po ${s.rotting_days} dnech` : "Zatím žádné dealy"}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
