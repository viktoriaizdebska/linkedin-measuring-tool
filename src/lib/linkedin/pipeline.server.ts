// measure-period: run log -> parse -> validate -> normalize -> KPIs -> summary -> one atomic commit (commit_run).
// Writes only through database functions; never updates or deletes measurement rows.
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dropIncompleteDay, FormatError, idTime, parseExport, PARSER_VERSION, TRANSFORM_VERSION, validateExport, viennaDate,
  type Issue, type ParsedExport,
} from "./export-reader";
import { PROMPT_VERSION, SUMMARY_MODEL, summarize, type SummaryInput } from "./ai-summary.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;
type Row = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export const WORKFLOW = "measure-period-1";
const BUCKET = "raw-imports";
const EXPORT = "linkedin_export";
const MAX_BYTES = 5 * 1024 * 1024;
const SOURCE_RANK: Record<string, number> = { linkedin_api: 1, linkedin_export: 2, manual: 3, baseline_2026_10_08: 4 };
const TARGET_INDUSTRIES = ["Venture capital and private equity principals", "Financial services", "Banking"];
const SENIOR_LEVELS = ["Owner", "Partner", "CXO", "VP", "Director"];

export type RunResult = {
  status: string; run_id?: string; reason?: string; periods_written?: string[]; no_change?: string[];
  rows_written?: number; warnings?: string[]; posts?: { alias: number; by_date: number; by_id_time: number; created: number };
  kpis?: number; summary?: string; dry_run?: unknown;
};

const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as NonNullable<T>;
};
async function all(q: () => any, what: string): Promise<Row[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Row[] = [];
  for (let o = 0; ; o += 1000) {
    const d = must(await q().range(o, o + 999), what) as Row[];
    out.push(...d);
    if (d.length < 1000) return out;
  }
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
/** 12:00 Vienna on the given date, as an ISO timestamp. */
export function viennaNoon(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", hour: "2-digit", hourCycle: "h23" }).format(probe));
  return new Date(Date.UTC(y, m - 1, d, 12 - (h - 12))).toISOString();
}
const utcDate = (iso: string) => new Date(iso).toISOString().slice(0, 10);

// ---------- uploads and manual entries ----------
export async function uploadExport(db: DB, file: { bytes: Uint8Array; filename: string }, opts: { now?: Date | undefined } = {}): Promise<RunResult> {
  if (!/\.xlsx$/i.test(file.filename)) return { status: "rejected", reason: "Please upload the .xlsx file LinkedIn exports." };
  if (file.bytes.byteLength > MAX_BYTES) return { status: "rejected", reason: "The file is larger than 5 MB." };
  const sha = sha256(file.bytes);
  const seen = must(await db.from("raw_imports").select("id,status").eq("sha256", sha).maybeSingle(), "raw lookup") as Row | null;
  // A file whose earlier run failed before it was parsed can be retried; parsed or rejected files are never processed twice.
  if (seen?.status === "received") return measurePeriod(db, { rawImportIds: [seen.id], trigger: "retry", now: opts.now });
  if (seen) return { status: "already processed", reason: "This file was uploaded before; nothing changed." };
  const m = /_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.xlsx$/i.exec(file.filename);
  let hint = m ? `${m[1]}–${m[2]}` : null;
  if (!hint) { try { const p = parseExport(file.bytes); hint = `${p.range.start}–${p.range.end}`; } catch { hint = null; } }
  const safeName = file.filename.replace(/[^\w.\- ]+/g, "_");
  const path = `${EXPORT}/${sha}/${safeName}`;
  const up = await db.storage.from(BUCKET).upload(path, file.bytes, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false });
  if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(`File could not be stored: ${up.error.message}`);
  const id = must(await db.rpc("register_raw_import", { p_source: EXPORT, p_path: `${BUCKET}/${path}`, p_sha: sha, p_from: "upload", p_hint: hint, p_payload: { filename: file.filename, bytes: file.bytes.byteLength } }), "register");
  if (!id) return { status: "already processed", reason: "This file was uploaded before; nothing changed." };
  return measurePeriod(db, { rawImportIds: [id as unknown as string], trigger: "upload", now: opts.now });
}

export type ManualEntry =
  | { entry_type: "lead"; date: string; kind: string; person_type: string; attribution: string; post_urn?: string | null | undefined; note?: string | null | undefined; source?: "manual" | "google_calendar" | undefined; calendar_event_id?: string | null | undefined }
  | { entry_type: "spot_check"; checked_on: string; sample_size: number; strict_count: number; broad_count: number; none_count: number; method_version: string }
  | { entry_type: "lead_removal"; lead_id: string };

export async function logEntry(db: DB, entry: ManualEntry, opts: { now?: Date | undefined } = {}): Promise<RunResult> {
  const payload = { ...entry, nonce: randomUUID(), received_at: (opts.now ?? new Date()).toISOString() };
  const source = entry.entry_type === "lead" && entry.source === "google_calendar" ? "google_calendar" : "manual";
  const id = must(await db.rpc("register_raw_import", { p_source: source, p_path: null, p_sha: sha256(JSON.stringify(payload)), p_from: source === "manual" ? "form" : "calendar_review", p_hint: null, p_payload: payload }), "register");
  return measurePeriod(db, { rawImportIds: [id as unknown as string], trigger: "manual", now: opts.now });
}

