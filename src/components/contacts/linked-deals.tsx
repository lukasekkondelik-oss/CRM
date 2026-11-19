"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { insertDeal } from "@/lib/deals/mutations";
import { formatCZK, formatDate } from "@/lib/format";
import type { Deal, Pipeline, Stage } from "@/lib/types";

interface Props {
  deals: Deal[];
  stages: Stage[];
  pipelines: Pipeline[];
  userId: string;
  /** vazby pro nově vytvářený deal */
  link: { person_id?: string | null; organization_id?: string | null };
}

export function LinkedDeals({ deals, stages, pipelines, userId, link }: Props) {
  const [open, setOpen] = useState(false);
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const opened = deals.filter((d) => d.status === "open");
  const closed = deals.filter((d) => d.status !== "open");
  const sum = opened.reduce((s, d) => s + d.value, 0);

  const Item = ({ d }: { d: Deal }) => (
    <li>
      <Link href={`/dealy/${d.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{d.title}</span>
          <span className="text-xs text-muted-foreground">
            {d.status === "open" ? stageName.get(d.stage_id) : d.status === "won" ? `Vyhráno ${formatDate(d.won_at)}` : `Prohráno ${formatDate(d.lost_at)}${d.lost_reason ? ` · ${d.lost_reason}` : ""}`}
          </span>
        </span>
        <span className="flex items-center gap-2 whitespace-nowrap">
          {d.status === "won" && <Badge variant="success">Vyhráno</Badge>}
          {d.status === "lost" && <Badge variant="danger">Prohráno</Badge>}
          <span className="text-sm font-semibold tabular-nums">{formatCZK(d.value)}</span>
        </span>
      </Link>
    </li>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2"><Briefcase className="size-4" /> Dealy <Badge variant="muted">{deals.length}</Badge></CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={stages.length === 0}><Plus /> Přidat deal</Button>
      </CardHeader>
      <CardContent>
        {deals.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">Zatím žádné dealy. Přidej první a drž si tak přehled o obchodu.</p>
        ) : (
          <>
            {opened.length > 0 && (
              <>
                <p className="mb-1 flex justify-between px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><span>Otevřené ({opened.length})</span><span>{formatCZK(sum)}</span></p>
                <ul>{opened.map((d) => <Item key={d.id} d={d} />)}</ul>
              </>
            )}
            {closed.length > 0 && (
              <>
                <p className="mb-1 mt-4 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Uzavřené ({closed.length})</p>
                <ul>{closed.map((d) => <Item key={d.id} d={d} />)}</ul>
              </>
            )}
          </>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{open && <AddDeal pipelines={pipelines} stages={stages} userId={userId} link={link} onClose={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </Card>
  );
}

function AddDeal({ pipelines, stages, userId, link, onClose }: Omit<Props, "deals"> & { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");
  const pipelineStages = stages.filter((s) => s.pipeline_id === pipelineId).sort((a, b) => a.position - b.position);
  const [stageId, setStageId] = useState(pipelineStages[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !stageId || busy) return;
    setBusy(true);
    try {
      const { data: top } = await createClient().from("deals").select("position").eq("stage_id", stageId).order("position").limit(1);
      await insertDeal({
        pipeline_id: pipelineId, stage_id: stageId, title: title.trim(),
        value: Number(value.replace(/\s/g, "").replace(",", ".")) || 0, owner_id: userId,
        person_id: link.person_id ?? null, organization_id: link.organization_id ?? null,
        position: top?.length ? Number(top[0].position) - 1 : 0,
      });
      toast.success("Deal vytvořen");
      onClose();
      router.refresh();
    } catch {
      toast.error("Deal se nepodařilo vytvořit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogTitle>Nový deal</DialogTitle>
      <div className="flex flex-col gap-1.5"><Label htmlFor="ad-title">Název *</Label><Input id="ad-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="ad-val">Hodnota (Kč)</Label><Input id="ad-val" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" /></div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ad-stage">Fáze</Label>
          <Select id="ad-stage" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {pipelineStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </div>
      {pipelines.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ad-pipe">Pipeline</Label>
          <Select id="ad-pipe" value={pipelineId} onChange={(e) => {
            setPipelineId(e.target.value);
            setStageId(stages.filter((s) => s.pipeline_id === e.target.value).sort((a, b) => a.position - b.position)[0]?.id ?? "");
          }}>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>Zrušit</Button>
        <Button type="submit" disabled={!title.trim() || !stageId || busy}>{busy && <Loader2 className="animate-spin" />} Vytvořit deal</Button>
      </DialogFooter>
    </form>
  );
}
