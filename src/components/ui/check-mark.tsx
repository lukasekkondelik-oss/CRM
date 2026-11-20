import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Kroužek u aktivity: prázdný 1.5px okraj, zaškrtnutý = vyplněný mint s fajfkou. */
export function CheckMark({ done, className }: { done: boolean; className?: string }) {
  return done ? (
    <span className={cn("flex size-5 items-center justify-center rounded-full bg-success text-on-success", className)}><Check className="size-3.5" strokeWidth={3} /></span>
  ) : (
    <span className={cn("block size-5 rounded-full border-[1.5px] border-input transition-colors group-hover/check:border-primary", className)} />
  );
}
