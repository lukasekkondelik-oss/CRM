"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Briefcase, Building2, ExternalLink, Mail, Phone, Trash2, UserCog } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { searchOrgs } from "@/lib/contacts/search";
import { telHref } from "@/lib/contacts/search-util";
import { createOrgQuick } from "@/lib/deals/mutations";
import { personName, type OrgLite } from "@/lib/deals/helpers";
import { formatDate } from "@/lib/format";
import type { loadPerson } from "@/lib/data/contacts";
import type { Person } from "@/lib/types";
import { ContactFeed } from "./contact-feed";
import { InlineText, makePatcher, Row } from "./field-row";
import { LinkedDeals } from "./linked-deals";

type Data = NonNullable<Awaited<ReturnType<typeof loadPerson>>>;

const linkBtn = "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground";

export function PersonDetail({ data, today }: { data: Data; today: string }) {
  const router = useRouter();
  const [person, setPerson] = useState<Person>(data.person);
  const [orgs, setOrgs] = useState<OrgLite[]>(data.org ? [data.org] : []);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const patch = makePatcher("persons", person, setPerson);
  const owner = data.members.find((m) => m.id === person.owner_id);
  const org = orgs.find((o) => o.id === person.organization_id);
  const fullName = personName(person);

  async function remove() {
    const { error } = await createClient().from("persons").delete().eq("id", person.id);
    if (error) return void toast.error("Osobu se nepodařilo smazat.");
    toast.success("Osoba smazána");
    router.push("/osoby");
  }

  return (
    <>
      <Link href="/osoby" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Osoby
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-x-2">
            <InlineText label="Jméno" value={person.first_name} placeholder="Jméno" onSave={(v) => patch({ first_name: v ?? "" })}
              className="h-auto w-auto min-w-12 py-0.5 text-2xl font-semibold tracking-tight [field-sizing:content]" />
            <InlineText label="Příjmení" value={person.last_name} placeholder="Příjmení" onSave={(v) => patch({ last_name: v ?? "" })}
              className="h-auto w-auto min-w-12 py-0.5 text-2xl font-semibold tracking-tight [field-sizing:content]" />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {person.position && <span>{person.position}</span>}
            {org && <Link href={`/firmy/${org.id}`} className="hover:text-primary hover:underline">{org.name}</Link>}
            {person.email && <a href={`mailto:${person.email}`} className="text-primary hover:underline">{person.email}</a>}
            {person.phone && <a href={telHref(person.phone)} className="text-primary hover:underline">{person.phone}</a>}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Smazat osobu" onClick={() => setDeleteOpen(true)}><Trash2 /></Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardContent className="p-5">
            <Row icon={Mail} label="E-mail">
              <InlineText label="E-mail" type="email" value={person.email} placeholder="Přidat e-mail" onSave={(v) => patch({ email: v })}
                action={person.email && <a href={`mailto:${person.email}`} aria-label="Napsat e-mail" className={linkBtn}><Mail className="size-3.5" /></a>} />
            </Row>
            <Row icon={Phone} label="Telefon">
              <InlineText label="Telefon" type="tel" value={person.phone} placeholder="Přidat telefon" onSave={(v) => patch({ phone: v })}
                action={person.phone && <a href={telHref(person.phone)} aria-label="Zavolat" className={linkBtn}><Phone className="size-3.5" /></a>} />
            </Row>
            <Row icon={Briefcase} label="Pozice">
              <InlineText label="Pozice" value={person.position} placeholder="Přidat pozici" onSave={(v) => patch({ position: v })} />
            </Row>
            <Row icon={Building2} label="Firma">
              <div className="flex items-center gap-1">
                <Combobox ghost className="min-w-0 flex-1" value={person.organization_id} placeholder="Přidat firmu" createLabel="Nová firma"
                  options={orgs.map((o) => ({ id: o.id, label: o.name }))} search={searchOrgs}
                  onChange={(id, opt) => { if (opt?.data) setOrgs((os) => [...os, opt.data as OrgLite]); patch({ organization_id: id }); }}
                  onCreate={async (q) => { try { const o = await createOrgQuick(q); setOrgs((os) => [...os, o]); await patch({ organization_id: o.id }); return o.id; } catch { toast.error("Firmu se nepodařilo vytvořit."); } }} />
                {person.organization_id && <Link href={`/firmy/${person.organization_id}`} aria-label="Otevřít firmu" className={linkBtn}><ExternalLink className="size-3.5" /></Link>}
              </div>
            </Row>
            <Row icon={UserCog} label="Vlastník">
              <div className="flex items-center gap-2">
                {owner && <Avatar name={owner.full_name} src={owner.avatar_url} className="size-6 text-[10px]" />}
                <Select aria-label="Vlastník" className="h-8 border-transparent bg-transparent shadow-none hover:bg-muted" value={person.owner_id ?? ""} onChange={(e) => patch({ owner_id: e.target.value || null })}>
                  <option value="">Bez vlastníka</option>
                  {data.members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </Select>
              </div>
            </Row>
            <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">Vytvořeno {formatDate(person.created_at)}</p>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <LinkedDeals deals={data.deals} stages={data.stages} pipelines={data.pipelines} userId={data.userId}
            link={{ person_id: person.id, organization_id: person.organization_id }} />
          <ContactFeed activities={data.activities} notes={data.notes} deals={data.deals} members={data.members} today={today} target={{ person_id: person.id }} />
        </div>
      </div>

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Smazat ${fullName}?`}
        description="Smažou se poznámky osoby. Dealy a aktivity zůstanou, jen bez vazby na tuto osobu. Akci nelze vrátit."
        onConfirm={remove} />
    </>
  );
}
