"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Calendar, CheckCircle2, Circle, Clock, History, Loader2, Mail, MessageSquare, Phone, Plus, StickyNote, Users, Flag, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatCZK, formatDate, formatDateTime } from "@/lib/format";
import { ACTIVITY_TYPES, type Member } from "@/lib/deals/helpers";
import type { Activity, ActivityType, Deal, DealHistory, Note } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<ActivityType, typeof Phone> = { call: Phone, meeting: Users, task: ListChecks, email: Mail, deadline: Flag };
const STATUS_LABEL = { open: "Otevřený", won: "Vyhráno", lost: "Prohráno" } as const;

function historyText(h: DealHistory): string {
  const nz = (v: string | null) => v ?? "—";
  switch (h.field) {
    case "created": return `Deal vytvořen`;
    case "stage_id": return `Fáze: ${nz(h.old_value)} → ${nz(h.new_value)}`;
    case "value": return `Hodnota: ${formatCZK(h.old_value)} → ${formatCZK(h.new_value)}`;
    case "owner_id": return `Vlastník: ${h.old_value ?? "nikdo"} → ${h.new_value ?? "nikdo"}`;
    case "status": return `Stav: ${STATUS_LABEL[h.old_value as keyof typeof STATUS_LABEL] ?? nz(h.old_value)} → ${STATUS_LABEL[h.new_value as keyof typeof STATUS_LABEL] ?? nz(h.new_value)}`;
    case "lost_reason": return `Důvod prohry: ${nz(h.new_value)}`;
    default: return `${h.field}: ${nz(h.old_value)} → ${nz(h.new_value)}`;
  }
}

interface Props {
  deal: Deal;
  activities: Activity[];
  setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  history: DealHistory[];
  members: Member[];
  userId: string;
  today: string;
}

