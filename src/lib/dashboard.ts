// Čisté výpočty pro Dashboard (bez závislostí na Reactu / Supabase → snadno testovatelné).

export interface DDeal {
  id: string;
  title: string;
  value: number;
  status: "open" | "won" | "lost";
  stage_id: string;
  pipeline_id: string;
  owner_id: string | null;
  won_at: string | null;
  lost_at: string | null;
  stage_changed_at: string;
  openActivities: number;
  delivery_status?: string | null;
}
export interface DStage { id: string; pipeline_id: string; name: string; position: number; probability: number; rotting_days: number | null }

export type Period = "month" | "3m" | "6m" | "year" | "all";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "month", label: "Tento měsíc" },
  { key: "3m", label: "Poslední 3 měsíce" },
  { key: "6m", label: "Posledních 6 měsíců" },
  { key: "year", label: "Tento rok" },
  { key: "all", label: "Celé období" },
];

const pragueDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(d);
/** datum (YYYY-MM-DD v Praze) z ISO časového razítka */
export const dayOf = (iso: string) => pragueDay(new Date(iso));

const monthKeyAdd = (key: string, n: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Začátek období (YYYY-MM-DD) nebo null = bez omezení. */
export function periodStart(period: Period, today: string): string | null {
  const month = today.slice(0, 7);
  switch (period) {
    case "month": return `${month}-01`;
    case "3m": return `${monthKeyAdd(month, -2)}-01`;
    case "6m": return `${monthKeyAdd(month, -5)}-01`;
    case "year": return `${today.slice(0, 4)}-01-01`;
    default: return null;
  }
}

export interface Filters { period: Period; owner: string }

const inPeriod = (iso: string | null, from: string | null) => !!iso && (!from || dayOf(iso) >= from);
const byOwner = (d: DDeal, owner: string) => !owner || d.owner_id === owner;

export interface Kpis {
  openCount: number; openValue: number; weighted: number;
  wonCount: number; wonValue: number; lostCount: number;
  /** podíl výher z uzavřených dealů v období (0–100) nebo null, když nic uzavřeno není */
  winRate: number | null;
}

export function computeKpis(deals: DDeal[], stages: DStage[], f: Filters, today: string): Kpis {
  const prob = new Map(stages.map((s) => [s.id, s.probability]));
  const from = periodStart(f.period, today);
  const k: Kpis = { openCount: 0, openValue: 0, weighted: 0, wonCount: 0, wonValue: 0, lostCount: 0, winRate: null };
  for (const d of deals) {
    if (!byOwner(d, f.owner)) continue;
    if (d.status === "open") {
      k.openCount++; k.openValue += d.value; k.weighted += d.value * ((prob.get(d.stage_id) ?? 0) / 100);
    } else if (d.status === "won" && inPeriod(d.won_at, from)) {
      k.wonCount++; k.wonValue += d.value;
    } else if (d.status === "lost" && inPeriod(d.lost_at, from)) {
      k.lostCount++;
    }
  }
  const closed = k.wonCount + k.lostCount;
  k.winRate = closed ? Math.round((k.wonCount / closed) * 1000) / 10 : null;
  return k;
}

export interface FunnelRow { id: string; name: string; probability: number; count: number; value: number }

/** Otevřené dealy podle fází jedné pipeline. */
export function computeFunnel(deals: DDeal[], stages: DStage[], pipelineId: string, owner: string): FunnelRow[] {
  const rows = stages.filter((s) => s.pipeline_id === pipelineId).sort((a, b) => a.position - b.position)
    .map((s) => ({ id: s.id, name: s.name, probability: s.probability, count: 0, value: 0 }));
  const idx = new Map(rows.map((r, i) => [r.id, i]));
  for (const d of deals) {
    if (d.status !== "open" || !byOwner(d, owner)) continue;
    const i = idx.get(d.stage_id);
    if (i !== undefined) { rows[i].count++; rows[i].value += d.value; }
  }
  return rows;
}

const monthFmt = new Intl.DateTimeFormat("cs-CZ", { month: "short", year: "2-digit", timeZone: "UTC" });
/** „2026-11“ → „lis 26“ */
export const monthLabel = (key: string) => monthFmt.format(new Date(`${key}-01T12:00:00Z`));

export interface MonthRow { key: string; won: number; lost: number; wonValue: number; lostValue: number }

/** Vyhrané vs prohrané po měsících; vždy aspoň 6 měsíců končících aktuálním. */
export function computeMonthly(deals: DDeal[], f: Filters, today: string): MonthRow[] {
  const current = today.slice(0, 7);
  const from = periodStart(f.period, today);
  let startKey = from ? from.slice(0, 7) : null;
  if (!startKey) {
    const all = deals.filter((d) => byOwner(d, f.owner)).flatMap((d) => [d.won_at, d.lost_at]).filter((x): x is string => !!x).map((x) => dayOf(x).slice(0, 7)).sort();
    startKey = all[0] ?? monthKeyAdd(current, -5);
    if (startKey < monthKeyAdd(current, -23)) startKey = monthKeyAdd(current, -23); // max 24 měsíců
  }
  const minStart = monthKeyAdd(current, -5);
  if (startKey > minStart) startKey = minStart;

  const rows = new Map<string, MonthRow>();
  for (let k = startKey; k <= current; k = monthKeyAdd(k, 1)) rows.set(k, { key: k, won: 0, lost: 0, wonValue: 0, lostValue: 0 });
  for (const d of deals) {
    if (!byOwner(d, f.owner)) continue;
    if (d.status === "won" && d.won_at) { const r = rows.get(dayOf(d.won_at).slice(0, 7)); if (r) { r.won++; r.wonValue += d.value; } }
    if (d.status === "lost" && d.lost_at) { const r = rows.get(dayOf(d.lost_at).slice(0, 7)); if (r) { r.lost++; r.lostValue += d.value; } }
  }
  return [...rows.values()];
}

export const daysInStageAt = (d: Pick<DDeal, "stage_changed_at">, now: number) =>
  Math.floor((now - new Date(d.stage_changed_at).getTime()) / 86_400_000);

export function rottingDeals(deals: DDeal[], stages: DStage[], owner: string, now: number) {
  const st = new Map(stages.map((s) => [s.id, s]));
  return deals
    .filter((d) => d.status === "open" && byOwner(d, owner))
    .map((d) => ({ deal: d, stage: st.get(d.stage_id), days: daysInStageAt(d, now) }))
    .filter((x) => x.stage?.rotting_days && x.days > x.stage.rotting_days)
    .sort((a, b) => b.days - a.days);
}

export const dealsWithoutNextStep = (deals: DDeal[], owner: string) =>
  deals.filter((d) => (d.status === "open" || (d.status === "won" && d.delivery_status === "in_progress")) && d.openActivities === 0 && byOwner(d, owner)).sort((a, b) => b.value - a.value);
