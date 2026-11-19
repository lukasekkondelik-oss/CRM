"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string } | undefined;

function translate(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Nesprávný e-mail nebo heslo.";
    case "email_not_confirmed":
      return "E-mail ještě není potvrzený. Klikni na odkaz v potvrzovacím e-mailu.";
    case "user_already_exists":
    case "email_exists":
      return "Tento e-mail je už zaregistrovaný. Zkus se přihlásit.";
    case "weak_password":
      return "Heslo je příliš slabé. Použij alespoň 8 znaků.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Příliš mnoho pokusů. Zkus to prosím za chvíli.";
    default:
      return error.message || "Něco se nepovedlo. Zkus to prosím znovu.";
  }
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = str(formData, "email");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Vyplň e-mail i heslo." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translate(error) };
  redirect("/pipeline");
}

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const fullName = str(formData, "full_name");
  const workspaceName = str(formData, "workspace_name");
  const email = str(formData, "email");
  const inviteToken = str(formData, "invite_token");
  const password = String(formData.get("password") ?? "");

  if (!fullName || !email) return { error: "Vyplň jméno a e-mail." };
  if (password.length < 8) return { error: "Heslo musí mít alespoň 8 znaků." };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  const supabase = await createClient();

  // Pozvánka: znovu ověřit na serveru a hlídat, že se e-mail shoduje (trigger v DB to ověří také)
  if (inviteToken) {
    const { data: inv } = await supabase.rpc("get_invitation", { p_token: inviteToken });
    const invitation = Array.isArray(inv) ? inv[0] : null;
    if (!invitation) return { error: "Pozvánka je neplatná nebo vypršela. Požádej admina o novou." };
    if (String(invitation.email).toLowerCase() !== email.toLowerCase()) return { error: `Pozvánka je pro e-mail ${invitation.email}.` };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: inviteToken
        ? { full_name: fullName, invite_token: inviteToken }
        : { full_name: fullName, workspace_name: workspaceName || `${fullName} – firma` },
      emailRedirectTo: `${proto}://${host}/auth/callback`,
    },
  });
  if (error) return { error: inviteToken && /database error/i.test(error.message) ? "Pozvánku se nepodařilo použít (vypršela nebo je pro jiný e-mail)." : translate(error) };

  // Supabase u již existujícího e-mailu vrací uživatele bez identit (kvůli ochraně soukromí).
  if (data.user && data.user.identities?.length === 0) {
    return { error: "Tento e-mail je už zaregistrovaný. Zkus se přihlásit." };
  }
  if (data.session) redirect("/pipeline");
  return { message: "Účet je vytvořený. Potvrď e-mail odkazem, který jsme ti poslali, a pak se přihlas." };
}
