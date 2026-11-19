"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, CalendarDays, CheckCircle2, Circle, List, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { addDays, formatLongDay, relativeDay, weekStart } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import type { DealLite } from "@/lib/data/activities";
import { ACTIVITY_TYPES, personName, type Member, type PersonLite } from "@/lib/deals/helpers";
import type { Activity, ActivityType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActivityDialog, TYPE_ICON, type DealRef, type DialogMode } from "./activity-dialog";
import { ActivityCalendar, type CalMode } from "./calendar";

type Tab = "today" | "overdue" | "week" | "all";
const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "Dnes" },
  { key: "overdue", label: "Po termínu" },
  { key: "week", label: "Tento týden" },
  { key: "all", label: "Vše" },
];

interface Props {
  initial: Activity[];
  deals: DealLite[];
  persons: PersonLite[];
  members: Member[];
  userId: string;
  today: string;
}

interface DialogState { mode: DialogMode; activity?: Activity; deal?: DealRef | null; link?: { person_id: string | null; organization_id: string | null }; defaultDate?: string; defaultType?: ActivityType }

export function ActivitiesView({ initial, deals: initialDeals, persons, members, userId, today }: Props) {
  const router = useRouter();
  const [activities, setActivities] = useState(initial);
  const [deals, setDeals] = useState(initialDeals);
  const [tab, setTab] = useState<Tab>("today");
  const [type, setType] = useState<"" | ActivityType>("");
  const [mine, setMine] = useState(true);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [calMode, setCalMode] = useState<CalMode>("week");
  const [anchor, setAnchor] = useState(today);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [showDone, setShowDone] = useState(false);

  const dealMap = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const personMap = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const visible = useMemo(
    () => activities.filter((a) => (!mine || a.assigned_to === userId) && (!type || a.type === type)),
    [activities, mine, type, userId],
  );
  const open = useMemo(() => visible.filter((a) => !a.done), [visible]);
  const done = useMemo(() => visible.filter((a) => a.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")), [visible]);

  const ws = weekStart(today), we = addDays(ws, 6);
  const filters: Record<Tab, (a: Activity) => boolean> = {
    today: (a) => a.due_date === today,
    overdue: (a) => !!a.due_date && a.due_date < today,
    week: (a) => !!a.due_date && a.due_date >= ws && a.due_date <= we,
    all: () => true,
  };
  const counts = Object.fromEntries(TABS.map((t) => [t.key, open.filter(filters[t.key]).length])) as Record<Tab, number>;

  const listItems = useMemo(
    () => open.filter(filters[tab]).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || (a.due_time ?? "99").localeCompare(b.due_time ?? "99")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, tab, today],
  );
  const groups = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of listItems) m.set(a.due_date ?? "none", [...(m.get(a.due_date ?? "none") ?? []), a]);
    return [...m.entries()];
  }, [listItems]);

  /** Označení hotovo/nehotovo; po dokončení nabídne naplánování dalšího kroku. */
  async function setDone(a: Activity, isDone: boolean) {
    const before = a;
    setActivities((as) => as.map((x) => (x.id === a.id ? { ...x, done: isDone, done_at: isDone ? new Date().toISOString() : null } : x)));
    const { error } = await createClient().from("activities").update({ done: isDone }).eq("id", a.id);
    if (error) {
      setActivities((as) => as.map((x) => (x.id === a.id ? before : x)));
      return void toast.error("Aktivitu se nepodařilo uložit.");
    }
    router.refresh(); // obnoví odznak v navigaci
    if (!isDone) return;
    const deal = a.deal_id ? dealMap.get(a.deal_id) : undefined;
    if (deal && deal.status !== "open") return; // uzavřený deal další krok nepotřebuje
    setDialog({
      mode: "next", defaultType: a.type,
      deal: deal ? { id: deal.id, title: deal.title, person_id: deal.person_id, organization_id: deal.organization_id } : null,
      link: { person_id: a.person_id, organization_id: a.organization_id },
    });
  }

  function saved(a: Activity, deal?: DealRef | null) {
    setActivities((as) => (as.some((x) => x.id === a.id) ? as.map((x) => (x.id === a.id ? a : x)) : [...as, a]));
    if (deal) setDeals((ds) => (ds.some((d) => d.id === deal.id) ? ds : [...ds, { ...deal, status: "open" }]));
    router.refresh();
  }

  const newBtn = (
    <Button size="lg" onClick={() => setDialog({ mode: "create", defaultDate: tab === "today" || tab === "overdue" ? today : undefined })}>
      <Plus /> Nová aktivita
    </Button>
  );

  const Row = ({ a }: { a: Activity }) => {
    const Icon = TYPE_ICON[a.type];
    const deal = a.deal_id ? dealMap.get(a.deal_id) : undefined;
    const person = a.person_id ? personMap.get(a.person_id) : undefined;
    const owner = a.assigned_to ? memberMap.get(a.assigned_to) : undefined;
    const overdue = !a.done && !!a.due_date && a.due_date < today;
    return (
      <li className="flex items-center gap-3 px-3 py-2.5">
        <button type="button" aria-label={a.done ? "Vrátit mezi nedokončené" : "Označit jako hotové"} onClick={() => setDone(a, !a.done)}
          className={cn("shrink-0", a.done ? "text-success" : "text-muted-foreground hover:text-success")}>
          {a.done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
        </button>
        <Icon className={cn("size-4 shrink-0", overdue ? "text-danger" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => setDialog({ mode: "edit", activity: a })} className={cn("block max-w-full truncate text-left text-sm font-medium hover:text-primary", a.done && "text-muted-foreground line-through")}>
            {a.subject}
          </button>
          <p className="truncate text-xs text-muted-foreground">
            {ACTIVITY_TYPES[a.type]}
            {deal && <> · <Link href={`/dealy/${deal.id}`} className="hover:text-primary hover:underline">{deal.title}</Link></>}
            {person && <> · <Link href={`/osoby/${person.id}`} className="hover:text-primary hover:underline">{personName(person)}</Link></>}
          </p>
        </div>
        {a.due_time && <span className={cn("text-xs tabular-nums", overdue ? "text-danger" : "text-muted-foreground")}>{a.due_time.slice(0, 5)}</span>}
        {owner && <Avatar name={owner.full_name} src={owner.avatar_url} className="size-6 text-[10px]" />}
      </li>
    );
  };

  const groupLabel = (key: string) => {
    if (key === "none") return "Bez termínu";
    const rel = relativeDay(key, today);
    return ["Dnes", "Zítra", "Včera"].includes(rel) ? `${rel} · ${formatLongDay(key)}` : formatLongDay(key);
  };

  const emptyMsg: Record<Tab, [string, string]> = {
    today: ["Na dnešek nemáš nic naplánováno", "Super – nebo je čas naplánovat další kroky u svých dealů."],
    overdue: ["Nic po termínu", "Všechno máš včas. Tak to má být."],
    week: ["Tento týden je prázdný", "Naplánuj hovor nebo schůzku a drž obchod v pohybu."],
    all: ["Zatím žádné aktivity", "Aktivity plánuj přímo u dealů nebo tlačítkem Nová aktivita."],
  };

  return (
    <>
      <PageHeader
        title="Aktivity"
        description="Co máš dnes udělat – hovory, schůzky, úkoly a termíny."
        actions={
          <>
            <div className="flex rounded-lg border bg-card p-0.5" role="group" aria-label="Zobrazení">
              {([["list", List, "Seznam"], ["calendar", CalendarDays, "Kalendář"]] as const).map(([v, Icon, label]) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                  className={cn("flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium", view === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            {newBtn}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === "list" && (
          <div className="flex flex-wrap rounded-lg border bg-card p-0.5" role="tablist" aria-label="Období">
            {TABS.map((t) => (
              <button key={t.key} role="tab" type="button" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={cn("flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium", tab === t.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
                <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", t.key === "overdue" && counts.overdue > 0 ? "bg-danger text-white" : "bg-muted text-muted-foreground")}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
        )}
        <Select value={type} onChange={(e) => setType(e.target.value as "" | ActivityType)} className="h-9 w-40" aria-label="Typ aktivity">
          <option value="">Všechny typy</option>
          {(Object.keys(ACTIVITY_TYPES) as ActivityType[]).map((k) => <option key={k} value={k}>{ACTIVITY_TYPES[k]}</option>)}
        </Select>
        <button type="button" aria-pressed={mine} onClick={() => setMine((m) => !m)}
          className={cn("h-9 rounded-lg border px-3 text-sm font-medium transition-colors", mine ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-muted")}>
          Jen moje
        </button>
      </div>

      {view === "calendar" ? (
        <ActivityCalendar
          activities={visible} today={today} mode={calMode} anchor={anchor} onMode={setCalMode} onAnchor={setAnchor}
          onOpen={(a) => setDialog({ mode: "edit", activity: a })}
          onAdd={(date) => setDialog({ mode: "create", defaultDate: date })}
        />
      ) : listItems.length === 0 && !(tab === "all" && done.length > 0) ? (
        <EmptyState icon={CalendarCheck} title={emptyMsg[tab][0]} description={emptyMsg[tab][1]} action={newBtn} />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([key, items]) => (
            <section key={key} aria-label={groupLabel(key)}>
              <h2 className={cn("mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide", key !== "none" && key < today ? "text-danger" : "text-muted-foreground")}>
                {groupLabel(key)} <Badge variant="muted">{items.length}</Badge>
              </h2>
              <ul className="divide-y rounded-xl border bg-card shadow-card">{items.map((a) => <Row key={a.id} a={a} />)}</ul>
            </section>
          ))}
          {tab === "all" && done.length > 0 && (
            <section aria-label="Hotové">
              <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hotovo – posledních 30 dní ({done.length})</h2>
              <ul className="divide-y rounded-xl border bg-card shadow-card">{(showDone ? done : done.slice(0, 5)).map((a) => <Row key={a.id} a={a} />)}</ul>
              {done.length > 5 && <button type="button" onClick={() => setShowDone((s) => !s)} className="mt-2 px-1 text-sm text-primary hover:underline">{showDone ? "Zobrazit méně" : `Zobrazit vše (${done.length})`}</button>}
            </section>
          )}
        </div>
      )}

      <ActivityDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        mode={dialog?.mode ?? "create"}
        members={members}
        userId={userId}
        today={today}
        activity={dialog?.activity}
        deal={dialog?.deal}
        dealTitle={dialog?.activity?.deal_id ? dealMap.get(dialog.activity.deal_id)?.title : null}
        link={dialog?.link}
        defaultDate={dialog?.defaultDate}
        defaultType={dialog?.defaultType}
        onSaved={saved}
        onDeleted={(id) => { setActivities((as) => as.filter((a) => a.id !== id)); router.refresh(); }}
        onComplete={(a) => setDone(a, true)}
      />
    </>
  );
}
