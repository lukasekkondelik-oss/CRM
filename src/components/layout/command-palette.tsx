"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Briefcase, Building2, CalendarCheck, CornerDownLeft, Kanban, Loader2, Search, Settings, User, Users, type LucideIcon } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { searchAll, type GlobalResults } from "@/lib/contacts/search";
import { cn } from "@/lib/utils";

interface Item { id: string; group: string; label: string; sub?: string; href: string; icon: LucideIcon }

const NAV: Item[] = [
  { id: "n-dash", group: "Přejít na", label: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { id: "n-pipe", group: "Přejít na", label: "Pipeline", href: "/pipeline", icon: Kanban },
  { id: "n-act", group: "Přejít na", label: "Aktivity", href: "/aktivity", icon: CalendarCheck },
  { id: "n-per", group: "Přejít na", label: "Osoby", href: "/osoby", icon: Users },
  { id: "n-org", group: "Přejít na", label: "Firmy", href: "/firmy", icon: Building2 },
  { id: "n-set", group: "Přejít na", label: "Nastavení", href: "/nastaveni", icon: Settings },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-card shadow-pop focus:outline-none">
          <DialogPrimitive.Title className="sr-only">Hledání</DialogPrimitive.Title>
          {open && <Palette onDone={() => onOpenChange(false)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Palette({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GlobalResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const term = q.trim();
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      if (term.length < 2) { setResults(null); setLoading(false); return; }
      setLoading(true);
      try {
        const r = await searchAll(term);
        if (id === seq.current) setResults(r); // starší odpovědi zahodit
      } finally { if (id === seq.current) setLoading(false); }
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  const items: Item[] = useMemo(() => {
    if (!results) return q.trim() ? [] : NAV;
    return [
      ...results.deals.map((d) => ({ id: `d${d.id}`, group: "Dealy", label: d.label, sub: d.sub, href: `/dealy/${d.id}`, icon: Briefcase })),
      ...results.persons.map((p) => ({ id: `p${p.id}`, group: "Osoby", label: p.label, sub: p.sub, href: `/osoby/${p.id}`, icon: User })),
      ...results.orgs.map((o) => ({ id: `o${o.id}`, group: "Firmy", label: o.label, href: `/firmy/${o.id}`, icon: Building2 })),
    ];
  }, [results, q]);

  const go = (i: Item) => { onDone(); router.push(i.href); };
  const idx = Math.min(active, Math.max(items.length - 1, 0));

  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [idx, items]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && items[idx]) { e.preventDefault(); go(items[idx]); }
  }

  return (
    <div onKeyDown={onKey}>
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Hledat dealy, osoby, firmy…" aria-label="Hledat"
          role="combobox" aria-expanded aria-controls="cmd-list" aria-activedescendant={items[idx] ? `cmd-${items[idx].id}` : undefined}
          className="h-12 flex-1 bg-transparent text-sm focus-visible:outline-none" />
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">Esc</kbd>
      </div>
      <ul id="cmd-list" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
        {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">{q.trim().length < 2 ? "Napiš aspoň 2 znaky…" : loading ? "Hledám…" : `Nic nenalezeno pro „${q.trim()}“`}</li>}
        {items.map((it, i) => {
          const header = i === 0 || items[i - 1].group !== it.group ? it.group : null;
          return (
            <li key={it.id} role="presentation">
              {header && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{header}</p>}
              <button id={`cmd-${it.id}`} role="option" aria-selected={i === idx} type="button" onClick={() => go(it)} onMouseMove={() => setActive(i)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === idx ? "bg-accent text-accent-foreground" : "hover:bg-muted")}>
                <it.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{it.label}{it.sub && <span className="ml-2 text-xs text-muted-foreground">{it.sub}</span>}</span>
                {i === idx && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
