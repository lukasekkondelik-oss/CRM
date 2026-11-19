"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

interface Props {
  user: { fullName: string; email: string | null; avatarUrl: string | null; role: "admin" | "member" };
  workspaceName: string;
  children: React.ReactNode;
}

function SidebarContent({ user, workspaceName, onNavigate }: Omit<Props, "children"> & { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Brand />
        <p className="mt-3 truncate rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          {workspaceName}
        </p>
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
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
              {label}
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

export function AppShell({ user, workspaceName, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar lg:block">
        <SidebarContent user={user} workspaceName={workspaceName} />
      </aside>

      {/* Mobilní horní lišta */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-sidebar/90 px-4 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Otevřít menu" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
        <Brand />
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
            <SidebarContent user={user} workspaceName={workspaceName} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