// ---------- state helpers ----------
const KINDS = ["follower_daily", "account_daily", "account_range", "total_followers", "post_export", "post_other", "aud_followers", "aud_viewers", "audience_checks", "leads"] as const;
type Kind = (typeof KINDS)[number];
type Rows = Record<Kind, Row[]>;
const emptyRows = (): Rows => Object.fromEntries(KINDS.map((k) => [k, []])) as unknown as Rows;
function splitRows(t: { follower_daily: Row[]; account_metrics: Row[]; post_observations: Row[]; audience_observations: Row[]; audience_checks: Row[]; leads: Row[] }): Rows {
  const r = emptyRows();
  r.follower_daily = t.follower_daily;
  for (const a of t.account_metrics) {
    if (a.metric_key === "total_followers") r.total_followers.push(a);
    else if (a.window_start && a.window_start === a.window_end && ["impressions", "engagements"].includes(a.metric_key)) r.account_daily.push(a);
    else r.account_range.push(a);
  }
  for (const o of t.post_observations) (o.obs_window === "export_range" ? r.post_export : r.post_other).push(o);
  for (const a of t.audience_observations) (a.scope === "followers" ? r.aud_followers : r.aud_viewers).push(a);
  r.audience_checks = t.audience_checks; r.leads = t.leads;
  return r;
}
const strip = (x: Row) => { const { id: _i, created_at: _c, snapshot_id: _s, ...rest } = x; return rest; };
const canon: Record<Kind, (x: Row) => unknown[]> = {
  follower_daily: (x) => [x.date, Number(x.new_followers), x.total == null ? null : Number(x.total)],
  account_daily: (x) => [x.metric_key, Number(x.value), x.window_start, x.window_end],
  account_range: (x) => [x.metric_key, Number(x.value), x.window_start, x.window_end],
  total_followers: (x) => [Number(x.value), x.window_start, x.window_end],
  post_export: (x) => [x.post_urn, new Date(x.observed_at).toISOString(), x.age_days, x.obs_window, x.impressions, x.engagements],
  post_other: (x) => [x.post_urn, new Date(x.observed_at).toISOString(), x.age_days, x.obs_window, x.impressions],
  aud_followers: (x) => [x.dimension, x.label, x.label_raw ?? null, x.share_pct == null ? null : Number(x.share_pct), !!x.below_one_pct],
  aud_viewers: (x) => [x.dimension, x.label, x.label_raw ?? null, x.share_pct == null ? null : Number(x.share_pct), !!x.below_one_pct],
  audience_checks: (x) => [x.checked_on, x.sample_size, x.strict_count, x.broad_count, x.none_count, x.method_version],
  leads: (x) => [x.date, x.kind, x.person_type, x.attribution, x.post_urn ?? null, x.note ?? null, x.calendar_event_id ?? null],
};
const same = (k: Kind, a: Row[], b: Row[]) => {
  const f = (rs: Row[]) => rs.map((x) => JSON.stringify(canon[k](x))).sort().join("\n");
  return f(a) === f(b);
};

async function loadRows(db: DB, snapshotIds: string[]): Promise<Map<string, Rows>> {
  const out = new Map<string, Rows>();
  if (!snapshotIds.length) return out;
  const tables = ["follower_daily", "account_metrics", "post_observations", "audience_observations", "audience_checks", "leads"] as const;
  const res = await Promise.all(tables.map((t) => all(() => db.from(t).select("*").in("snapshot_id", snapshotIds).order("id"), t)));
  for (const id of snapshotIds) {
    const pick = (i: number) => res[i]!.filter((r) => r.snapshot_id === id);
    out.set(id, splitRows({ follower_daily: pick(0), account_metrics: pick(1), post_observations: pick(2), audience_observations: pick(3), audience_checks: pick(4), leads: pick(5) }));
  }
  return out;
}
type Snap = { id: string; period_id: string; source_key: string; completeness: string; captured_at: string; created_at?: string; rows: Rows; isNew?: boolean };
const better = (a: Snap, b: Snap) => {
  const c = (a.completeness === "complete" ? 0 : 1) - (b.completeness === "complete" ? 0 : 1);
  if (c) return c;
  const s = (SOURCE_RANK[a.source_key] ?? 5) - (SOURCE_RANK[b.source_key] ?? 5);
  if (s) return s;
  return Date.parse(b.captured_at) - Date.parse(a.captured_at);
};
const winner = (snaps: Snap[], k: Kind, filter?: (r: Row) => boolean) =>
  snaps.filter((s) => s.rows[k].some((r) => !filter || filter(r))).sort(better)[0];

// ---------- the run ----------
export type MeasureOpts = { rawImportIds?: string[]; periodId?: string; trigger: "upload" | "manual" | "retry" | "schedule"; dryRun?: boolean; localFiles?: { bytes: Uint8Array; name: string }[]; testCrash?: boolean; skipSummary?: boolean; summaryNote?: string; now?: Date | undefined };

