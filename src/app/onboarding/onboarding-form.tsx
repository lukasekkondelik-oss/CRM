"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspace } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createWorkspace, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="workspace_name">Název firmy / workspace</Label>
        <Input id="workspace_name" name="workspace_name" placeholder="Moje agentura" required autoFocus />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Vytvořit workspace
      </Button>
    </form>
  );
}
