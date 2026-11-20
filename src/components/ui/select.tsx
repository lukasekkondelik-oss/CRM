import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Nativní <select> ve stylu aplikace (na mobilu otevře systémový výběr). */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-9 w-full appearance-none rounded-lg border bg-card pl-3 pr-9 text-sm shadow-card transition-colors hover:border-input focus-visible:border-ring focus-visible:outline-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
