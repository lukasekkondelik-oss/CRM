import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { AuthForm, type Field } from "../auth-form";
import { register } from "../actions";
import { sanitizeNext } from "@/lib/oauth/pure";

export const metadata: Metadata = { title: "Registrace" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string; next?: string }> }) {
  const { invite, next: nextRaw } = await searchParams;
  const next = sanitizeNext(nextRaw);

  // Pozvánka: ověříme token (veřejná funkce vrací jen e-mail, roli a název workspace)
  let invitation: { email: string; role: string; workspace_name: string } | null = null;
  if (invite && UUID.test(invite)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_invitation", { p_token: invite });
    invitation = Array.isArray(data) && data[0] ? data[0] : null;
  }
  const invalidInvite = !!invite && !invitation;

  const fields: Field[] = invitation
    ? [
        { name: "full_name", label: "Jméno a příjmení", autoComplete: "name", placeholder: "Jan Novák" },
        { name: "email", label: "E-mail (z pozvánky)", type: "email", defaultValue: invitation.email, readOnly: true },
        { name: "password", label: "Heslo (min. 8 znaků)", type: "password", autoComplete: "new-password", minLength: 8 },
      ]
    : [
        { name: "full_name", label: "Jméno a příjmení", autoComplete: "name", placeholder: "Jan Novák" },
        { name: "workspace_name", label: "Název firmy / workspace", placeholder: "Moje agentura", required: false },
        { name: "email", label: "E-mail", type: "email", autoComplete: "email", placeholder: "jan@firma.cz" },
        { name: "password", label: "Heslo (min. 8 znaků)", type: "password", autoComplete: "new-password", minLength: 8 },
      ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{invitation ? "Přijmout pozvánku" : "Vytvořit účet"}</CardTitle>
        <CardDescription>
          {invitation ? <>Připojíš se do workspace <b>{invitation.workspace_name}</b> jako {invitation.role === "admin" ? "admin" : "člen"}.</> : "Připravíme ti workspace a výchozí prodejní pipeline."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {invalidInvite && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            Pozvánka je neplatná, už byla použita nebo vypršela. Požádej admina o novou, nebo si <Link href="/registrace" className="font-medium underline">vytvoř vlastní workspace</Link>.
          </p>
        )}
        {!invalidInvite && (
          <AuthForm action={register} submitLabel={invitation ? "Připojit se" : "Vytvořit účet"} fields={fields} hidden={{ ...(invitation ? { invite_token: invite! } : {}), ...(next ? { next } : {}) }} />
        )}
        <p className="text-center text-sm text-muted-foreground">
          Už máš účet? <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-accent-foreground hover:underline">Přihlas se</Link>
        </p>
      </CardContent>
    </Card>
  );
}
