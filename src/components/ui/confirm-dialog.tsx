"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Smazat", confirmVariant = "destructive", onConfirm,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string;
  confirmLabel?: string; confirmVariant?: "destructive" | "success" | "default"; onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Zrušit</Button>
          <Button variant={confirmVariant} onClick={async () => { await onConfirm(); onOpenChange(false); }}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
