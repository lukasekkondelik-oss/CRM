"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { createLabelQuick } from "@/lib/deals/mutations";
import type { Label } from "@/lib/types";
import { cn } from "@/lib/utils";

type Target = { table: "person_labels"; fk: "person_id" } | { table: "organization_labels"; fk: "organization_id" };

/** Štítky u osoby / firmy: chipy + rozbalovací výběr + rychlé vytvoření nového štítku. */
export function LabelPicker({ target, entityId, labels: initialLabels, selected }: {
  target: Target; entityId: string; labels: Label[]; selected: string[];
}) {
  const [labels, setLabels] = useState(initialLabels);
  const [ids, setIds] = useState(selected);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function toggle(id: string) {
    const has = ids.includes(id);
    setIds((l) => (has ? l.filter((x) => x !== id) : [...l, id]));
    const sb = createClient();
    const { error } = has
      ? await sb.from(target.table).delete().eq(target.fk, entityId).eq("label_id", id)
      : await sb.from(target.table).insert({ [target.fk]: entityId, label_id: id });
    if (error) {
      setIds((l) => (has ? [...l, id] : l.filter((x) => x !== id)));
      toast.error("Štítek se nepodařilo změnit.");
    }
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    const existing = labels.find((l) => l.name.toLowerCase() === n.toLowerCase());
    if (existing) { setName(""); if (!ids.includes(existing.id)) toggle(existing.id); return; }
    try {
      const l = await createLabelQuick(n, labels.length);
      setLabels((ls) => [...ls, l]);
      setName("");
      toggle(l.id);
    } catch { toast.error("Štítek se nepodařilo vytvořit."); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.filter((l) => ids.includes(l.id)).map((l) => (
          <span key={l.id} className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: l.color }}>{l.name}</span>
        ))}
        <button type="button" aria-label="Upravit štítky" aria-expanded={open} onClick={() => setOpen((o) => !o)}
          className="rounded-full border border-dashed p-1 text-muted-foreground hover:bg-muted"><Plus className="size-3" /></button>
      </div>
      {open && (
        <div className="mt-2 rounded-lg border bg-muted/40 p-3">
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => (
              <button key={l.id} type="button" onClick={() => toggle(l.id)} aria-pressed={ids.includes(l.id)}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", ids.includes(l.id) ? "text-white" : "bg-card")}
                style={ids.includes(l.id) ? { backgroundColor: l.color, borderColor: l.color } : { borderColor: l.color, color: l.color }}>
                {l.name}
              </button>
            ))}
            {labels.length === 0 && <span className="text-xs text-muted-foreground">Zatím žádné štítky.</span>}
          </div>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nový štítek…" aria-label="Nový štítek"
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm focus-visible:outline-none" />
            <Button type="submit" size="sm" variant="outline" disabled={!name.trim()}>Přidat</Button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Jen zobrazení štítků (seznamy). */
export function LabelChips({ labels, ids }: { labels: Label[]; ids: string[] }) {
  const on = labels.filter((l) => ids.includes(l.id));
  if (on.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {on.map((l) => <span key={l.id} className="rounded-full px-1.5 py-px text-[11px] font-medium text-white" style={{ backgroundColor: l.color }}>{l.name}</span>)}
    </span>
  );
}
