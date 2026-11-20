import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { addParams } from "@/lib/oauth/pure";
import { createClient } from "@/lib/supabase/server";
import { decide } from "./actions";
import { validateAuthRequest } from "./validate";

export const metadata: Metadata = { title: "Povolit přístup" };

type SP = Record<string, string | string[] | undefined>;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Brand className="mb-8 text-lg" />
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-card">{children}</div>
    </div>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const v = await validateAuthRequest(sp);

  if (!v.ok) {
    // Chyby bez důvěryhodného redirect URI se jen zobrazí; ostatní se vrátí klientovi podle RFC 6749
    if ("redirect" in v) redirect(addParams(v.redirect.uri, { error: v.redirect.error, error_description: v.redirect.description, state: v.redirect.state }));
    return (
      <Shell>
        <div role="alert" className="flex gap-3 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" />
          <div><p className="font-semibold">Připojení nejde dokončit</p><p className="mt-1 text-muted-foreground">{"fatal" in v ? v.fatal : ""}</p></div>
        </div>
      </Shell>
    );
  }
  const { req } = v;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, val]) => (typeof val === "string" ? [[k, val] as [string, string]] : [])));
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs.toString()}`)}`);
  }
  const { data: profile } = await supabase.from("profiles").select("full_name, workspaces(name)").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");
  const ws = Array.isArray(profile.workspaces) ? profile.workspaces[0] : profile.workspaces;
  const host = new URL(req.redirectUri).host;
  // Název si při dynamické registraci volí kdokoli → důvěryhodnost se pozná podle adresy, kam se vrátíme
  const verified = ["claude.ai", "claude.com"].some((h) => host === h || host.endsWith(`.${h}`));
  const writeAllowed = req.scopes.length === 0 || req.scopes.includes("write");

  return (
    <Shell>
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"><ShieldCheck className="size-5" /></span>
        <div>
          <h1 className="text-lg font-semibold leading-tight">„{req.clientName}“ žádá o přístup k nexdeals</h1>
          <p className="mt-1 text-sm text-muted-foreground">Přihlášen jako <b>{profile.full_name || user.email}</b> · {ws?.name && <>workspace <b>{ws.name}</b></>}</p>
        </div>
      </div>

      {verified ? (
        <p className="mb-5 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success"><ShieldCheck className="size-4 shrink-0" /> Ověřená aplikace Claude ({host})</p>
      ) : (
        <p role="alert" className="mb-5 flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span><b>Neověřená aplikace.</b> Po schválení se vrátíš na <b>{host}</b>. Pokračuj jen tehdy, když jsi připojení sám právě spustil a adresu znáš.</span>
        </p>
      )}

      <form action={decide} className="flex flex-col gap-5">
        <input type="hidden" name="client_id" value={req.clientId} />
        <input type="hidden" name="redirect_uri" value={req.redirectUri} />
        <input type="hidden" name="code_challenge" value={req.codeChallenge} />
        <input type="hidden" name="state" value={req.state ?? ""} />
        <input type="hidden" name="resource" value={req.resource ?? ""} />
        <input type="hidden" name="scope" value={req.scopes.join(" ")} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Co smí aplikace dělat?</legend>
          <label className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/60">
            <input type="radio" name="grant" value="read" defaultChecked={!writeAllowed} className="mt-1" />
            <span className="text-sm"><b>Jen čtení</b><br /><span className="text-muted-foreground">Prohlížet dealy, kontakty, aktivity a přehledy.</span></span>
          </label>
          {writeAllowed && (
            <label className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-accent/60">
              <input type="radio" name="grant" value="write" defaultChecked className="mt-1" />
              <span className="text-sm"><b>Čtení a zápis</b><br /><span className="text-muted-foreground">Navíc vytvářet a upravovat dealy, kontakty, aktivity a poznámky. Mazat záznamy nemůže.</span></span>
            </label>
          )}
        </fieldset>

        <p className="text-xs text-muted-foreground">Přístup můžeš kdykoli odvolat v Nastavení → API a Claude.</p>

        <div className="flex gap-2">
          <Button type="submit" name="decision" value="approve" size="lg" className="flex-1">Povolit</Button>
          <Button type="submit" name="decision" value="deny" variant="outline" size="lg">Zamítnout</Button>
        </div>
      </form>
    </Shell>
  );
}
