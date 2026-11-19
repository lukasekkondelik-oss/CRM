/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "node:test";
import { generateApiKey, keyDisplayPrefix, looksLikeApiKey, sha256Hex } from "../../src/lib/api/key-utils.ts";
import * as S from "../../src/lib/api/schemas.ts";
import { ENDPOINTS, buildOpenApi } from "../../src/lib/api/openapi.ts";

test("API klíč: formát, unikátnost, rozpoznání, otisk SHA-256", async () => {
  const k = generateApiKey();
  assert.match(k, /^nxd_[A-Za-z0-9_-]{43}$/);
  assert.ok(looksLikeApiKey(k));
  assert.notEqual(k, generateApiKey());
  assert.ok(!looksLikeApiKey("nxd_kratky") && !looksLikeApiKey("Bearer " + k) && !looksLikeApiKey(k + "x"));
  assert.equal(keyDisplayPrefix(k).length, 10);
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal((await sha256Hex(k)).length, 64);
});

test("schémata dealů: validace vstupu", () => {
  assert.equal(S.dealCreate.parse({ title: "  Nový deal ", value: 1000, organization_name: "Alfa" }).title, "Nový deal");
  assert.throws(() => S.dealCreate.parse({ title: "" }));
  assert.throws(() => S.dealCreate.parse({ title: "x", value: -5 }));
  assert.throws(() => S.dealCreate.parse({ title: "x", expected_close_date: "31.12.2026" }));
  assert.throws(() => S.dealUpdate.parse({}), /aspoň jedno pole/);
  assert.throws(() => S.dealMove.parse({}), /stage_id nebo stage_name/);
  assert.ok(S.dealMove.parse({ stage_name: "Lead" }));
  assert.throws(() => S.dealStatus.parse({ status: "lost" }), /lost_reason/);
  assert.ok(S.dealStatus.parse({ status: "lost", lost_reason: "Cena" }));
  assert.ok(S.dealStatus.parse({ status: "won" }));
});

test("schémata: dotazy (coerce, limity, výchozí hodnoty)", () => {
  const q = S.dealListQuery.parse({ limit: "25", status: "all" });
  assert.deepEqual([q.limit, q.offset, q.status, q.sort, q.dir], [25, 0, "all", "created_at", "desc"]);
  assert.throws(() => S.dealListQuery.parse({ limit: "500" }));
  assert.throws(() => S.dealListQuery.parse({ owner_id: "nejaky" }));
  assert.equal(S.dealListQuery.parse({ owner_id: "me" }).owner_id, "me");
  assert.equal(S.activityListQuery.parse({ done: "true" }).done, true);
  assert.equal(S.activityListQuery.parse({ done: "false" }).done, false);
  assert.throws(() => S.activityListQuery.parse({ done: "ano" }));
});

test("schémata: osoby, firmy, aktivity, poznámky", () => {
  assert.throws(() => S.personCreate.parse({ email: "a@b.cz" }), /jméno/);
  assert.ok(S.personCreate.parse({ last_name: "Novák", email: "" }));
  assert.throws(() => S.personCreate.parse({ last_name: "Novák", email: "neni-email" }));
  assert.equal(S.orgCreate.parse({ name: "Alfa", ico: "123 456 78" }).ico, "12345678");
  assert.throws(() => S.orgCreate.parse({ name: "Alfa", ico: "123" }));
  assert.ok(S.orgCreate.parse({ name: "Alfa", ico: "" }));
  assert.throws(() => S.activityCreate.parse({ subject: "x", type: "oběd" }));
  assert.ok(S.activityCreate.parse({ subject: "Zavolat", type: "call", due_date: "2026-11-20", due_time: "09:30" }));
  assert.throws(() => S.noteCreate.parse({ content: "x" }), /právě jedno/);
  assert.throws(() => S.noteCreate.parse({ content: "x", deal_id: "60000000-0000-4000-8000-000000000001", person_id: "60000000-0000-4000-8000-000000000002" }));
  assert.ok(S.noteCreate.parse({ content: "x", deal_id: "60000000-0000-4000-8000-000000000001" }));
  assert.ok(S.activityComplete.parse({ next: { subject: "Další krok", due_date: "2026-12-01" } }));
});

test("OpenAPI: kompletní dokument se schématy těl a parametry dotazů", () => {
  const doc = buildOpenApi("https://crm.example") as { openapi: string; servers: { url: string }[]; paths: Record<string, Record<string, any>> };
  assert.equal(doc.openapi, "3.1.0");
  assert.equal(doc.servers[0].url, "https://crm.example/api/v1");
  assert.equal(ENDPOINTS.length, 30);
  const create = doc.paths["/deals"].post.requestBody.content["application/json"].schema;
  assert.ok(create.required.includes("title") && create.properties.value);
  const params = doc.paths["/deals"].get.parameters.map((p: { name: string }) => p.name);
  for (const n of ["status", "q", "limit", "offset", "stage_id"]) assert.ok(params.includes(n), n);
  assert.ok(doc.paths["/deals/{id}"].get.parameters.some((p: { name: string; in: string }) => p.name === "id" && p.in === "path"));
  assert.equal(doc.paths["/deals"].post.responses["201"].description.startsWith("Úspěch"), true);
  // každá operace má oprávnění v popisu a bearer zabezpečení
  for (const ops of Object.values(doc.paths)) for (const op of Object.values(ops)) assert.ok(op.security && /read|write/.test(op.description));
});
