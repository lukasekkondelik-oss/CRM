// Práce s kalendářními daty jako s řetězci YYYY-MM-DD (bez časových pásem a posunů DST).
const toDate = (s: string) => new Date(`${s}T12:00:00Z`);
const toStr = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
};

/** pondělí týdne, ve kterém datum leží */
export const weekStart = (s: string) => addDays(s, -((toDate(s).getUTCDay() + 6) % 7));
export const monthStart = (s: string) => `${s.slice(0, 8)}01`;
export const addMonths = (s: string, n: number) => {
  const d = toDate(monthStart(s));
  d.setUTCMonth(d.getUTCMonth() + n);
  return toStr(d);
};

/** všechny dny mřížky měsíce (celé týdny, po–ne) */
export function monthGrid(anchor: string): string[] {
  const first = monthStart(anchor);
  const start = weekStart(first);
  const last = addDays(addMonths(first, 1), -1);
  const end = addDays(weekStart(last), 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("cs-CZ", { ...o, timeZone: "UTC" });
const long = f({ weekday: "long", day: "numeric", month: "numeric" });
const short = f({ weekday: "short", day: "numeric", month: "numeric" });
const monthName = f({ month: "long", year: "numeric" });
const plain = f({ day: "numeric", month: "numeric", year: "numeric" });

export const formatLongDay = (s: string) => long.format(toDate(s));
export const formatShortDay = (s: string) => short.format(toDate(s));
export const formatMonth = (s: string) => monthName.format(toDate(s));
export const dayOfMonth = (s: string) => toDate(s).getUTCDate();

/** „Dnes“, „Zítra“, „Včera“ nebo datum */
export function relativeDay(s: string, today: string): string {
  if (s === today) return "Dnes";
  if (s === addDays(today, 1)) return "Zítra";
  if (s === addDays(today, -1)) return "Včera";
  return plain.format(toDate(s));
}
