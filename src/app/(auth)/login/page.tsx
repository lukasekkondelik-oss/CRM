import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "../auth-form";
import { login } from "../actions";
import { sanitizeNext } from "@/lib/oauth/pure";

export const metadata: Metadata = { title: "Přihlášení" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = sanitizeNext((await searchParams).next);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Přihlášení</CardTitle>
        <CardDescription>Pokračuj ke svým dealům a dnešním úkolům.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <AuthForm
          action={login}
          submitLabel="Přihlásit se"
          hidden={next ? { next } : undefined}
          fields={[
            { name: "email", label: "E-mail", type: "email", autoComplete: "email", placeholder: "jan@firma.cz" },
            { name: "password", label: "Heslo", type: "password", autoComplete: "current-password" },
          ]}
        />
        <p className="text-center text-sm text-muted-foreground">
          Nemáš účet?{" "}
          <Link href={next ? `/registrace?next=${encodeURIComponent(next)}` : "/registrace"} className="font-medium text-primary hover:underline">
            Zaregistruj se
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
