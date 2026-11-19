import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Nastavení workspace" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (profile) redirect("/pipeline");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Brand className="mb-8 text-lg" />
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-card">
        <h1 className="text-xl font-semibold">Pojďme si nastavit workspace</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">
          Tvůj účet ještě nemá workspace. Vytvoříme ho spolu s výchozí prodejní pipeline.
        </p>
        <OnboardingForm />
      </div>
    </div>
  );
}
