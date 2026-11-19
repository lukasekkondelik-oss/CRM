"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { searchOrgs, searchPersons } from "@/lib/contacts/search";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { personName, type Member, type OrgLite, type PersonLite } from "@/lib/deals/helpers";
import type { Deal, Stage } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stages: Stage[];
  defaultStageId: string;
  members: Member[];
  persons: PersonLite[];
  orgs: OrgLite[];
  currentUserId: string;
  onCreate: (input: Partial<Deal> & Pick<Deal, "stage_id" | "title">) => Promise<boolean>;
  onCreatePerson: (name: string, orgId: string | null) => Promise<PersonLite | null>;
  onCreateOrg: (name: string) => Promise<OrgLite | null>;
  /** vybraný výsledek serverového hledání → rodič si ho přidá do svých seznamů */
  onRegisterPerson: (p: PersonLite) => void;
  onRegisterOrg: (o: OrgLite) => void;
}

export function NewDealDialog(props: Props) {
  // Obsah je vykreslený jen při otevření → formulář se pokaždé resetuje.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>{props.open && <Form {...props} />}</DialogContent>
    </Dialog>
  );
}

function Form({ onOpenChange, stages, defaultStageId, members, persons, orgs, currentUserId, onCreate, onCreatePerson, onCreateOrg, onRegisterPerson, onRegisterOrg }: Props) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState(defaultStageId);
  const [personId, setPersonId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [close, setClose] = useState("");
  const [busy, setBusy] = useState(false);

  const orgName = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const personOptions = persons.map((p) => ({ id: p.id, label: personName(p), sub: p.organization_id ? orgName.get(p.organization_id) : undefined }));
  const orgOptions = orgs.map((o) => ({ id: o.id, label: o.name }));

  function pickPerson(id: string | null, opt?: ComboOption) {
    setPersonId(id);
    const person = (opt?.data as PersonLite | undefined) ?? persons.find((p) => p.id === id);
    if (opt?.data) onRegisterPerson(opt.data as PersonLite);
    if (person?.organization_id && !orgId) {
      setOrgId(person.organization_id);
      if (opt?.sub) onRegisterOrg({ id: person.organization_id, name: opt.sub });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate({
      title: title.trim(),
      stage_id: stageId,
      value: Number(value.replace(/\s/g, "").replace(",", ".")) || 0,
      person_id: personId,
      organization_id: orgId,
      owner_id: ownerId || null,
      expected_close_date: close || null,
    });
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogTitle>Nový deal</DialogTitle>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nd-title">Název *</Label>
        <Input id="nd-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Např. Automatizace reportingu" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nd-value">Hodnota (Kč)</Label>
          <Input id="nd-value" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nd-stage">Fáze</Label>
          <Select id="nd-stage" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Firma</Label>
          <Combobox
            options={orgOptions}
            value={orgId}
            search={searchOrgs}
            onChange={(id, opt) => { setOrgId(id); if (opt?.data) onRegisterOrg(opt.data as OrgLite); }}
            placeholder="Vybrat firmu"
            createLabel="Nová firma"
            onCreate={async (q) => { const o = await onCreateOrg(q); if (o) { setOrgId(o.id); return o.id; } }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Osoba</Label>
          <Combobox
            options={personOptions}
            value={personId}
            search={searchPersons}
            onChange={(id, opt) => pickPerson(id, opt)}
            placeholder="Vybrat osobu"
            createLabel="Nová osoba"
            onCreate={async (q) => { const p = await onCreatePerson(q, orgId); if (p) { setPersonId(p.id); return p.id; } }}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nd-owner">Vlastník</Label>
          <Select id="nd-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nd-close">Očekávané uzavření</Label>
          <Input id="nd-close" type="date" value={close} onChange={(e) => setClose(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Zrušit</Button>
        <Button type="submit" disabled={!title.trim() || busy}>
          {busy && <Loader2 className="animate-spin" />} Vytvořit deal
        </Button>
      </DialogFooter>
    </form>
  );
}
