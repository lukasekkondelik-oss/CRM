"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";

/** Toasty respektují zvolený (světlý/tmavý) režim aplikace. */
export function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} position="bottom-right" richColors closeButton />;
}
