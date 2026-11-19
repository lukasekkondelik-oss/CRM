// CSV: parser (uvozovky, CRLF, BOM, autodetekce oddělovače), generátor pro Excel, české formáty čísel a dat.

/** Rozpozná oddělovač podle první řádky (české Excely ukládají `;`). */
export function detectDelimiter(text: string): string {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => [d, first.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** Dekóduje soubor jako UTF-8, a když v něm jsou vadné znaky, zkusí Windows-1250 (staré Excely). */
export function decodeBuffer(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8;
  try { return new TextDecoder("windows-1250").decode(buf); } catch { return utf8; }
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === d) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

type Cell = string | number | null | undefined;

/** Buňky začínající = + - @ se v Excelu vyhodnocují jako vzorec → prefix apostrofem. */
const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) && !/^[+-]?\d+([.,]\d+)?$/.test(v) && !/^\+\d[\d\s]*$/.test(v) ? `'${v}` : v);

export function toCsv(rows: Cell[][], delimiter = ";", bom = true): string {
  const esc = (x: Cell) => {
    const v = x === null || x === undefined ? "" : safe(String(x));
    return /[";\n\r,\t]/.test(v) || v.includes(delimiter) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return (bom ? "﻿" : "") + rows.map((r) => r.map(esc).join(delimiter)).join("\r\n") + "\r\n";
}

/** „1 200,50“, „1.200,50“, „1,200.50“, „120000“, „120 000 Kč“ → číslo (nebo null). */
export function parseCzNumber(raw: string): number | null {
  let s = raw.replace(/[^\d.,\-]/g, "");
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    s = s.split(dec === "." ? "," : ".").join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    s = s.length - lastComma - 1 === 3 && s.indexOf(",") === lastComma && lastComma > 0 && /^\d{1,3},\d{3}$/.test(s) ? s.replace(",", "") : s.replace(",", ".");
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 1. 2. 2026, 01.02.2026, 1/2/2026, 2026-02-01 → YYYY-MM-DD (nebo null). Den/měsíc v českém pořadí. */
export function parseDateLoose(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = s.match(/^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{2,4})/))) { d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Najde index sloupce hlavičky, který nejlépe odpovídá synonymům (bez diakritiky, přesná shoda před částečnou). */
export function guessColumn(headers: string[], synonyms: string[]): number {
  const h = headers.map(norm);
  const syn = synonyms.map(norm);
  for (const s of syn) { const i = h.indexOf(s); if (i >= 0) return i; }
  for (const s of syn) { const i = h.findIndex((x) => x.includes(s)); if (i >= 0) return i; }
  return -1;
}
