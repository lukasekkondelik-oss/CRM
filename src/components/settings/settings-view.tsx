"use client";

import { useState } from "react";
import { FileSpreadsheet, GitBranch, Tag, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import type { loadSettings } from "@/lib/data/settings";
import { cn } from "@/lib/utils";
import { ImportExport } from "./import-export";
import { LabelsSettings } from "./labels-settings";
import { PipelinesSettings } from "./pipelines-settings";
import { TeamSettings } from "./team-settings";

type Data = NonNullable<Awaited<ReturnType<typeof loadSettings>>>;
type Tab = "team" | "pipelines" | "labels" | "import";
const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "team", label: "Workspace a tým", icon: Users },
  { key: "pipelines", label: "Pipelines", icon: GitBranch },
  { key: "labels", label: "Labely", icon: Tag },
  { key: "import", label: "Import a export", icon: FileSpreadsheet },
];

export function SettingsView({ data, initialTab }: { data: Data; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const select = (t: Tab) => { setTab(t); window.history.replaceState(null, "", `?tab=${t}`); };
  return (
    <>
      <PageHeader title="Nastavení" description={data.isAdmin ? "Workspace, pipelines, labely a tým." : "Workspace a labely. Správa týmu a pipelines je jen pro adminy."} />
      <div role="tablist" aria-label="Sekce nastavení" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => select(key)}
            className={cn("-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium", tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      {tab === "team" && <TeamSettings isAdmin={data.isAdmin} userId={data.userId} workspace={data.workspace} members={data.members} invitations={data.invitations} invitesAvailable={data.invitesAvailable} />}
      {tab === "pipelines" && <PipelinesSettings isAdmin={data.isAdmin} pipelines={data.pipelines} stages={data.stages} dealsByStage={data.dealsByStage} />}
      {tab === "labels" && <LabelsSettings labels={data.labels} usage={data.labelUsage} />}
      {tab === "import" && <ImportExport members={data.members.map((m) => ({ id: m.id, full_name: m.full_name, email: m.email }))} userId={data.userId} pipelines={data.pipelines} stages={data.stages} />}
    </>
  );
}
