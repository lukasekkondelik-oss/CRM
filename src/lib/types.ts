// Ručně psané typy řádků (odpovídají supabase/migrations). Po připojení projektu lze nahradit
// generovanými: `supabase gen types typescript`.
export type Role = "admin" | "member";
export type DealStatus = "open" | "won" | "lost";
export type ActivityType = "call" | "meeting" | "task" | "email" | "deadline";

export interface Workspace { id: string; name: string; created_at: string }
export interface Profile {
  id: string; workspace_id: string; full_name: string; email: string | null;
  role: Role; avatar_url: string | null; created_at: string;
}
export interface Pipeline { id: string; workspace_id: string; name: string; position: number }
export interface Stage {
  id: string; pipeline_id: string; name: string; position: number;
  probability: number; rotting_days: number | null;
}
export interface Organization {
  id: string; workspace_id: string; name: string; ico: string | null; web: string | null;
  address: string | null; owner_id: string | null; created_at: string;
}
export interface Person {
  id: string; workspace_id: string; organization_id: string | null; first_name: string;
  last_name: string; email: string | null; phone: string | null; position: string | null; web: string | null;
  owner_id: string | null; created_at: string;
}
export interface Deal {
  id: string; workspace_id: string; pipeline_id: string; stage_id: string; title: string;
  value: number; currency: string; person_id: string | null; organization_id: string | null;
  owner_id: string | null; expected_close_date: string | null; status: DealStatus;
  lost_reason: string | null; won_at: string | null; lost_at: string | null;
  stage_changed_at: string; position: number; created_at: string; updated_at: string;
}
export interface Activity {
  id: string; workspace_id: string; type: ActivityType; subject: string; note: string | null;
  due_date: string | null; due_time: string | null; duration_min: number | null; done: boolean;
  done_at: string | null; deal_id: string | null; person_id: string | null;
  organization_id: string | null; assigned_to: string | null; created_at: string;
}
export interface Note {
  id: string; workspace_id: string; content: string; deal_id: string | null;
  person_id: string | null; organization_id: string | null; author_id: string | null; created_at: string;
}
export interface Label { id: string; workspace_id: string; name: string; color: string }
export interface DealHistory {
  id: string; deal_id: string; field: string; old_value: string | null;
  new_value: string | null; changed_by: string | null; changed_at: string;
}
