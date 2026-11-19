"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Loader2, MailPlus, Trash2, UserMinus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import type { Invitation } from "@/lib/data/settings";
import type { Profile } from "@/lib/types";

interface Props {
  isAdmin: boolean;
  userId: string;
  workspace: { id: string; name: string };
  members: Profile[];
  invitations: Invitation[];
  invitesAvailable: boolean;
}

const inviteUrl = (token: string) => `${window.location.origin}/registrace?invite=${token}`;

function CopyButton({ text }: { text: () => string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text()); setOk(true); setTimeout(() => setOk(false), 1500); toast.success("Odkaz zkopírován"); }
      catch { toast.error("Kopírování se nepovedlo – označ odkaz ručně."); }
    }}>
      {ok ? <Check /> : <Copy />} Kopírovat odkaz
    </Button>
  );
}

export function TeamSettings({ isAdmin, userId, workspace, members: initialMembers, invitations: initialInvites, invitesAvailable }: Props) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [wsName, setWsName] = useState(workspace.name);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Profile | null>(null);
  const sb = createClient();

  async function saveWorkspace() {
    const name = wsName.trim();
    if (!name || name === workspace.name) return void setWsName(workspace.name);
    const { error } = await sb.from("workspaces").update({ name }).eq("id", workspace.id);
    if (error) { setWsName(workspace.name); return void toast.error("Název se nepodařilo uložit."); }
    toast.success("Název workspace uložen");
    router.refresh();
  }

  async function changeRole(m: Profile, next: "admin" | "member") {
    const before = members;
    setMembers((all) => all.map((x) => (x.id === m.id ? { ...x, role: next } : x)));
    const { error } = await sb.rpc("set_member_role", { p_user: m.id, p_role: next });
    if (error) { setMembers(before); toast.error(error.message.includes("aspoň jednoho admina") ? "Workspace musí mít aspoň jednoho admina." : "Roli se nepodařilo změnit."); }
  }

  async function removeMember(m: Profile) {
    const { error } = await sb.rpc("remove_member", { p_user: m.id });
    if (error) return void toast.error("Člena se nepodařilo odebrat.");
    setMembers((all) => all.filter((x) => x.id !== m.id));
    toast.success(`${m.full_name} byl(a) odebrán(a) z workspace`);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    if (members.some((m) => m.email?.toLowerCase() === addr)) return void toast.error("Tenhle člen už ve workspace je.");
    setBusy(true);
    const { data, error } = await sb.from("invitations").insert({ email: addr, role }).select().single();
    setBusy(false);
    if (error || !data) return void toast.error(error?.code === "23505" ? "Tomuhle e-mailu už čeká pozvánka." : "Pozvánku se nepodařilo vytvořit.");
    setInvites((i) => [data as Invitation, ...i]);
    setEmail("");
    toast.success("Pozvánka vytvořena – pošli člověku odkaz");
  }

  async function revoke(i: Invitation) {
    const { error } = await sb.from("invitations").delete().eq("id", i.id);
    if (error) return void toast.error("Pozvánku se nepodařilo zrušit.");
    setInvites((all) => all.filter((x) => x.id !== i.id));
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Card>
        <CardHeader><CardTitle>Workspace</CardTitle><CardDescription>Název firmy, pod kterou nexdeals vedeš.</CardDescription></CardHeader>
        <CardContent>
          <Input aria-label="Název workspace" value={wsName} disabled={!isAdmin} onChange={(e) => setWsName(e.target.value)} onBlur={saveWorkspace}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="max-w-sm" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Členové <Badge variant="muted">{members.length}</Badge></CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={m.full_name} src={m.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.full_name}{m.id === userId && <span className="ml-2 text-xs font-normal text-muted-foreground">(ty)</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                {isAdmin ? (
                  <Select aria-label={`Role: ${m.full_name}`} value={m.role} onChange={(e) => changeRole(m, e.target.value as "admin" | "member")} className="h-9 w-32">
                    <option value="member">Člen</option><option value="admin">Admin</option>
                  </Select>
                ) : <Badge variant={m.role === "admin" ? "default" : "muted"}>{m.role === "admin" ? "Admin" : "Člen"}</Badge>}
                {isAdmin && m.id !== userId && (
                  <button type="button" aria-label={`Odebrat ${m.full_name}`} onClick={() => setRemoveTarget(m)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-danger"><UserMinus className="size-4" /></button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle>Pozvat do workspace</CardTitle><CardDescription>Vytvoř pozvánku a pošli člověku odkaz. Po registraci se rovnou připojí. Pozvánka platí 14 dní.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!invitesAvailable ? (
              <p className="rounded-lg bg-warning-soft px-3 py-3 text-sm text-warning">Pozvánky se zapnou po nasazení databázové migrace Fáze 6 (soubor <code>supabase/migrations/20261119000200_phase6_invites_search.sql</code>).</p>
            ) : (
              <>
                <form onSubmit={invite} className="flex flex-wrap items-center gap-2">
                  <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kolega@firma.cz" aria-label="E-mail pozvaného" className="max-w-xs" />
                  <Select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")} className="w-32" aria-label="Role">
                    <option value="member">Člen</option><option value="admin">Admin</option>
                  </Select>
                  <Button type="submit" disabled={busy || !email.trim()}>{busy ? <Loader2 className="animate-spin" /> : <MailPlus />} Vytvořit pozvánku</Button>
                </form>
                {invites.length > 0 && (
                  <ul className="divide-y rounded-lg border">
                    {invites.map((i) => {
                      const expired = new Date(i.expires_at) < new Date();
                      return (
                        <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{i.email}</p>
                            <p className="text-xs text-muted-foreground">{i.role === "admin" ? "Admin" : "Člen"} · {expired ? "vypršela" : `platí do ${formatDate(i.expires_at)}`}</p>
                          </div>
                          {expired ? <Badge variant="danger">Vypršela</Badge> : <CopyButton text={() => inviteUrl(i.token)} />}
                          <button type="button" aria-label={`Zrušit pozvánku pro ${i.email}`} onClick={() => revoke(i)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 className="size-4" /></button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)} title={`Odebrat ${removeTarget?.full_name ?? ""}?`}
        description="Člen ztratí přístup. Jeho dealy, kontakty a aktivity zůstanou, jen bez přiřazeného vlastníka." confirmLabel="Odebrat"
        onConfirm={async () => { if (removeTarget) await removeMember(removeTarget); }} />
    </div>
  );
}
