"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Member } from "@/lib/deals/helpers";
import type { Label } from "@/lib/types";

export interface Filters { q: string; owner: string; label: string; mine: boolean; noNext: boolean; rotting: boolean }
export const EMPTY_FILTERS: Filters = { q: "", owner: "", label: "", mine: false, noNext: false, rotting: false };

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("h-9 rounded-lg border px-3 text-sm font-medium transition-colors", active ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-muted")}
    >
      {children}
    </button>
  );
}

export function FiltersBar({ filters, onChange, members, labels, extra }: {
  filters: Filters; onChange: (f: Filters) => void; members: Member[]; labels: Label[]; extra?: React.ReactNode;
}) {
  const set = (p: Partial<Filters>) => onChange({ ...filters, ...p });
  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-44 flex-1 sm:max-w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Hledat deal…" className="h-9 pl-9" />
      </div>
      <Select value={filters.owner} onChange={(e) => set({ owner: e.target.value, mine: false })} className="h-9 w-40" aria-label="Vlastník">
        <option value="">Všichni vlastníci</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      </Select>
      <Select value={filters.label} onChange={(e) => set({ label: e.target.value })} className="h-9 w-36" aria-label="Label">
        <option value="">Všechny labely</option>
        {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </Select>
      <Chip active={filters.mine} onClick={() => set({ mine: !filters.mine, owner: "" })}>Jen moje</Chip>
      <Chip active={filters.noNext} onClick={() => set({ noNext: !filters.noNext })}>Bez další aktivity</Chip>
      <Chip active={filters.rotting} onClick={() => set({ rotting: !filters.rotting })}>Hnijící</Chip>
      {dirty && (
        <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          Zrušit filtry
        </button>
      )}
      {extra}
    </div>
  );
}
