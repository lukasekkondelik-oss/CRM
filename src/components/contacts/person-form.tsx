"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { searchOrgs } from "@/lib/contacts/search";
import { createOrgQuick } from "@/lib/deals/mutations";
import type { Member, OrgLite } from "@/lib/deals/helpers";

interface Props {
  members: Member[];
  currentUserId: string;
  /** předvyplněná firma (např. z detailu firmy) */
  defaultOrg?: OrgLite | null;
  /** po vytvoření přejít na detail osoby (jinak jen obnovit stránku) */
  goToDetail?: boolean;
  label?: string;
  variant?: "default" | "outline";
}

export function NewPersonButton({ label = "Nová osoba", variant = "default", ...props }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}><Plus /> {label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{open && <Form {...props} onClose={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function Form({ members, currentUserId, defaultOrg, goToDetail = true, onClose }: Props & { onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", phone: "", position: "", web: "" });
  const [orgs, setOrgs] = useState<OrgLite[]>(defaultOrg ? [defaultOrg] : []);
  const [orgId, setOrgId] = useState<string | null>(defaultOrg?.id ?? null);
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valid = (f.first_name + f.last_name).trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const { data, error } = await createClient().from("persons").insert({
      first_name: f.first_name.trim(), last_name: f.last_name.trim(),
      email: f.email.trim() || null, phone: f.phone.trim() || null, position: f.position.trim() || null, web: f.web.trim() || null,
      organization_id: orgId, owner_id: ownerId || null,
    }).select("id").single();
    setBusy(false);
    if (error || !data) return void toast.error("Osobu se nepodařilo vytvořit.");
    toast.success("Osoba vytvořena");
    onClose();
    if (goToDetail) router.push(`/osoby/${data.id}`); else router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogTitle>Nová osoba</DialogTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="p-fn">Jméno</Label><Input id="p-fn" autoFocus value={f.first_name} onChange={set("first_name")} autoComplete="off" /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="p-ln">Příjmení</Label><Input id="p-ln" value={f.last_name} onChange={set("last_name")} autoComplete="off" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="p-em">E-mail</Label><Input id="p-em" type="email" value={f.email} onChange={set("email")} placeholder="jan@firma.cz" /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="p-ph">Telefon</Label><Input id="p-ph" type="tel" value={f.phone} onChange={set("phone")} placeholder="+420 777 123 456" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="p-pos">Pozice</Label><Input id="p-pos" value={f.position} onChange={set("position")} placeholder="Finanční poradce" /></div>
        <div className="flex flex-col gap-1.5">
          <Label>Firma</Label>
          <Combobox
            options={orgs.map((o) => ({ id: o.id, label: o.name }))}
            value={orgId}
            search={searchOrgs}
            onChange={(id, opt) => { setOrgId(id); if (opt?.data) setOrgs((os) => [...os, opt.data as OrgLite]); }}
            placeholder="Vybrat firmu"
            createLabel="Nová firma"
            onCreate={async (q) => { try { const o = await createOrgQuick(q); setOrgs((os) => [...os, o]); setOrgId(o.id); return o.id; } catch { toast.error("Firmu se nepodařilo vytvořit."); } }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="p-web">Web</Label><Input id="p-web" value={f.web} onChange={set("web")} placeholder="jannovak.cz" /></div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-ow">Vlastník</Label>
        <Select id="p-ow" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">Bez vlastníka</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>Zrušit</Button>
        <Button type="submit" disabled={!valid || busy}>{busy && <Loader2 className="animate-spin" />} Vytvořit osobu</Button>
      </DialogFooter>
    </form>
  );
}
