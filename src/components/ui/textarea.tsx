import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-lg border bg-card px-3 py-2 text-sm shadow-card placeholder:text-subtle hover:border-input focus-visible:border-ring focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}
