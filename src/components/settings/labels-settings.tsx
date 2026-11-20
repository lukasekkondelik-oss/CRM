"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { LABEL_COLORS } from "@/lib/deals/helpers";
import type { Label } from "@/lib/types";
import { cn } from "@/lib/utils";

function Palette({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
      {LABEL_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} onClick={() => onChange(c)}
          className={cn("size-6 rounded-full border-2 border-transparent transition-transform hover:scale-110", value === c && "border-foreground")} style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

export function LabelsSettings({ labels: initial, usage }: { labels: Label[]; usage: Record<string, number> }) {
  const [labels, setLabels] = useState(initial);
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[0]);
  const [del, setDel] = useState<Label | null>(null);
  const sb = createClient();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { data, error } = await sb.from("labels").insert({ name: name.trim(), color }).select().single();
    if (error || !data) return void toast.error(error?.code === "23505" ? "Label s tímhle názvem už existuje." : "Label se nepodařilo vytvořit.");
    setLabels((l) => [...l, data as Label].sort((a, b) => a.name.localeCompare(b.name, "cs")));
    setName("");
  }

  async function patch(l: Label, p: Partial<Label>) {
    setLabels((all) => all.map((x) => (x.id === l.id ? { ...x, ...p } : x)));
    const { error } = await sb.from("labels").update(p).eq("id", l.id);
    if (error) { setLabels((all) => all.map((x) => (x.id === l.id ? l : x))); toast.error(error.code === "23505" ? "Label s tímhle názvem už existuje." : "Label se nepodařilo uložit."); }
  }

  async function remove(l: Label) {
    const { error } = await sb.from("labels").delete().eq("id", l.id);
    if (error) return void toast.error("Label se nepodařilo smazat.");
    setLabels((all) => all.filter((x) => x.id !== l.id));
    toast.success("Label smazán");
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardContent className="p-5">
          <form onSubmit={add} className="flex flex-col gap-3">
            <p className="text-sm font-medium">Nový label</p>
            <div className="flex flex-wrap items-center gap-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Např. Horký lead" aria-label="Název labelu" className="max-w-64" />
              <Palette value={color} onChange={setColor} label="Barva nového labelu" />
              <Button type="submit" disabled={!name.trim()}><Plus /> Přidat</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {labels.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground"><Tag className="mx-auto mb-2 size-5" />Zatím žádné labely. Přidej první a štítkuj jimi dealy.</p>
      ) : (
        <Card>
          <ul className="divide-y">
            {labels.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                <input aria-label="Název labelu" defaultValue={l.name} className="h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm hover:bg-muted focus-visible:border-ring focus-visible:bg-card focus-visible:outline-none"
                  onBlur={(e) => { const v = e.target.value.trim(); if (!v) e.target.value = l.name; else if (v !== l.name) patch(l, { name: v }); }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                <Palette value={l.color} onChange={(c) => patch(l, { color: c })} label={`Barva labelu ${l.name}`} />
                <span className="w-16 text-right text-xs text-muted-foreground">{usage[l.id] ?? 0}× použit</span>
                <button type="button" aria-label={`Smazat label ${l.name}`} onClick={() => setDel(l)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Smazat label ${del?.name ?? ""}?`}
        description={del && (usage[del.id] ?? 0) > 0 ? `Štítek se odebere z ${usage[del.id]} záznamů (dealy, osoby, firmy).` : "Štítek není nikde použitý."}
        onConfirm={async () => { if (del) await remove(del); }} />
    </div>
  );
}
