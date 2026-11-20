import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Truck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { loadDelivery, type DeliveryDeal } from "@/lib/data/delivery";
import { personName, todayInPrague, type PersonLite } from "@/lib/deals/helpers";
import { relativeDay } from "@/lib/dates";
import { formatCZK, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Realizace" };

const addDays = (day: string, n: number) => new Date(Date.parse(day + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);


interface Ctx { today: string; soon: string; members: Map<string, { full_name: string; avatar_url: string | null }>; persons: Map<string, PersonLite>; orgs: Map<string, string> }

function Table({ deals, subscription, ctx }: { deals: DeliveryDeal[]; subscription?: boolean; ctx: Ctx }) {
  const { today, soon, members: memberMap, persons: personMap, orgs: orgMap } = ctx;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b bg-muted/40">
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-3 py-2.5">Deal</th>
            <th scope="col" className="px-3 py-2.5">Firma · osoba</th>
            <th scope="col" className="px-3 py-2.5 text-right">Hodnota</th>
            <th scope="col" className="px-3 py-2.5">Vlastník</th>
            <th scope="col" className="px-3 py-2.5">Další krok</th>
            <th scope="col" className="px-3 py-2.5">{subscription ? "Běží do" : "Vyhráno"}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {deals.map((d) => {
            const person = d.person_id ? personMap.get(d.person_id) : undefined;
            const orgId = d.organization_id ?? person?.organization_id;
            const owner = d.owner_id ? memberMap.get(d.owner_id) : undefined;
            const overdue = !!d.nextDue && d.nextDue < today;
            const ends = d.delivery_ends_on;
            return (
              <tr key={d.id} className="hover:bg-muted/40">
                <td className="px-3 py-2.5"><Link href={`/dealy/${d.id}`} className="font-medium hover:text-primary hover:underline">{d.title}</Link></td>
                <td className="px-3 py-2.5 text-muted-foreground">{[orgId ? orgMap.get(orgId) : null, person ? personName(person) : null].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatCZK(d.value)}</td>
                <td className="px-3 py-2.5">{owner ? <span className="flex items-center gap-2"><Avatar name={owner.full_name} src={owner.avatar_url} className="size-6 text-[10px]" /><span className="hidden xl:inline">{owner.full_name}</span></span> : "—"}</td>
                <td className="px-3 py-2.5">
                  {d.nextSubject ? (
                    <span className={cn("block max-w-[22rem] truncate", overdue && "font-medium text-danger")} title={d.nextSubject}>
                      {d.nextSubject}{d.nextDue ? <span className="text-muted-foreground"> · {relativeDay(d.nextDue, today)}</span> : null}
                    </span>
                  ) : subscription ? <span className="text-muted-foreground">—</span> : <Badge variant="warning">Bez dalšího kroku</Badge>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {subscription ? (
                    ends ? (
                      <span className="inline-flex items-center gap-1.5">
                        {formatDate(ends)}
                        {ends < today ? <Badge variant="danger">Skončilo</Badge> : ends <= soon ? <Badge variant="warning">Do 30 dní</Badge> : null}
                      </span>
                    ) : <span className="text-muted-foreground">bez data</span>
                  ) : <span className="text-muted-foreground">{formatDate(d.won_at)}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function DeliveryPage() {
  const data = await loadDelivery();
  if (!data) return <EmptyState icon={Truck} title="Realizace se nepodařilo načíst" description="Zkus stránku obnovit." />;
  const today = todayInPrague();
  const soon = addDays(today, 30);
  const memberMap = new Map(data.members.map((m) => [m.id, m]));
  const personMap = new Map(data.persons.map((p) => [p.id, p]));
  const orgMap = new Map(data.orgs.map((o) => [o.id, o.name]));

  const working = data.deals.filter((d) => d.delivery_status === "in_progress");
  const subs = data.deals
    .filter((d) => d.delivery_status === "ongoing")
    .sort((a, b) => (a.delivery_ends_on ?? "9999").localeCompare(b.delivery_ends_on ?? "9999"));
  const ctx: Ctx = { today, soon, members: memberMap, persons: personMap, orgs: orgMap };
  const sum = (l: DeliveryDeal[]) => l.reduce((s, d) => s + d.value, 0);

  return (
    <>
      <PageHeader title="Realizace" description="Vyhrané dealy, na kterých se ještě pracuje, a běžící předplatné." />
      {data.deals.length === 0 ? (
        <EmptyState icon={Truck} title="Nic se zrovna nerealizuje"
          description="Až některý deal označíš jako vyhraný, objeví se tady, dokud ho neodklikneš jako dodaný. Předplatné nastavíš v detailu dealu v panelu Dodání."
          action={<Link href="/pipeline" className="text-sm font-medium text-primary hover:underline">Přejít na Pipeline</Link>} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Pracuje se na tom</p><p className="mt-1 text-2xl font-semibold tabular-nums">{working.length} <span className="text-base font-normal text-muted-foreground">· {formatCZK(sum(working))}</span></p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Běžící předplatné</p><p className="mt-1 text-2xl font-semibold tabular-nums">{subs.length} <span className="text-base font-normal text-muted-foreground">· {formatCZK(sum(subs))}</span></p></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><Truck className="size-4" /> Pracuje se na tom <Badge variant="muted">{working.length}</Badge></CardTitle></CardHeader>
            <CardContent className="p-0">
              {working.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">Žádný deal v realizaci.</p> : <Table deals={working} ctx={ctx} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><CalendarClock className="size-4" /> Předplatné <Badge variant="muted">{subs.length}</Badge></CardTitle></CardHeader>
            <CardContent className="p-0">
              {subs.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">Žádné běžící předplatné. V detailu vyhraného dealu ho nastavíš v panelu Dodání.</p> : <Table deals={subs} subscription ctx={ctx} />}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
