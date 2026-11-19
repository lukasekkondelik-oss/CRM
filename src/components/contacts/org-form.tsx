"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import type { Member } from "@/lib/deals/helpers";

export const normalizeIco = (v: string) => v.replace(/\s/g, "");
export const icoValid = (v: string) => v === "" || /^\d{8}$/.test(normalizeIco(v));

export function NewOrgButton({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Nová firma</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>{open && <Form members={members} currentUserId={currentUserId} onClose={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function Form({ members, currentUserId, onClose }: { members: Member[]; currentUserId: string; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", ico: "", web: "", address: "" });
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valid = f.name.trim().length > 0 && icoValid(f.ico);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const { data, error } = await createClient().from("organizations").insert({
      name: f.name.trim(), ico: normalizeIco(f.ico) || null, web: f.web.trim() || null, address: f.address.trim() || null,
      owner_id: ownerId || null,
    }).select("id").single();
    setBusy(false);
    if (error || !data) return void toast.error("Firmu se nepodařilo vytvořit.");
    toast.success("Firma vytvořena");
    onClose();
    router.push(`/firmy/${data.id}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogTitle>Nová firma</DialogTitle>
      <div className="flex flex-col gap-1.5"><Label htmlFor="o-name">Název *</Label><Input id="o-name" autoFocus value={f.name} onChange={set("name")} autoComplete="off" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="o-ico">IČO</Label>
          <Input id="o-ico" value={f.ico} onChange={set("ico")} inputMode="numeric" placeholder="12345678" aria-invalid={!icoValid(f.ico)} />
          {!icoValid(f.ico) && <p className="text-xs text-danger">IČO má 8 číslic.</p>}
        </div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="o-web">Web</Label><Input id="o-web" value={f.web} onChange={set("web")} placeholder="firma.cz" /></div>
      </div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="o-addr">Adresa</Label><Input id="o-addr" value={f.address} onChange={set("address")} placeholder="Ulice 1, Praha" /></div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="o-ow">Vlastník</Label>
        <Select id="o-ow" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">Bez vlastníka</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </Select>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>Zrušit</Button>
        <Button type="submit" disabled={!valid || busy}>{busy && <Loader2 className="animate-spin" />} Vytvořit firmu</Button>
      </DialogFooter>
    </form>
  );
}
