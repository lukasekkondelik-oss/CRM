import { cn } from "@/lib/utils";

/** Cesta písmene „n“ ze symbolu nexdeals (viewBox symbolu: 0 0 100 100 před zkosením). */
const N_PATH = "M0,100 L0,0 L22,0 L22,11 C30,4 40,0 51,0 C69,0 80,12 80,32 L80,100 L58,100 L58,37 C58,26 52,20 43,20 C31,20 22,29 22,41 L22,100 Z";

/** Ikona aplikace: indigový zaoblený čtverec se symbolem (stejný soubor jako favicon). */
export function AppIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 512 512" className={cn("size-7 shrink-0", className)}>
      <rect width="512" height="512" rx="112" fill="#5B5FEF" />
      <g transform="translate(118 146) scale(2.2) translate(21 0) skewX(-12)">
        <path fill="#FFFFFF" d={N_PATH} />
        <rect x="90" y="80" width="21" height="20" rx="3" fill="#95F2D9" />
      </g>
    </svg>
  );
}

/** Samotný symbol bez pozadí (indigové „n“ + mint čtvereček). */
export function Symbol({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="-6 -6 132 112" className={cn("h-7 w-auto shrink-0", className)}>
      <g transform="translate(21 0) skewX(-12)">
        <path fill="#5B5FEF" d={N_PATH} />
        <rect x="90" y="80" width="21" height="20" rx="3" fill="#95F2D9" />
      </g>
    </svg>
  );
}

/**
 * Logo nexdeals: ikona + wordmark „nex“ (tlumená šedomodrá) + „deals“ (text) v Sora 600 s mint zkoseným čtverečkem místo tečky.
 * Finální SVG stačí měnit tady, zbytek aplikace používá jen <Logo />.
 */
export function Logo({ variant = "full", className }: { variant?: "full" | "mark"; className?: string }) {
  if (variant === "mark") return <AppIcon className={className} />;
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <AppIcon />
      <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">
        <span className="text-[#8A8FA8] dark:text-[#7E83A3]">nex</span>
        <span className="text-foreground">deals</span>
        <span aria-hidden className="ml-[2px] inline-block h-[0.3em] w-[0.34em] -skew-x-12 rounded-[1px] bg-[#95F2D9] align-baseline" />
      </span>
    </span>
  );
}

export function Brand({ className }: { className?: string }) {
  return <Logo className={className} />;
}
