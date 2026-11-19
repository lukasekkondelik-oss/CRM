import { createClient } from "@/lib/supabase/client";
import type { Deal, Label } from "@/lib/types";
import { LABEL_COLORS, type OrgLite, type PersonLite } from "./helpers";

/** Mutace běží v prohlížeči pod uživatelskou session – bezpečnost zajišťuje RLS. */

export async function insertDeal(input: Partial<Deal> & Pick<Deal, "pipeline_id" | "stage_id" | "title">) {
  const { data, error } = await createClient().from("deals").insert(input).select().single();
  if (error) throw error;
  return data as Deal;
}

export async function updateDeals(ids: string[], patch: Partial<Deal>) {
  const { error } = await createClient().from("deals").update(patch).in("id", ids);
  if (error) throw error;
}

export async function deleteDeals(ids: string[]) {
  const { error } = await createClient().from("deals").delete().in("id", ids);
  if (error) throw error;
}

export async function createOrgQuick(name: string): Promise<OrgLite> {
  const { data, error } = await createClient()
    .from("organizations")
    .insert({ name: name.trim() })
    .select("id, name")
    .single();
  if (error) throw error;
  return data as OrgLite;
}

/** „Jan Novák“ -> jméno Jan, příjmení Novák; jedno slovo = příjmení. */
export async function createPersonQuick(fullName: string, organization_id?: string | null): Promise<PersonLite> {
  const parts = fullName.trim().split(/\s+/);
  const last_name = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const first_name = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  const { data, error } = await createClient()
    .from("persons")
    .insert({ first_name, last_name, organization_id: organization_id ?? null })
    .select("id, first_name, last_name, organization_id")
    .single();
  if (error) throw error;
  return data as PersonLite;
}

export async function createLabelQuick(name: string, count: number): Promise<Label> {
  const { data, error } = await createClient()
    .from("labels")
    .insert({ name: name.trim(), color: LABEL_COLORS[count % LABEL_COLORS.length] })
    .select()
    .single();
  if (error) throw error;
  return data as Label;
}
