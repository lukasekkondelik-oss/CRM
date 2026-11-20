"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import dynamic from "next/dynamic";
import { ThemeToggle } from "./theme-toggle";

// Hledání se stáhne až při prvním otevření (nezatěžuje první načtení)
const CommandPalette = dynamic(() => import("./command-palette").then((m) => m.CommandPalette), { ssr: false });

export interface ActivityBadge { today: number; overdue: number }

interface Props {
  activityBadge?: ActivityBadge;
  deliveryCount?: number;
  user: { fullName: string; email: string | null; avatarUrl: string | null; role: "admin" | "member" };
  workspaceName: string;
  children: React.ReactNode;
}

function SidebarContent({ user, workspaceName, activityBadge, deliveryCount, onNavigate, onSearch }: Omit<Props, "children"> & { onNavigate?: () => void; onSearch: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Brand />
        <p className="mt-3 truncate rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
          {workspaceName}
        </p>
      </div>

      <div className="px-3 pb-3">
        <button type="button" onClick={() => { onNavigate?.(); onSearch(); }} aria-label="Hledat (Ctrl+K)"
          className="flex h-9 w-full items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-card hover:bg-muted">
          <Search className="size-4" /> <span className="flex-1 text-left">Hledat…</span>
          <kbd className="rounded border bg-surface-3 px-1.5 text-[10px] font-medium">Ctrl K</kbd>
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Hlavní navigace">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
              <span className="flex-1">{label}</span>
              {href === "/realizace" && !!deliveryCount && deliveryCount > 0 && (
                <span title={`Dealů v realizaci a předplatných: ${deliveryCount}`} aria-label={`V realizaci: ${deliveryCount}`}
                  className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums", active ? "bg-primary text-primary-foreground" : "bg-surface-3 text-muted-foreground")}>{deliveryCount}</span>
              )}
              {href === "/aktivity" && activityBadge && activityBadge.today + activityBadge.overdue > 0 && (
                <span
                  title={`Dnes: ${activityBadge.today}, po termínu: ${activityBadge.overdue}`}
                  aria-label={`Aktivity k vyřízení: dnes ${activityBadge.today}, po termínu ${activityBadge.overdue}`}
                  className="flex items-center gap-1 text-[11px] font-semibold tabular-nums"
                >
                  {activityBadge.overdue > 0 && <span className="rounded-full bg-danger-soft px-1.5 py-0.5 leading-none text-danger">{activityBadge.overdue}</span>}
                  {activityBadge.today > 0 && <span className="rounded-full bg-warning-soft px-1.5 py-0.5 leading-none text-warning">{activityBadge.today}</span>}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user.fullName} src={user.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight">{user.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          {user.role === "admin" && <Badge>Admin</Badge>}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <form action="/auth/odhlasit" method="post">
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
              <LogOut /> Odhlásit
            </Button>
          </form>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

export function AppShell({ user, workspaceName, activityBadge, deliveryCount, children }: Props) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpenState] = useState(false);
  const [searchMounted, setSearchMounted] = useState(false);
  const setSearchOpen = (v: boolean | ((o: boolean) => boolean)) => { setSearchMounted(true); setSearchOpenState(v); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#obsah" className="sr-only z-[60] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Přeskočit na obsah</a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar lg:block">
        <SidebarContent user={user} workspaceName={workspaceName} activityBadge={activityBadge} deliveryCount={deliveryCount} onSearch={() => setSearchOpen(true)} />
      </aside>

      {/* Mobilní horní lišta */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-sidebar/90 px-4 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Otevřít menu" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
        <Brand className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="Hledat" onClick={() => setSearchOpen(true)}><Search /></Button>
      </header>

      {/* Mobilní drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            aria-label="Zavřít menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-sidebar shadow-pop">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zavřít menu"
              className="absolute right-3 top-3"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
            <SidebarContent user={user} workspaceName={workspaceName} activityBadge={activityBadge} deliveryCount={deliveryCount} onNavigate={() => setOpen(false)} onSearch={() => setSearchOpen(true)} />
          </aside>
        </div>
      )}

      {searchMounted && <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />}

      <main id="obsah" tabIndex={-1} className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
