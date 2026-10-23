// Step 7 controls in Tab 2: calendar status and meeting review, benchmark CSV upload, and post tagging.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, FolderSync, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { diagnosisQuery } from "@/lib/strategy-query";
import { checkCalendarNow, checkDriveNow, decideMeeting, savePostTags, suggestPostTags, uploadConfigCsv, type Rec, type DiagnosisData } from "@/lib/diagnosis.functions";

const TYPES = [["investor", "Investor"], ["rollup_operator", "Rollup operator"], ["founder", "Founder"], ["other", "Other"]] as const;
const ATTR = [["tracked_link", "Tracked link"], ["named_post", "Named a post"], ["said_linkedin", "Said LinkedIn"], ["unknown", "Unknown"]] as const;
const day = (s: string) => new Date(s).toLocaleString("en-GB", { timeZone: "Europe/Vienna", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const errText = (e: unknown) => (e instanceof Error ? e.message.replace(/^\[.*?\]\s*/, "") : "Something went wrong. Please try again.");

export function PendingMeetingsStatus() {
  const q = useQuery(diagnosisQuery());
  const pending = q.data?.meetings.filter((m) => m["status"] === "pending").length;
  return <div><p className="field-label">Meetings to review</p><p className="status-line">{q.isPending ? "…" : q.data?.calendarConnected ? `${pending} pending` : "Calendar not connected"}</p></div>;
}

export function latestObserved(obs: Rec[]) { return obs.reduce<string | null>((m, o) => (!m || String(o["observed_on"]) > m ? String(o["observed_on"]) : m), null); }
export const ageDays = (iso: string, now = new Date()) => Math.floor((now.getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000);

export function BenchmarkStaleness() {
  const q = useQuery(diagnosisQuery());
  const last = q.data ? latestObserved(q.data.observations) : null;
  const n = last ? ageDays(last) : null;
  if (!q.data || (n != null && n <= 40)) return null;
  return <div><p className="field-label">Benchmarks</p><p className="status-line"><span className="run-dot warn" aria-hidden="true" />{n == null ? "No benchmark snapshot yet" : `Benchmarks are ${n} days old`}</p></div>;
}

function DriveBenchmarks({ d, busy, go, check }: { d: DiagnosisData | undefined; busy: string | null; go: (w: string, fn: () => Promise<Record<string, unknown>>) => Promise<void>; check: () => Promise<Record<string, unknown>> }) {
  if (!d) return null;
  const run = d.drive.runs[0];
  const counts = (d.drive.steps.find((s) => s["step"] === "import files")?.["details"] as Rec | undefined)?.["counts"] as Rec | undefined;
  const rejected = d.drive.imports.filter((i) => i["status"] === "rejected");
  const last = latestObserved(d.observations);
  return (
    <section className="strategy-card" aria-labelledby="drive-bench-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id="drive-bench-h" className="card-label">Benchmarks</p>
        <Button size="sm" variant="outline" disabled={!!busy || !d.drive.connected} onClick={() => void go("drive", async () => ({ what: "drive", ...(await check()) }))}><FolderSync /> {busy === "drive" ? "Checking…" : "Check Drive now"}</Button>
      </div>
      {!d.drive.connected ? (
        <div className="mt-3" role="status"><p className="kpi-missing">Drive not connected</p>
          <p className="measure-note">Not connected yet: the Google Drive connection is being moved from Lovable to a Google service account. Benchmark snapshots can still be uploaded by hand.</p></div>
      ) : (
        <p className="measure-note mt-2">Folder "LinkedIn Measuring Tool / Benchmarks", checked daily at 07:00 (Vienna) after the calendar. Last check: {run ? `${day(String(run["finished_at"] ?? run["started_at"]))} · ${run["status"]}` : "never"}.</p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-5">
        {([["Files found", counts?.["found"]], ["Imported", counts?.["imported"]], ["Skipped", counts?.["skipped"]], ["Rejected", counts?.["rejected"]], ["Latest snapshot", last]] as const).map(([k, v]) =>
          <div key={k}><dt className="field-label">{k}</dt><dd className="status-line">{v == null ? "—" : String(v)}</dd></div>)}
      </dl>
      {rejected.length > 0 && <div className="mt-3" role="status"><p className="kpi-missing">Needs attention</p>
        <ul className="measure-note">{rejected.map((r) => <li key={String(r["id"])}>{String(r["drive_file_name"] ?? "file")}: {String(r["status_reason"] ?? "rejected")}</li>)}</ul></div>}
    </section>
  );
}

type Posts = { urn: string; published_at: string; hook: string | null; url: string | null }[];
export function Step7DataRuns({ posts }: { posts: Posts }) {
  const q = useQuery(diagnosisQuery());
  const qc = useQueryClient();
  const sync = useServerFn(checkCalendarNow), decide = useServerFn(decideMeeting), upload = useServerFn(uploadConfigCsv), drive = useServerFn(checkDriveNow);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, { type: string; attribution: string; post_urn: string }>>({});
  const go = async (what: string, fn: () => Promise<Record<string, unknown>>) => {
    setBusy(what); setNote(null);
    try { const r = await fn(); setNote([r["status"], r["reason"], r["what"] === "drive" ? `${r["found"]} files found, ${r["imported"]} imported, ${r["skipped"]} skipped, ${r["rejected"]} rejected` + ((r["files"] as Rec[] | undefined)?.length ? ` (${(r["files"] as Rec[]).map((f) => `${f["name"]}: ${f["status"]}`).join("; ")})` : "") : r["found"] != null ? `${r["found"]} meetings found, ${r["added"]} new` : null].filter(Boolean).join(" — ")); }
    catch (e) { setNote(errText(e)); }
    finally { setBusy(null); void qc.invalidateQueries({ queryKey: ["diagnosis"] }); void qc.invalidateQueries({ queryKey: ["measurement"] }); }
  };
  const d = q.data;
  const pending = (d?.meetings ?? []).filter((m) => m["status"] === "pending");
  const decided = (d?.meetings ?? []).filter((m) => m["status"] !== "pending");
  return (
    <div className="mt-6 measure-stack">
      <section className="strategy-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="card-label">Meetings to review{d?.calendarConnected ? ` (${pending.length})` : ""}</p>
          <Button size="sm" variant="outline" disabled={!!busy || !d?.calendarConnected} onClick={() => void go("sync", () => sync())}><CalendarCheck /> {busy === "sync" ? "Checking…" : "Check calendar now"}</Button>
        </div>
        {!d ? <p className="measure-note mt-3">Loading…</p> : !d.calendarConnected ? (
          <div className="mt-3" role="status"><p className="kpi-missing">Calendar not connected</p>
            <p className="measure-note">Not connected yet: the Google Calendar connection is being moved from Lovable to a Google service account. Meetings can still be logged by hand.</p></div>
        ) : (<>
          <p className="measure-note mt-2">Events inside your "room for luck" slot with a guest from outside your own addresses, since 28 September. Daily at 07:00 (Vienna). Last check: {d.integration?.["last_success_at"] ? day(String(d.integration["last_success_at"])) : "never"}.</p>
          {pending.length ? <div className="table-scroll mt-3"><table className="posts-table"><thead><tr><th>Date</th><th>Title</th><th>Domains</th><th>Suggested</th><th>Type</th><th>How they found you</th><th>Post</th><th /></tr></thead>
            <tbody>{pending.map((m) => { const id = String(m["event_id"]); const c = choice[id] ?? { type: String(m["suggested_type"] ?? "other"), attribution: "unknown", post_urn: "" };
              const set = (x: Partial<typeof c>) => setChoice({ ...choice, [id]: { ...c, ...x } });
              return <tr key={id}><td>{day(String(m["start_at"]))}</td><td>{String(m["title"])}</td><td>{(m["domains"] as string[]).join(", ")}</td>
                <td title={String(m["suggested_reason"] ?? "")}>{TYPES.find((t) => t[0] === m["suggested_type"])?.[1] ?? "—"}</td>
                <td><select className="version-select" value={c.type} onChange={(e) => set({ type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td><select className="version-select" value={c.attribution} onChange={(e) => set({ attribution: e.target.value })}>{ATTR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td><select className="version-select" value={c.post_urn} onChange={(e) => set({ post_urn: e.target.value })}><option value="">—</option>{posts.map((p) => <option key={p.urn} value={p.urn}>{p.published_at.slice(0, 10)} · {(p.hook ?? p.url ?? p.urn).slice(0, 50)}</option>)}</select></td>
                <td className="whitespace-nowrap"><Button size="sm" disabled={!!busy} onClick={() => void go(id, () => decide({ data: { event_id: id, decision: "confirm", type: c.type as "investor", attribution: c.attribution as "unknown", post_urn: c.post_urn || null } }))}>{busy === id ? "Saving…" : "Confirm"}</Button>{" "}
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void go(id, () => decide({ data: { event_id: id, decision: "drop" } }))}>Drop</Button></td></tr>; })}</tbody></table></div>
            : <p className="measure-note mt-3">No meetings waiting for review.</p>}
          {decided.length > 0 && <p className="measure-note mt-2">{decided.filter((m) => m["status"] === "confirmed").length} confirmed, {decided.filter((m) => m["status"] === "dropped").length} dropped.</p>}
        </>)}
      </section>
      <section className="strategy-card">
        <p className="card-label">Benchmark snapshot</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="outline" asChild disabled={!!busy}>
            <label className="cursor-pointer"><Upload /> {busy === "csv" ? "Importing…" : "Upload benchmark snapshot"}
              <input type="file" accept=".csv" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void go("csv", async () => upload({ data: { filename: f.name, text: await f.text() } })); }} />
            </label>
          </Button>
          <span className="measure-note">CSV with the same columns as benchmark_observations.csv. Unknown people and scores outside 0–2 are rejected.</span>
        </div>
      </section>
      <DriveBenchmarks d={d} busy={busy} go={go} check={() => drive()} />
      {note && <p className="measure-note" role="status">{note}</p>}
    </div>
  );
}

type Tag = { urn: string; topic: string; pillar: string; concept: string; named_person: boolean };
export function TagPosts() {
  const q = useQuery(diagnosisQuery());
  const qc = useQueryClient();
  const suggest = useServerFn(suggestPostTags), save = useServerFn(savePostTags);
  const [tags, setTags] = useState<Record<string, Tag>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const untagged = (q.data?.posts ?? []).filter((p: Rec) => p["topic"] == null);
  if (!q.data || !untagged.length) return null;
  const blank = (urn: string): Tag => ({ urn, topic: "core", pillar: "none", concept: "", named_person: false });
  const doSuggest = async () => {
    setBusy("suggest"); setNote(null);
    try { const r = await suggest(); const m = { ...tags }; for (const s of r.suggestions) m[s.urn] = s; setTags(m); if (!r.suggestions.length) setNote(`No suggestions${r.note ? ` (${r.note})` : ""}.`); }
    catch (e) { setNote(errText(e)); } finally { setBusy(null); }
  };
  const doSave = async (t: Tag) => {
    setBusy(t.urn); setNote(null);
    try { const r = await save({ data: t as Tag & { topic: "core"; pillar: "none" } }); if (r["status"] !== "saved") setNote(r["reason"] ?? "Not saved."); }
    catch (e) { setNote(errText(e)); } finally { setBusy(null); void qc.invalidateQueries({ queryKey: ["diagnosis"] }); void qc.invalidateQueries({ queryKey: ["measurement"] }); }
  };
  return (
    <section className="strategy-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="measure-h">Tag posts ({untagged.length} untagged)</h2>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void doSuggest()}><Sparkles /> {busy === "suggest" ? "Suggesting…" : "Suggest tags"}</Button>
      </div>
      <p className="measure-note mt-2">Suggestions come from the post's web address only. Check them, change what's wrong, then confirm. Untagged posts count as "untagged" in the Diagnosis.</p>
      <div className="table-scroll mt-3"><table className="posts-table"><thead><tr><th>Date</th><th>Post</th><th>Topic</th><th>Pillar</th><th>Concept</th><th>Named person</th><th /></tr></thead>
        <tbody>{untagged.map((p: Rec) => { const urn = String(p["urn"]); const t = tags[urn] ?? blank(urn); const set = (x: Partial<Tag>) => setTags({ ...tags, [urn]: { ...t, ...x } });
          return <tr key={urn}><td>{String(p["published_at"]).slice(0, 10)}</td><td><a href={String(p["url"] ?? "#")} target="_blank" rel="noreferrer">{String(p["url"] ?? urn).replace(/^https:\/\/www\.linkedin\.com\/(posts|feed\/update)\//, "").slice(0, 60)}</a></td>
            <td><select className="version-select" value={t.topic} onChange={(e) => set({ topic: e.target.value })}>{["core", "adjacent", "personal", "promo"].map((x) => <option key={x}>{x}</option>)}</select></td>
            <td><select className="version-select" value={t.pillar} onChange={(e) => set({ pillar: e.target.value })}>{["buying", "running", "thesis", "none"].map((x) => <option key={x}>{x}</option>)}</select></td>
            <td><input className="version-select" value={t.concept} maxLength={200} onChange={(e) => set({ concept: e.target.value })} aria-label="Concept" /></td>
            <td><select className="version-select" value={t.named_person ? "yes" : "no"} onChange={(e) => set({ named_person: e.target.value === "yes" })}><option>no</option><option>yes</option></select></td>
            <td><Button size="sm" disabled={!!busy || !tags[urn]} onClick={() => void doSave(t)}>{busy === urn ? "Saving…" : "Confirm"}</Button></td></tr>; })}</tbody></table></div>
      {note && <p className="measure-note mt-2" role="status">{note}</p>}
    </section>
  );
}
