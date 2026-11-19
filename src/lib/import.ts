import { guessColumn, parseCzNumber, parseDateLoose } from "./csv.ts";

export type EntityKind = "persons" | "orgs" | "deals";

export interface FieldDef { key: string; label: string; required?: boolean; synonyms: string[] }

export const ENTITY_LABEL: Record<EntityKind, string> = { persons: "Osoby", orgs: "Firmy", deals: "Dealy" };

export const IMPORT_FIELDS: Record<EntityKind, FieldDef[]> = {
  persons: [
    { key: "full_name", label: "Celé jméno", synonyms: ["cele jmeno", "jmeno a prijmeni", "full name", "name", "kontakt", "osoba"] },
    { key: "first_name", label: "Jméno", synonyms: ["jmeno", "krestni jmeno", "first name", "firstname"] },
    { key: "last_name", label: "Příjmení", synonyms: ["prijmeni", "last name", "lastname", "surname"] },
    { key: "email", label: "E-mail", synonyms: ["email", "e mail", "mail"] },
    { key: "phone", label: "Telefon", synonyms: ["telefon", "mobil", "phone", "tel"] },
    { key: "position", label: "Pozice", synonyms: ["pozice", "funkce", "position", "job title", "title"] },
    { key: "organization", label: "Firma", synonyms: ["firma", "spolecnost", "organizace", "organization", "company"] },
    { key: "owner", label: "Vlastník", synonyms: ["vlastnik", "owner", "obchodnik", "prirazeno"] },
  ],
  orgs: [
    { key: "name", label: "Název", required: true, synonyms: ["nazev", "firma", "spolecnost", "organizace", "name", "company"] },
    { key: "ico", label: "IČO", synonyms: ["ico", "ic", "company id", "reg"] },
    { key: "web", label: "Web", synonyms: ["web", "www", "website", "url", "domena"] },
    { key: "address", label: "Adresa", synonyms: ["adresa", "address", "sidlo", "mesto"] },
    { key: "owner", label: "Vlastník", synonyms: ["vlastnik", "owner", "obchodnik"] },
  ],
  deals: [
    { key: "title", label: "Název dealu", required: true, synonyms: ["nazev", "deal", "obchod", "title", "name", "predmet"] },
    { key: "value", label: "Hodnota", synonyms: ["hodnota", "castka", "cena", "value", "amount", "kc"] },
    { key: "stage", label: "Fáze", synonyms: ["faze", "stage", "stav", "status"] },
    { key: "organization", label: "Firma", synonyms: ["firma", "spolecnost", "organizace", "organization", "company"] },
    { key: "person", label: "Osoba", synonyms: ["osoba", "kontakt", "person", "contact", "jmeno"] },
    { key: "owner", label: "Vlastník", synonyms: ["vlastnik", "owner", "obchodnik"] },
    { key: "expected_close_date", label: "Očekávané uzavření", synonyms: ["uzavreni", "ocekavane uzavreni", "expected close", "close date", "termin"] },
  ],
};

/** Odhad mapování: klíč pole → index sloupce (-1 = nemapováno). Jeden sloupec se nepřiřadí dvakrát. */
export function autoMap(kind: EntityKind, headers: string[]): Record<string, number> {
  const used = new Set<number>();
  const map: Record<string, number> = {};
  for (const f of IMPORT_FIELDS[kind]) {
    const i = guessColumn(headers, f.synonyms);
    map[f.key] = i >= 0 && !used.has(i) ? i : -1;
    if (map[f.key] >= 0) used.add(map[f.key]);
  }
  return map;
}

export interface ParsedRow {
  /** číslo řádku v původním souboru (od 1, hlavička = 1) */
  line: number;
  errors: string[];
  data: Record<string, string | number | null>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizeIco = (s: string) => s.replace(/\s/g, "");

/** Rozdělí „Jan Karel Novák“ na jméno a příjmení (poslední slovo = příjmení). */
export function splitName(full: string): { first_name: string; last_name: string } {
  const p = full.trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? { first_name: p.slice(0, -1).join(" "), last_name: p[p.length - 1] } : { first_name: "", last_name: p[0] ?? "" };
}

/** Převede řádky CSV (bez hlavičky) na normalizovaná data a zvaliduje je. */
export function buildRows(kind: EntityKind, rows: string[][], mapping: Record<string, number>): ParsedRow[] {
  return rows.map((r, idx) => {
    const g = (k: string) => (mapping[k] >= 0 ? (r[mapping[k]] ?? "").trim() : "");
    const errors: string[] = [];
    const data: ParsedRow["data"] = {};
    const text = (k: string) => { const v = g(k); data[k] = v || null; };

    if (kind === "persons") {
      let first = g("first_name"), last = g("last_name");
      if (!first && !last && g("full_name")) ({ first_name: first, last_name: last } = splitName(g("full_name")));
      if (!first && !last) errors.push("chybí jméno");
      data.first_name = first; data.last_name = last;
      const email = g("email").toLowerCase();
      if (email && !EMAIL_RE.test(email)) errors.push(`neplatný e-mail „${g("email")}“`);
      data.email = email && EMAIL_RE.test(email) ? email : null;
      text("phone"); text("position"); text("organization"); text("owner");
    } else if (kind === "orgs") {
      if (!g("name")) errors.push("chybí název");
      data.name = g("name");
      const ico = normalizeIco(g("ico"));
      if (ico && !/^\d{8}$/.test(ico)) errors.push(`IČO „${g("ico")}“ nemá 8 číslic`);
      data.ico = ico && /^\d{8}$/.test(ico) ? ico : null;
      text("web"); text("address"); text("owner");
    } else {
      if (!g("title")) errors.push("chybí název dealu");
      data.title = g("title");
      const rawValue = g("value");
      if (rawValue) {
        const n = parseCzNumber(rawValue);
        if (n === null || n < 0) errors.push(`neplatná hodnota „${rawValue}“`);
        data.value = n !== null && n >= 0 ? n : 0;
      } else data.value = 0;
      const rawDate = g("expected_close_date");
      if (rawDate) {
        const d = parseDateLoose(rawDate);
        if (!d) errors.push(`neplatné datum „${rawDate}“`);
        data.expected_close_date = d;
      } else data.expected_close_date = null;
      text("stage"); text("organization"); text("person"); text("owner");
    }
    return { line: idx + 2, errors, data };
  });
}

export const nameKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
