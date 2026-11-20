"use client";

import { DELIVERY_SHORT, isDelivering, needsNextStep } from "@/lib/deals/delivery";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCZK, formatDate } from "@/lib/format";
import { isRotting, nextState, personName, type DealVM, type Member, type OrgLite, type PersonLite } from "@/lib/deals/helpers";
import type { Stage } from "@/lib/types";
import { Download, Kanban } from "lucide-react";
import { toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { NextStepIcon } from "./next-step-icon";

type SortKey = "title" | "value" | "stage" | "close" | "created";

interface Props {
  deals: DealVM[];
  stages: Stage[];
  members: Member[];
  persons: PersonLite[];
  orgs: OrgLite[];
  now: number;
  today: string;
  onBulkStage: (ids: string[], stageId: string) => void;
  onBulkOwner: (ids: string[], ownerId: string | null) => void;
  onBulkDelete: (ids: string[]) => Promise<void>;
}

type Sort = { key: SortKey; dir: 1 | -1 };

function Th({ k, sort, setSort, children, className }: {
  k?: SortKey; sort: Sort; setSort: (fn: (s: Sort) => Sort) => void; children: React.ReactNode; className?: string;
}) {
  return (
    <th scope="col" className={cn("whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}>
      {k ? (
        <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (-s.dir as 1 | -1) : 1 }))}>
          {children}
          {sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </button>
      ) : children}
    </th>
  );
}

const STATUS_BADGE = { open: null, won: <Badge variant="success">Vyhráno</Badge>, lost: <Badge variant="danger">Prohráno</Badge> };
const deliveryBadge = (d: DealVM) =>
  d.status === "won" && d.delivery_status && d.delivery_status !== "done"
    ? <Badge variant="warning">{DELIVERY_SHORT[d.delivery_status]}</Badge>
    : d.status === "won" && d.delivery_status === "done" ? <Badge variant="muted">Dodáno</Badge> : null;

export function TableView({ deals, stages, members, persons, orgs, now, today, onBulkStage, onBulkOwner, onBulkDelete }: Props) {
  const [sort, setSort] = useState<Sort>({ key: "created", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stageMap = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const personMap = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);
  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  const rows = useMemo(() => {
    const val = (d: DealVM): string | number => {
      switch (sort.key) {
        case "title": return d.title.toLowerCase();
        case "value": return d.value;
        case "stage": return stageMap.get(d.stage_id)?.position ?? 0;
        case "close": return d.expected_close_date ?? "9999";
        default: return d.created_at;
      }
    };
    return [...deals].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [deals, sort, stageMap]);

  const visibleIds = rows.map((r) => r.id);
  const sel = visibleIds.filter((id) => selected.has(id));
  const allSelected = visibleIds.length > 0 && sel.length === visibleIds.length;

  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (rows.length === 0) {
    return <EmptyState icon={Kanban} title="Žádné dealy neodpovídají filtrům" description="Zkus upravit filtry nebo přidej nový deal tlačítkem nahoře." />;
  }

  function exportCsv() {
    const stat = { open: "Otevřený", won: "Vyhráno", lost: "Prohráno" };
    const del = { in_progress: "Pracuje se na tom", ongoing: "Běží (předplatné)", done: "Dodáno" };
    const lines = rows.map((d) => {
      const person = d.person_id ? personMap.get(d.person_id) : undefined;
      const orgId = d.organization_id ?? person?.organization_id;
      return [d.title, d.value, stat[d.status], d.delivery_status ? del[d.delivery_status] : "", stageMap.get(d.stage_id)?.name, orgId ? orgMap.get(orgId)?.name : "", person ? personName(person) : "",
        d.owner_id ? memberMap.get(d.owner_id)?.full_name : "", d.expected_close_date, d.lost_reason];
    });
    const blob = new Blob([toCsv([["Název", "Hodnota", "Stav", "Dodání", "Fáze", "Firma", "Osoba", "Vlastník", "Očekávané uzavření", "Důvod prohry"], ...lines])], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "nexdeals-dealy-tabulka.csv" });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={exportCsv}><Download /> Export CSV ({rows.length})</Button>
      </div>
      {sel.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-accent/50 p-2.5">
          <span className="px-2 text-sm font-medium">Vybráno: {sel.length}</span>
          <Select className="h-9 w-48" value="" aria-label="Přesunout do fáze" onChange={(e) => { if (e.target.value) { onBulkStage(sel, e.target.value); setSelected(new Set()); } }}>
            <option value="">Přesunout do fáze…</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select className="h-9 w-48" value="" aria-label="Změnit vlastníka" onChange={(e) => { if (e.target.value) { onBulkOwner(sel, e.target.value === "none" ? null : e.target.value); setSelected(new Set()); } }}>
            <option value="">Změnit vlastníka…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            <option value="none">Bez vlastníka</option>
          </Select>
          <Button variant="outline" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}><Trash2 /> Smazat</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Zrušit výběr</Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="w-10 px-3">
                <input type="checkbox" aria-label="Vybrat vše" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visibleIds))} />
              </th>
              <Th k="title" sort={sort} setSort={setSort}>Deal</Th>
              <Th k="value" sort={sort} setSort={setSort} className="text-right">Hodnota</Th>
              <Th k="stage" sort={sort} setSort={setSort}>Fáze</Th>
              <Th sort={sort} setSort={setSort}>Firma / osoba</Th>
              <Th sort={sort} setSort={setSort}>Vlastník</Th>
              <Th sort={sort} setSort={setSort}>Další krok</Th>
              <Th k="close" sort={sort} setSort={setSort}>Uzavření</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((d) => {
              const person = d.person_id ? personMap.get(d.person_id) : undefined;
              const orgId = d.organization_id ?? person?.organization_id;
              const owner = d.owner_id ? memberMap.get(d.owner_id) : undefined;
              const rotting = isRotting(d, stageMap.get(d.stage_id), now);
              return (
                <tr key={d.id} className={cn("hover:bg-muted/40", selected.has(d.id) && "bg-accent/40")}>
                  <td className="px-3"><input type="checkbox" aria-label={`Vybrat ${d.title}`} checked={selected.has(d.id)} onChange={() => toggle(d.id)} /></td>
                  <td className="px-3 py-2.5">
                    <Link href={`/dealy/${d.id}`} className="font-medium hover:text-accent-foreground hover:underline">{d.title}</Link>
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      {STATUS_BADGE[d.status]}
                      {deliveryBadge(d)}
                      {rotting && <Badge variant="danger">Hnije</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCZK(d.value)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{stageMap.get(d.stage_id)?.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{[orgId ? orgMap.get(orgId)?.name : null, person ? personName(person) : null].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-3 py-2.5">{owner ? <span className="flex items-center gap-2"><Avatar name={owner.full_name} src={owner.avatar_url} className="size-6 text-[10px]" /><span className="hidden xl:inline">{owner.full_name}</span></span> : "—"}</td>
                  <td className="px-3 py-2.5">{needsNextStep(d) || (isDelivering(d) && d.openActivities > 0) ? <NextStepIcon state={nextState(d, today)} due={d.nextDue} /> : "—"}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{d.expected_close_date ? formatDate(d.expected_close_date) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Smazat ${sel.length} ${sel.length === 1 ? "deal" : "dealů"}?`}
        description="Smažou se i jejich aktivity, poznámky a historie. Akci nelze vrátit."
        onConfirm={async () => { await onBulkDelete(sel); setSelected(new Set()); }}
      />
    </div>
  );
}
