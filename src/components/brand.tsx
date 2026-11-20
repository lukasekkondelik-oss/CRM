import { cn } from "@/lib/utils";

/**
 * Logo nexdeals. Dočasná značka: indigový čtverec s „n“ (Sora 600) + wordmark „nexdeals.“ s mint tečkou.
 * Až bude finální symbol, stačí vyměnit <Mark /> (SVG) – zbytek aplikace se nemění.
 */
function Mark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-[17px] font-semibold leading-none text-white", className)}>
      n
    </span>
  );
}

export function Logo({ variant = "full", className }: { variant?: "full" | "mark"; className?: string }) {
  if (variant === "mark") return <Mark className={className} />;
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Mark />
      <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-foreground">
        nexdeals<span style={{ color: "#95f2d9" }}>.</span>
      </span>
    </span>
  );
}

export function Brand({ className }: { className?: string }) {
  return <Logo className={className} />;
}
