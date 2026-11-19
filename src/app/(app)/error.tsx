"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger"><TriangleAlert className="size-7" /></span>
      <div>
        <h1 className="text-xl font-semibold">Něco se pokazilo</h1>
        <p className="mt-1 text-sm text-muted-foreground">Stránku se nepodařilo načíst. Zkus to znovu, a pokud problém trvá, zkontroluj připojení nebo se přihlas znovu.</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Kód: {error.digest}</p>}
      </div>
      <Button onClick={reset}>Zkusit znovu</Button>
    </div>
  );
}
