"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarCheck, CircleAlert, Flame, Plus, Target, TriangleAlert, Trophy, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { TYPE_ICON } from "@/components/activities/activity-dialog";
import {
  PERIODS, computeFunnel, computeKpis, computeMonthly, dealsWithoutNextStep, monthLabel, rottingDeals,
  type DDeal, type DStage, type Period,
} from "@/lib/dashboard";
import type { DashActivity } from "@/lib/data/dashboard";
import { formatCZK } from "@/lib/format";
import { relativeDay } from "@/lib/dates";
import type { Member } from "@/lib/deals/helpers";
import type { Pipeline } from "@/lib/types";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Recharts je největší závislost → stahuje se až na dashboardu a bez SSR
const FunnelChart = dynamic(() => import("./charts").then((m) => m.FunnelChart), { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> });
const WonLostChart = dynamic(() => import("./charts").then((m) => m.WonLostChart), { ssr: false, loading: () => <Skeleton className="h-72 w-full" /> });

interface Props {
  deals: DDeal[]; stages: DStage[]; pipelines: Pipeline[]; members: Member[]; activities: DashActivity[];
  userId: string; now: number; today: string;
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Wallet; label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="size-3.5" /> {label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-[26px]">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ListCard({ title, icon: Icon, count, children, footer }: { title: string; icon: typeof Wallet; count: number; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Icon className="size-4" /> {title} <Badge variant="muted">{count}</Badge></CardTitle></CardHeader>
      <CardContent className="flex-1">{children}{footer}</CardContent>
    </Card>
  );
}

const MAX = 6;

