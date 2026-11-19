import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeBuffer, detectDelimiter, guessColumn, parseCsv, parseCzNumber, parseDateLoose, toCsv } from "../../src/lib/csv.ts";

test("parseCsv: uvozovky, oddělovače, CRLF, BOM, prázdné řádky", () => {
  assert.deepEqual(parseCsv('﻿Jméno;Poznámka\r\n"Novák, Jan";"řekl ""ahoj""\nnový řádek"\r\n\r\nEva;\r\n'),
    [["Jméno", "Poznámka"], ["Novák, Jan", 'řekl "ahoj"\nnový řádek'], ["Eva", ""]]);
  assert.deepEqual(parseCsv("a,b,c\n1,2,3"), [["a", "b", "c"], ["1", "2", "3"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  assert.equal(detectDelimiter("a;b;c,d"), ";");
  assert.equal(detectDelimiter("jediny"), ",");
  assert.deepEqual(parseCsv("x;y\n1;2"), [["x", "y"], ["1", "2"]]); // bez koncového newline
});

test("toCsv: escapování, BOM, ochrana proti vzorcům, round-trip", () => {
  const rows = [["Název", "Pozn"], ['A "b"; c', "řádek1\nřádek2"], [null, 5], ["=SUM(A1)", "+420 777 123 456"], ["-5", "@x"]];
  const csv = toCsv(rows);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes("'=SUM(A1)") && csv.includes("'@x"));          // vzorce neutralizovány
  assert.ok(csv.includes("+420 777 123 456") && !csv.includes("'+420")); // telefon se nemění
  assert.ok(!csv.includes("'-5"));                                       // záporné číslo se nemění
  const back = parseCsv(csv);
  assert.deepEqual(back[1], ['A "b"; c', "řádek1\nřádek2"]);
  assert.deepEqual(back[2], ["", "5"]);
});

test("parseCzNumber: české i anglické formáty", () => {
  const cases: [string, number | null][] = [["120000", 120000], ["120 000 Kč", 120000], ["1 200,50", 1200.5], ["1.200,50", 1200.5], ["1,200.50", 1200.5],
    ["1.200", 1200], ["1,200", 1200], ["12,5", 12.5], ["0,99", 0.99], ["abc", null], ["", null], ["-300", -300]];
  for (const [i, o] of cases) assert.equal(parseCzNumber(i), o, `parseCzNumber(${JSON.stringify(i)})`);
});

test("parseDateLoose: české a ISO datum, neplatná data", () => {
  assert.equal(parseDateLoose("1. 2. 2026"), "2026-02-01");
  assert.equal(parseDateLoose("01.02.2026"), "2026-02-01");
  assert.equal(parseDateLoose("31/12/26"), "2026-12-31");
  assert.equal(parseDateLoose("2026-02-01T10:00:00Z"), "2026-02-01");
  assert.equal(parseDateLoose("31.02.2026"), null);
  assert.equal(parseDateLoose("zítra"), null);
});

test("guessColumn: bez diakritiky, přesná shoda před částečnou", () => {
  const h = ["Příjmení", "Jméno", "E-mail (pracovní)", "Telefon", "Firma"];
  assert.equal(guessColumn(h, ["prijmeni", "last name"]), 0);
  assert.equal(guessColumn(h, ["jmeno", "first name"]), 1);
  assert.equal(guessColumn(h, ["email", "e mail"]), 2);
  assert.equal(guessColumn(h, ["mobil"]), -1);
});

test("decodeBuffer: UTF-8 i Windows-1250", () => {
  assert.equal(decodeBuffer(new TextEncoder().encode("Žluťoučký kůň").buffer as ArrayBuffer), "Žluťoučký kůň");
  const w1250 = new Uint8Array([0x8e, 0x6c, 0x75, 0x9d, 0x6f, 0x75, 0xe8, 0x6b, 0xfd]); // „Žluťoučký“ ve Windows-1250
  assert.equal(decodeBuffer(w1250.buffer), "Žluťoučký");
});
