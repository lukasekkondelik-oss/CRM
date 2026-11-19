"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const ghost =
  "-mx-2 h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm transition-colors hover:bg-muted focus-visible:border-ring focus-visible:bg-card focus-visible:outline-none";

export function Row({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-2 py-1.5">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="size-3.5" /> {label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Pole upravované přímo v místě: Enter / opuštění pole uloží, prázdná hodnota = null (pokud není `required`). */
export function InlineText({ label, value, onSave, type = "text", placeholder, required, validate, className, action }: {
  label: string; value: string | null; onSave: (v: string | null) => void; type?: string; placeholder?: string;
  required?: boolean; validate?: (v: string) => boolean; className?: string; action?: React.ReactNode;
}) {
  const [version, setVersion] = useState(0);
  return (
    <div className="flex items-center gap-1">
      <input
        key={version}
        aria-label={label}
        type={type}
        defaultValue={value ?? ""}
        placeholder={placeholder ?? "—"}
        className={cn(ghost, className)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if ((required && !v) || (v && validate && !validate(v))) { setVersion((n) => n + 1); if (v) toast.error("Neplatná hodnota."); return; }
          if (v !== (value ?? "")) onSave(v || null);
        }}
      />
      {action}
    </div>
  );
}

/** Optimistická úprava záznamu v tabulce `table`; při chybě vrací původní stav. */
export function makePatcher<T extends { id: string }>(table: string, record: T, setRecord: React.Dispatch<React.SetStateAction<T>>) {
  return async (p: Partial<T>): Promise<boolean> => {
    const before = record;
    setRecord((r) => ({ ...r, ...p }));
    const { error } = await createClient().from(table).update(p as never).eq("id", record.id);
    if (error) {
      setRecord(before);
      toast.error("Změnu se nepodařilo uložit.");
      return false;
    }
    return true;
  };
}