export async function measurePeriod(db: DB, opts: MeasureOpts): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const uploadDate = viennaDate(now);
  const runId = must(await db.rpc("run_start", { p_trigger: opts.trigger, p_period: opts.periodId ?? null, p_workflow: WORKFLOW }), "run start") as unknown as string;
  let stepName = "start", stepStart = new Date(), recordsRead = 0, rawIds: string[] = [];
  const step = async (details?: unknown, message?: string) => {
    must(await db.rpc("run_step", { p_run: runId, p_step: stepName, p_status: "succeeded", p_started: stepStart.toISOString(), p_message: message ?? null, p_details: details ?? null }), "step log");
    stepStart = new Date();
  };
  const finish = async (status: string, message: string, issues: Issue[] = [], rawStatus: string | null = null, failedStep = true): Promise<RunResult> => {
    if (failedStep) await db.rpc("run_step", { p_run: runId, p_step: stepName, p_status: "failed", p_started: stepStart.toISOString(), p_message: message, p_details: null });
    await db.rpc("run_finish", { p_run: runId, p_status: status, p_summary: message, p_issues: issues, p_raw_ids: rawIds, p_raw_status: rawStatus, p_records_read: recordsRead });
    return { status, run_id: runId, reason: message, warnings: issues.filter((i) => i.severity !== "info").map((i) => i.message) };
  };
  try {
    // a. start
    if (!must(await db.rpc("run_lock", { p_run: runId }), "lock")) return await finish("failed", "Another measurement run is in progress; try again in a few minutes.");
    const period = opts.periodId ? must(await db.from("periods").select("*").eq("id", opts.periodId).single(), "period") as Row : null;
    let raws: Row[];
    if (opts.rawImportIds) raws = must(await db.from("raw_imports").select("*").in("id", opts.rawImportIds), "raw imports") as Row[];
    else if (period) {
      raws = (must(await db.from("raw_imports").select("*").eq("source_key", EXPORT).eq("status", "parsed").order("received_at"), "raw imports") as Row[])
        .filter((r) => { const [s, e] = String(r.period_hint ?? "").split("–"); return s && e && s <= period.end_date && e >= period.start_date; });
    } else raws = [];
    if (opts.localFiles) {
      if (!opts.dryRun) throw new Error("Local files are only allowed in dry runs.");
      raws = opts.localFiles.map((f, i) => ({ id: null, source_key: EXPORT, sha256: sha256(f.bytes), period_hint: f.name, received_at: String(i), _bytes: f.bytes }));
    }
    raws.sort((a, b) => String(a.received_at).localeCompare(String(b.received_at)));
    rawIds = raws.map((r) => r.id).filter(Boolean);
    const inputKey = sha256(JSON.stringify({ periods: period ? [period.id] : raws.map((r) => r.period_hint).sort(), sha: raws.map((r) => r.sha256).sort(), parser: PARSER_VERSION, transform: TRANSFORM_VERSION }));
    const existing = must(await db.rpc("run_claim_key", { p_run: runId, p_key: inputKey, p_claim: !opts.dryRun }), "input key");
    if (existing) {
      await step({ input_key: inputKey });
      await finish("succeeded", `Already processed: same input as run ${existing}.`, [], null, false);
      return { status: "already processed", run_id: runId, reason: `Same input as run ${existing}; nothing changed.` };
    }
    await step({ input_key: inputKey, raw_imports: rawIds.length });

    // b. parse (layout first)
    stepName = "parse";
    const files: { raw: Row; p: ParsedExport }[] = [];
    const manual: { raw: Row; entry: ManualEntry }[] = [];
    for (const raw of raws) {
      if (raw._bytes) { files.push({ raw, p: parseExport(raw._bytes) }); continue; }
      if (raw.source_key === EXPORT) {
        const dl = await db.storage.from(BUCKET).download(String(raw.storage_path).replace(/^raw-imports\//, ""));
        if (dl.error || !dl.data) throw new Error(`Stored file could not be read: ${dl.error?.message}`);
        try { files.push({ raw, p: parseExport(new Uint8Array(await dl.data.arrayBuffer())) }); }
        catch (e) { if (e instanceof FormatError) return await finish("needs_attention", e.message, [], "rejected"); throw e; }
      } else if (raw.source_key === "manual" || raw.source_key === "google_calendar") manual.push({ raw, entry: raw.payload as ManualEntry });
    }
    recordsRead = files.reduce((a, f) => a + f.p.rowsRead, 0) + manual.length;
    await step({ files: files.map((f) => ({ range: f.p.range, rows: f.p.rowsRead })), manual: manual.length });

    // c. validate (before dropping the incomplete day)
    stepName = "validate";
    const lastTotal = (must(await db.from("account_metrics").select("value").eq("metric_key", "total_followers").order("window_end", { ascending: false }).order("created_at", { ascending: false }).limit(1), "last total") as Row[])[0];
    const issues: Issue[] = files.flatMap((f) => validateExport(f.p, lastTotal ? Number(lastTotal.value) : null));
    for (const m of manual) issues.push(...validateManual(m.entry));
    const blockers = issues.filter((i) => i.severity === "blocker");
    if (blockers.length) return await finish("failed", blockers.map((b) => b.message).slice(0, 3).join(" ") + (blockers.length > 3 ? ` (+${blockers.length - 3} more)` : ""), issues, "rejected");
    await step({ info: issues.filter((i) => i.severity === "info").length, warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message) });

    // d. normalize
    stepName = "normalize";
    const periodsAll = must(await db.from("periods").select("*").order("start_date"), "periods") as Row[];
    const grid = periodsAll.filter((p) => ["biweekly", "baseline", "history"].includes(p.kind) && p.label !== "BASE");
    const gridOf = (d: string) => grid.find((p) => d >= p.start_date && d <= p.end_date);
    const newPeriods: Row[] = [];
    const posts: Row[] = [], aliases: Row[] = [];
    const postStats = { alias: 0, by_date: 0, by_id_time: 0, created: 0 };
    type Plan = { period: Row; source: string; provided: Partial<Rows>; rawImportId: string | null; rangePartial: boolean; supersedeManual?: boolean; manualRemove?: string[] };
    const plans = new Map<string, Plan>();
    const planFor = (period: Row, source: string, rawImportId: string | null) => {
      const key = `${period.id}|${source}`;
      const p = plans.get(key) ?? { period, source, provided: {}, rawImportId, rangePartial: false };
      plans.set(key, p);
      return p;
    };
    let rangePeriodId: string | null = null;

    if (files.length) {
      const existingPosts = await all(() => db.from("posts").select("urn,published_at").order("urn"), "posts");
      const aliasRows = await all(() => db.from("post_aliases").select("alias_urn,post_urn").order("alias_urn"), "aliases");
      const aliasMap = new Map(aliasRows.map((a) => [a.alias_urn, a.post_urn]));
      const aliased = new Set(aliasRows.map((a) => a.post_urn));
      const postSet = new Set(existingPosts.map((p) => p.urn));
      const resolve = (t: ParsedExport["topPosts"][number]) => {
        if (aliasMap.has(t.urn)) { postStats.alias++; return aliasMap.get(t.urn)!; }
        if (postSet.has(t.urn)) { postStats.alias++; return t.urn; }
        const tt = idTime(t.urn);
        const cands = existingPosts.filter((p) => p.urn.startsWith("urn:li:activity:") && !aliased.has(p.urn));
        const byDate = cands.filter((p) => viennaDate(new Date(p.published_at)) === t.published || utcDate(p.published_at) === t.published);
        const byId = tt == null ? [] : cands.filter((p) => { const pt = idTime(p.urn); return pt != null && Math.abs(pt - tt) <= 10_000; });
        const union = [...new Set([...byDate, ...byId].map((p) => p.urn))];
        if (union.length === 1) {
          const target = union[0]!, method = byId.some((p) => p.urn === target) ? "id_time" : "same_date";
          aliases.push({ alias_urn: t.urn, post_urn: target, method });
          aliasMap.set(t.urn, target); aliased.add(target);
          if (method === "id_time") postStats.by_id_time++; else postStats.by_date++;
          return target;
        }
        posts.push({ urn: t.urn, url: t.url, published_at: viennaNoon(t.published) });
        postSet.add(t.urn); postStats.created++;
        return t.urn;
      };

      for (const { raw, p: parsed } of files) {
        const p = dropIncompleteDay(parsed, uploadDate);
        // Daily data -> each 14-day period it touches.
        const byPeriod = new Map<string, { period: Row; f: Row[]; a: Row[] }>();
        for (const d of p.followersDaily) {
          const gp = gridOf(d.date); if (!gp) { issues.push({ severity: "info", rule: "day_outside_periods", subject: d.date, message: `${d.date} is not in any 14-day period; skipped.` }); continue; }
          const e = byPeriod.get(gp.id) ?? { period: gp, f: [], a: [] }; byPeriod.set(gp.id, e);
          e.f.push({ date: d.date, new_followers: d.newFollowers });
        }
        for (const d of p.daily) {
          const gp = gridOf(d.date); if (!gp) continue;
          const e = byPeriod.get(gp.id) ?? { period: gp, f: [], a: [] }; byPeriod.set(gp.id, e);
          e.a.push({ metric_key: "impressions", value: d.impressions, window_start: d.date, window_end: d.date }, { metric_key: "engagements", value: d.engagements, window_start: d.date, window_end: d.date });
        }
        if (period) for (const k of [...byPeriod.keys()]) if (k !== period.id) byPeriod.delete(k);
        for (const e of byPeriod.values()) {
          const pl = planFor(e.period, EXPORT, raw.id);
          pl.provided.follower_daily = e.f; pl.provided.account_daily = e.a;
        }
        // Range-level data -> the period whose dates equal the range (or a new window period).
        let rp = periodsAll.find((x) => x.start_date === p.range.start && x.end_date === p.range.end && x.label !== "BASE") ?? newPeriods.find((x) => x.start_date === p.range.start && x.end_date === p.range.end);
        if (!rp) { rp = { id: randomUUID(), label: `W ${p.range.start}–${p.range.end}`, kind: "window", start_date: p.range.start, end_date: p.range.end }; newPeriods.push(rp); }
        if (period && rp.id !== period.id) continue;
        rangePeriodId = rp.id;
        const pl = planFor(rp, EXPORT, raw.id);
        pl.rangePartial = p.rangePartial;
        pl.provided.account_range = [
          { metric_key: "impressions", value: p.discovery.impressions, window_start: p.range.start, window_end: p.range.end },
          { metric_key: "members_reached", value: p.discovery.membersReached, window_start: p.range.start, window_end: p.range.end },
        ];
        pl.provided.total_followers = [{ metric_key: "total_followers", value: p.totalFollowers, window_start: uploadDate, window_end: uploadDate }];
        pl.provided.post_export = p.topPosts.map((t) => ({
          post_urn: resolve(t), observed_at: `${p.range.end}T23:59:59Z`, age_days: Math.max(0, daysBetween(t.published, p.range.end)), obs_window: "export_range",
          impressions: t.impressions, engagements: t.engagements,
        }));
        const aud = (scope: string) => p.audience.filter((a) => a.scope === scope).map((a) => ({ scope, dimension: a.dimension, label: a.label, label_raw: a.label_raw, share_pct: a.share_pct, below_one_pct: a.below_one_pct }));
        pl.provided.aud_followers = aud("followers"); pl.provided.aud_viewers = aud("content_viewers");
      }
    }
    // Manual entries: one new manual snapshot per period holding all earlier manual rows of that period plus the change.
    for (const { raw, entry } of manual) {
      let gp: Row | undefined;
      if (entry.entry_type === "lead_removal") {
        const lead = must(await db.from("v_manual_leads").select("*").eq("id", entry.lead_id).maybeSingle(), "lead lookup") as Row | null;
        if (!lead) return await finish("failed", "That lead is not in the current manual entries.", issues, "rejected");
        gp = periodsAll.find((p) => p.id === lead.period_id);
      } else gp = gridOf(entry.entry_type === "lead" ? entry.date : entry.checked_on);
      if (!gp) return await finish("failed", "The entry's date is not inside any 14-day period.", issues, "rejected");
      if (period && gp.id !== period.id) continue;
      const pl = planFor(gp, raw.source_key === "google_calendar" ? "google_calendar" : "manual", raw.id);
      pl.supersedeManual = true;
      if (entry.entry_type === "lead") (pl.provided.leads ??= []).push({ date: entry.date, kind: entry.kind, person_type: entry.person_type, attribution: entry.attribution, post_urn: entry.post_urn || null, note: entry.note || null, calendar_event_id: entry.calendar_event_id || null });
      else if (entry.entry_type === "spot_check") (pl.provided.audience_checks ??= []).push({ checked_on: entry.checked_on, sample_size: entry.sample_size, strict_count: entry.strict_count, broad_count: entry.broad_count, none_count: entry.none_count, method_version: entry.method_version });
      else (pl.manualRemove ??= []).push(entry.lead_id);
    }

    // Carry-over and change detection against the same source's current snapshot of each period.
    const planList = [...plans.values()];
    const currentAll = planList.length ? must(await db.from("current_snapshots").select("*").in("period_id", planList.map((p) => p.period.id)), "current") as Row[] : [];
    const oldRows = await loadRows(db, currentAll.map((s) => s.id));
    const snapshots: Row[] = [];
    const newSnaps: Snap[] = [];
    const written: string[] = [], noChange: string[] = [];
    let rowsWritten = 0;
    for (const pl of planList) {
      const old = currentAll.find((s) => s.period_id === pl.period.id && s.source_key === pl.source);
      const o = old ? oldRows.get(old.id)! : emptyRows();
      const rows = emptyRows();
      for (const k of KINDS) rows[k] = pl.provided[k] ?? o[k].map(strip);
      if (pl.source === "manual" || pl.source === "google_calendar") {
        rows.leads = [...o.leads.filter((l) => !(pl.manualRemove ?? []).includes(l.id)).map(strip), ...(pl.provided.leads ?? [])];
        rows.audience_checks = [...o.audience_checks.map(strip), ...(pl.provided.audience_checks ?? [])];
      }
      let completeness = "complete";
      if (pl.source === EXPORT) {
        const days = pl.period.end_date && pl.period.start_date ? daysBetween(pl.period.start_date, pl.period.end_date) + 1 : 0;
        const dailyOk = pl.period.kind === "window" || (new Set(rows.follower_daily.map((r) => r.date)).size === days && new Set(rows.account_daily.filter((r) => r.metric_key === "impressions").map((r) => r.window_start)).size === days);
        const rangeOk = pl.provided.account_range ? !pl.rangePartial : !(old && old.completeness === "partial" && o.account_range.length);
        completeness = dailyOk && rangeOk ? "complete" : "partial";
      }
      const changed = !old || completeness !== old.completeness || KINDS.some((k) => !same(k, rows[k], o[k]));
      if (!changed) { noChange.push(pl.period.label); continue; }
      const id = randomUUID();
      snapshots.push({
        snapshot: { id, period_id: pl.period.id, source_key: pl.source, run_id: runId, raw_import_id: pl.rawImportId, parser_version: pl.source === "manual" ? "manual-entry-1" : pl.source === "google_calendar" ? "calendar-review-1" : PARSER_VERSION, transform_version: TRANSFORM_VERSION, captured_at: now.toISOString(), completeness, supersedes_id: old?.id ?? null },
        follower_daily: rows.follower_daily, account_metrics: [...rows.account_daily, ...rows.account_range, ...rows.total_followers],
        post_observations: [...rows.post_export, ...rows.post_other], audience_observations: [...rows.aud_followers, ...rows.aud_viewers],
        audience_checks: rows.audience_checks, leads: rows.leads,
      });
      rowsWritten += 1 + KINDS.reduce((a, k) => a + rows[k].length, 0);
      newSnaps.push({ id, period_id: pl.period.id, source_key: pl.source, completeness, captured_at: now.toISOString(), rows, isNew: true });
      written.push(`${pl.period.label}${completeness === "partial" ? " (partial)" : ""}`);
    }
    await step({ periods_written: written, no_change: noChange, posts: postStats, new_periods: newPeriods.map((p) => p.label), rows: rowsWritten }, noChange.length ? `No change: ${noChange.join(", ")}` : undefined);

    // e. KPI values, only for the range period or the period given to "Run now".
    stepName = "kpis";
    const target = period ?? (rangePeriodId ? [...periodsAll, ...newPeriods].find((p) => p.id === rangePeriodId) : null)
      ?? (manual.length ? planList.find((p) => p.source === "manual" || p.source === "google_calendar")?.period : null) ?? null;
    const kpi = target ? await computeKpis(db, target, newSnaps.filter((s) => s.period_id === target.id), newSnaps, grid, periodsAll) : { rows: [], input: null };
    await step({ period: target?.label ?? null, kpis: kpi.rows.map((r) => r.kpi_key) });

    const anyPartial = newSnaps.some((s) => s.completeness === "partial");
    const changes = `${written.length ? `Wrote ${written.join(", ")}` : "No new snapshots"}${noChange.length ? `; no change: ${noChange.join(", ")}` : ""}${kpi.rows.length ? `; ${kpi.rows.length} KPI values for ${target!.label}` : ""}`;
    if (opts.dryRun) {
      stepName = "dry_run";
      await finish("succeeded", `Dry run: nothing committed. ${changes}`, issues, null, false);
      return { status: "dry run", run_id: runId, periods_written: written, no_change: noChange, rows_written: rowsWritten, posts: postStats, kpis: kpi.rows.length, dry_run: { snapshots, kpi_values: kpi.rows, new_periods: newPeriods, posts, aliases, summary_input: kpi.input } };
    }

    // f. summary
    stepName = "summary";
    let summaryRows: Row[] = [], summaryNote = "Skipped: no KPI values.";
    if (kpi.rows.length && kpi.input && !opts.skipSummary) {
      try {
        const s = await summarize(kpi.input);
        summaryNote = s.note;
        if (s.summary) summaryRows = [{ period_id: target!.id, summary: s.summary, model: SUMMARY_MODEL, prompt_version: PROMPT_VERSION, tokens_used: s.tokens }];
      } catch (e) { summaryNote = `AI call failed: ${e instanceof Error ? e.message : String(e)}`; }
    } else if (opts.skipSummary) summaryNote = opts.summaryNote ?? "Skipped (test flag).";
    await step(null, summaryNote);

    // g. commit — one transaction
    stepName = "commit";
    const final = anyPartial ? "partial" : "succeeded";
    must(await db.rpc("commit_run", {
      payload: {
        run_id: runId, final_status: final, records_read: recordsRead, changes_summary: changes, test_crash: !!opts.testCrash,
        periods: newPeriods.filter((p) => snapshots.some((s) => s.snapshot.period_id === p.id) || kpi.rows.some((k) => k.period_id === p.id)),
        posts, aliases, snapshots, kpi_values: kpi.rows, period_summaries: summaryRows, issues, raw_import_ids: rawIds,
      },
    }), "commit");
    return { status: final, run_id: runId, periods_written: written, no_change: noChange, rows_written: rowsWritten, posts: postStats, kpis: kpi.rows.length, summary: summaryNote, warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message) };
  } catch (e) {
    return await finish("failed", e instanceof Error ? e.message : String(e));
  }
}

