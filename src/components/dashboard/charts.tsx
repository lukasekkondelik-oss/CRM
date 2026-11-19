"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCZK } from "@/lib/format";
import { monthLabel, type FunnelRow, type MonthRow } from "@/lib/dashboard";

const AXIS = { fill: "var(--muted-foreground)", fontSize: 12 };
const GRID = "var(--border)";


function Tip({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-semibold text-foreground">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-muted-foreground">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
          {r.label}: <span className="font-medium text-foreground">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Funnel: otevřené dealy podle fází (jedna série → bez legendy, hodnota na konci sloupce). */
export function FunnelChart({ rows }: { rows: FunnelRow[] }) {
  const h = Math.max(160, rows.length * 44 + 20);
  return (
    <div className="viz-root" style={{ height: h }} role="img" aria-label={`Funnel: ${rows.map((r) => `${r.name} ${r.count}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap={12}>
          <CartesianGrid horizontal={false} stroke={GRID} strokeWidth={1} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={118} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const r = active ? (payload?.[0]?.payload as FunnelRow | undefined) : undefined;
              return r ? <Tip title={r.name} rows={[
                { color: "var(--series-1)", label: "Dealů", value: String(r.count) },
                { label: "Hodnota", value: formatCZK(r.value) },
                { label: "Pravděpodobnost", value: `${r.probability} %` },
              ]} /> : null;
            }}
          />
          <Bar dataKey="count" fill="var(--series-1)" barSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="count" position="right" style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vyhrané vs prohrané po měsících – dva sloupce vedle sebe s mezerou 2 px. */
export function WonLostChart({ rows }: { rows: MonthRow[] }) {
  return (
    <div className="viz-root h-72" role="img" aria-label={`Vyhrané a prohrané dealy po měsících: ${rows.map((r) => `${monthLabel(r.key)} ${r.won} / ${r.lost}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis dataKey="key" tickFormatter={monthLabel} tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const r = active ? (payload?.[0]?.payload as MonthRow | undefined) : undefined;
              return r ? <Tip title={monthLabel(r.key)} rows={[
                { color: "var(--series-1)", label: "Vyhráno", value: `${r.won} (${formatCZK(r.wonValue)})` },
                { color: "var(--series-2)", label: "Prohráno", value: `${r.lost} (${formatCZK(r.lostValue)})` },
              ]} /> : null;
            }}
          />
          <Bar dataKey="won" name="Vyhráno" fill="var(--series-1)" barSize={16} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="lost" name="Prohráno" fill="var(--series-2)" barSize={16} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
