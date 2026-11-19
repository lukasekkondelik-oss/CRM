"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props { isAdmin: boolean; pipelines: Pipeline[]; stages: Stage[]; dealsByStage: Record<string, number> }

const field = "h-9 rounded-md border border-input bg-card px-2.5 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:bg-muted disabled:opacity-70";

export function PipelinesSettings({ isAdmin, pipelines: initialPipelines, stages: initialStages, dealsByStage: initialCounts }: Props) {
  const [pipelines, setPipelines] = useState([...initialPipelines].sort((a, b) => a.position - b.position));
  const [stages, setStages] = useState(initialStages);
  const [counts, setCounts] = useState(initialCounts);
  const [delStage, setDelStage] = useState<Stage | null>(null);
  const [delPipeline, setDelPipeline] = useState<Pipeline | null>(null);
  const sb = createClient();

  const stagesOf = (pid: string) => stages.filter((s) => s.pipeline_id === pid).sort((a, b) => a.position - b.position);
  const dealsIn = (pid: string) => stagesOf(pid).reduce((n, s) => n + (counts[s.id] ?? 0), 0);

  async function patchStage(s: Stage, p: Partial<Stage>) {
    setStages((all) => all.map((x) => (x.id === s.id ? { ...x, ...p } : x)));
    const { error } = await sb.from("stages").update(p).eq("id", s.id);
    if (error) { setStages((all) => all.map((x) => (x.id === s.id ? s : x))); toast.error("Fázi se nepodařilo uložit."); }
  }

  async function reorder(pid: string, e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const list = stagesOf(pid);
    const from = list.findIndex((s) => s.id === e.active.id), to = list.findIndex((s) => s.id === e.over!.id);
    const next = arrayMove(list, from, to).map((s, i) => ({ ...s, position: i }));
    const before = stages;
    setStages((all) => [...all.filter((s) => s.pipeline_id !== pid), ...next]);
    const { error } = await sb.from("stages").upsert(next, { onConflict: "id" });
    if (error) { setStages(before); toast.error("Pořadí se nepodařilo uložit."); }
  }

  async function addStage(pid: string) {
    const list = stagesOf(pid);
    const { data, error } = await sb.from("stages").insert({ pipeline_id: pid, name: "Nová fáze", position: list.length, probability: 50 }).select().single();
    if (error || !data) return void toast.error("Fázi se nepodařilo přidat.");
    setStages((all) => [...all, data as Stage]);
  }

  async function removeStage(s: Stage, moveTo?: string) {
    if (moveTo) {
      const { error } = await sb.from("deals").update({ stage_id: moveTo, stage_changed_at: new Date().toISOString() }).eq("stage_id", s.id);
      if (error) return void toast.error("Dealy se nepodařilo přesunout.");
      setCounts((c) => ({ ...c, [moveTo]: (c[moveTo] ?? 0) + (c[s.id] ?? 0), [s.id]: 0 }));
    }
    const { error } = await sb.from("stages").delete().eq("id", s.id);
    if (error) return void toast.error("Fázi se nepodařilo smazat.");
    setStages((all) => all.filter((x) => x.id !== s.id));
    toast.success("Fáze smazána");
  }

  async function addPipeline() {
    const { data, error } = await sb.from("pipelines").insert({ name: "Nová pipeline", position: pipelines.length }).select("id, workspace_id, name, position").single();
    if (error || !data) return void toast.error("Pipeline se nepodařilo vytvořit.");
    const st = await sb.from("stages").insert([
      { pipeline_id: data.id, name: "Lead", position: 0, probability: 10 },
      { pipeline_id: data.id, name: "Vyjednávání", position: 1, probability: 60 },
    ]).select();
    setPipelines((p) => [...p, data as Pipeline]);
    setStages((all) => [...all, ...((st.data ?? []) as Stage[])]);
    toast.success("Pipeline vytvořena");
  }

  async function renamePipeline(p: Pipeline, name: string) {
    if (!name.trim() || name === p.name) return;
    setPipelines((all) => all.map((x) => (x.id === p.id ? { ...x, name } : x)));
    const { error } = await sb.from("pipelines").update({ name }).eq("id", p.id);
    if (error) { setPipelines((all) => all.map((x) => (x.id === p.id ? p : x))); toast.error("Název se nepodařilo uložit."); }
  }

  async function movePipeline(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= pipelines.length) return;
    const next = arrayMove(pipelines, i, j).map((p, k) => ({ ...p, position: k }));
    const before = pipelines;
    setPipelines(next);
    const { error } = await sb.from("pipelines").upsert(next, { onConflict: "id" });
    if (error) { setPipelines(before); toast.error("Pořadí se nepodařilo uložit."); }
  }

  async function removePipeline(p: Pipeline) {
    const { error } = await sb.from("pipelines").delete().eq("id", p.id);
    if (error) return void toast.error("Pipeline se nepodařilo smazat.");
    setPipelines((all) => all.filter((x) => x.id !== p.id));
    setStages((all) => all.filter((s) => s.pipeline_id !== p.id));
    toast.success("Pipeline smazána");
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {!isAdmin && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Pipelines a fáze může upravovat jen admin workspace. Tebe čeká jen čtení.</p>}
      {pipelines.map((p, i) => {
        const list = stagesOf(p.id);
        return (
          <Card key={p.id}>
            <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0 pb-3">
              <input aria-label="Název pipeline" defaultValue={p.name} disabled={!isAdmin} onBlur={(e) => renamePipeline(p, e.target.value.trim())}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={cn(field, "min-w-0 flex-1 text-base font-semibold")} />
              <Badge variant="muted">{dealsIn(p.id)} dealů</Badge>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" aria-label="Posunout pipeline nahoru" disabled={i === 0} onClick={() => movePipeline(i, -1)}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon" aria-label="Posunout pipeline dolů" disabled={i === pipelines.length - 1} onClick={() => movePipeline(i, 1)}><ArrowDown /></Button>
                  <Button variant="ghost" size="icon" aria-label="Smazat pipeline" disabled={pipelines.length < 2} onClick={() => dealsIn(p.id) > 0 ? toast.error(`Pipeline obsahuje ${dealsIn(p.id)} dealů. Nejdřív je přesuň nebo smaž.`) : setDelPipeline(p)}><Trash2 /></Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="mb-1 hidden grid-cols-[28px_1fr_110px_110px_72px] gap-2 px-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                <span /><span>Fáze</span><span>Šance</span><span>Hnije po (dny)</span><span />
              </div>
              <StageList pipelineId={p.id} list={list} counts={counts} isAdmin={isAdmin} onReorder={(e) => reorder(p.id, e)}
                onPatch={patchStage} onDelete={(s) => ((counts[s.id] ?? 0) > 0 ? setDelStage(s) : removeStage(s))} />
              {isAdmin && <Button variant="outline" size="sm" className="mt-3" onClick={() => addStage(p.id)}><Plus /> Přidat fázi</Button>}
            </CardContent>
          </Card>
        );
      })}
      {isAdmin && <div><Button onClick={addPipeline}><Plus /> Nová pipeline</Button></div>}

      <MoveDealsDialog stage={delStage} options={delStage ? stagesOf(delStage.pipeline_id).filter((s) => s.id !== delStage.id) : []} count={delStage ? counts[delStage.id] ?? 0 : 0}
        onClose={() => setDelStage(null)} onConfirm={(target) => { const s = delStage!; setDelStage(null); removeStage(s, target); }} />
      <ConfirmDialog open={!!delPipeline} onOpenChange={(o) => !o && setDelPipeline(null)} title={`Smazat pipeline ${delPipeline?.name ?? ""}?`} description="Pipeline je prázdná, smažou se jen její fáze." onConfirm={async () => { if (delPipeline) await removePipeline(delPipeline); }} />
    </div>
  );
}

