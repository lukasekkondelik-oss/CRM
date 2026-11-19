"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, addMonths, dayOfMonth, formatMonth, formatShortDay, monthGrid, weekStart } from "@/lib/dates";
import type { Activity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TYPE_ICON } from "./activity-dialog";

export type CalMode = "week" | "month";

interface Props {
  activities: Activity[];
  today: string;
  mode: CalMode;
  anchor: string;
  onMode: (m: CalMode) => void;
  onAnchor: (a: string) => void;
  onOpen: (a: Activity) => void;
  onAdd: (date: string) => void;
}

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function Chip({ a, today, onOpen }: { a: Activity; today: string; onOpen: (a: Activity) => void }) {
  const Icon = TYPE_ICON[a.type];
  const overdue = !a.done && !!a.due_date && a.due_date < today;
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      title={`${a.due_time ? a.due_time.slice(0, 5) + " " : ""}${a.subject}`}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded-md px-1.5 py-1 text-left text-xs font-medium transition-colors",
        a.done ? "bg-muted text-muted-foreground line-through" : overdue ? "bg-danger-soft text-danger hover:brightness-95" : "bg-accent text-accent-foreground hover:brightness-95",
      )}
    >
      <Icon className="size-3 shrink-0" />
      {a.due_time && <span className="shrink-0 tabular-nums">{a.due_time.slice(0, 5)}</span>}
      <span className="truncate">{a.subject}</span>
    </button>
  );
}

export function ActivityCalendar({ activities, today, mode, anchor, onMode, onAnchor, onOpen, onAdd }: Props) {
  const byDay = new Map<string, Activity[]>();
  for (const a of activities) {
    if (!a.due_date) continue;
    byDay.set(a.due_date, [...(byDay.get(a.due_date) ?? []), a]);
  }
  for (const list of byDay.values()) list.sort((x, y) => (x.due_time ?? "").localeCompare(y.due_time ?? ""));

  const days = mode === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)) : monthGrid(anchor);
  const step = (dir: 1 | -1) => onAnchor(mode === "week" ? addDays(anchor, 7 * dir) : addMonths(anchor, dir));
  const title = mode === "week" ? `${formatShortDay(days[0])} – ${formatShortDay(days[6])}` : formatMonth(anchor);
  const anchorMonth = anchor.slice(0, 7);
  const noDate = activities.filter((a) => !a.due_date && !a.done).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Předchozí" onClick={() => step(-1)}><ChevronLeft /></Button>
          <Button variant="outline" size="icon" aria-label="Další" onClick={() => step(1)}><ChevronRight /></Button>
          <Button variant="outline" onClick={() => onAnchor(today)}>Dnes</Button>
          <h2 className="ml-2 text-base font-semibold capitalize">{title}</h2>
        </div>
        <div className="flex rounded-lg border bg-card p-0.5" role="group" aria-label="Rozsah kalendáře">
          {(["week", "month"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}
              className={cn("h-8 rounded-md px-3 text-sm font-medium", mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
              {m === "week" ? "Týden" : "Měsíc"}
            </button>
          ))}
        </div>
      </div>

      {mode === "month" && (
        <div className="grid grid-cols-7 gap-px px-px pb-1 text-center text-xs font-medium text-muted-foreground">
          {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>
      )}

      <div className={cn("grid gap-px overflow-hidden rounded-xl border bg-border", mode === "week" ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-7")}>
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const isToday = d === today;
          const dim = mode === "month" && d.slice(0, 7) !== anchorMonth;
          const max = mode === "week" ? 50 : 3;
          return (
            <div key={d} className={cn("group flex min-h-24 flex-col gap-1 bg-card p-1.5", mode === "week" && "sm:min-h-72", mode === "month" && "min-h-20 sm:min-h-28", dim && "bg-muted/40")}>
              <div className="flex items-center justify-between">
                <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium", isToday ? "bg-primary text-primary-foreground" : dim ? "text-muted-foreground/60" : "text-muted-foreground")}>
                  {mode === "week" ? formatShortDay(d) : dayOfMonth(d)}
                </span>
                <button type="button" aria-label={`Přidat aktivitu na ${d}`} onClick={() => onAdd(d)} className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
                  <Plus className="size-3.5" />
                </button>
              </div>
              {list.slice(0, max).map((a) => <Chip key={a.id} a={a} today={today} onOpen={onOpen} />)}
              {list.length > max && (
                <button type="button" onClick={() => { onMode("week"); onAnchor(d); }} className="px-1 text-left text-xs text-muted-foreground hover:text-foreground">
                  +{list.length - max} dalších
                </button>
              )}
            </div>
          );
        })}
      </div>
      {noDate > 0 && <p className="mt-2 text-xs text-muted-foreground">{noDate} aktivit bez termínu je vidět jen v seznamu.</p>}
    </div>
  );
}
