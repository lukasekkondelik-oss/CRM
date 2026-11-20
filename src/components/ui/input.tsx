import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-9 w-full rounded-lg border bg-card px-3 text-sm shadow-card transition-colors placeholder:text-subtle hover:border-input focus-visible:border-ring focus-visible:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
