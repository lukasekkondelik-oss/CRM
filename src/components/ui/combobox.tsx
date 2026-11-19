"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboOption { id: string; label: string; sub?: string; data?: unknown }

interface Props {
  options: ComboOption[];
  value: string | null;
  onChange: (id: string | null, option?: ComboOption) => void;
  /** Serverové hledání (s debounce). Bez zadaného textu se zobrazí `options`. */
  search?: (q: string) => Promise<ComboOption[]>;
  /** Když je zadáno, nabídne vytvoření nové položky z hledaného textu. */
  onCreate?: (query: string) => Promise<string | null | void>;
  placeholder?: string;
  createLabel?: string;
  className?: string;
  /** bez rámečku, vypadá jako text (inline editace) */
  ghost?: boolean;
}

export function Combobox({ options, value, onChange, search, onCreate, placeholder = "Vybrat…", createLabel = "Vytvořit", className, ghost }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState<ComboOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !search) return;
    const term = q.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!term) {
        if (!cancelled) setRemote(null);
        return;
      }
      setLoading(true);
      try {
        const res = await search(term);
        if (!cancelled) setRemote(res);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, open, search]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.id === value);
  const filtered = useMemo(() => {
    if (search && q.trim() && remote) return remote;
    const s = q.trim().toLowerCase();
    return (s ? options.filter((o) => (o.label + " " + (o.sub ?? "")).toLowerCase().includes(s)) : options).slice(0, 50);
  }, [options, q, search, remote]);
  const canCreate = !!onCreate && q.trim().length > 0 && !loading && !filtered.some((o) => o.label.toLowerCase() === q.trim().toLowerCase());

  const pick = (id: string | null, option?: ComboOption) => {
    onChange(id, option);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left text-sm transition-colors",
          ghost
            ? "-mx-2 rounded-md px-2 py-1 hover:bg-muted"
            : "h-10 rounded-lg border border-input bg-card px-3 shadow-card hover:bg-muted/50",
        )}
      >
        <span className={cn("truncate", !current && "text-muted-foreground")}>{current?.label ?? placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-full min-w-56 rounded-lg border bg-card p-1.5 shadow-pop">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Hledat…"
            className="mb-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[0] && !canCreate) pick(filtered[0].id, filtered[0]);
              }
            }}
          />
          <ul role="listbox" className="max-h-56 overflow-y-auto">
            {value && (
              <li>
                <button type="button" onClick={() => pick(null)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted">
                  <X className="size-3.5" /> Odebrat
                </button>
              </li>
            )}
            {filtered.map((o) => (
              <li key={o.id}>
                <button type="button" role="option" aria-selected={o.id === value} onClick={() => pick(o.id, o)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <span className="truncate">
                    {o.label}
                    {o.sub && <span className="ml-1.5 text-xs text-muted-foreground">{o.sub}</span>}
                  </span>
                  {o.id === value && <Check className="size-4 text-primary" />}
                </button>
              </li>
            ))}
            {loading && <li className="px-2 py-2 text-sm text-muted-foreground">Hledám…</li>}
            {!loading && filtered.length === 0 && !canCreate && <li className="px-2 py-2 text-sm text-muted-foreground">Nic nenalezeno</li>}
            {canCreate && (
              <li>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const id = await onCreate!(q.trim());
                      if (id) pick(id);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-accent"
                >
                  <Plus className="size-4" /> {createLabel} „{q.trim()}“
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
