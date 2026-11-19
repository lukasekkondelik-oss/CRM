import type { Deal, Stage } from "@/lib/types";

/** Deal + data odvozená pro zobrazení. */
export interface DealVM extends Deal {
  labelIds: string[];
  openActivities: number;
  /** nejbližší termín nedokončené aktivity (YYYY-MM-DD) nebo null */
  nextDue: string | null;
}

export interface Member { id: string; full_name: string; avatar_url: string | null }
export interface PersonLite { id: string; first_name: string; last_name: string; organization_id: string | null }
export interface OrgLite { id: string; name: string }

export const personName = (p?: Pick<PersonLite, "first_name" | "last_name"> | null) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : "";

/** Dnešní datum v Praze jako YYYY-MM-DD (shodné na serveru i v prohlížeči). */
export function todayInPrague(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(date);
}

export type NextState = "planned" | "overdue" | "none";

/** Zelená = naplánováno, červená = po termínu, žlutá = žádná další aktivita. */
export function nextState(d: Pick<DealVM, "openActivities" | "nextDue">, today: string): NextState {
  if (d.openActivities === 0) return "none";
  if (d.nextDue && d.nextDue < today) return "overdue";
  return "planned";
}

export function daysInStage(d: Pick<Deal, "stage_changed_at">, now: number): number {
  return Math.floor((now - new Date(d.stage_changed_at).getTime()) / 86_400_000);
}

/** Otevřený deal je ve fázi déle než rotting_days. */
export function isRotting(d: Deal, stage: Stage | undefined, now: number): boolean {
  if (d.status !== "open" || !stage?.rotting_days) return false;
  return daysInStage(d, now) > stage.rotting_days;
}

/** Pozice mezi dvěma sousedy (zlomkové řazení, ukládá se jediný řádek). */
export function positionBetween(prev?: number, next?: number): number {
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + 1;
  if (next !== undefined) return next - 1;
  return 0;
}

export const LABEL_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#64748b"];

export const LOST_REASONS = ["Cena", "Zvolili konkurenci", "Bez rozpočtu", "Bez odezvy", "Špatný timing", "Nevhodný lead"];

export const ACTIVITY_TYPES = {
  call: "Hovor",
  meeting: "Schůzka",
  task: "Úkol",
  email: "E-mail",
  deadline: "Deadline",
} as const;