function validateManual(e: ManualEntry): Issue[] {
  const bad = (message: string): Issue[] => [{ severity: "blocker", rule: "manual_entry", subject: e.entry_type, message }];
  const isDate = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (e.entry_type === "lead") {
    if (!isDate(e.date)) return bad("The lead needs a date.");
    if (!["meeting", "inquiry", "intro"].includes(e.kind) || !["investor", "operator", "other", "founder", "rollup_operator"].includes(e.person_type) || !["tracked_link", "named_post", "said_linkedin", "unknown"].includes(e.attribution)) return bad("Invalid lead kind, person type or attribution.");
    return [];
  }
  if (e.entry_type === "spot_check") {
    const n = [e.sample_size, e.strict_count, e.broad_count, e.none_count];
    if (!isDate(e.checked_on) || n.some((x) => !Number.isInteger(x) || x < 0) || e.sample_size < 1) return bad("The spot check needs a date and whole, non-negative counts.");
    if (e.strict_count + e.broad_count + e.none_count !== e.sample_size) return bad("Strict + broad + none must equal the sample size.");
    if (!e.method_version?.trim()) return bad("The spot check needs a method version.");
    return [];
  }
  if (e.entry_type === "lead_removal") return typeof e.lead_id === "string" ? [] : bad("Missing lead.");
  return bad("Unknown entry.");
}

