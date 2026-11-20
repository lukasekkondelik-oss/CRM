"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { decodeBuffer, parseCsv, toCsv } from "@/lib/csv";
import { ENTITY_LABEL, IMPORT_FIELDS, autoMap, buildRows, type EntityKind } from "@/lib/import";
import { runImport, type ImportMember, type ImportResult } from "@/lib/import-run";
import type { Pipeline, Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props { members: ImportMember[]; userId: string; pipelines: Pipeline[]; stages: Stage[] }

const MAX_ROWS = 5000;
const SAMPLE: Record<EntityKind, string[][]> = {
  persons: [["Jméno", "Příjmení", "E-mail", "Telefon", "Pozice", "Firma"], ["Jan", "Novák", "jan@alfa.cz", "+420 777 123 456", "Finanční poradce", "Alfa Finance s.r.o."]],
  orgs: [["Název", "IČO", "Web", "Adresa"], ["Alfa Finance s.r.o.", "12345678", "alfa.cz", "Ulice 1, Praha"]],
  deals: [["Název", "Hodnota", "Fáze", "Firma", "Osoba", "Uzavření"], ["Automatizace reportingu", "120 000", "Lead", "Alfa Finance s.r.o.", "Jan Novák", "31. 12. 2026"]],
};

export function ImportExport(props: Props) {
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <ImportWizard {...props} />
      <Card>
        <CardHeader><CardTitle>Export do CSV</CardTitle><CardDescription>Soubory jsou v UTF-8 s oddělovačem <code>;</code>, takže se v Excelu otevřou správně česky. Tabulkový pohled Pipeline má vlastní export aktuálních řádků.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {([["osoby", "Osoby"], ["firmy", "Firmy"], ["dealy", "Dealy"]] as const).map(([k, label]) => (
            <a key={k} href={`/export/${k}`} download className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium hover:bg-muted"><Download className="size-4" /> {label}</a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ImportWizard({ members, userId, pipelines, stages }: Props) {
  const [kind, setKind] = useState<EntityKind>("persons");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const headers = table?.[0] ?? [];
  const dataRows = useMemo(() => (table ? table.slice(1, MAX_ROWS + 1) : []), [table]);
  const parsed = useMemo(() => buildRows(kind, dataRows, mapping), [kind, dataRows, mapping]);
  const valid = parsed.filter((r) => r.errors.length === 0);
  const invalid = parsed.filter((r) => r.errors.length > 0);
  const fields = IMPORT_FIELDS[kind];
  const missingRequired = fields.filter((f) => f.required && mapping[f.key] < 0);
  const personNeedsName = kind === "persons" && mapping.full_name < 0 && mapping.first_name < 0 && mapping.last_name < 0;
  const running = progress !== null;

  function reset() { setTable(null); setFileName(""); setMapping({}); setResult(null); setProgress(null); if (input.current) input.current.value = ""; }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10_000_000) return void toast.error("Soubor je příliš velký (max. 10 MB).");
    const rows = parseCsv(decodeBuffer(await file.arrayBuffer()));
    if (rows.length < 2) return void toast.error("V souboru je jen hlavička nebo je prázdný.");
    setTable(rows); setFileName(file.name); setResult(null);
    setMapping(autoMap(kind, rows[0]));
    if (rows.length - 1 > MAX_ROWS) toast.warning(`Soubor má ${rows.length - 1} řádků, naimportuje se prvních ${MAX_ROWS}.`);
  }

  function changeKind(k: EntityKind) { setKind(k); if (table) setMapping(autoMap(k, headers)); setResult(null); }

  async function start() {
    setProgress([0, valid.length]);
    try {
      const res = await runImport({ kind, rows: valid, members, userId, pipelineId, stages: stages.filter((s) => s.pipeline_id === pipelineId), skipDuplicates }, (d, t) => setProgress([d, t]));
      setResult(res);
      toast.success(`Import hotový: ${res.created} nových záznamů`);
    } catch (e) {
      toast.error(`Import se přerušil: ${(e as Error).message ?? "neznámá chyba"}`);
    } finally { setProgress(null); }
  }

  const downloadSample = () => {
    const blob = new Blob([toCsv(SAMPLE[kind])], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `vzor-${kind}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-4" /> Import z CSV</CardTitle><CardDescription>Nahraj soubor, zkontroluj mapování sloupců a náhled, pak importuj. Podporuje UTF-8 i starší Windows-1250 a oddělovače <code>;</code> <code>,</code> tabulátor.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        {result ? (
          <div className="flex flex-col gap-3" role="status">
            <p className="flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="size-5 text-success" /> Import dokončen</p>
            <div className="flex flex-wrap gap-2 text-sm"><Badge variant="success">Vytvořeno: {result.created}</Badge><Badge variant="muted">Přeskočeno (duplicity): {result.skipped}</Badge><Badge variant={result.failed.length ? "danger" : "muted"}>Chyby: {result.failed.length}</Badge></div>
            {result.warnings.map((w) => <p key={w} className="text-sm text-muted-foreground">• {w}</p>)}
            {result.failed.length > 0 && <ul className="max-h-40 overflow-auto rounded-lg bg-danger-soft p-3 text-xs text-danger">{result.failed.slice(0, 50).map((f) => <li key={f.line}>Řádek {f.line}: {f.message}</li>)}</ul>}
            <div><Button onClick={reset}>Importovat další soubor</Button></div>
          </div>
        ) : (
          <>
            <div role="radiogroup" aria-label="Co importuješ" className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(ENTITY_LABEL) as EntityKind[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => changeKind(k)} disabled={running}
                  className={cn("rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors", kind === k ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}>{ENTITY_LABEL[k]}</button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" id="csv-file" onChange={(e) => onFile(e.target.files?.[0])} />
              <label htmlFor="csv-file" className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-card hover:bg-primary/90"><Upload className="size-4" /> {table ? "Vybrat jiný soubor" : "Vybrat CSV soubor"}</label>
              {fileName && <span className="text-sm text-muted-foreground">{fileName} · {table!.length - 1} řádků</span>}
              <button type="button" onClick={downloadSample} className="text-sm text-accent-foreground hover:underline">Stáhnout vzorový CSV</button>
            </div>

            {table && (
              <>
                <div>
                  <p className="mb-2 text-sm font-medium">Mapování sloupců</p>
                  <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    {fields.map((f) => (
                      <label key={f.key} className="flex items-center gap-3 text-sm">
                        <span className="w-36 shrink-0 text-muted-foreground">{f.label}{f.required && <span className="text-danger"> *</span>}</span>
                        <Select value={String(mapping[f.key] ?? -1)} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))} className="h-9" aria-label={`Sloupec pro ${f.label}`}>
                          <option value="-1">— nemapovat —</option>
                          {headers.map((h, i) => <option key={i} value={i}>{h || `Sloupec ${i + 1}`}</option>)}
                        </Select>
                      </label>
                    ))}
                  </div>
                  {kind === "deals" && (
                    <label className="mt-3 flex items-center gap-3 text-sm"><span className="w-36 shrink-0 text-muted-foreground">Do pipeline</span>
                      <Select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className="h-9 max-w-xs" aria-label="Pipeline">{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
                  )}
                  {(missingRequired.length > 0 || personNeedsName) && (
                    <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"><AlertTriangle className="size-4" />
                      {personNeedsName ? "Namapuj aspoň jméno, příjmení nebo celé jméno." : `Namapuj povinné pole: ${missingRequired.map((f) => f.label).join(", ")}.`}</p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Náhled (prvních 5 řádků)</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[560px] text-xs">
                      <thead className="bg-muted/50 text-left text-muted-foreground"><tr><th className="px-2 py-1.5">#</th>{fields.filter((f) => mapping[f.key] >= 0).map((f) => <th key={f.key} className="px-2 py-1.5">{f.label}</th>)}<th className="px-2 py-1.5">Stav</th></tr></thead>
                      <tbody className="divide-y">
                        {parsed.slice(0, 5).map((r) => (
                          <tr key={r.line} className={cn(r.errors.length && "bg-danger-soft/60")}>
                            <td className="px-2 py-1.5 text-muted-foreground">{r.line}</td>
                            {fields.filter((f) => mapping[f.key] >= 0).map((f) => <td key={f.key} className="max-w-48 truncate px-2 py-1.5">{String(table[r.line - 1]?.[mapping[f.key]] ?? "")}</td>)}
                            <td className="px-2 py-1.5">{r.errors.length ? <span className="text-danger">{r.errors.join("; ")}</span> : <span className="text-success">OK</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-sm"><span className="font-medium text-success">{valid.length}</span> řádků je v pořádku{invalid.length > 0 && <>, <span className="font-medium text-danger">{invalid.length}</span> s chybou se přeskočí</>}.</p>
                  {invalid.length > 5 && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Zobrazit chyby</summary><ul className="mt-1 max-h-32 overflow-auto">{invalid.slice(0, 50).map((r) => <li key={r.line}>Řádek {r.line}: {r.errors.join("; ")}</li>)}</ul></details>}
                </div>

                {kind !== "deals" && (
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
                    Přeskočit duplicity ({kind === "persons" ? "podle e-mailu" : "podle IČO nebo názvu"})</label>
                )}

                {running ? (
                  <div role="status" aria-live="polite">
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress![1] ? (progress![0] / progress![1]) * 100 : 0}%` }} /></div>
                    <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Importuji… {progress![0]} / {progress![1]}</p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button onClick={start} disabled={valid.length === 0 || missingRequired.length > 0 || personNeedsName || (kind === "deals" && !pipelineId)}>Importovat {valid.length} {kind === "persons" ? "osob" : kind === "orgs" ? "firem" : "dealů"}</Button>
                    <Button variant="ghost" onClick={reset}>Zrušit</Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
