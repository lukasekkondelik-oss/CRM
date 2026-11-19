import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { NewPersonButton } from "@/components/contacts/person-form";
import { SearchBox } from "@/components/contacts/list-toolbar";
import { listHref, Pagination, SortTh, Th } from "@/components/contacts/list-parts";
import { listPersons, parseListParams } from "@/lib/data/contacts";
import { telHref } from "@/lib/contacts/search-util";
import { formatDate } from "@/lib/format";
import { personName } from "@/lib/deals/helpers";

export const metadata: Metadata = { title: "Osoby" };
const BASE = "/osoby";

export default async function PersonsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseListParams(await searchParams, ["name", "email", "created_at"], "name");
  const { rows, total, members, userId } = await listPersons(p);
  if (rows.length === 0 && p.page > 1) redirect(listHref(BASE, p, { page: 1 }));
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const newBtn = <NewPersonButton members={members} currentUserId={userId} />;

  return (
    <>
      <PageHeader title="Osoby" description="Kontaktní osoby napříč firmami a jejich dealy." actions={newBtn} />
      {total === 0 && !p.q ? (
        <EmptyState icon={Users} title="Zatím tu nejsou žádné osoby" description="Přidej první kontakt a propoj ho s dealem. Import z CSV přijde ve Fázi 6." action={newBtn} />
      ) : (
        <>
          <div className="mb-4"><SearchBox placeholder="Hledat jméno, e-mail, telefon…" /></div>
          {total === 0 ? (
            <EmptyState icon={Users} title={`Nic nenalezeno pro „${p.q}“`} description="Zkus jiné slovo nebo hledání zruš." action={<Link href={BASE} className="text-sm font-medium text-primary hover:underline">Zrušit hledání</Link>} />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <SortTh base={BASE} p={p} k="name">Jméno</SortTh>
                    <Th>Firma</Th>
                    <SortTh base={BASE} p={p} k="email">E-mail</SortTh>
                    <Th>Telefon</Th>
                    <Th>Pozice</Th>
                    <Th>Vlastník</Th>
                    <Th>Otevřené dealy</Th>
                    <SortTh base={BASE} p={p} k="created_at">Vytvořeno</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const owner = r.owner_id ? memberMap.get(r.owner_id) : undefined;
                    return (
                      <tr key={r.id} className="hover:bg-muted/40">
                        <td className="px-3 py-2.5"><Link href={`/osoby/${r.id}`} className="font-medium hover:text-primary hover:underline">{personName(r)}</Link></td>
                        <td className="px-3 py-2.5">{r.organization_id ? <Link href={`/firmy/${r.organization_id}`} className="text-muted-foreground hover:text-primary hover:underline">{r.orgName}</Link> : "—"}</td>
                        <td className="px-3 py-2.5">{r.email ? <a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a> : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{r.phone ? <a href={telHref(r.phone)} className="text-primary hover:underline">{r.phone}</a> : "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.position ?? "—"}</td>
                        <td className="px-3 py-2.5">{owner ? <span className="flex items-center gap-2"><Avatar name={owner.full_name} src={owner.avatar_url} className="size-6 text-[10px]" /><span className="hidden xl:inline">{owner.full_name}</span></span> : "—"}</td>
                        <td className="px-3 py-2.5">{r.openDeals > 0 ? <Badge>{r.openDeals}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatDate(r.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
          {total > 0 && <Pagination base={BASE} p={p} total={total} />}
        </>
      )}
    </>
  );
}