// ---------- KPIs ----------
async function computeKpis(db: DB, target: Row, targetNew: Snap[], allNew: Snap[], grid: Row[], periodsAll: Row[]) {
  const defs = must(await db.from("kpi_definitions").select("*"), "definitions") as Row[];
  const def = (k: string) => defs.find((d) => d.key === k)!;
  const cur = target.id && periodsAll.some((p) => p.id === target.id) ? must(await db.from("current_snapshots").select("*").eq("period_id", target.id), "current") as Row[] : [];
  const rowsMap = await loadRows(db, cur.map((s) => s.id));
  const snaps: Snap[] = cur.map((s) => ({ ...s, rows: rowsMap.get(s.id)! } as Snap)).filter((s) => !targetNew.some((n) => n.source_key === s.source_key));
  snaps.push(...targetNew);
  const days = daysBetween(target.start_date, target.end_date) + 1;
  const isGrid = target.kind !== "window" && target.label !== "BASE" && days === 14;
  const inP = (d: string) => d >= target.start_date && d <= target.end_date;
  const values: Record<string, number> = {};
  const notes: Record<string, string> = {};
  // followers / impressions
  const fw = winner(snaps, "follower_daily");
  const followers = (s: Snap | undefined) => {
    if (!s || s.completeness !== "complete") return null;
    const r = s.rows.follower_daily.filter((x) => inP(x.date));
    return new Set(r.map((x) => x.date)).size === days ? r.reduce((a, x) => a + Number(x.new_followers), 0) : null;
  };
  if (isGrid) { const v = followers(fw); if (v != null) values["new_followers_14d"] = v; }
  const rangeRow = (s: Snap | undefined) => s?.rows.account_range.find((x) => x.metric_key === "impressions" && x.window_start === target.start_date && x.window_end === target.end_date);
  const rw = winner(snaps, "account_range", (x) => x.metric_key === "impressions" && x.window_start === target.start_date && x.window_end === target.end_date);
  const dw = winner(snaps, "account_daily");
  if (isGrid) {
    if (rw) { values["impressions_14d"] = Number(rangeRow(rw)!.value); notes["impressions_14d"] = "discovery total of the export"; }
    else if (dw) {
      const r = dw.rows.account_daily.filter((x) => x.metric_key === "impressions" && inP(x.window_start));
      if (new Set(r.map((x) => x.window_start)).size === days) { values["impressions_14d"] = r.reduce((a, x) => a + Number(x.value), 0); notes["impressions_14d"] = "sum of daily impressions"; }
    }
  }
  // viewer shares
  const vw = winner(snaps, "aud_viewers");
  const share = (rows: Row[], dim: string, labels: string[]) => {
    const r = rows.filter((x) => x.dimension === dim);
    if (!r.length) return null;
    const present = r.filter((x) => labels.includes(x.label));
    return { value: present.reduce((a, x) => a + Number(x.share_pct ?? 0), 0), atLeast: present.length < labels.length || present.some((x) => x.share_pct == null) };
  };
  if (vw) {
    const ind = share(vw.rows.aud_viewers, "industry", TARGET_INDUSTRIES), sen = share(vw.rows.aud_viewers, "seniority", SENIOR_LEVELS);
    if (ind) { values["viewers_target_industry_share"] = ind.value; if (ind.atLeast) notes["viewers_target_industry_share"] = "at least: some labels are not in LinkedIn's top list"; }
    if (sen) { values["viewers_senior_share"] = sen.value; if (sen.atLeast) notes["viewers_senior_share"] = "at least: some labels are not in LinkedIn's top list"; }
  }
  // spot checks and leads add up across sources
  const otherChecks = (must(await db.from("v_spot_checks").select("*").eq("snapshot_period_label", target.label), "checks") as Row[])
    .filter((c) => !targetNew.some((n) => n.source_key === c.source_key && cur.some((s) => s.id === c.snapshot_id)));
  const checks = [...otherChecks, ...targetNew.flatMap((s) => s.rows.audience_checks)];
  if (checks.length) {
    const sample = checks.reduce((a, c) => a + Number(c.sample_size), 0);
    values["follower_target_spot_check"] = (checks.reduce((a, c) => a + Number(c.strict_count), 0) / sample) * 100;
    notes["follower_target_spot_check"] = `strict share of ${sample} checked followers`;
  }
  const leadView = must(await db.from("v_leads_by_period").select("*").eq("period_id", target.id).maybeSingle(), "leads") as Row | null;
  const leadNews = targetNew.filter((s) => s.source_key === "manual" || s.source_key === "google_calendar");
  if (isGrid && (leadView?.fully_covered || leadNews.length)) {
    let n = Number(leadView?.leads ?? 0);
    for (const ln of leadNews) {
      const oldS = cur.find((s) => s.source_key === ln.source_key);
      const oldCount = oldS ? rowsMap.get(oldS.id)!.leads.filter((l) => inP(l.date)).length : 0;
      n = n - oldCount + ln.rows.leads.filter((l) => inP(l.date)).length;
    }
    values["linkedin_leads_14d"] = n;
  }

  // comparisons: the numbers compared against (not differences)
  const [pf, pi, pl] = await Promise.all([
    all(() => db.from("v_period_followers").select("*").order("start_date"), "followers"),
    all(() => db.from("v_period_impressions").select("*").order("start_date"), "impressions"),
    all(() => db.from("v_leads_by_period").select("*").order("start_date"), "leads"),
  ]);
  const series: Record<string, Map<string, number>> = { new_followers_14d: new Map(), impressions_14d: new Map(), linkedin_leads_14d: new Map() };
  for (const r of pf) if (r.is_complete) series["new_followers_14d"]!.set(r.period_id, Number(r.new_followers));
  for (const r of pi) { const v = r.range_impressions ?? (r.daily_complete ? r.daily_impressions : null); if (v != null) series["impressions_14d"]!.set(r.period_id, Number(v)); }
  for (const r of pl) if (r.fully_covered) series["linkedin_leads_14d"]!.set(r.period_id, Number(r.leads));
  for (const s of allNew) { // planned snapshots win over older data in the same run
    if (s.completeness !== "complete" || s.source_key !== EXPORT) continue;
    const p = periodsAll.find((x) => x.id === s.period_id); if (!p || p.kind === "window") continue;
    const r = s.rows.follower_daily; if (r.length === 14) series["new_followers_14d"]!.set(p.id, r.reduce((a, x) => a + Number(x.new_followers), 0));
    const range = s.rows.account_range.find((x) => x.metric_key === "impressions" && x.window_start === p.start_date && x.window_end === p.end_date);
    const daily = s.rows.account_daily.filter((x) => x.metric_key === "impressions");
    if (range) series["impressions_14d"]!.set(p.id, Number(range.value)); else if (daily.length === 14) series["impressions_14d"]!.set(p.id, daily.reduce((a, x) => a + Number(x.value), 0));
  }
  const idx = grid.findIndex((p) => p.id === target.id);
  const avg = (ids: string[], m: Map<string, number>) => (ids.length && ids.every((i) => m.has(i)) ? ids.reduce((a, i) => a + m.get(i)!, 0) / ids.length : null);
  const prevIds = (n: number) => (idx >= n ? grid.slice(idx - n, idx).map((p) => p.id) : []);
  const baselineIds = grid.filter((p) => p.kind === "baseline").map((p) => p.id);
  const [aud, baseAud] = await Promise.all([
    all(() => db.from("v_period_audience").select("*").eq("scope", "content_viewers").order("period_id"), "audience"),
    Promise.resolve(null),
  ]);
  void baseAud;
  const shareOf = (periodId: string, dim: string, labels: string[]) => share(aud.filter((a) => a.period_id === periodId), dim, labels)?.value ?? null;
  const basePeriod = periodsAll.find((p) => p.label === "BASE");
  const rows: Row[] = [];
  for (const [key, value] of Object.entries(values)) {
    const d = def(key); if (!d) continue;
    let vs: [number | null, number | null, number | null, number | null] = [null, null, null, null];
    if (series[key]) {
      const m = series[key]!;
      const baseVals = baselineIds.filter((i) => m.has(i));
      vs = [avg(prevIds(1), m), avg(prevIds(2), m), avg(prevIds(6), m), baseVals.length === baselineIds.length ? avg(baselineIds, m) : null];
      if (!isGrid) vs = [null, null, null, null];
    } else if (key === "viewers_target_industry_share" || key === "viewers_senior_share") {
      const [dim, labels] = key === "viewers_target_industry_share" ? ["industry", TARGET_INDUSTRIES] : ["seniority", SENIOR_LEVELS];
      const prev = idx > 0 ? shareOf(grid[idx - 1]!.id, dim as string, labels as string[]) : null;
      vs = [prev, null, null, basePeriod ? shareOf(basePeriod.id, dim as string, labels as string[]) : null];
    }
    rows.push({ period_id: target.id, kpi_key: key, formula_version: d.formula_version, kind: d.kind, value, vs_previous: vs[0], vs_28_days: vs[1], vs_12_weeks: vs[2], vs_baseline: vs[3] });
  }
  const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  const input: SummaryInput = {
    period: { label: target.label, start_date: target.start_date, end_date: target.end_date, days, partial: targetNew.some((s) => s.completeness === "partial") },
    kpis: rows.map((r) => ({
      kpi_key: r.kpi_key, name: def(r.kpi_key).name, kind: r.kind, value: r2(r.value)!, vs_previous: r2(r.vs_previous), vs_28_days: r2(r.vs_28_days), vs_12_weeks: r2(r.vs_12_weeks), vs_baseline: r2(r.vs_baseline),
      change_vs_previous: r.vs_previous == null ? null : r2(r.value - r.vs_previous), change_vs_baseline: r.vs_baseline == null ? null : r2(r.value - r.vs_baseline),
      change_vs_baseline_pct: r.vs_baseline ? r2(((r.value - r.vs_baseline) / r.vs_baseline) * 100) : null, note: notes[r.kpi_key] ?? null,
    })),
    reference_numbers: [14, 28, 12, 1000],
  };
  return { rows, input: rows.length ? input : null };
}
export { addDays };
