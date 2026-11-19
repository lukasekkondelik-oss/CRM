import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "../auth-form";
import { login } from "../actions";

export const metadata: Metadata = { title: "Přihlášení" };

export default function LoginPage() {
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
          fields={[
            { name: "email", label: "E-mail", type: "email", autoComplete: "email", placeholder: "jan@firma.cz" },
            { name: "password", label: "Heslo", type: "password", autoComplete: "current-password" },
          ]}
        />
        <p className="text-center text-sm text-muted-foreground">
          Nemáš účet?{" "}
          <Link href="/registrace" className="font-medium text-primary hover:underline">
            Zaregistruj se
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
