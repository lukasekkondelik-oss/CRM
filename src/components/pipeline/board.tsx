"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection,
  useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trophy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCZK } from "@/lib/format";
import { isRotting, nextState, personName, positionBetween, type DealVM, type Member, type OrgLite, type PersonLite } from "@/lib/deals/helpers";
import type { Label, Stage } from "@/lib/types";
import { DealCard, type CardInfo } from "./deal-card";
import { QuickAdd } from "./quick-add";

interface Props {
  stages: Stage[];
  deals: DealVM[]; // otevřené, už vyfiltrované
  members: Member[];
  labels: Label[];
  persons: PersonLite[];
  orgs: OrgLite[];
  now: number;
  today: string;
  onMove: (dealId: string, stageId: string, position: number) => void;
  onWon: (dealId: string) => void;
  onLost: (dealId: string) => void;
  onQuickAdd: (stageId: string, title: string, value: number) => Promise<boolean>;
}

const collision: CollisionDetection = (args) => {
  const p = pointerWithin(args);
  return p.length ? p : rectIntersection(args);
};

export function Board(props: Props) {
  const { stages, deals, members, labels, persons, orgs, now, today, onMove, onWon, onLost, onQuickAdd } = props;
  const router = useRouter();
  const [dragCols, setDragCols] = useState<Record<string, string[]> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quickStage, setQuickStage] = useState<string | null>(null);
  const justDragged = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dealMap = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const stageMap = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const personMap = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);
  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  const baseCols = useMemo(() => {
    const cols: Record<string, string[]> = Object.fromEntries(stages.map((s) => [s.id, [] as string[]]));
    [...deals].sort((a, b) => a.position - b.position).forEach((d) => cols[d.stage_id]?.push(d.id));
    return cols;
  }, [stages, deals]);
  const cols = dragCols ?? baseCols;

  const infoFor = (d: DealVM): CardInfo => {
    const person = d.person_id ? personMap.get(d.person_id) : undefined;
    const orgId = d.organization_id ?? person?.organization_id ?? null;
    return {
      org: orgId ? orgMap.get(orgId)?.name : undefined,
      person: person ? personName(person) : undefined,
      owner: d.owner_id ? memberMap.get(d.owner_id) : undefined,
      labels: d.labelIds.map((id) => labelMap.get(id)).filter((l): l is Label => !!l),
      rotting: isRotting(d, stageMap.get(d.stage_id), now),
      state: nextState(d, today),
    };
  };

  const findContainer = (id: string, c: Record<string, string[]>) =>
    id in c ? id : Object.keys(c).find((k) => c[k].includes(id));

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setDragCols(baseCols);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || !dragCols) return;
    const aId = String(active.id), oId = String(over.id);
    if (oId.startsWith("zone-")) return;
    const from = findContainer(aId, dragCols), to = findContainer(oId, dragCols);
    if (!from || !to || from === to) return;
    setDragCols((prev) => {
      if (!prev) return prev;
      const target = [...prev[to]];
      let idx = target.length;
      if (!(oId in prev)) {
        const translated = active.rect.current.translated;
        const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
        idx = target.indexOf(oId) + (below ? 1 : 0);
      }
      return {
        ...prev,
        [from]: prev[from].filter((i) => i !== aId),
        [to]: [...target.slice(0, idx), aId, ...target.slice(idx)],
      };
    });
  }

  function finish() {
    setActiveId(null);
    setDragCols(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 150);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const aId = String(active.id);
    const cur = dragCols;
    finish();
    if (!over || !cur) return;
    const oId = String(over.id);

    if (oId === "zone-won") return onWon(aId);
    if (oId === "zone-lost") return onLost(aId);

    let result = cur;
    const container = findContainer(aId, cur);
    const target = findContainer(oId, cur);
    if (container && target && container === target && !(oId in cur)) {
      const from = cur[container].indexOf(aId), to = cur[container].indexOf(oId);
      if (from !== to && to >= 0) result = { ...cur, [container]: arrayMove(cur[container], from, to) };
    }
    const stageId = findContainer(aId, result);
    const deal = dealMap.get(aId);
    if (!stageId || !deal) return;
    const list = result[stageId];
    const i = list.indexOf(aId);
    const prev = list[i - 1] ? dealMap.get(list[i - 1])?.position : undefined;
    const next = list[i + 1] ? dealMap.get(list[i + 1])?.position : undefined;
    const position = positionBetween(prev, next);
    if (stageId === deal.stage_id && position === deal.position) return;
    // beze změny pořadí → nic neukládat
    if (stageId === deal.stage_id && baseCols[stageId].indexOf(aId) === i) return;
    onMove(aId, stageId, position);
  }

  const activeDeal = activeId ? dealMap.get(activeId) : undefined;

  return (
    <DndContext
      id="pipeline-board"
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      <div className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-28 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {stages.map((stage) => {
          const ids = cols[stage.id] ?? [];
          const sum = ids.reduce((s, id) => s + Number(dealMap.get(id)?.value ?? 0), 0);
          return (
            <Column
              key={stage.id}
              stage={stage}
              ids={ids}
              count={ids.length}
              sum={sum}
              onAdd={() => setQuickStage(stage.id)}
            >
              {quickStage === stage.id && (
                <QuickAdd onCancel={() => setQuickStage(null)} onSubmit={(t, v) => onQuickAdd(stage.id, t, v)} />
              )}
              {ids.map((id) => {
                const d = dealMap.get(id);
                return d ? (
                  <SortableCard
                    key={id}
                    deal={d}
                    info={infoFor(d)}
                    onOpen={() => !justDragged.current && router.push(`/dealy/${d.id}`)}
                  />
                ) : null;
              })}
              {ids.length === 0 && quickStage !== stage.id && (
                <button
                  type="button"
                  onClick={() => setQuickStage(stage.id)}
                  className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground hover:bg-muted"
                >
                  Žádné dealy – přidej první
                </button>
              )}
            </Column>
          );
        })}
      </div>

      <DragOverlay>{activeDeal && <DealCard deal={activeDeal} info={infoFor(activeDeal)} className="rotate-2 shadow-pop" />}</DragOverlay>

      {activeId && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t bg-background/90 p-3 backdrop-blur lg:left-64">
          <Zone id="zone-won" icon={Trophy} label="Vyhráno" tone="success" />
          <Zone id="zone-lost" icon={XCircle} label="Prohráno" tone="danger" />
        </div>
      )}
    </DndContext>
  );
}

