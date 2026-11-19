import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { NewOrgButton } from "@/components/contacts/org-form";
import { SearchBox } from "@/components/contacts/list-toolbar";
import { listHref, Pagination, SortTh, Th } from "@/components/contacts/list-parts";
import { listOrgs, parseListParams } from "@/lib/data/contacts";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Firmy" };
const BASE = "/firmy";

const webHref = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);

export default async function OrgsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseListParams(await searchParams, ["name", "ico", "created_at"], "name");
  const { rows, total, members, userId } = await listOrgs(p);
  if (rows.length === 0 && p.page > 1) redirect(listHref(BASE, p, { page: 1 }));
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const newBtn = <NewOrgButton members={members} currentUserId={userId} />;

  return (
    <>
      <PageHeader title="Firmy" description="Organizace, jejich kontakty a dealy." actions={newBtn} />
      {total === 0 && !p.q ? (
        <EmptyState icon={Building2} title="Zatím tu nejsou žádné firmy" description="Přidej první firmu a navaž na ni osoby a dealy. Import z CSV přijde ve Fázi 6." action={newBtn} />
      ) : (
        <>
          <div className="mb-4"><SearchBox placeholder="Hledat název, IČO, web…" /></div>
          {total === 0 ? (
            <EmptyState icon={Building2} title={`Nic nenalezeno pro „${p.q}“`} description="Zkus jiné slovo nebo hledání zruš." action={<Link href={BASE} className="text-sm font-medium text-primary hover:underline">Zrušit hledání</Link>} />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <SortTh base={BASE} p={p} k="name">Název</SortTh>
                    <SortTh base={BASE} p={p} k="ico">IČO</SortTh>
                    <Th>Web</Th>
                    <Th>Osoby</Th>
                    <Th>Otevřené dealy</Th>
                    <Th>Vlastník</Th>
                    <SortTh base={BASE} p={p} k="created_at">Vytvořeno</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const owner = r.owner_id ? memberMap.get(r.owner_id) : undefined;
                    return (
                      <tr key={r.id} className="hover:bg-muted/40">
                        <td className="px-3 py-2.5"><Link href={`/firmy/${r.id}`} className="font-medium hover:text-primary hover:underline">{r.name}</Link></td>
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{r.ico ?? "—"}</td>
                        <td className="px-3 py-2.5">{r.web ? <a href={webHref(r.web)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{r.web}</a> : "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.personCount}</td>
                        <td className="px-3 py-2.5">{r.openDeals > 0 ? <Badge>{r.openDeals}</Badge> : <span className="text-muted-foreground">0</span>}</td>
                        <td className="px-3 py-2.5">{owner ? <span className="flex items-center gap-2"><Avatar name={owner.full_name} src={owner.avatar_url} className="size-6 text-[10px]" /><span className="hidden xl:inline">{owner.full_name}</span></span> : "—"}</td>
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
