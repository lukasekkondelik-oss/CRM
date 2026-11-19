import assert from "node:assert/strict";
import { test } from "node:test";
import { autoMap, buildRows, nameKey, splitName } from "../../src/lib/import.ts";

test("autoMap: české i anglické hlavičky, bez dvojího použití sloupce", () => {
  const m = autoMap("persons", ["Příjmení", "Jméno", "E-mail", "Mobil", "Firma", "Funkce"]);
  assert.deepEqual([m.last_name, m.first_name, m.email, m.phone, m.organization, m.position], [0, 1, 2, 3, 4, 5]);
  assert.equal(m.full_name, -1);
  const d = autoMap("deals", ["Deal", "Částka", "Fáze", "Firma", "Datum uzavření"]);
  assert.deepEqual([d.title, d.value, d.stage, d.organization, d.expected_close_date], [0, 1, 2, 3, 4]);
  const o = autoMap("orgs", ["Name", "IČO", "Website"]);
  assert.deepEqual([o.name, o.ico, o.web], [0, 1, 2]);
});

test("splitName", () => {
  assert.deepEqual(splitName("Jan Karel Novák"), { first_name: "Jan Karel", last_name: "Novák" });
  assert.deepEqual(splitName("Novák"), { first_name: "", last_name: "Novák" });
});

test("buildRows persons: celé jméno, e-mail, chyby, čísla řádků", () => {
  const map = { full_name: 0, first_name: -1, last_name: -1, email: 1, phone: 2, position: -1, organization: 3, owner: -1 };
  const r = buildRows("persons", [["Jan Novák", "JAN@X.CZ", "+420 777", "Alfa"], ["", "a@b.cz", "", ""], ["Eva Černá", "ne-email", "", ""]], map);
  assert.equal(r[0].errors.length, 0); assert.equal(r[0].data.email, "jan@x.cz"); assert.equal(r[0].data.last_name, "Novák"); assert.equal(r[0].data.first_name, "Jan"); assert.equal(r[0].line, 2);
  assert.deepEqual(r[1].errors, ["chybí jméno"]);
  assert.equal(r[2].errors.length, 1); assert.equal(r[2].data.email, null);
});

test("buildRows orgs: IČO s mezerami a chybné IČO", () => {
  const map = { name: 0, ico: 1, web: -1, address: -1, owner: -1 };
  const r = buildRows("orgs", [["Alfa", "123 456 78"], ["Beta", "123"], ["", ""]], map);
  assert.equal(r[0].data.ico, "12345678"); assert.equal(r[0].errors.length, 0);
  assert.equal(r[1].errors.length, 1); assert.equal(r[2].errors[0], "chybí název");
});

test("buildRows deals: hodnota, datum, chyby", () => {
  const map = { title: 0, value: 1, stage: 2, organization: -1, person: -1, owner: -1, expected_close_date: 3 };
  const r = buildRows("deals", [["A", "1 200,50 Kč", "Lead", "31. 12. 2026"], ["B", "", "", ""], ["C", "xyz", "", "32.13.2026"]], map);
  assert.equal(r[0].data.value, 1200.5); assert.equal(r[0].data.expected_close_date, "2026-12-31"); assert.equal(r[0].errors.length, 0);
  assert.equal(r[1].data.value, 0); assert.equal(r[1].data.expected_close_date, null);
  assert.equal(r[2].errors.length, 2);
});

test("nameKey ignoruje diakritiku, velikost a mezery", () => {
  assert.equal(nameKey("  Alfa  Fináncé "), "alfa finance");
});
