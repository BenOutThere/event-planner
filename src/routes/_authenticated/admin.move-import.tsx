import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Upload } from "lucide-react";
import { importPeople, importReadBack, importRows, importUploadLink } from "@/lib/move-import.functions";
import { IMPORT_TABLES, USER_COLUMNS, batches, orderRows, reconcile, remapRow, type EventCounts, type ImportTable } from "@/lib/move";

export const Route = createFileRoute("/_authenticated/admin/move-import")({
  head: () => ({ meta: [{ title: "Import from the old Event Planner — OTG Event Planner" }] }),
  component: MoveImportPage,
});

type Exported = {
  format: string;
  exported_at: string;
  users: Array<{ id: string; email: string | null; display_name?: string | null }>;
  tables: Partial<Record<ImportTable, Record<string, any>[]>>;
  files: Array<{ bucket: string; path: string; size: number | null }>;
  problems: string[];
};
type PersonStatus = { email: string; status: string; note?: string };
type Report = {
  tables: Array<{ table: string; exported: number; skipped: number; now: number }>;
  files: { exported: number; uploaded: number; now: number; failed: string[] };
  events: Array<{ id: string; before: EventCounts; after: EventCounts | undefined }>;
  skipped: string[];
};

const COUNT_LABELS: Array<[keyof EventCounts, string]> = [
  ["fieldsWithInfo", "Fields with info"], ["tableRows", "Table rows"], ["files", "Files"], ["fileVersions", "Older file versions"],
  ["links", "Links"], ["savedVersions", "Saved versions"], ["reviews", "Reviews"], ["history", "History entries"],
  ["pins", "Pins"], ["assignments", "Assignments"], ["indexedFiles", "Indexed files"],
];

const eventMismatch = (r: Report["events"][number]) => !r.after || COUNT_LABELS.some(([k]) => r.before[k] !== r.after![k]);

