import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RestoreReport } from "@/lib/restore.server";

// One-time move of the Lovable data into this database. Works only while the database is empty.
export const Route = createFileRoute("/restore")({
  ssr: false,
  component: RestorePage,
});

function RestorePage() {
  const [empty, setEmpty] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<(Partial<RestoreReport> & { message: string; ok: boolean }) | null>(null);

  useEffect(() => {
    fetch("/api/restore").then((r) => r.json()).then((j) => setEmpty(Boolean(j.empty))).catch(() => setEmpty(null));
  }, [report]);

  async function run() {
    if (!file) return;
    setBusy(true);
    setReport(null);
    try {
      const r = await fetch("/api/restore", { method: "POST", headers: { "content-type": "application/json" }, body: await file.text() });
      setReport(await r.json());
    } catch (e) {
      setReport({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Move data from Lovable</h1>
      <p className="text-muted-foreground">
        Loads the exported file (lovable-data-….json) into this database once. It only runs while the database is empty and either loads everything and passes every check, or saves nothing.
      </p>
      {empty === false && !report?.ok && <p className="font-medium">This database already holds data, so restore is switched off.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept="application/json,.json" aria-label="Export file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button onClick={run} disabled={!file || busy || empty === false}>{busy ? "Loading…" : "Load data"}</Button>
      </div>
      {report && (
        <section className="space-y-3" aria-live="polite">
          <p className={report.ok ? "font-medium" : "font-medium text-destructive"}>{report.ok ? "✓ " : "✗ "}{report.message}</p>
          {report.tables && (
            <table className="w-full text-sm">
              <thead><tr className="text-left"><th>Table</th><th>Expected</th><th>Loaded</th><th>Checksum</th></tr></thead>
              <tbody>
                {report.tables.map((t) => (
                  <tr key={t.table}><td>{t.table}</td><td>{t.expected}</td><td>{t.restored}</td><td>{t.checksumMatches ? "match" : "MISMATCH"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {report.files && <p className="text-sm">Files: {report.files.filter((f) => f.sha256Matches).length} of {report.files.length} match their fingerprint.</p>}
          {!!report.filesNotMigrated?.length && <p className="text-sm text-muted-foreground">Original upload not carried over (data is, file is not needed again): {report.filesNotMigrated.join(", ")}</p>}
          {!!report.setupRowsKept?.length && <p className="text-sm text-muted-foreground">Already created by the setup, kept as they are (only the created date differs from Lovable): {report.setupRowsKept.join(", ")}</p>}
          {report.alwaysOnTriggers !== undefined && <p className="text-sm">History protection: {report.alwaysOnTriggers} always-on triggers active.</p>}
          {report.ok && <a className="underline" href="/">Open the dashboard</a>}
        </section>
      )}
    </main>
  );
}
