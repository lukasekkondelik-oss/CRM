"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Calendar, Flag, ListChecks, Loader2, Mail, Phone, StickyNote, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format";
import { ACTIVITY_TYPES, type Member } from "@/lib/deals/helpers";
import type { Activity, ActivityType, Deal, Note } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<ActivityType, typeof Phone> = { call: Phone, meeting: Users, task: ListChecks, email: Mail, deadline: Flag };

interface Props {
  activities: Activity[];
  notes: Note[];
  deals: Deal[];
  members: Member[];
  today: string;
  /** ke komu se nová poznámka váže */
  target: { person_id?: string; organization_id?: string };
}

export function ContactFeed({ activities, notes: initialNotes, deals, members, today, target }: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const dealTitle = new Map(deals.map((d) => [d.id, d.title]));
  const who = (id: string | null) => (id ? members.find((m) => m.id === id)?.full_name ?? "Neznámý" : "API");

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    const { data, error } = await createClient().from("notes").insert({ content: content.trim(), ...target }).select().single();
    setBusy(false);
    if (error) return void toast.error("Poznámku se nepodařilo uložit.");
    setNotes((n) => [data as Note, ...n]);
    setContent("");
  }

  const planned = useMemo(
    () => activities.filter((a) => !a.done).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")),
    [activities],
  );
  const timeline = useMemo(() => {
    const items = [
      ...activities.filter((a) => a.done).map((a) => ({ id: "a" + a.id, at: a.done_at ?? a.created_at, a, n: null as Note | null })),
      ...notes.map((n) => ({ id: "n" + n.id, at: n.created_at, a: null as Activity | null, n })),
    ];
    return items.sort((x, y) => y.at.localeCompare(x.at));
  }, [activities, notes]);

  const dealLink = (id: string | null) =>
    id && dealTitle.has(id) ? <> · <Link href={`/dealy/${id}`} className="text-primary hover:underline">{dealTitle.get(id)}</Link></> : null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><Calendar className="size-4" /> Plánované aktivity <Badge variant="muted">{planned.length}</Badge></CardTitle></CardHeader>
        <CardContent>
          {planned.length === 0 ? <p className="text-sm text-muted-foreground">Žádné naplánované aktivity. Plánují se v detailu dealu.</p> : (
            <ul className="divide-y">
              {planned.map((a) => {
                const Icon = ICON[a.type];
                const overdue = !!a.due_date && a.due_date < today;
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <Icon className={cn("size-4 shrink-0", overdue ? "text-danger" : "text-muted-foreground")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.subject}</p>
                      <p className="text-xs text-muted-foreground">{ACTIVITY_TYPES[a.type]} · {who(a.assigned_to)}{dealLink(a.deal_id)}</p>
                    </div>
                    <span className={cn("whitespace-nowrap text-xs", overdue ? "font-medium text-danger" : "text-muted-foreground")}>{a.due_date ? formatDate(a.due_date) : "bez termínu"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>Poznámky a historie</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={addNote} className="mb-5 flex flex-col gap-2">
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Napiš poznámku…" aria-label="Nová poznámka" />
            <div><Button type="submit" size="sm" disabled={!content.trim() || busy}>{busy && <Loader2 className="animate-spin" />} Uložit poznámku</Button></div>
          </form>
          {timeline.length === 0 ? <p className="text-sm text-muted-foreground">Zatím nic. Poznámky a hotové aktivity se zobrazí tady.</p> : (
            <ol className="flex flex-col gap-3">
              {timeline.map(({ id, at, a, n }) => (
                <li key={id} className="flex items-start gap-3 text-sm">
                  {a ? (() => { const Icon = ICON[a.type]; return <Icon className="mt-0.5 size-4 shrink-0 text-success" />; })() : <StickyNote className="mt-0.5 size-4 shrink-0 text-warning" />}
                  <div className="min-w-0 flex-1">
                    {a ? <p>Hotovo: <b>{a.subject}</b> <span className="text-muted-foreground">({ACTIVITY_TYPES[a.type]}){dealLink(a.deal_id)}</span></p>
                       : <p><span className="whitespace-pre-wrap break-words">{n!.content}</span> <span className="text-xs text-muted-foreground">· {who(n!.author_id)}{dealLink(n!.deal_id)}</span></p>}
                  </div>
                  <time className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(at)}</time>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
