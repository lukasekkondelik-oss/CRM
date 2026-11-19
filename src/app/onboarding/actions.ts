"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createWorkspace(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const name = String(formData.get("workspace_name") ?? "").trim();
  if (!name) return { error: "Zadej název workspace." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("ensure_workspace", { p_workspace_name: name });
  if (error) return { error: "Workspace se nepodařilo vytvořit. Zkus to prosím znovu." };
  redirect("/pipeline");
}