export function DashboardView({ deals, stages, pipelines, members, activities, userId, now, today }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const [owner, setOwner] = useState("");
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");

  const f = useMemo(() => ({ period, owner }), [period, owner]);
  const kpis = useMemo(() => computeKpis(deals, stages, f, today), [deals, stages, f, today]);
  const funnel = useMemo(() => computeFunnel(deals, stages, pipelineId, owner), [deals, stages, pipelineId, owner]);
  const monthly = useMemo(() => computeMonthly(deals, f, today), [deals, f, today]);
  const rotting = useMemo(() => rottingDeals(deals, stages, owner, now), [deals, stages, owner, now]);
  const noNext = useMemo(() => dealsWithoutNextStep(deals, owner), [deals, owner]);

  const dealMap = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);
  const stageMap = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const actOwner = owner || userId;
  const actOwnerName = members.find((m) => m.id === actOwner)?.full_name;
  const todays = useMemo(
    () => activities.filter((a) => a.assigned_to === actOwner && !!a.due_date && a.due_date <= today)
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || (a.due_time ?? "").localeCompare(b.due_time ?? "")),
    [activities, actOwner, today],
  );

  const periodLabel = PERIODS.find((p) => p.key === period)!.label.toLowerCase();
  const hasAnything = deals.length > 0;
  const funnelTotal = funnel.reduce((s, r) => s + r.count, 0);
  const closedInPeriod = kpis.wonCount + kpis.lostCount;

  return (
    <>
      <PageHeader title="Dashboard" description="Přehled pipeline, výkonu a toho, co máš dnes udělat." />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="h-9 w-48" aria-label="Období">
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="h-9 w-48" aria-label="Vlastník">
          <option value="">Všichni vlastníci</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </Select>
        {pipelines.length > 1 && (
          <Select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className="h-9 w-44" aria-label="Pipeline pro funnel">
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
      </div>

      {!hasAnything ? (
        <EmptyState icon={BarChart3} title="Dashboard se zaplní, jakmile přibydou dealy"
          description="Přidej první deal na Pipeline. Hned potom uvidíš hodnotu pipeline, funnel i výsledky výher a proher."
          action={<Link href="/pipeline" className={buttonVariants()}><Plus /> Přejít na Pipeline</Link>} />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Wallet} label="Otevřená pipeline" value={formatCZK(kpis.openValue)} hint={`${kpis.openCount} otevřených dealů`} />
            <Kpi icon={Target} label="Vážená hodnota" value={formatCZK(kpis.weighted)} hint="hodnota × pravděpodobnost fáze" />
            <Kpi icon={Trophy} label={`Vyhráno – ${periodLabel}`} value={formatCZK(kpis.wonValue)} hint={`${kpis.wonCount} ${kpis.wonCount === 1 ? "vyhraný deal" : "vyhraných dealů"}`} />
            <Kpi icon={BarChart3} label={`Win rate – ${periodLabel}`} value={kpis.winRate === null ? "—" : `${kpis.winRate.toLocaleString("cs-CZ")} %`}
              hint={closedInPeriod ? `${kpis.wonCount} vyhráno / ${kpis.lostCount} prohráno` : "Zatím žádné uzavřené dealy"} />
          </div>

          <div className="mb-6 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Funnel podle fází <span className="font-normal text-muted-foreground">· otevřené dealy</span></CardTitle></CardHeader>
              <CardContent>
                {funnelTotal === 0 ? <p className="rounded-lg bg-muted px-3 py-8 text-center text-sm text-muted-foreground">Žádné otevřené dealy v téhle pipeline.</p> : <FunnelChart rows={funnel} />}
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Zobrazit jako tabulku</summary>
                  <table className="mt-2 w-full text-xs">
                    <thead><tr className="text-left text-muted-foreground"><th className="py-1">Fáze</th><th className="py-1 text-right">Dealů</th><th className="py-1 text-right">Hodnota</th></tr></thead>
                    <tbody>{funnel.map((r) => <tr key={r.id} className="border-t"><td className="py-1">{r.name}</td><td className="py-1 text-right tabular-nums">{r.count}</td><td className="py-1 text-right tabular-nums">{formatCZK(r.value)}</td></tr>)}</tbody>
                  </table>
                </details>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>Vyhrané vs prohrané <span className="font-normal text-muted-foreground">· po měsících</span></span>
                  <span className="viz-root flex items-center gap-3 text-xs font-normal text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--series-1)" }} /> Vyhráno</span>
                    <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--series-2)" }} /> Prohráno</span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="viz-root"><WonLostChart rows={monthly} /></div>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Zobrazit jako tabulku</summary>
                  <table className="mt-2 w-full text-xs">
                    <thead><tr className="text-left text-muted-foreground"><th className="py-1">Měsíc</th><th className="py-1 text-right">Vyhráno</th><th className="py-1 text-right">Prohráno</th></tr></thead>
                    <tbody>{monthly.map((r) => <tr key={r.key} className="border-t"><td className="py-1">{monthLabel(r.key)}</td><td className="py-1 text-right tabular-nums">{r.won} ({formatCZK(r.wonValue)})</td><td className="py-1 text-right tabular-nums">{r.lost} ({formatCZK(r.lostValue)})</td></tr>)}</tbody>
                  </table>
                </details>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ListCard title={owner && owner !== userId ? `Dnešní aktivity – ${actOwnerName ?? ""}` : "Moje dnešní aktivity"} icon={CalendarCheck} count={todays.length}
              footer={<Link href="/aktivity" className="mt-3 inline-block text-sm text-primary hover:underline">Všechny aktivity →</Link>}>
              {todays.length === 0 ? <p className="rounded-lg bg-muted px-3 py-4 text-sm text-muted-foreground">Na dnešek nemáš nic naplánováno ani po termínu.</p> : (
                <ul className="divide-y">
                  {todays.slice(0, MAX).map((a) => {
                    const Icon = TYPE_ICON[a.type];
                    const overdue = !!a.due_date && a.due_date < today;
                    const deal = a.deal_id ? dealMap.get(a.deal_id) : undefined;
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-2">
                        <Icon className={cn("size-4 shrink-0", overdue ? "text-danger" : "text-muted-foreground")} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.subject}</p>
                          <p className="truncate text-xs text-muted-foreground">{deal ? <Link href={`/dealy/${deal.id}`} className="hover:text-primary hover:underline">{deal.title}</Link> : "Bez dealu"}</p>
                        </div>
                        <span className={cn("whitespace-nowrap text-xs", overdue ? "font-medium text-danger" : "text-muted-foreground")}>
                          {overdue ? relativeDay(a.due_date!, today) : a.due_time ? a.due_time.slice(0, 5) : "Dnes"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {todays.length > MAX && <p className="mt-2 text-xs text-muted-foreground">+ {todays.length - MAX} dalších</p>}
            </ListCard>

            <ListCard title="Dealy bez dalšího kroku" icon={TriangleAlert} count={noNext.length}>
              {noNext.length === 0 ? <p className="rounded-lg bg-success-soft px-3 py-4 text-sm text-success">Každý otevřený deal má naplánovaný další krok.</p> : (
                <ul className="divide-y">
                  {noNext.slice(0, MAX).map((d) => (
                    <li key={d.id}>
                      <Link href={`/dealy/${d.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-primary">
                        <span className="min-w-0"><span className="block truncate text-sm font-medium">{d.title}</span><span className="text-xs text-muted-foreground">{stageMap.get(d.stage_id)?.name}</span></span>
                        <span className="flex items-center gap-2 whitespace-nowrap text-sm tabular-nums"><TriangleAlert className="size-4 text-warning" />{formatCZK(d.value)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {noNext.length > MAX && <p className="mt-2 text-xs text-muted-foreground">+ {noNext.length - MAX} dalších</p>}
            </ListCard>

            <ListCard title="Hnijící dealy" icon={Flame} count={rotting.length}>
              {rotting.length === 0 ? <p className="rounded-lg bg-success-soft px-3 py-4 text-sm text-success">Žádný deal nehnije. Pipeline se hýbe.</p> : (
                <ul className="divide-y">
                  {rotting.slice(0, MAX).map(({ deal, stage, days }) => (
                    <li key={deal.id}>
                      <Link href={`/dealy/${deal.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-primary">
                        <span className="min-w-0"><span className="block truncate text-sm font-medium">{deal.title}</span><span className="text-xs text-muted-foreground">{stage?.name} · limit {stage?.rotting_days} dní</span></span>
                        <span className="flex items-center gap-2 whitespace-nowrap text-sm"><CircleAlert className="size-4 text-danger" /><span className="font-medium text-danger">{days} dní</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {rotting.length > MAX && <p className="mt-2 text-xs text-muted-foreground">+ {rotting.length - MAX} dalších</p>}
            </ListCard>
          </div>
        </>
      )}
    </>
  );
}
