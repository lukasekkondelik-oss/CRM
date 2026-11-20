"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileText, Globe, MapPin, Trash2, UserCog, Hash, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { telHref, webHref } from "@/lib/contacts/search-util";
import { personName } from "@/lib/deals/helpers";
import { formatDate } from "@/lib/format";
import type { loadOrg } from "@/lib/data/contacts";
import type { Organization } from "@/lib/types";
import { ContactFeed } from "./contact-feed";
import { InlineText, makePatcher, Row } from "./field-row";
import { LinkedDeals } from "./linked-deals";
import { icoValid, normalizeIco } from "./org-form";
import { NewPersonButton } from "./person-form";

type Data = NonNullable<Awaited<ReturnType<typeof loadOrg>>>;

const linkBtn = "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground";

export function OrgDetail({ data, today }: { data: Data; today: string }) {
  const router = useRouter();
  const [org, setOrg] = useState<Organization>(data.org);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const patch = makePatcher("organizations", org, setOrg);
  const owner = data.members.find((m) => m.id === org.owner_id);

  async function remove() {
    const { error } = await createClient().from("organizations").delete().eq("id", org.id);
    if (error) return void toast.error("Firmu se nepodařilo smazat.");
    toast.success("Firma smazána");
    router.push("/firmy");
  }

  return (
    <>
      <Link href="/firmy" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Firmy
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <InlineText label="Název firmy" value={org.name} required onSave={(v) => patch({ name: v ?? org.name })}
            className="h-auto py-0.5 text-2xl font-semibold tracking-tight" />
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            {org.ico && <span>IČO {org.ico}</span>}
            {org.web && <a href={webHref(org.web)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{org.web}</a>}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Smazat firmu" onClick={() => setDeleteOpen(true)}><Trash2 /></Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardContent className="p-5">
            <Row icon={Hash} label="IČO">
              <InlineText label="IČO" value={org.ico} placeholder="Přidat IČO" validate={icoValid} onSave={(v) => patch({ ico: v ? normalizeIco(v) : null })} />
            </Row>
            <Row icon={Globe} label="Web">
              <InlineText label="Web" value={org.web} placeholder="Přidat web" onSave={(v) => patch({ web: v })}
                action={org.web && <a href={webHref(org.web)} target="_blank" rel="noopener noreferrer" aria-label="Otevřít web" className={linkBtn}><Globe className="size-3.5" /></a>} />
            </Row>
            <Row icon={MapPin} label="Adresa">
              <InlineText label="Adresa" value={org.address} placeholder="Přidat adresu" onSave={(v) => patch({ address: v })} />
            </Row>
            <Row icon={UserCog} label="Vlastník">
              <div className="flex items-center gap-2">
                {owner && <Avatar name={owner.full_name} src={owner.avatar_url} className="size-6 text-[10px]" />}
                <Select aria-label="Vlastník" className="h-8 border-transparent bg-transparent shadow-none hover:bg-muted" value={org.owner_id ?? ""} onChange={(e) => patch({ owner_id: e.target.value || null })}>
                  <option value="">Bez vlastníka</option>
                  {data.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </Select>
              </div>
            </Row>
            <p className="mt-5 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground"><FileText className="size-3" /> Vytvořeno {formatDate(org.created_at)}</p>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2"><Users className="size-4" /> Osoby <Badge variant="muted">{data.persons.length}</Badge></CardTitle>
              <NewPersonButton members={data.members} currentUserId={data.userId} defaultOrg={{ id: org.id, name: org.name }} goToDetail={false} variant="outline" label="Přidat osobu" />
            </CardHeader>
            <CardContent>
              {data.persons.length === 0 ? (
                <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">K téhle firmě zatím nejsou přiřazené žádné osoby.</p>
              ) : (
                <ul className="divide-y">
                  {data.persons.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/osoby/${p.id}`} className="text-sm font-medium hover:text-primary hover:underline">{personName(p)}</Link>
                        {p.position && <p className="text-xs text-muted-foreground">{p.position}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 text-sm">
                        {p.email && <a href={`mailto:${p.email}`} className="text-primary hover:underline">{p.email}</a>}
                        {p.phone && <a href={telHref(p.phone)} className="text-primary hover:underline">{p.phone}</a>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <LinkedDeals deals={data.deals} stages={data.stages} pipelines={data.pipelines} userId={data.userId} link={{ organization_id: org.id }} />
          <ContactFeed activities={data.activities} notes={data.notes} deals={data.deals} members={data.members} today={today} target={{ organization_id: org.id }} />
        </div>
      </div>

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Smazat firmu ${org.name}?`}
        description="Smažou se poznámky firmy. Osoby a dealy zůstanou, jen bez vazby na tuto firmu. Akci nelze vrátit."
        onConfirm={remove} />
    </>
  );
}
