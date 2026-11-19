"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "./actions";

export interface Field {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  defaultValue?: string;
  readOnly?: boolean;
}

export function AuthForm({
  action,
  fields,
  submitLabel,
  hidden,
}: {
  action: (prev: AuthState, fd: FormData) => Promise<AuthState>;
  fields: Field[];
  submitLabel: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <Label htmlFor={f.name}>{f.label}</Label>
          <Input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            placeholder={f.placeholder}
            required={f.required ?? true}
            minLength={f.minLength}
            defaultValue={f.defaultValue}
            readOnly={f.readOnly}
          />
        </div>
      ))}
      {state?.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-1">
        {pending && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