/** The reconciliation as a Markdown file, to keep or send on. */
function reportMarkdown(r: Report, people: PersonStatus[] | null) {
  const lines = ["# Event Planner move: reconciliation", "", `Run at ${new Date().toISOString()}`, "", "## Per event (old app → OTG Shared)", ""];
  lines.push(`| Event | ${COUNT_LABELS.map(([, l]) => l).join(" | ")} | Match |`, `|${"---|".repeat(COUNT_LABELS.length + 2)}`);
  for (const e of r.events) {
    const cells = COUNT_LABELS.map(([k]) => (e.after?.[k] === e.before[k] ? `${e.before[k]}` : `${e.before[k]} → ${e.after?.[k] ?? "missing"}`));
    lines.push(`| ${e.before.name.replace(/\|/g, "/")} | ${cells.join(" | ")} | ${eventMismatch(e) ? "⚠️" : "✅"} |`);
  }
  lines.push("", "## Per table", "", "| Table | Exported | Skipped | Now in OTG Shared |", "|---|---|---|---|");
  for (const t of r.tables) lines.push(`| ${t.table} | ${t.exported} | ${t.skipped} | ${t.now} |`);
  lines.push("", `Files: ${r.files.exported} exported, ${r.files.uploaded} copied, ${r.files.now} now stored.`);
  const issues = [...r.files.failed, ...r.skipped];
  lines.push("", "## Needs a look", "", ...(issues.length ? issues.map((i) => `- ${i}`) : ["Nothing."]));
  if (people?.length) lines.push("", "## People", "", ...people.map((p) => `- ${p.email}: ${p.status}${p.note ? ` (${p.note})` : ""}`));
  return lines.join("\n") + "\n";
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MoveImportPage() {
  const { isAdmin, loading } = useAuth();
  const peopleFn = useServerFn(importPeople);
  const linkFn = useServerFn(importUploadLink);
  const rowsFn = useServerFn(importRows);
  const readFn = useServerFn(importReadBack);
  const [exp, setExp] = useState<Exported | null>(null);
  const [zipFiles, setZipFiles] = useState<Record<string, Uint8Array>>({});
  const [people, setPeople] = useState<PersonStatus[] | null>(null);
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [pct, setPct] = useState(0);
  const [report, setReport] = useState<Report | null>(null);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  /** Everyone the exported records point at. */
  function peopleInExport(e: Exported) {
    const ids = new Set<string>();
    for (const t of IMPORT_TABLES) for (const col of USER_COLUMNS[t] ?? []) for (const r of e.tables[t] ?? []) if (r[col]) ids.add(r[col]);
    return e.users
      .filter((u) => ids.has(u.id) && u.email)
      .map((u) => ({ old_id: u.id, email: u.email!, display_name: u.display_name ?? (e.tables.profiles ?? []).find((p) => p.id === u.id)?.display_name ?? null }));
  }

  async function choose(file: File) {
    setReport(null); setPeople(null); setStep("Reading the export file…");
    try {
      const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const data = JSON.parse(strFromU8(files["data.json"])) as Exported;
      if (data.format !== "otg-event-planner-export") throw new Error("This isn't an Event Planner export file.");
      setExp(data); setZipFiles(files);
      const res = await peopleFn({ data: { people: peopleInExport(data), invite: false, dryRun: true } });
      setPeople(res.people);
      setStep("");
    } catch (e: any) {
      setExp(null);
      setStep(`Couldn't read that file: ${e?.message ?? e}`);
    }
  }

  async function run() {
    if (!exp) return;
    setBusy(true); setReport(null); setPct(0);
    const skipped: string[] = [];
    try {
      setStep("Matching people to OTG logins…");
      const { map, people: ps } = await peopleFn({ data: { people: peopleInExport(exp), invite, dryRun: false } });
      setPeople(ps);

      const failed: string[] = [];
      let uploaded = 0;
      for (const [i, f] of exp.files.entries()) {
        setStep(`Copying files (${i + 1} of ${exp.files.length})…`);
        setPct(Math.round(((i + 1) / Math.max(1, exp.files.length)) * 50));
        const bytes = zipFiles[`files/${f.bucket}/${f.path}`];
        if (!bytes) { failed.push(`${f.bucket}/${f.path}: not in the export file`); continue; }
        try {
          const link = await linkFn({ data: { bucket: f.bucket, path: f.path } });
          const { error } = await supabase.storage.from(link.bucket).uploadToSignedUrl(link.path, link.token, new Blob([bytes as BlobPart]));
          if (error) throw error;
          uploaded += 1;
        } catch (e: any) {
          failed.push(`${f.bucket}/${f.path}: ${e?.message ?? e}`);
        }
      }

      const written: Record<string, { exported: number; skipped: number }> = {};
      for (const [i, t] of IMPORT_TABLES.entries()) {
        setStep(`Copying records: ${t.replace(/_/g, " ")}…`);
        setPct(50 + Math.round(((i + 1) / IMPORT_TABLES.length) * 45));
        const src = exp.tables[t] ?? [];
        const rows: Record<string, any>[] = [];
        for (const r of orderRows(t, src)) {
          const m = remapRow(t, r, map);
          if (m) rows.push(m);
          else skipped.push(`${t} ${r.id}: the person it belongs to has no OTG login`);
        }
        written[t] = { exported: src.length, skipped: src.length - rows.length };
        for (const batch of batches(rows)) await rowsFn({ data: { table: t, json: JSON.stringify(batch) } });
      }

      setStep("Checking everything arrived…");
      const after = JSON.parse((await readFn()).json) as { tables: Partial<Record<ImportTable, any[]>>; files: unknown[] };
      const before = reconcile(exp.tables);
      const now = reconcile(after.tables);
      setReport({
        tables: IMPORT_TABLES.map((t) => ({ table: t, ...written[t], now: (after.tables[t] ?? []).length })).filter((r) => r.exported || r.now),
        files: { exported: exp.files.length, uploaded, now: after.files.length, failed },
        events: Object.entries(before).map(([id, b]) => ({ id, before: b, after: now[id] })),
        skipped,
      });
      setPct(100);
      setStep("Import finished. Check the reconciliation below.");
    } catch (e: any) {
      setStep(`Import stopped: ${e?.message ?? e}. Nothing is lost: fix the problem and run it again (it updates rather than duplicates).`);
    } finally {
      setBusy(false);
    }
  }

  const noLogin = (people ?? []).filter((p) => p.status === "login will be created");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-3xl font-display font-semibold">Import from the old Event Planner</h1>
      <Card className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose the export file downloaded from the old Event Planner (Admin → Export for the move). People are matched to their
          OTG Control Centre login by email. Records keep their ids, dates, versions, reviews and history exactly as they were.
          Running it again updates the same records, so it never makes duplicates.
        </p>
        <input type="file" accept=".zip" disabled={busy} onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
        {exp && (
          <div className="text-sm space-y-2">
            <p>
              Exported {new Date(exp.exported_at).toLocaleString()}: {(exp.tables.events ?? []).length} events,{" "}
              {(exp.tables.event_field_values ?? []).length} saved values, {exp.files.length} files.
            </p>
            {exp.problems.length > 0 && (
              <div className="text-destructive">
                <p className="font-medium">The export reported problems:</p>
                <ul className="list-disc pl-5">{exp.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        {people && (
          <div className="text-sm">
            <p className="font-medium">People</p>
            <ul className="list-disc pl-5">
              {people.map((p) => <li key={p.email}>{p.email}: {p.status}{p.note ? ` (${p.note})` : ""}</li>)}
            </ul>
          </div>
        )}
        {exp && noLogin.length > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={invite} onCheckedChange={(v) => setInvite(v === true)} disabled={busy} />
            <span>
              Also email the {noLogin.length} {noLogin.length === 1 ? "person" : "people"} without an OTG login a link to set a password now.
              Either way their login is created and their roles, events and history come across. Leave this off until switch-over.
            </span>
          </label>
        )}
        {exp && <Button onClick={run} disabled={busy}><Upload className="size-4" /> {busy ? "Importing…" : "Start import"}</Button>}
        {step && <p className="text-sm">{step}</p>}
        {busy && <Progress value={pct} />}
      </Card>

      {report && (
        <Card className="p-5 space-y-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Reconciliation</h2>
            <Button variant="outline" size="sm" onClick={() => downloadText(`event-planner-reconciliation-${new Date().toISOString().slice(0, 10)}.md`, reportMarkdown(report, people))}>Download report</Button>
          </div>
          <div>
            <p className="font-medium">Per event (old app → OTG Shared)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr><th className="text-left p-1">Event</th>{COUNT_LABELS.map(([, l]) => <th key={l} className="p-1">{l}</th>)}<th className="p-1">Match</th></tr></thead>
                <tbody>
                  {report.events.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-1">{r.before.name}</td>
                      {COUNT_LABELS.map(([k]) => (
                        <td key={k} className={`p-1 text-center ${r.after?.[k] !== r.before[k] ? "text-destructive font-semibold" : ""}`}>
                          {r.before[k]}{r.after?.[k] !== r.before[k] ? ` → ${r.after?.[k] ?? "missing"}` : ""}
                        </td>
                      ))}
                      <td className="p-1 text-center">{eventMismatch(r) ? "⚠️" : "✅"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <p className="font-medium">Per table</p>
            <table className="text-xs">
              <thead><tr><th className="text-left p-1">Table</th><th className="p-1">Exported</th><th className="p-1">Skipped</th><th className="p-1">Now in OTG Shared</th></tr></thead>
              <tbody>
                {report.tables.map((r) => (
                  <tr key={r.table} className={`border-t ${r.now < r.exported - r.skipped ? "text-destructive font-semibold" : ""}`}>
                    <td className="p-1">{r.table}</td><td className="p-1 text-center">{r.exported}</td><td className="p-1 text-center">{r.skipped}</td><td className="p-1 text-center">{r.now}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Files: {report.files.exported} exported, {report.files.uploaded} copied, {report.files.now} now stored.</p>
          {[...report.files.failed, ...report.skipped].length > 0 && (
            <div className="text-destructive">
              <p className="font-medium">Needs a look</p>
              <ul className="list-disc pl-5">{[...report.files.failed, ...report.skipped].map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
