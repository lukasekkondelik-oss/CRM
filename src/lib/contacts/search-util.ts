/** Odstraní znaky, které by rozbily PostgREST filtr `or(...)`. */
export const sanitizeSearch = (q: string) => q.replace(/[,()*%\\"]/g, " ").trim().replace(/\s+/g, " ");

/**
 * Každé slovo musí odpovídat aspoň jednomu ze sloupců (AND přes slova, OR přes sloupce).
 * Vrací pole `or`-filtrů pro postupné volání `query.or(...)`.
 */
export function wordFilters(q: string, columns: string[]): string[] {
  return sanitizeSearch(q)
    .split(" ")
    .filter(Boolean)
    .map((w) => columns.map((c) => `${c}.ilike.*${w}*`).join(","));
}

export const PERSON_SEARCH_COLUMNS = ["first_name", "last_name", "email", "phone", "position", "web"];
export const ORG_SEARCH_COLUMNS = ["name", "ico", "web"];

export const webHref = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`);
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
