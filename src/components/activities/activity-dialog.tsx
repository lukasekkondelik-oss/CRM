"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Flag, ListChecks, Loader2, Mail, Phone, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { searchDeals } from "@/lib/contacts/search";
import { addDays } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { ACTIVITY_TYPES, type Member } from "@/lib/deals/helpers";
import type { Activity, ActivityType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const TYPE_ICON: Record<ActivityType, typeof Phone> = { call: Phone, meeting: Users, task: ListChecks, email: Mail, deadline: Flag };

/** Co o dealu potřebujeme pro vazbu aktivity. */
export interface DealRef { id: string; title: string; person_id: string | null; organization_id: string | null }

export type DialogMode = "create" | "edit" | "next";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: DialogMode;
  members: Member[];
  userId: string;
  today: string;
  activity?: Activity | null;
  /** předvybraný deal (u „další aktivity“, v detailu dealu) */
  deal?: DealRef | null;
  /** deal pro zobrazení názvu u editované aktivity */
  dealTitle?: string | null;
  /** vazba na osobu/firmu pro aktivitu bez dealu (např. další krok po dokončení úkolu osoby) */
  link?: { person_id: string | null; organization_id: string | null } | null;
  defaultDate?: string;
  defaultType?: ActivityType;
  /** persistovaná aktivita po vytvoření/úpravě (`deal` je vybraný deal u nové aktivity) */
  onSaved: (a: Activity, deal?: DealRef | null) => void;
  onDeleted?: (id: string) => void;
  /** v režimu edit: tlačítko „Hotovo“ */
  onComplete?: (a: Activity) => void;
}

export function ActivityDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.open && <Form {...props} />}</DialogContent>
    </Dialog>
  );
}

const QUICK = [["Dnes", 0], ["Zítra", 1], ["Za 3 dny", 3], ["Za týden", 7], ["Za 2 týdny", 14], ["Za měsíc", 30]] as const;

function Form({ mode, members, userId, today, activity, deal: presetDeal, dealTitle, link, defaultDate, defaultType, onSaved, onDeleted, onComplete, onOpenChange }: Props) {
  const [type, setType] = useState<ActivityType>(activity?.type ?? defaultType ?? "call");
  const [subject, setSubject] = useState(activity?.subject ?? "");
  const [date, setDate] = useState(activity?.due_date ?? defaultDate ?? (mode === "next" ? addDays(today, 1) : today));
  const [time, setTime] = useState(activity?.due_time?.slice(0, 5) ?? "");
  const [duration, setDuration] = useState(activity?.duration_min ? String(activity.duration_min) : "");
  const [assignee, setAssignee] = useState(activity ? (activity.assigned_to ?? "") : userId);
  const [note, setNote] = useState(activity?.note ?? "");
  const [pickedDeal, setPickedDeal] = useState<DealRef | null>(null);
  const [dealOptions, setDealOptions] = useState<DealRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deal = presetDeal ?? pickedDeal;
  const fixedDeal = !!presetDeal || mode === "edit";
  const title = mode === "edit" ? "Upravit aktivitu" : mode === "next" ? "Naplánovat další aktivitu?" : "Nová aktivita";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || busy) return;
    setBusy(true);
    const fields = {
      type, subject: subject.trim(), note: note.trim() || null, due_date: date || null, due_time: time || null,
      duration_min: Number(duration) > 0 ? Math.round(Number(duration)) : null, assigned_to: assignee || null,
    };
    const sb = createClient();
    const res = mode === "edit" && activity
      ? await sb.from("activities").update(fields).eq("id", activity.id).select().single()
      : await sb.from("activities").insert({
          ...fields,
          deal_id: deal?.id ?? null,
          person_id: deal?.person_id ?? link?.person_id ?? null,
          organization_id: deal?.organization_id ?? link?.organization_id ?? null,
        }).select().single();
    setBusy(false);
    if (res.error || !res.data) return void toast.error("Aktivitu se nepodařilo uložit.");
    toast.success(mode === "edit" ? "Aktivita upravena" : "Aktivita naplánována");
    onSaved(res.data as Activity, deal);
    onOpenChange(false);
  }

  async function remove() {
    if (!activity) return;
    const { error } = await createClient().from("activities").delete().eq("id", activity.id);
    if (error) return void toast.error("Aktivitu se nepodařilo smazat.");
    toast.success("Aktivita smazána");
    onDeleted?.(activity.id);
    onOpenChange(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <DialogTitle>{title}</DialogTitle>
        {mode === "next" && (
          <DialogDescription>
            {presetDeal ? <>Deal <b>{presetDeal.title}</b> by měl mít vždy naplánovaný další krok.</> : "Naplánuj, co bude následovat."}
          </DialogDescription>
        )}
        {mode !== "next" && <DialogDescription className="sr-only">Formulář aktivity</DialogDescription>}
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Typ aktivity">
        {(Object.keys(ACTIVITY_TYPES) as ActivityType[]).map((k) => {
          const Icon = TYPE_ICON[k];
          return (
            <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k)}
              className={cn("flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm", type === k ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}>
              <Icon className="size-4" /> {ACTIVITY_TYPES[k]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ac-subject">Předmět *</Label>
        <Input id="ac-subject" autoFocus value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Např. Zavolat ohledně nabídky" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ac-date">Termín</Label>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map(([label, n]) => (
            <button key={label} type="button" onClick={() => setDate(addDays(today, n))}
              className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", date === addDays(today, n) ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input id="ac-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Čas" />
          <Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Délka (min)" aria-label="Délka v minutách" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ac-assignee">Přiřazeno</Label>
          <Select id="ac-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Nikomu</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Deal</Label>
          {fixedDeal ? (
            (deal?.title ?? dealTitle) ? (
              <Link href={`/dealy/${deal?.id ?? activity?.deal_id}`} className="flex h-10 items-center truncate text-sm text-accent-foreground hover:underline">{deal?.title ?? dealTitle}</Link>
            ) : <span className="flex h-10 items-center text-sm text-muted-foreground">Bez dealu</span>
          ) : (
            <Combobox
              value={pickedDeal?.id ?? null}
              options={dealOptions.map((d) => ({ id: d.id, label: d.title }))}
              search={searchDeals}
              placeholder="Bez dealu"
              onChange={(id, opt) => {
                const d = (opt?.data as DealRef | undefined) ?? null;
                if (d) setDealOptions((o) => [...o, d]);
                setPickedDeal(id ? d : null);
              }}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ac-note">Poznámka</Label>
        <Input id="ac-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Volitelné" />
      </div>

      <DialogFooter className="items-center justify-between sm:justify-between">
        <div className="flex gap-1">
          {mode === "edit" && (
            confirmDelete ? (
              <Button type="button" variant="destructive" size="sm" onClick={remove}>Opravdu smazat</Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}><Trash2 /> Smazat</Button>
            )
          )}
          {mode === "edit" && activity && !activity.done && onComplete && (
            <Button type="button" variant="outline" size="sm" onClick={() => { onComplete(activity); onOpenChange(false); }}><CheckCircle2 /> Hotovo</Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{mode === "next" ? "Přeskočit" : "Zrušit"}</Button>
          <Button type="submit" disabled={!subject.trim() || busy}>
            {busy && <Loader2 className="animate-spin" />} {mode === "edit" ? "Uložit" : "Naplánovat"}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