export function DealActivity({ deal, activities, setActivities, notes, setNotes, history, members, userId, today }: Props) {
  const [tab, setTab] = useState<"activity" | "note" | "history">("activity");
  const [showAllDone, setShowAllDone] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.full_name ?? "Neznámý";

  const planned = useMemo(
    () => activities.filter((a) => !a.done).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || (a.due_time ?? "").localeCompare(b.due_time ?? "")),
    [activities],
  );
  const done = useMemo(
    () => activities.filter((a) => a.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")),
    [activities],
  );

  async function toggleDone(a: Activity) {
    const next = !a.done;
    const stamp = next ? new Date().toISOString() : null;
    setActivities((as) => as.map((x) => (x.id === a.id ? { ...x, done: next, done_at: stamp } : x)));
    const { error } = await createClient().from("activities").update({ done: next }).eq("id", a.id);
    if (error) {
      setActivities((as) => as.map((x) => (x.id === a.id ? a : x)));
      toast.error("Aktivitu se nepodařilo uložit.");
      return;
    }
    if (next && planned.length === 1 && deal.status === "open") {
      toast.warning("Deal teď nemá další krok.", {
        action: { label: "Naplánovat", onClick: () => { setTab("activity"); setTimeout(() => subjectRef.current?.focus(), 50); } },
      });
    }
  }

  const timeline = useMemo(() => {
    type Item = { id: string; at: string; kind: "activity" | "note" | "history"; node: React.ReactNode };
    const items: Item[] = [
      ...done.map((a) => {
        const Icon = TYPE_ICON[a.type];
        return { id: "a" + a.id, at: a.done_at ?? a.created_at, kind: "activity" as const, node: <><Icon className="size-4 text-success" /><span>Hotovo: <b>{a.subject}</b> <span className="text-muted-foreground">({ACTIVITY_TYPES[a.type]})</span></span></> };
      }),
      ...notes.map((n) => ({ id: "n" + n.id, at: n.created_at, kind: "note" as const, node: <><StickyNote className="size-4 text-warning" /><span className="min-w-0"><span className="whitespace-pre-wrap break-words">{n.content}</span> <span className="text-xs text-muted-foreground">· {memberName(n.author_id)}</span></span></> })),
      ...history.map((h) => ({ id: "h" + h.id, at: h.changed_at, kind: "history" as const, node: <><History className="size-4 text-muted-foreground" /><span>{historyText(h)} <span className="text-xs text-muted-foreground">· {memberName(h.changed_by)}</span></span></> })),
    ];
    return items.sort((x, y) => y.at.localeCompare(x.at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, notes, history, members]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><Calendar className="size-4" /> Plánováno <Badge variant="muted">{planned.length}</Badge></CardTitle></CardHeader>
        <CardContent>
          {planned.length === 0 ? (
            <p className={cn("rounded-lg px-3 py-3 text-sm", deal.status === "open" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
              {deal.status === "open" ? "Bez dalšího kroku – naplánuj další aktivitu níže." : "Žádné naplánované aktivity."}
            </p>
          ) : (
            <ul className="divide-y">
              {planned.map((a) => {
                const Icon = TYPE_ICON[a.type];
                const overdue = !!a.due_date && a.due_date < today;
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <button type="button" aria-label="Označit jako hotové" onClick={() => toggleDone(a)} className="text-muted-foreground hover:text-success"><Circle className="size-5" /></button>
                    <Icon className={cn("size-4 shrink-0", overdue ? "text-danger" : "text-muted-foreground")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.subject}</p>
                      <p className="text-xs text-muted-foreground">{ACTIVITY_TYPES[a.type]} · {memberName(a.assigned_to)}</p>
                    </div>
                    <span className={cn("flex items-center gap-1 whitespace-nowrap text-xs", overdue ? "font-medium text-danger" : "text-muted-foreground")}>
                      <Clock className="size-3" /> {a.due_date ? formatDate(a.due_date) : "bez termínu"}{a.due_time ? ` ${a.due_time.slice(0, 5)}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {done.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> Hotovo <Badge variant="muted">{done.length}</Badge></CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {(showAllDone ? done : done.slice(0, 3)).map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <button type="button" aria-label="Vrátit mezi plánované" onClick={() => toggleDone(a)} className="text-success"><CheckCircle2 className="size-5" /></button>
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground line-through">{a.subject}</p>
                  <span className="text-xs text-muted-foreground">{formatDate(a.done_at)}</span>
                </li>
              ))}
            </ul>
            {done.length > 3 && <button type="button" onClick={() => setShowAllDone((s) => !s)} className="mt-2 text-sm text-primary hover:underline">{showAllDone ? "Zobrazit méně" : `Zobrazit vše (${done.length})`}</button>}
          </CardContent>
        </Card>
      )}

      <Card>
        <div role="tablist" className="flex border-b px-3">
          {([["activity", "Aktivita", Calendar], ["note", "Poznámka", MessageSquare], ["history", "Historie", History]] as const).map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
              className={cn("-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium", tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <CardContent className="pt-4">
          {tab === "activity" && <ActivityForm deal={deal} members={members} userId={userId} subjectRef={subjectRef} onCreated={(a) => setActivities((as) => [...as, a])} />}
          {tab === "note" && <NoteForm dealId={deal.id} onCreated={(n) => setNotes((ns) => [n, ...ns])} />}
          {tab === "history" && (
            history.length === 0 ? <p className="text-sm text-muted-foreground">Zatím žádné změny.</p> : (
              <ul className="flex flex-col gap-2 text-sm">
                {history.map((h) => <li key={h.id} className="flex flex-wrap justify-between gap-2"><span>{historyText(h)}</span><span className="text-xs text-muted-foreground">{memberName(h.changed_by)} · {formatDateTime(h.changed_at)}</span></li>)}
              </ul>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>Timeline</CardTitle></CardHeader>
        <CardContent>
          {timeline.length === 0 ? <p className="text-sm text-muted-foreground">Zatím nic.</p> : (
            <ol className="flex flex-col gap-3">
              {timeline.map((i) => (
                <li key={i.id} className="flex items-start gap-3 text-sm">
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">{i.node}</div>
                  <time className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(i.at)}</time>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityForm({ deal, members, userId, subjectRef, onCreated }: {
  deal: Deal; members: Member[]; userId: string; subjectRef: React.RefObject<HTMLInputElement | null>; onCreated: (a: Activity) => void;
}) {
  const [type, setType] = useState<ActivityType>("call");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [assignee, setAssignee] = useState(userId);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    setBusy(true);
    const { data, error } = await createClient().from("activities").insert({
      type, subject: subject.trim(), due_date: date || null, due_time: time || null, assigned_to: assignee || null,
      deal_id: deal.id, person_id: deal.person_id, organization_id: deal.organization_id,
    }).select().single();
    setBusy(false);
    if (error) return void toast.error("Aktivitu se nepodařilo vytvořit.");
    onCreated(data as Activity);
    setSubject(""); setDate(""); setTime("");
    toast.success("Aktivita naplánována");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
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
      <Input ref={subjectRef} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Co je další krok? (např. Zavolat ohledně nabídky)" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Termín" />
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Čas" />
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Přiřazeno">
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </Select>
      </div>
      <div><Button type="submit" disabled={!subject.trim() || busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} Naplánovat aktivitu</Button></div>
    </form>
  );
}

function NoteForm({ dealId, onCreated }: { dealId: string; onCreated: (n: Note) => void }) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    const { data, error } = await createClient().from("notes").insert({ content: content.trim(), deal_id: dealId }).select().single();
    setBusy(false);
    if (error) return void toast.error("Poznámku se nepodařilo uložit.");
    onCreated(data as Note);
    setContent("");
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Napiš poznámku…" />
      <div><Button type="submit" disabled={!content.trim() || busy}>{busy && <Loader2 className="animate-spin" />} Uložit poznámku</Button></div>
    </form>
  );
}
