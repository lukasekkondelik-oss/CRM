"use client";

import { useState } from "react";
import { CheckCircle2, CalendarClock, Truck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DELIVERY_LABEL, DELIVERY_STATUSES } from "@/lib/deals/delivery";
import { formatDate } from "@/lib/format";
import type { Deal, DeliveryStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Co se děje s vyhraným dealem: realizace, běžící předplatné, nebo hotovo. */
export function DeliveryPanel({ deal, plannedCount, onChange }: {
  deal: Deal;
  plannedCount: number;
  onChange: (p: Partial<Deal>) => void;
}) {
  const [confirmDone, setConfirmDone] = useState(false);
  const current = deal.delivery_status ?? "in_progress";

  function set(s: DeliveryStatus) {
    if (s === current) return;
    if (s === "done") return void (plannedCount > 0 ? setConfirmDone(true) : markDone());
    onChange({ delivery_status: s, delivery_ends_on: s === "ongoing" ? deal.delivery_ends_on : null, delivered_at: null });
  }
  function markDone() {
    onChange({ delivery_status: "done", delivery_ends_on: null, delivered_at: new Date().toISOString() });
  }

  return (
    <section aria-label="Dodání" className="mb-4 rounded-lg border bg-muted/30 p-3">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Truck className="size-3.5" /> Dodání</h3>
      <div role="radiogroup" aria-label="Stav dodání" className="grid gap-1.5">
        {DELIVERY_STATUSES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={current === s} onClick={() => set(s)}
            className={cn("flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors",
              current === s ? "border-primary bg-accent font-medium text-accent-foreground" : "bg-card hover:bg-muted")}>
            <span className={cn("size-2 rounded-full", current === s ? "bg-primary" : "bg-muted-foreground/40")} />
            {DELIVERY_LABEL[s]}
          </button>
        ))}
      </div>

      {current === "ongoing" && (
        <div className="mt-3 flex flex-col gap-1.5">
          <label htmlFor="delivery-end" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarClock className="size-3.5" /> Běží do</label>
          <input id="delivery-end" type="date" value={deal.delivery_ends_on ?? ""} onChange={(e) => onChange({ delivery_ends_on: e.target.value || null })}
            className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm focus-visible:border-ring focus-visible:outline-none" />
          <p className="text-xs text-muted-foreground">Po dobu běhu k dealu přidávej úkoly (reporty, schůzky, prodloužení…). Datum je jen informativní.</p>
        </div>
      )}

      {current === "in_progress" && (
        <Button className="mt-3 w-full" variant="success" onClick={() => set("done")}><CheckCircle2 /> Označit jako dodáno</Button>
      )}
      {current === "ongoing" && (
        <Button className="mt-3 w-full" variant="outline" onClick={() => set("done")}><CheckCircle2 /> Ukončit a označit jako dodáno</Button>
      )}
      {current === "done" && (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Dodáno {formatDate(deal.delivered_at)}</span>
          <Button size="sm" variant="ghost" onClick={() => set("in_progress")}><Undo2 /> Vrátit do realizace</Button>
        </div>
      )}

      <ConfirmDialog open={confirmDone} onOpenChange={setConfirmDone} title="Označit jako dodáno?" confirmLabel="Dodáno" confirmVariant="success"
        description={`K dealu zbývá ${plannedCount} ${plannedCount === 1 ? "naplánovaná aktivita" : plannedCount < 5 ? "naplánované aktivity" : "naplánovaných aktivit"}. Zůstanou v seznamu, deal se ale už nebude hlídat jako rozdělaný.`}
        onConfirm={markDone} />
    </section>
  );
}
