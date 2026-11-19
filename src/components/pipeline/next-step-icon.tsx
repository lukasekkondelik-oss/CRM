import { CalendarCheck, CircleAlert, TriangleAlert } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { NextState } from "@/lib/deals/helpers";
import { cn } from "@/lib/utils";

const META = {
  planned: { icon: CalendarCheck, cls: "text-success", label: "Naplánovaná aktivita" },
  overdue: { icon: CircleAlert, cls: "text-danger", label: "Aktivita po termínu" },
  none: { icon: TriangleAlert, cls: "text-warning", label: "Bez dalšího kroku" },
} as const;

export function NextStepIcon({ state, due, className }: { state: NextState; due?: string | null; className?: string }) {
  const { icon: Icon, cls, label } = META[state];
  const title = due && state !== "none" ? `${label} (${formatDate(due)})` : label;
  return (
    <span title={title} role="img" aria-label={title} className={cn("inline-flex", cls, className)}>
      <Icon className="size-4" />
    </span>
  );
}
