"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Building2, CalendarDays, ExternalLink, Plus, RotateCcw, Tag, Trash2, Trophy, User, UserCog, Wallet, XCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboOption } from "@/components/ui/combobox";
import { searchOrgs, searchPersons } from "@/lib/contacts/search";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { LostDialog } from "@/components/pipeline/lost-dialog";
import { createClient } from "@/lib/supabase/client";
import { createLabelQuick, createOrgQuick, createPersonQuick, deleteDeals, updateDeals } from "@/lib/deals/mutations";
import { daysInStage, isRotting, personName, type Member, type OrgLite, type PersonLite } from "@/lib/deals/helpers";
import { formatCZK, formatDate } from "@/lib/format";
import type { Activity, Deal, DealHistory, Label, Note, Pipeline, Stage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DealActivity } from "./deal-activity";

interface Data {
  userId: string;
  deal: Deal;
  pipeline: Pipeline;
  stages: Stage[];
  members: Member[];
  labels: Label[];
  labelIds: string[];
  persons: PersonLite[];
  orgs: OrgLite[];
  activities: Activity[];
  notes: Note[];
  history: DealHistory[];
}

function Row({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-2 py-1.5">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="size-3.5" /> {label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const ghost = "-mx-2 h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm transition-colors hover:bg-muted focus-visible:border-ring focus-visible:bg-card focus-visible:outline-none";

export function DealDetail({ data, now, today }: { data: Data; now: number; today: string }) {
  const router = useRouter();
  const { userId, pipeline, stages, members } = data;
  const [deal, setDeal] = useState(data.deal);
  const [labels, setLabels] = useState(data.labels);
  const [labelIds, setLabelIds] = useState(data.labelIds);
  const [persons, setPersons] = useState(data.persons);
  const [orgs, setOrgs] = useState(data.orgs);
  const [activities, setActivities] = useState(data.activities);
  const [notes, setNotes] = useState(data.notes);
  const [history, setHistory] = useState(data.history);
  const [lostOpen, setLostOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [valueText, setValueText] = useState<string | null>(null);

  const stage = stages.find((s) => s.id === deal.stage_id);
  const stageIdx = stages.findIndex((s) => s.id === deal.stage_id);
  const rotting = isRotting(deal, stage, now);
  const open = deal.status === "open";

  async function refreshHistory() {
    const { data: h } = await createClient().from("deal_history").select("*").eq("deal_id", deal.id).order("changed_at", { ascending: false });
    if (h) setHistory(h as DealHistory[]);
  }

  /** Optimistická úprava + uložení; při chybě návrat a toast. */
  async function patch(p: Partial<Deal>, { history: logs = false }: { history?: boolean } = {}) {
    const before = deal;
    setDeal((d) => ({ ...d, ...p }));
    try {
      await updateDeals([deal.id], p);
      if (logs) refreshHistory();
      return true;
    } catch {
      setDeal(before);
      toast.error("Změnu se nepodařilo uložit.");
      return false;
    }
  }

  async function moveToStage(s: Stage) {
    if (s.id === deal.stage_id) return;
    const { data: top } = await createClient().from("deals").select("position").eq("stage_id", s.id).order("position").limit(1);
    const position = top?.length ? Number(top[0].position) - 1 : 0;
    patch({ stage_id: s.id, position, stage_changed_at: new Date().toISOString() }, { history: true });
  }

  const status = (p: Partial<Deal>) => patch(p, { history: true });

  async function toggleLabel(id: string) {
    const has = labelIds.includes(id);
    setLabelIds((ls) => (has ? ls.filter((l) => l !== id) : [...ls, id]));
    const sb = createClient();
    const { error } = has
      ? await sb.from("deal_labels").delete().eq("deal_id", deal.id).eq("label_id", id)
      : await sb.from("deal_labels").insert({ deal_id: deal.id, label_id: id });
    if (error) {
      setLabelIds((ls) => (has ? [...ls, id] : ls.filter((l) => l !== id)));
      toast.error("Label se nepodařilo změnit.");
    }
  }

  async function addLabel() {
    if (!newLabel.trim()) return;
    try {
      const l = await createLabelQuick(newLabel, labels.length);
      setLabels((ls) => [...ls, l]);
      setNewLabel("");
      toggleLabel(l.id);
    } catch { toast.error("Label už možná existuje."); }
  }

  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const registerOrg = (o: OrgLite) => setOrgs((os) => (os.some((x) => x.id === o.id) ? os : [...os, o]));
  function pickPerson(id: string | null, opt?: ComboOption) {
    const person = (opt?.data as PersonLite | undefined) ?? persons.find((p) => p.id === id);
    if (opt?.data) setPersons((ps) => (ps.some((x) => x.id === id) ? ps : [...ps, opt.data as PersonLite]));
    if (id && person?.organization_id && !deal.organization_id) {
      if (opt?.sub) registerOrg({ id: person.organization_id, name: opt.sub });
      patch({ person_id: id, organization_id: person.organization_id });
    } else patch({ person_id: id });
  }
  const owner = members.find((m) => m.id === deal.owner_id);

  return (
    <>
      <Link href="/pipeline" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {pipeline.name}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            aria-label="Název dealu"
            defaultValue={deal.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v) return void (e.target.value = deal.title);
              if (v !== deal.title) patch({ title: v });
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-full rounded-md border border-transparent bg-transparent text-2xl font-semibold tracking-tight hover:bg-muted focus-visible:border-ring focus-visible:bg-card focus-visible:outline-none"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 pl-px">
            {deal.status === "won" && <Badge variant="success">Vyhráno {formatDate(deal.won_at)}</Badge>}
            {deal.status === "lost" && <Badge variant="danger">Prohráno {formatDate(deal.lost_at)}{deal.lost_reason ? ` · ${deal.lost_reason}` : ""}</Badge>}
            {open && rotting && <Badge variant="danger">Hnije – {daysInStage(deal, now)} dní ve fázi</Badge>}
            {open && <span className="text-sm text-muted-foreground">{stage?.name} · {formatCZK(deal.value)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {open ? (
            <>
              <Button variant="success" onClick={() => status({ status: "won", won_at: new Date().toISOString(), lost_at: null, lost_reason: null })}><Trophy /> Vyhráno</Button>
              <Button variant="outline" className="text-danger" onClick={() => setLostOpen(true)}><XCircle /> Prohráno</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => status({ status: "open", won_at: null, lost_at: null, lost_reason: null })}><RotateCcw /> Znovu otevřít</Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Smazat deal" onClick={() => setDeleteOpen(true)}><Trash2 /></Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardContent className="p-5">
            <div className="mb-4">
              <ol className="flex gap-1" aria-label="Fáze dealu">
                {stages.map((s, i) => (
                  <li key={s.id} className="flex-1">
                    <button type="button" title={`${s.name} (${s.probability} %)`} aria-label={`Přesunout do fáze ${s.name}`} aria-current={i === stageIdx ? "step" : undefined}
                      onClick={() => moveToStage(s)} disabled={!open}
                      className={cn("h-2.5 w-full rounded-full transition-colors", i <= stageIdx ? "bg-primary" : "bg-muted hover:bg-primary/30", !open && "opacity-50")} />
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{stage?.name}</span> · {stage?.probability} % · {daysInStage(deal, now)} dní ve fázi
              </p>
            </div>

            <Row icon={Wallet} label="Hodnota">
              <input
                inputMode="decimal"
                aria-label="Hodnota"
                className={cn(ghost, "font-semibold tabular-nums")}
                value={valueText ?? formatCZK(deal.value)}
                onFocus={() => setValueText(String(deal.value))}
                onChange={(e) => setValueText(e.target.value)}
                onBlur={() => {
                  const n = Number((valueText ?? "").replace(/\s/g, "").replace(",", "."));
                  setValueText(null);
                  if (Number.isFinite(n) && n >= 0 && n !== deal.value) patch({ value: n }, { history: true });
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </Row>
            <Row icon={UserCog} label="Vlastník">
              <div className="flex items-center gap-2">
                {owner && <Avatar name={owner.full_name} src={owner.avatar_url} className="size-6 text-[10px]" />}
                <Select aria-label="Vlastník" className="h-8 border-transparent bg-transparent shadow-none hover:bg-muted" value={deal.owner_id ?? ""} onChange={(e) => patch({ owner_id: e.target.value || null }, { history: true })}>
                  <option value="">Bez vlastníka</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </Select>
              </div>
            </Row>
            <Row icon={CalendarDays} label="Uzavření">
              <input type="date" aria-label="Očekávané datum uzavření" className={ghost} value={deal.expected_close_date ?? ""} onChange={(e) => patch({ expected_close_date: e.target.value || null })} />
            </Row>
            <Row icon={Building2} label="Firma">
              <div className="flex items-center gap-1">
              <Combobox className="min-w-0 flex-1" ghost value={deal.organization_id} placeholder="Přidat firmu" createLabel="Nová firma"
                options={orgs.map((o) => ({ id: o.id, label: o.name }))} search={searchOrgs}
                onChange={(id, opt) => { if (opt?.data) registerOrg(opt.data as OrgLite); patch({ organization_id: id }); }}
                onCreate={async (q) => { try { const o = await createOrgQuick(q); setOrgs((os) => [...os, o]); await patch({ organization_id: o.id }); return o.id; } catch { toast.error("Firmu se nepodařilo vytvořit."); } }} />
              {deal.organization_id && <Link href={`/firmy/${deal.organization_id}`} aria-label="Otevřít firmu" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="size-3.5" /></Link>}
              </div>
            </Row>
            <Row icon={User} label="Osoba">
              <div className="flex items-center gap-1">
              <Combobox className="min-w-0 flex-1" ghost value={deal.person_id} placeholder="Přidat osobu" createLabel="Nová osoba"
                options={persons.map((p) => ({ id: p.id, label: personName(p), sub: p.organization_id ? orgName.get(p.organization_id) : undefined }))}
                search={searchPersons}
                onChange={(id, opt) => pickPerson(id, opt)}
                onCreate={async (q) => { try { const p = await createPersonQuick(q, deal.organization_id); setPersons((ps) => [...ps, p]); await patch({ person_id: p.id }); return p.id; } catch { toast.error("Osobu se nepodařilo vytvořit."); } }} />
              {deal.person_id && <Link href={`/osoby/${deal.person_id}`} aria-label="Otevřít osobu" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="size-3.5" /></Link>}
              </div>
            </Row>
            <Row icon={Tag} label="Labely">
              <div className="flex flex-wrap items-center gap-1.5">
                {labels.filter((l) => labelIds.includes(l.id)).map((l) => (
                  <span key={l.id} className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: l.color }}>{l.name}</span>
                ))}
                <button type="button" aria-label="Upravit labely" onClick={() => setLabelsOpen((o) => !o)} className="rounded-full border border-dashed p-1 text-muted-foreground hover:bg-muted"><Plus className="size-3" /></button>
              </div>
            </Row>
            {labelsOpen && (
              <div className="mt-2 rounded-lg border bg-muted/40 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((l) => (
                    <button key={l.id} type="button" onClick={() => toggleLabel(l.id)} aria-pressed={labelIds.includes(l.id)}
                      className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", labelIds.includes(l.id) ? "text-white" : "bg-card")}
                      style={labelIds.includes(l.id) ? { backgroundColor: l.color, borderColor: l.color } : { borderColor: l.color, color: l.color }}>
                      {l.name}
                    </button>
                  ))}
                  {labels.length === 0 && <span className="text-xs text-muted-foreground">Zatím žádné labely.</span>}
                </div>
                <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); addLabel(); }}>
                  <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nový label…" className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm focus-visible:outline-none" />
                  <Button type="submit" size="sm" variant="outline" disabled={!newLabel.trim()}>Přidat</Button>
                </form>
              </div>
            )}

            <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
              Vytvořeno {formatDate(deal.created_at)} · upraveno {formatDate(deal.updated_at)}
            </p>
          </CardContent>
        </Card>

        <DealActivity deal={deal} activities={activities} setActivities={setActivities} notes={notes} setNotes={setNotes}
          history={history} members={members} userId={userId} today={today} />
      </div>

      <LostDialog open={lostOpen} onOpenChange={setLostOpen} dealTitle={deal.title}
        onConfirm={(reason) => { setLostOpen(false); status({ status: "lost", lost_at: new Date().toISOString(), won_at: null, lost_reason: reason }); }} />
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Smazat deal?"
        description="Smažou se i jeho aktivity, poznámky a historie. Akci nelze vrátit."
        onConfirm={async () => {
          try { await deleteDeals([deal.id]); toast.success("Deal smazán"); router.push("/pipeline"); }
          catch { toast.error("Deal se nepodařilo smazat."); }
        }} />
    </>
  );
}
