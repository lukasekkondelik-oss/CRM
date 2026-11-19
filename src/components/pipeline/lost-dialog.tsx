"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LOST_REASONS } from "@/lib/deals/helpers";

export function LostDialog({ open, onOpenChange, dealTitle, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; dealTitle?: string; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setReason(""); onOpenChange(o); }}>
      <DialogContent>
        <DialogTitle>Proč byl deal prohrán?</DialogTitle>
        <DialogDescription>{dealTitle}</DialogDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          {LOST_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn("rounded-full border px-3 py-1 text-sm transition-colors", reason === r ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea className="mt-3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nebo napiš vlastní důvod…" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Zrušit</Button>
          <Button variant="destructive" disabled={!reason.trim()} onClick={() => { onConfirm(reason.trim()); setReason(""); }}>
            Označit jako prohraný
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
