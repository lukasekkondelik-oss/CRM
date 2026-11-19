import { computeKpis, computeFunnel, computeMonthly, rottingDeals, dealsWithoutNextStep, periodStart, type DDeal, type DStage } from "../../src/lib/dashboard.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
test("dashboard: KPI, funnel, měsíční graf, hnití", () => {
const today = "2026-11-19"; const now = new Date("2026-11-19T10:00:00Z").getTime();
const stages: DStage[] = [
  { id: "s1", pipeline_id: "p", name: "Lead", position: 0, probability: 10, rotting_days: 14 },
  { id: "s2", pipeline_id: "p", name: "Nabídka", position: 1, probability: 60, rotting_days: 21 },
  { id: "x1", pipeline_id: "q", name: "Jiná", position: 0, probability: 50, rotting_days: null },
];
const d = (o: Partial<DDeal>): DDeal => ({ id: Math.random().toString(), title: "t", value: 100, status: "open", stage_id: "s1", pipeline_id: "p", owner_id: "u1", won_at: null, lost_at: null, stage_changed_at: "2026-11-18T10:00:00Z", openActivities: 1, ...o });
const deals = [
  d({ value: 1000, stage_id: "s1" }), d({ value: 2000, stage_id: "s2", owner_id: "u2" }), d({ value: 500, stage_id: "x1" }),
  d({ status: "won", value: 3000, won_at: "2026-11-05T10:00:00Z" }), d({ status: "won", value: 1000, won_at: "2026-09-10T10:00:00Z" }),
  d({ status: "lost", lost_at: "2026-11-02T10:00:00Z" }), d({ status: "lost", lost_at: "2026-11-30T23:30:00Z" }), d({ status: "lost", lost_at: "2026-06-01T10:00:00Z" }),
  d({ stage_changed_at: "2026-10-01T10:00:00Z", value: 700 }), d({ openActivities: 0, value: 9000 }),
];
// KPI – vše, tento měsíc
let k = computeKpis(deals, stages, { period: "month", owner: "" }, today);
assert.equal(k.openCount, 5); assert.equal(k.openValue, 13200);
assert.equal(k.weighted, 1000*.1 + 2000*.6 + 500*.5 + 700*.1 + 9000*.1);
assert.equal(k.wonCount, 1); assert.equal(k.wonValue, 3000); assert.equal(k.lostCount, 2);
assert.equal(k.winRate, 33.3);
// období 3m zahrnuje září
k = computeKpis(deals, stages, { period: "3m", owner: "" }, today); assert.equal(k.wonCount, 2); assert.equal(k.wonValue, 4000);
// celé období
k = computeKpis(deals, stages, { period: "all", owner: "" }, today); assert.equal(k.lostCount, 3);
// owner filtr
k = computeKpis(deals, stages, { period: "all", owner: "u2" }, today); assert.equal(k.openCount, 1); assert.equal(k.openValue, 2000); assert.equal(k.winRate, null);
// podíl bez uzavřených
assert.equal(computeKpis([d({})], stages, { period: "month", owner: "" }, today).winRate, null);
// funnel
const f = computeFunnel(deals, stages, "p", ""); assert.deepEqual(f.map(r => [r.name, r.count, r.value]), [["Lead", 3, 10700], ["Nabídka", 1, 2000]]);
assert.equal(computeFunnel(deals, stages, "q", "").length, 1);
// měsíční graf: konec 30.11. 23:30 UTC = 1.12. v Praze (mimo) → nezapočítá se v listopadu? current = 2026-11, 1.12. není v řádcích
let m = computeMonthly(deals, { period: "month", owner: "" }, today);
assert.equal(m.length, 6); assert.equal(m.at(-1)!.key, "2026-11"); assert.equal(m.at(-1)!.won, 1); assert.equal(m.at(-1)!.lost, 1); // 2.11. ano, 30.11.23:30Z → 1.12. Praha → mimo
assert.equal(m.find(r => r.key === "2026-09")!.won, 1); assert.equal(m.find(r => r.key === "2026-06")!.lost, 1);
m = computeMonthly([], { period: "all", owner: "" }, today); assert.equal(m.length, 6);
m = computeMonthly(deals, { period: "year", owner: "" }, today); assert.equal(m[0].key, "2026-01"); assert.equal(m.length, 11);
// období
assert.equal(periodStart("3m", "2026-01-15"), "2025-11-01"); assert.equal(periodStart("6m", today), "2026-06-01"); assert.equal(periodStart("all", today), null);
// rotting + bez kroku
const r = rottingDeals(deals, stages, "", now); assert.equal(r.length, 1); assert.equal(r[0].deal.value, 700); assert.ok(r[0].days >= 48);
assert.equal(dealsWithoutNextStep(deals, "").length, 1); assert.equal(dealsWithoutNextStep(deals, "")[0].value, 9000);


});
