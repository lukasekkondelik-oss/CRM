import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE, type ListParams } from "@/lib/data/contacts";
import { cn } from "@/lib/utils";

export function listHref(base: string, p: ListParams, over: Partial<ListParams>) {
  const m = { ...p, ...over };
  const s = new URLSearchParams();
  if (m.q) s.set("q", m.q);
  s.set("sort", m.sort);
  s.set("dir", m.dir);
  if (m.page > 1) s.set("page", String(m.page));
  return `${base}?${s.toString()}`;
}

export function SortTh({ base, p, k, children, className }: { base: string; p: ListParams; k: string; children: React.ReactNode; className?: string }) {
  const active = p.sort === k;
  return (
    <th scope="col" aria-sort={active ? (p.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}>
      <Link href={listHref(base, p, { sort: k, dir: active && p.dir === "asc" ? "desc" : "asc", page: 1 })} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        {active && (p.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </Link>
    </th>
  );
}

export const Th = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th scope="col" className={cn("whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}>{children}</th>
);

export function Pagination({ base, p, total }: { base: string; p: ListParams; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (p.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, p.page * PAGE_SIZE);
  const btn = "inline-flex h-9 items-center gap-1 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-muted";
  const off = "pointer-events-none opacity-40";
  return (
    <nav aria-label="Stránkování" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>{from}–{to} z {total}</span>
      <div className="flex items-center gap-2">
        <Link aria-disabled={p.page <= 1} className={cn(btn, p.page <= 1 && off)} href={listHref(base, p, { page: p.page - 1 })}><ChevronLeft className="size-4" /> Předchozí</Link>
        <span className="px-1">Strana {p.page} / {pages}</span>
        <Link aria-disabled={p.page >= pages} className={cn(btn, p.page >= pages && off)} href={listHref(base, p, { page: p.page + 1 })}>Další <ChevronRight className="size-4" /></Link>
      </div>
    </nav>
  );
}