function Column({ stage, ids, count, sum, onAdd, children }: {
  stage: Stage; ids: string[]; count: number; sum: number; onAdd: () => void; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section
      aria-label={stage.name}
      className={cn("flex w-[84vw] max-w-80 shrink-0 snap-center flex-col rounded-xl bg-muted/50 p-2.5 sm:w-72 sm:snap-start", isOver && "bg-accent/60")}
    >
      <header className="mb-2 flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
          <p className="text-xs text-muted-foreground">
            {count} {count === 1 ? "deal" : count >= 2 && count <= 4 ? "dealy" : "dealů"} · {formatCZK(sum)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="muted">{stage.probability} %</Badge>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Přidat deal do fáze ${stage.name}`} onClick={onAdd}>
            <Plus />
          </Button>
        </div>
      </header>
      <div ref={setNodeRef} className="flex min-h-24 flex-col gap-2">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </div>
    </section>
  );
}

function SortableCard({ deal, info, onOpen }: { deal: DealVM; info: CardInfo; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id });
  return (
    <DealCard
      ref={setNodeRef as never}
      deal={deal}
      info={info}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    />
  );
}

function Zone({ id, icon: Icon, label, tone }: { id: string; icon: typeof Trophy; label: string; tone: "success" | "danger" }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const t = tone === "success" ? "border-success text-success bg-success-soft" : "border-danger text-danger bg-danger-soft";
  return (
    <div
      ref={setNodeRef}
      className={cn("flex h-16 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-semibold transition-all", t, isOver && "scale-[1.02] border-solid shadow-pop")}
    >
      <Icon className="size-5" /> {label}
    </div>
  );
}
