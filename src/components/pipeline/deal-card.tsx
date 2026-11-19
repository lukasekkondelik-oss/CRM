import { Building2, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatCZK } from "@/lib/format";
import { relativeDay } from "@/lib/dates";
import { TYPE_ICON } from "@/components/activities/activity-dialog";
import type { DealVM, Member, NextState } from "@/lib/deals/helpers";
import type { Label } from "@/lib/types";
import { NextStepIcon } from "./next-step-icon";

export interface CardInfo {
  org?: string;
  person?: string;
  owner?: Member;
  labels: Label[];
  rotting: boolean;
  state: NextState;
  today: string;
}

export function DealCard({ deal, info, className, ...rest }: { deal: DealVM; info: CardInfo } & React.ComponentProps<"div">) {
  const { org, person, owner, labels, rotting, state, today } = info;
  const NextIcon = deal.nextType ? TYPE_ICON[deal.nextType] : null;
  return (
    <div
      {...rest}
      className={cn(
        "cursor-grab touch-manipulation rounded-lg border bg-card p-3 text-left shadow-card transition-shadow hover:shadow-pop active:cursor-grabbing",
        rotting && "border-danger ring-1 ring-danger/40",
        className,
      )}
    >
      {labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {labels.map((l) => (
            <span key={l.id} title={l.name} className="h-1.5 w-8 rounded-full" style={{ backgroundColor: l.color }} />
          ))}
        </div>
      )}
      <p className="text-sm font-medium leading-snug">{deal.title}</p>
      {(org || person) && (
        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          {org ? <Building2 className="size-3 shrink-0" /> : <User className="size-3 shrink-0" />}
          <span className="truncate">{[org, person].filter(Boolean).join(" · ")}</span>
        </p>
      )}
      {deal.nextSubject && NextIcon && (
        <p className={cn("mt-1.5 flex items-center gap-1.5 truncate text-xs", state === "overdue" ? "font-medium text-danger" : "text-muted-foreground")}>
          <NextIcon className="size-3 shrink-0" />
          <span className="truncate">{deal.nextSubject}{deal.nextDue ? ` · ${relativeDay(deal.nextDue, today)}` : ""}</span>
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">{formatCZK(deal.value)}</span>
        <span className="flex items-center gap-2">
          {rotting && <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-danger">Hnije</span>}
          <NextStepIcon state={state} due={deal.nextDue} />
          {owner && <Avatar name={owner.full_name} src={owner.avatar_url} className="size-6 text-[10px]" />}
        </span>
      </div>
      {state === "none" && deal.status === "open" && (
        <p className="mt-2 rounded-md bg-warning-soft px-2 py-1 text-[11px] font-medium text-warning">Bez dalšího kroku</p>
      )}
    </div>
  );
}
