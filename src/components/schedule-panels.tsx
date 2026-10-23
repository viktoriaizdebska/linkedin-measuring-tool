// Step 9: waiting-for-export banner, Schedule panel, email switches, and the run-age status.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { scheduleQuery } from "@/lib/strategy-query";
import { saveEmailSettings } from "@/lib/schedule.functions";
import { uploadLinkedInExport } from "@/lib/pipeline.functions";
import { runAgeLevel } from "@/lib/schedule-rules";

const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { timeZone: "Europe/Vienna", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const dayText = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "—");
const toBase64 = async (f: File) => { const b = new Uint8Array(await f.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const daysAgo = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 864e5);

export function WaitingBanner() {
  const q = useQuery(scheduleQuery());
  const qc = useQueryClient();
  const upload = useServerFn(uploadLinkedInExport);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!q.data?.waiting.length) return null;
  const onFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setNote("The file is larger than 5 MB."); return; }
    setBusy(true); setNote(null);
    try { const r = await upload({ data: { filename: f.name, base64: await toBase64(f) } }); setNote([r["status"], r["reason"]].filter(Boolean).join(" — ")); }
    catch (e) { setNote(e instanceof Error ? e.message : "The upload failed. Please try again."); }
    finally { setBusy(false); for (const k of ["schedule", "measurement", "diagnosis"]) void qc.invalidateQueries({ queryKey: [k] }); }
  };
  return (<>{q.data.waiting.map((w) => (
    <div key={w.label} className="waiting-banner" role="status">
      <div><strong>{w.label} ({w.range}) is waiting for your LinkedIn export</strong><br />{w.instruction}.{note && <><br />{note}</>}</div>
      <Button variant="outline" size="sm" asChild disabled={busy}>
        <label className="cursor-pointer"><Upload /> {busy ? "Uploading and measuring…" : "Upload LinkedIn export"}
          <input type="file" accept=".xlsx" className="sr-only" disabled={busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </Button>
    </div>))}</>);
}

/** Age of the last successful measurement run: amber after 16 days, red after 21. */
export function useRunAge() {
  const q = useQuery(scheduleQuery());
  const last = q.data?.lastSuccessAt ?? null;
  return { level: q.data ? runAgeLevel(last) : "", text: last ? `last successful run ${daysAgo(last)} days ago` : "no successful run yet" };
}
export function RunAgeStatus() {
  const a = useRunAge();
  return <div><p className="field-label">Last successful run</p><p className="status-line"><span className={`run-dot ${a.level}`} aria-hidden="true" />{a.text}</p></div>;
}

export function SchedulePanel() {
  const q = useQuery(scheduleQuery());
  const qc = useQueryClient();
  const save = useServerFn(saveEmailSettings);
  const [err, setErr] = useState<string | null>(null);
  const d = q.data;
  if (q.isError) return <section className="strategy-card mt-6" role="alert"><p>The schedule could not be loaded. Please try again.</p></section>;
  if (!d) return <p className="measure-note mt-6">Loading schedule…</p>;
  const set = async (k: "email_reminders" | "email_summaries", v: boolean) => {
    setErr(null);
    try { await save({ data: { email_reminders: d.settings?.email_reminders ?? false, email_summaries: d.settings?.email_summaries ?? false, [k]: v } }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Settings could not be saved."); }
    finally { void qc.invalidateQueries({ queryKey: ["schedule"] }); }
  };
  const P = d.periods.filter((p) => /^P\d+$/.test(p.label));
  const stepOf = (s: string) => d.dailySteps.find((x) => x.step === s);
  return (
    <div className="mt-6 measure-stack">
      <section className="strategy-card" aria-labelledby="schedule-h">
        <p id="schedule-h" className="card-label">Schedule</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div><dt className="field-label">Next due</dt><dd className="status-line">{d.nextDue ? `${d.nextDue.label} (${d.nextDue.range}) · ${when(d.nextDue.at)}` : "—"}</dd></div>
          <div><dt className="field-label">Next reminder</dt><dd className="status-line">{dayText(d.nextReminder)}</dd></div>
          <div><dt className="field-label">Friday deadline</dt><dd className="status-line">{d.nextDeadline ? `${dayText(d.nextDeadline)}, 07:00` : "—"}</dd></div>
          <div><dt className="field-label">Daily job</dt><dd className="status-line">07:00 Vienna · last {when(d.dailyRunAt)}</dd></div>
        </dl>
        <div className="table-scroll mt-4"><table className="measure-table"><thead><tr><th>Period</th><th>Dates</th><th>Measured on</th><th>Status</th></tr></thead>
          <tbody>{P.map((p) => <tr key={p.id}><td>{p.label}</td><td>{p.range}</td><td>{dayText(p.tuesday)}</td><td>{p.status === "waiting for data" ? `waiting for data since ${when(p.since)}` : p.status}</td></tr>)}</tbody></table></div>
        <h3 className="card-label mt-6">Daily job steps (last result)</h3>
        <ul className="step-list">{["calendar-sync", "benchmark-drive", "measure-due"].map((s) => { const x = stepOf(s); return <li key={s}>{s}: {x ? `${x.status}${x.message ? ` — ${x.message}` : ""}` : "not run yet"}</li>; })}</ul>
        <h3 className="card-label mt-6">LinkedIn API</h3>
        <p className="measure-note">Status: {d.linkedinApi?.["status"] ?? "—"} · token expires: {d.linkedinApi?.["token_expires_at"] ? when(d.linkedinApi["token_expires_at"]) : "no token"} · version sunset: {d.linkedinApi?.["version_sunset_date"] ?? "none recorded"}</p>
        {d.apiWarnings.map((w) => <p key={w} className="measure-note run-error">{w}</p>)}
      </section>
      <section className="strategy-card" aria-labelledby="email-h">
        <p id="email-h" className="card-label">Email settings</p>
        <p className="measure-note mt-2">Emails go only to viktoria@izdebska.com and never contain numbers about other people. Sending also needs a sender domain to be set up.</p>
        <div className="mt-3 flex flex-wrap gap-8">
          <label className="switch-row"><Switch checked={!!d.settings?.email_reminders} onCheckedChange={(v) => void set("email_reminders", v)} aria-label="Email reminders" /> Email reminders <span className="measure-note">(Tuesday and Thursday while an export is missing)</span></label>
          <label className="switch-row"><Switch checked={!!d.settings?.email_summaries} onCheckedChange={(v) => void set("email_summaries", v)} aria-label="Email summaries" /> Email summaries <span className="measure-note">(period measured; run failed or needs attention)</span></label>
        </div>
        {err && <p className="measure-note run-error" role="alert">{err}</p>}
        {d.notifications.length > 0 && <ul className="step-list mt-3">{d.notifications.map((n, i) => <li key={i}>{when(n["created_at"])} · {n["kind"]} · {n["subject"]} — {n["outcome"]}</li>)}</ul>}
      </section>
    </div>
  );
}
