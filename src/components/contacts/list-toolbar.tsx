"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/** Hledání do URL (?q=) s debounce; při změně textu se vrací na 1. stránku. */
export function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      // žádná změna oproti URL → nic nedělat (a hlavně nepřeskakovat na 1. stránku)
      if (value.trim() === (params.get("q") ?? "")) return;
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim()); else next.delete("q");
      next.delete("page");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="pl-9" aria-label={placeholder} />
      {pending && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
    </div>
  );
}

/** Filtr podle štítku do URL (?label=); při změně se vrací na 1. stránku. */
export function LabelFilter({ labels }: { labels: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (labels.length === 0) return null;
  return (
    <Select aria-label="Filtr podle štítku" className="h-9 w-full sm:w-48" value={params.get("label") ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set("label", e.target.value); else next.delete("label");
        next.delete("page");
        router.replace(`${pathname}?${next.toString()}`);
      }}>
      <option value="">Všechny štítky</option>
      {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
    </Select>
  );
}
