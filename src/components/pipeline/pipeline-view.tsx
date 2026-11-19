"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Kanban, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  isRotting, nextState, type DealVM, type Member, type OrgLite, type PersonLite,
} from "@/lib/deals/helpers";
import { createOrgQuick, createPersonQuick, deleteDeals, insertDeal, updateDeals } from "@/lib/deals/mutations";
import type { Deal, Label, Pipeline, Stage } from "@/lib/types";
import { Board } from "./board";
import { EMPTY_FILTERS, FiltersBar, type Filters } from "./filters-bar";
import { LostDialog } from "./lost-dialog";
import { NewDealDialog } from "./new-deal-dialog";
import { TableView } from "./table-view";

interface Props {
  pipelines: Pipeline[];
  pipeline: Pipeline;
  stages: Stage[];
  initialDeals: DealVM[];
  members: Member[];
  labels: Label[];
  initialPersons: PersonLite[];
  initialOrgs: OrgLite[];
  currentUserId: string;
  now: number;
  today: string;
}

type StatusFilter = "open" | "won" | "lost" | "all";

export function PipelineView({ pipelines, pipeline, stages, initialDeals, members, labels, initialPersons, initialOrgs, currentUserId, now, today }: Props) {
  const router = useRouter();
  const [deals, setDeals] = useState(initialDeals);
  const [persons, setPersons] = useState(initialPersons);
  const [orgs, setOrgs] = useState(initialOrgs);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [newDealStage, setNewDealStage] = useState<string | null>(null);
  const [lostId, setLostId] = useState<string | null>(null);

  const dealsRef = useRef(deals);
  useEffect(() => { dealsRef.current = deals; });

  const stageMap = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return deals.filter((d) => {
      if (q && !d.title.toLowerCase().includes(q)) return false;
      if (filters.mine && d.owner_id !== currentUserId) return false;
      if (filters.owner && d.owner_id !== filters.owner) return false;
      if (filters.label && !d.labelIds.includes(filters.label)) return false;
      if (filters.noNext && !(d.status === "open" && nextState(d, today) === "none")) return false;
      if (filters.rotting && !isRotting(d, stageMap.get(d.stage_id), now)) return false;
      return true;
    });
  }, [deals, filters, currentUserId, today, now, stageMap]);

  const openDeals = useMemo(() => filtered.filter((d) => d.status === "open"), [filtered]);
  const tableDeals = useMemo(() => (status === "all" ? filtered : filtered.filter((d) => d.status === status)), [filtered, status]);

  /** Optimistická změna + uložení; při chybě vrátí původní stav a ukáže toast. */
  const patchDeals = useCallback(async (ids: string[], patch: Partial<Deal>): Promise<boolean> => {
    const before = new Map(dealsRef.current.filter((d) => ids.includes(d.id)).map((d) => [d.id, d]));
    setDeals((ds) => ds.map((d) => (ids.includes(d.id) ? { ...d, ...patch } : d)));
    try {
      await updateDeals(ids, patch);
      return true;
    } catch {
      setDeals((ds) => ds.map((d) => before.get(d.id) ?? d));
      toast.error("Změnu se nepodařilo uložit. Vrátil jsem původní stav.");
      return false;
    }
  }, []);

  const reopen = useCallback((ids: string[]) =>
    patchDeals(ids, { status: "open", won_at: null, lost_at: null, lost_reason: null }), [patchDeals]);

  const handleMove = (id: string, stageId: string, position: number) => {
    const deal = dealsRef.current.find((d) => d.id === id);
    const changed = deal?.stage_id !== stageId;
    patchDeals([id], changed ? { stage_id: stageId, position, stage_changed_at: new Date().toISOString() } : { position });
  };

  const handleWon = async (id: string) => {
    const ok = await patchDeals([id], { status: "won", won_at: new Date().toISOString(), lost_at: null, lost_reason: null });
    if (ok) toast.success("Deal označen jako vyhraný", { action: { label: "Vrátit", onClick: () => reopen([id]) } });
  };

  const handleLost = async (reason: string) => {
    if (!lostId) return;
    const id = lostId;
    setLostId(null);
    const ok = await patchDeals([id], { status: "lost", lost_at: new Date().toISOString(), won_at: null, lost_reason: reason });
    if (ok) toast("Deal označen jako prohraný", { action: { label: "Vrátit", onClick: () => reopen([id]) } });
  };

  const createDeal = async (input: Partial<Deal> & Pick<Deal, "stage_id" | "title">): Promise<boolean> => {
    const inStage = dealsRef.current.filter((d) => d.stage_id === input.stage_id);
    const position = inStage.length ? Math.min(...inStage.map((d) => d.position)) - 1 : 0;
    try {
      const row = await insertDeal({ ...input, pipeline_id: pipeline.id, position });
      setDeals((ds) => [{ ...row, value: Number(row.value), labelIds: [], openActivities: 0, nextDue: null, nextSubject: null, nextType: null }, ...ds]);
      toast.success("Deal vytvořen");
      return true;
    } catch {
      toast.error("Deal se nepodařilo vytvořit.");
      return false;
    }
  };

  const quickAdd = (stageId: string, title: string, value: number) =>
    createDeal({ stage_id: stageId, title, value, owner_id: currentUserId });

  const createPerson = async (name: string, orgId: string | null) => {
    try {
      const p = await createPersonQuick(name, orgId);
      setPersons((ps) => [...ps, p]);
      return p;
    } catch { toast.error("Osobu se nepodařilo vytvořit."); return null; }
  };
  const createOrg = async (name: string) => {
    try {
      const o = await createOrgQuick(name);
      setOrgs((os) => [...os, o]);
      return o;
    } catch { toast.error("Firmu se nepodařilo vytvořit."); return null; }
  };

  const bulkDelete = async (ids: string[]) => {
    try {
      await deleteDeals(ids);
      setDeals((ds) => ds.filter((d) => !ids.includes(d.id)));
      toast.success(`Smazáno: ${ids.length}`);
    } catch { toast.error("Mazání se nepodařilo."); }
  };

  const bulkStage = (ids: string[], stageId: string) =>
    patchDeals(ids, { stage_id: stageId, stage_changed_at: new Date().toISOString() });

  const noPipeline = stages.length === 0;
  const lostDeal = lostId ? deals.find((d) => d.id === lostId) : undefined;

  return (
    <>
      <PageHeader
        title={pipeline.name}
        description="Každý otevřený deal by měl mít naplánovaný další krok."
        actions={
          <>
            {pipelines.length > 1 && (
              <Select value={pipeline.id} aria-label="Pipeline" className="h-10 w-44" onChange={(e) => router.push(`/pipeline?pipeline=${e.target.value}`)}>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            )}
            <div className="flex rounded-lg border bg-card p-0.5" role="group" aria-label="Zobrazení">
              {([["kanban", Kanban, "Kanban"], ["table", Table2, "Tabulka"]] as const).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn("flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium", view === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <Button size="lg" onClick={() => setNewDealStage(stages[0]?.id ?? null)} disabled={noPipeline}>
              <Plus /> Nový deal
            </Button>
          </>
        }
      />

      <FiltersBar
        filters={filters}
        onChange={setFilters}
        members={members}
        labels={labels}
        extra={
          view === "table" && (
            <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="h-9 w-36" aria-label="Stav">
              <option value="open">Otevřené</option>
              <option value="won">Vyhrané</option>
              <option value="lost">Prohrané</option>
              <option value="all">Všechny</option>
            </Select>
          )
        }
      />

      {noPipeline ? (
        <EmptyState icon={Kanban} title="Pipeline nemá žádné fáze" description="Fáze se dají spravovat v Nastavení (Fáze 6)." />
      ) : view === "kanban" ? (
        <Board
          stages={stages}
          deals={openDeals}
          members={members}
          labels={labels}
          persons={persons}
          orgs={orgs}
          now={now}
          today={today}
          onMove={handleMove}
          onWon={handleWon}
          onLost={setLostId}
          onQuickAdd={quickAdd}
        />
      ) : (
        <TableView
          deals={tableDeals}
          stages={stages}
          members={members}
          persons={persons}
          orgs={orgs}
          now={now}
          today={today}
          onBulkStage={bulkStage}
          onBulkOwner={(ids, owner) => patchDeals(ids, { owner_id: owner })}
          onBulkDelete={bulkDelete}
        />
      )}

      <NewDealDialog
        open={newDealStage !== null}
        onOpenChange={(o) => !o && setNewDealStage(null)}
        stages={stages}
        defaultStageId={newDealStage ?? stages[0]?.id ?? ""}
        members={members}
        persons={persons}
        orgs={orgs}
        currentUserId={currentUserId}
        onCreate={createDeal}
        onCreatePerson={createPerson}
        onCreateOrg={createOrg}
        onRegisterPerson={(p) => setPersons((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, p]))}
        onRegisterOrg={(o) => setOrgs((os) => (os.some((x) => x.id === o.id) ? os : [...os, o]))}
      />
      <LostDialog open={lostId !== null} onOpenChange={(o) => !o && setLostId(null)} dealTitle={lostDeal?.title} onConfirm={handleLost} />
    </>
  );
}
