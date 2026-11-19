import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "../auth-form";
import { register } from "../actions";

export const metadata: Metadata = { title: "Registrace" };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Vytvořit účet</CardTitle>
        <CardDescription>Připravíme ti workspace a výchozí prodejní pipeline.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <AuthForm
          action={register}
          submitLabel="Vytvořit účet"
          fields={[
            { name: "full_name", label: "Jméno a příjmení", autoComplete: "name", placeholder: "Jan Novák" },
            {
              name: "workspace_name",
              label: "Název firmy / workspace",
              placeholder: "Moje agentura",
              required: false,
            },
            { name: "email", label: "E-mail", type: "email", autoComplete: "email", placeholder: "jan@firma.cz" },
            {
              name: "password",
              label: "Heslo (min. 8 znaků)",
              type: "password",
              autoComplete: "new-password",
              minLength: 8,
            },
          ]}
        />
        <p className="text-center text-sm text-muted-foreground">
          Už máš účet?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Přihlas se
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
