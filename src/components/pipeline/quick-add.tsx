"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Rychlé přidání dealu přímo ve sloupci: Enter = uložit, Esc = zrušit. */
export function QuickAdd({ onSubmit, onCancel }: { onSubmit: (title: string, value: number) => Promise<boolean>; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const ok = await onSubmit(title.trim(), Number(value.replace(/\s/g, "").replace(",", ".")) || 0);
      if (ok) onCancel();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="flex flex-col gap-2 rounded-lg border bg-card p-2.5 shadow-card"
    >
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Název dealu" className="h-9" />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Hodnota (Kč)" inputMode="decimal" className="h-9" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!title.trim() || busy}>
          {busy && <Loader2 className="animate-spin" />} Přidat
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Zrušit</Button>
      </div>
    </form>
  );
}