function StageList({ pipelineId, list, counts, isAdmin, onReorder, onPatch, onDelete }: {
  pipelineId: string; list: Stage[]; counts: Record<string, number>; isAdmin: boolean;
  onReorder: (e: DragEndEvent) => void; onPatch: (s: Stage, p: Partial<Stage>) => void; onDelete: (s: Stage) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  return (
    <DndContext id={`stages-${pipelineId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReorder}>
      <SortableContext items={list.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-1.5">
          {list.map((s) => (
            <StageRow key={s.id} stage={s} count={counts[s.id] ?? 0} disabled={!isAdmin} canDelete={list.length > 1}
              onPatch={(patch) => onPatch(s, patch)} onDelete={() => onDelete(s)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function StageRow({ stage, count, disabled, canDelete, onPatch, onDelete }: { stage: Stage; count: number; disabled: boolean; canDelete: boolean; onPatch: (p: Partial<Stage>) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg border bg-card p-1.5 sm:grid sm:grid-cols-[28px_1fr_110px_110px_72px] sm:items-center sm:gap-2", isDragging && "z-10 opacity-70 shadow-pop")}>
      <div className="flex items-center gap-2 sm:contents">
        <button type="button" aria-label={`Přesunout fázi ${stage.name}`} disabled={disabled} {...attributes} {...listeners}
          className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:cursor-default disabled:opacity-40 sm:order-1"><GripVertical className="size-4" /></button>
        <input aria-label="Název fáze" defaultValue={stage.name} disabled={disabled} className={cn(field, "min-w-0 flex-1 sm:order-2")}
          onBlur={(e) => { const v = e.target.value.trim(); if (!v) e.target.value = stage.name; else if (v !== stage.name) onPatch({ name: v }); }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <div className="flex shrink-0 items-center justify-end gap-1 sm:order-5">
          {count > 0 && <span title={`${count} dealů`} className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">{count}</span>}
          {!disabled && <button type="button" aria-label={`Smazat fázi ${stage.name}`} disabled={!canDelete} onClick={onDelete} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-danger disabled:opacity-30"><Trash2 className="size-4" /></button>}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 pl-9 sm:contents sm:pl-0">
        <label className="block text-xs text-muted-foreground sm:order-3">
          <span className="mb-1 block sm:sr-only">Šance (%)</span>
          <span className="relative block">
            <input aria-label="Pravděpodobnost (%)" type="number" min={0} max={100} defaultValue={stage.probability} disabled={disabled} className={cn(field, "w-full pr-7 text-foreground")}
              onBlur={(e) => { const n = Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))); e.target.value = String(n); if (n !== stage.probability) onPatch({ probability: n }); }} />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs">%</span>
          </span>
        </label>
        <label className="block text-xs text-muted-foreground sm:order-4">
          <span className="mb-1 block sm:sr-only">Hnije po (dny)</span>
          <input aria-label="Hnije po (dnech)" type="number" min={1} placeholder="nikdy" defaultValue={stage.rotting_days ?? ""} disabled={disabled} className={cn(field, "w-full text-foreground")}
            onBlur={(e) => { const raw = e.target.value.trim(); const n = raw === "" ? null : Math.max(1, Math.round(Number(raw) || 1)); e.target.value = n === null ? "" : String(n); if (n !== stage.rotting_days) onPatch({ rotting_days: n }); }} />
        </label>
      </div>
    </li>
  );
}

function MoveDealsDialog({ stage, options, count, onClose, onConfirm }: { stage: Stage | null; options: Stage[]; count: number; onClose: () => void; onConfirm: (target: string) => void }) {
  const [target, setTarget] = useState("");
  const value = target || options[0]?.id || "";
  return (
    <Dialog open={!!stage} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>Smazat fázi {stage?.name}?</DialogTitle>
        <DialogDescription>Ve fázi je {count} {count === 1 ? "deal" : "dealů"}. Vyber, kam se přesunou.</DialogDescription>
        <Select className="mt-4" value={value} onChange={(e) => setTarget(e.target.value)} aria-label="Cílová fáze">
          {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Zrušit</Button>
          <Button variant="destructive" disabled={!value} onClick={() => onConfirm(value)}>Přesunout dealy a smazat fázi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
