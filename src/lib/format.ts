// České formáty: měna CZK, čísla, datum.
const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("cs-CZ");
const dateFmt = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatCZK = (v: number | string | null | undefined) => czk.format(Number(v ?? 0));
export const formatNumber = (v: number | string | null | undefined) => number.format(Number(v ?? 0));
export const formatDate = (v: string | Date | null | undefined) => (v ? dateFmt.format(new Date(v)) : "");
export const formatDateTime = (v: string | Date | null | undefined) =>
  v ? dateTimeFmt.format(new Date(v)) : "";

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
