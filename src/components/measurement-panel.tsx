import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ArrowUpDown, Play, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RunAgeStatus, SchedulePanel } from "@/components/schedule-panels";
import { BenchmarkStaleness, PendingMeetingsStatus, Step7DataRuns, TagPosts } from "@/components/review-panels";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { measurementQuery } from "@/lib/strategy-query";
import type { MeasurementData } from "@/lib/measurement.functions";
import { logManualEntry, runMeasurementNow, uploadLinkedInExport } from "@/lib/pipeline.functions";
import {
  compare, followerSeries, impressionSeries, leadSeries, medianFollowersPer1000, postFunnel, rankPosts, savesRepostsPer1000,
  SENIOR_LEVELS, shareAtLeast, spotCheck, TARGET_INDUSTRIES, type CompareMode, type PostRow, type Series,
} from "@/lib/measurement";

const DATA = "var(--chart-data)";
const ACCENT = "var(--primary)";
const fmt = (n: number | null | undefined, d = 0) => (n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const day = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { timeZone: "Europe/Vienna", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " (Vienna)" : "—");
const short = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export function age(s: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(s)) / 60000));
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
const SOURCE_NAME: Record<string, string> = { linkedin_export: "LinkedIn export", linkedin_api: "LinkedIn API", manual: "manual entries", baseline_2026_10_08: "baseline import" };
const MODES: { id: CompareMode; label: string }[] = [
  { id: "previous", label: "Previous period" }, { id: "28d", label: "Previous 28 days" }, { id: "12w", label: "Previous 12 weeks" }, { id: "baseline", label: "Baseline" },
];
export const latestRun = (data: Pick<MeasurementData, "runs">) => [...data.runs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
export const runDot = (s?: string) => (s === "succeeded" ? "ok" : s === "partial" || s === "needs_attention" ? "warn" : s === "failed" ? "bad" : "");

export function MeasurementPanel() {
  const q = useQuery(measurementQuery());
  if (q.isPending) return <p className="text-muted-foreground">Loading measurement data…</p>;
  if (q.isError) return (
    <div className="strategy-card" role="alert">
      <p>{q.error instanceof Error && q.error.message === "This tool is private." ? q.error.message : "Measurement data could not be loaded. Please try again."}</p>
      <Button variant="outline" className="mt-4" onClick={() => void q.refetch()}>Retry</Button>
    </div>
  );
  return <TooltipProvider delayDuration={150}><Measurement data={q.data} /></TooltipProvider>;
}

type RunResult = { status: string; reason?: string; periods_written?: string[]; no_change?: string[]; rows_written?: number; warnings?: string[]; kpis?: number; summary?: string; posts?: { alias: number; by_date: number; by_id_time: number; created: number } };
function ResultNote({ r }: { r: RunResult | string | null }) {
  if (!r) return null;
  if (typeof r === "string") return <p className="measure-note run-error" role="alert">{r}</p>;
  const bad = ["failed", "needs_attention", "rejected"].includes(r.status);
  return (
    <div className={`measure-note${bad ? " run-error" : ""}`} role="status">
      <p><strong>{r.status}</strong>{r.reason ? ` — ${r.reason}` : ""}</p>
      {r.periods_written && <p>Periods written: {r.periods_written.length ? r.periods_written.join(", ") : "none"}{r.no_change?.length ? ` · no change: ${r.no_change.join(", ")}` : ""}</p>}
      {r.rows_written != null && <p>Rows: {fmt(r.rows_written)}{r.kpis != null ? ` · KPI values: ${r.kpis}` : ""}{r.summary ? ` · Summary: ${r.summary}` : ""}</p>}
      {r.posts && <p>Posts: {r.posts.alias} linked through aliases, {r.posts.by_date + r.posts.by_id_time} linked by date or ID time, {r.posts.created} new</p>}
      {!!r.warnings?.length && <p>Warnings: {r.warnings.join(" ")}</p>}
    </div>
  );
}

function Measurement({ data }: { data: MeasurementData }) {
  const qc = useQueryClient();
  const runNow = useServerFn(runMeasurementNow);
  const fSeries = useMemo(() => followerSeries(data.followers), [data.followers]);
  const iSeries = useMemo(() => impressionSeries(data.impressions), [data.impressions]);
  const lSeries = useMemo(() => leadSeries(data.leads), [data.leads]);
  const withData = new Set([...data.followers.map((f) => f.label), ...data.impressions.map((i) => i.label), ...data.periodAudience.map((a) => a.period_label), ...data.periodPosts.map((p) => p.period_label)]);
  const pickable = data.periods.filter((p) => p.label !== "BASE" && (withData.has(p.label) || p.label === "P1"));
  const latestGrid = [...fSeries].reverse().find((s) => s.complete)?.label ?? fSeries.at(-1)?.label ?? "P1";
  const [selected, setSelected] = useState(latestGrid);
  const [mode, setMode] = useState<CompareMode>("previous");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | string | null>(null);
  const period = data.periods.find((p) => p.label === selected);
  const baselineSelected = period?.kind === "baseline";
  const last = latestRun(data);
  const relaunch = data.annotations.find((a) => a.date === "2026-10-12");
  const relaunchLabel = relaunch ? relaunch.label.split(" (")[0] ?? relaunch.label : null;
  const comparisonReason = (m: CompareMode) => { const c = compare(fSeries, selected, m); return c.available ? null : c.reason; };
  const activeMode = comparisonReason(mode) ? MODES.find((m) => !comparisonReason(m.id))?.id ?? mode : mode;
  const sources = new Set<string>();
  data.followers.filter((f) => f.label === selected).forEach((f) => sources.add(f.source_key as string));
  data.impressions.filter((i) => i.label === selected).forEach((i) => { if (i.daily_source) sources.add(i.daily_source); if (i.range_source) sources.add(i.range_source); });
  data.periodAudience.filter((a) => a.period_label === selected).forEach((a) => sources.add(a.source_key));
  data.leads.filter((l) => l.label === selected).forEach((l) => String((l as unknown as { source_key?: string }).source_key ?? "").split(",").filter(Boolean).forEach((s) => sources.add(s)));
  const groups = [
    { label: "History and baseline", kinds: ["history", "baseline"] }, { label: "P periods", kinds: ["biweekly"] }, { label: "Window periods", kinds: ["window"] },
  ];
  const doRun = async () => {
    if (!period) return;
    setRunning(true); setRunResult(null);
    try { setRunResult((await runNow({ data: { period_id: period.id } })) as unknown as RunResult); }
    catch (e) { setRunResult(e instanceof Error ? e.message : "The run could not be started."); }
    finally { setRunning(false); void qc.invalidateQueries({ queryKey: ["measurement"] }); }
  };

  return (
    <div className="measure-stack">
      <section className="strategy-card measure-status" aria-label="Measurement status">
        <div><p className="field-label">Last run</p><p className="status-line"><span className={`run-dot ${runDot(last?.status)}`} aria-hidden="true" />{last ? `${last.status} · ${age(last.finished_at ?? last.created_at)} · ${when(last.finished_at ?? last.created_at)} · ${last.workflow_version ?? "—"}` : "No runs yet"}</p></div>
        <RunAgeStatus />
        <PendingMeetingsStatus />
        <BenchmarkStaleness />
        <div><p className="field-label">Next scheduled run</p><p className="status-line">{when(data.schedule?.next_due ?? null)}</p></div>
        <div><p className="field-label">Data shown for {selected}</p><p className="status-line">{sources.size ? [...sources].map((s) => SOURCE_NAME[s] ?? s).join(", ") : "No data for this period yet"}</p></div>
      </section>

      <div className="measure-controls">
        <label className="field-label flex items-center gap-2">Period
          <select className="version-select" value={selected} onChange={(e) => { setSelected(e.target.value); setRunResult(null); }}>
            {groups.map((g) => { const ps = pickable.filter((p) => g.kinds.includes(p.kind)); return ps.length ? (
              <optgroup key={g.label} label={g.label}>{ps.map((p) => { const f = data.followers.find((x) => x.label === p.label);
                return <option key={p.id} value={p.label}>{p.label}{p.kind === "window" ? "" : ` · ${short(p.start_date)}–${short(p.end_date)}`}{!withData.has(p.label) ? " (upcoming)" : f && !f.is_complete ? " (partial)" : ""}</option>; })}</optgroup>) : null; })}
          </select>
        </label>
        <Button size="sm" variant="outline" onClick={() => void doRun()} disabled={running || !period}><Play /> {running ? "Running…" : "Run now"}</Button>
        <div className="compare-group" role="radiogroup" aria-label="Compare to">
          <span className="field-label">Compare to</span>
          {MODES.map((m) => { const reason = comparisonReason(m.id);
            const btn = <Button size="sm" variant={activeMode === m.id && !reason ? "default" : "outline"} role="radio" aria-checked={activeMode === m.id && !reason} disabled={!!reason} onClick={() => setMode(m.id)}>{m.label}</Button>;
            return reason ? <Tooltip key={m.id}><TooltipTrigger asChild><span tabIndex={0} aria-label={`${m.label}: ${reason}`}>{btn}</span></TooltipTrigger><TooltipContent>{reason}</TooltipContent></Tooltip> : <span key={m.id}>{btn}</span>;
          })}
        </div>
      </div>
      <ResultNote r={runResult} />

      <KpiTiles data={data} selected={selected} baselineSelected={baselineSelected} mode={activeMode} fSeries={fSeries} iSeries={iSeries} lSeries={lSeries} />
      <PeriodExport data={data} selected={selected} />
      <Funnel data={data} />
      <Trends fSeries={fSeries} iSeries={iSeries} selected={selected} relaunchLabel={relaunchLabel} />
      <Posts posts={data.posts} />
      <TagPosts />
      <Audience data={data} selected={selected} />
      <PeriodSummary data={data} periodId={period?.id} />
      <DataRuns data={data} />
    </div>
  );
}

function Spark({ values, highlight }: { values: { x: string; y: number }[]; highlight?: string }) {
  if (values.length < 2) return null;
  return (
    <div className="spark" aria-hidden="true"><ResponsiveContainer width="100%" height={36}>
      <LineChart data={values} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Line dataKey="y" stroke={DATA} strokeWidth={1.5} isAnimationActive={false}
          dot={(p: { cx?: number; cy?: number; payload?: { x: string }; index?: number }) => <circle key={p.index} cx={p.cx} cy={p.cy} r={p.payload?.x === highlight ? 3 : 0} fill={ACCENT} />} />
      </LineChart></ResponsiveContainer></div>
  );
}

function periodShares(data: MeasurementData, label: string) {
  const rows = data.periodAudience.filter((a) => a.period_label === label && a.scope === "content_viewers");
  return { industry: shareAtLeast(rows, "industry", TARGET_INDUSTRIES), senior: shareAtLeast(rows, "seniority", SENIOR_LEVELS) };
}
const shareText = (s: { value: number; atLeast: boolean } | null) => (s == null ? "not yet measured" : `${s.atLeast ? "at least " : ""}${fmt(s.value)}%`);

function KpiTiles({ data, selected, baselineSelected, mode, fSeries, iSeries, lSeries }: { data: MeasurementData; selected: string; baselineSelected: boolean; mode: CompareMode; fSeries: Series; iSeries: Series; lSeries: Series }) {
  const own = periodShares(data, selected);
  const base = periodShares(data, "BASE");
  const useOwn = own.industry != null || own.senior != null;
  const shares = useOwn ? own : baselineSelected ? base : { industry: null, senior: null };
  const shareNote = useOwn ? `content viewers, ${selected} export` : "content viewers, baseline";
  const checks = data.spotChecks.filter((c) => (c as unknown as { snapshot_period_label?: string }).snapshot_period_label === selected);
  const latestCheck = [...data.spotChecks].sort((a, b) => b.checked_on.localeCompare(a.checked_on))[0];
  const series = (s: Series) => s.map((x) => ({ x: x.label, y: x.value }));
  const periodValue = (s: Series) => s.find((x) => x.label === selected);
  const cmp = (s: Series) => { const c = compare(s, selected, mode); return c.available ? `${c.delta >= 0 ? "+" : ""}${fmt(c.delta, 1)} vs ${c.label} (${fmt(c.reference, 1)})` : c.reason; };
  const noCompare = "No comparison: one measurement only.";
  const imp = data.impressions.find((i) => i.label === selected);
  const tile = (key: string) => {
    const f = periodValue(fSeries), l = periodValue(lSeries), i = periodValue(iSeries);
    switch (key) {
      case "new_followers_14d": return f ? { value: fmt(f.value), note: f.complete ? selected : `${selected}, partial (${data.followers.find((x) => x.label === selected)?.days_covered} of 14 days)`, comparison: cmp(fSeries), spark: series(fSeries), side: shares.industry == null ? null : `Target-industry viewers ${shareText(shares.industry)}` } : null;
      case "followers_per_1000_impressions": { const m = medianFollowersPer1000(data.posts); return baselineSelected && m != null ? { value: fmt(m, 2), note: "median per post, lifetime, baseline", comparison: noCompare } : null; }
      case "viewers_target_industry_share": return shares.industry ? { value: shareText(shares.industry), note: shareNote, comparison: useOwn && base.industry ? `Baseline ${shareText(base.industry)}` : noCompare } : null;
      case "viewers_senior_share": return shares.senior ? { value: shareText(shares.senior), note: shareNote, comparison: useOwn && base.senior ? `Baseline ${shareText(base.senior)}` : noCompare } : null;
      case "follower_target_spot_check": {
        if (!checks.length) return latestCheck ? { value: "—", note: `latest check: ${short(latestCheck.checked_on)}, n = ${latestCheck.sample_size}`, comparison: "Spot checks belong only to the period in which they were done." } : null;
        const sample = checks.reduce((a, c) => a + c.sample_size, 0), strict = checks.reduce((a, c) => a + c.strict_count, 0), broad = checks.reduce((a, c) => a + c.broad_count, 0);
        return { value: `${fmt((strict / sample) * 100, 1)}%`, note: `strict; strict or broad ${fmt(((strict + broad) / sample) * 100, 1)}% · n = ${sample}`, comparison: noCompare };
      }
      case "impressions_14d": return i ? { value: fmt(i.value), note: imp?.range_impressions != null ? `${selected}, export total` : `${selected}, sum of daily impressions`, comparison: cmp(iSeries), spark: series(iSeries) } : null;
      case "saves_reposts_per_1000": { const r = savesRepostsPer1000(data.posts); return baselineSelected && r != null ? { value: fmt(r, 2), note: "across posts, lifetime, baseline", comparison: noCompare } : null; }
      case "linkedin_leads_14d": return l ? { value: fmt(l.value), note: l.complete ? selected : `${selected}, partly covered`, comparison: cmp(lSeries), spark: series(lSeries) } : null;
      default: return null;
    }
  };
  return (
    <section aria-labelledby="kpi-h"><h2 id="kpi-h" className="section-heading">KPIs</h2>
      <div className="goal-grid">
        {data.definitions.map((d) => { const t = tile(d.key) as null | { value: string; note: string; comparison: string; spark?: { x: string; y: number }[]; side?: string | null };
          return (
            <article key={d.key} className={`strategy-card kpi-tile${d.is_north_star ? " north-star" : ""}`}>
              <div className="card-label">{d.goal_category}</div>
              <h3 className="kpi-name">{d.name}</h3>
              <span className={`kind-badge${d.kind === "measured" ? " measured" : ""}`}>{d.kind}</span>
              {t ? (<>
                <div className="kpi-value-row"><p className="kpi-value">{t.value}</p>{t.side && <p className="kpi-side">{t.side}</p>}</div>
                <p className="kpi-note">{t.note}</p>
                {t.spark && <Spark values={t.spark} highlight={selected} />}
                <p className="kpi-compare">{t.comparison}</p>
              </>) : <p className="kpi-missing">not yet measured</p>}
            </article>);
        })}
      </div>
    </section>
  );
}

function PeriodExport({ data, selected }: { data: MeasurementData; selected: string }) {
  const imp = data.impressions.find((i) => i.label === selected && i.range_impressions != null);
  const posts = data.periodPosts.filter((p) => p.period_label === selected).sort((a, b) => Number(b.impressions ?? -1) - Number(a.impressions ?? -1));
  if (!imp && !posts.length) return null;
  const s = periodShares(data, selected);
  const slug = (url: string | null) => (url ? decodeURIComponent(url.split("/").filter(Boolean).at(-1) ?? url).replace(/^viktoria-izdebska_/, "").replace(/-(share|ugcPost|activity)-\d+.*$/, "").replace(/-/g, " ") : "—");
  return (
    <section className="strategy-card" aria-labelledby="export-h">
      <h2 id="export-h" className="measure-h">LinkedIn export for {selected}</h2>
      <p className="measure-note">Numbers count only this period's range, not the posts' lifetime.{imp && !imp.range_complete ? " The range ends on the download day, so it is partial." : ""}</p>
      <div className="funnel">
        <div className="funnel-step"><p className="field-label">Impressions</p><p className="kpi-value">{fmt(imp?.range_impressions)}</p></div>
        <div className="funnel-step"><p className="field-label">Members reached</p><p className="kpi-value">{fmt(imp?.range_members_reached)}</p></div>
        <div className="funnel-step"><p className="field-label">Viewers in VC/PE, financial services, banking</p><p className="kpi-value">{shareText(s.industry)}</p></div>
        <div className="funnel-step"><p className="field-label">Viewers at owner–director level</p><p className="kpi-value">{shareText(s.senior)}</p></div>
      </div>
      {!!posts.length && <div className="table-scroll mt-4"><table className="measure-table">
        <thead><tr><th>Published</th><th>Post</th><th className="num">Impressions in period</th><th className="num">Engagement in period</th></tr></thead>
        <tbody>{posts.map((p) => <tr key={p.urn}><td className="whitespace-nowrap">{day(p.published_at)}</td><td className="hook-cell">{p.url ? <a className="cta-link" href={p.url} target="_blank" rel="noreferrer">{p.hook ?? slug(p.url)}</a> : p.hook ?? "—"}</td><td className="num">{fmt(p.impressions)}</td><td className="num">{fmt(p.engagements)}</td></tr>)}</tbody>
      </table></div>}
    </section>
  );
}

function Funnel({ data }: { data: MeasurementData }) {
  const f = postFunnel(data.posts);
  const meetings = data.leads.find((l) => l.label === "BASE")?.meetings ?? null;
  const step = (label: string, value: number) => <div className="funnel-step"><p className="field-label">{label}</p><p className="kpi-value">{fmt(value)}</p></div>;
  const rate = (r: number | null) => <div className="funnel-rate">→ {r == null ? "—" : `${fmt(r * 100, 2)}%`}</div>;
  return (
    <section className="strategy-card"><h2 className="measure-h">Funnel, baseline window</h2>
      <p className="measure-note">Per-post data from the baseline import, {f.posts} posts reporting all three steps.</p>
      <div className="funnel">{step("Post impressions", f.impressions)}{rate(f.viewRate)}{step("Profile views from posts", f.profileViews)}{rate(f.followRate)}{step("Followers from posts", f.followers)}</div>
      <div className="funnel-extra"><p>Newsletter subscribers: not yet measured</p><p>Meetings: {meetings == null ? "not yet measured" : `${fmt(meetings)} (self-reported)`}</p></div>
    </section>
  );
}

function Trends({ fSeries, iSeries, selected, relaunchLabel }: { fSeries: Series; iSeries: Series; selected: string; relaunchLabel: string | null }) {
  const labels = [...new Set([...fSeries.map((s) => s.label), ...iSeries.map((s) => s.label)])];
  const order = (l: string) => (l.startsWith("B-") ? -Number(l.slice(2)) : Number(l.slice(1)) + 1000);
  labels.sort((a, b) => order(a) - order(b));
  if (relaunchLabel && !labels.includes("P1")) labels.push("P1");
  const rows = labels.map((l) => { const f = fSeries.find((s) => s.label === l); return { id: l, label: f && !f.complete ? `${l} (partial)` : l, followers: f?.value ?? null, partial: f ? !f.complete : false, impressions: iSeries.find((s) => s.label === l)?.value ?? null }; });
  const axis = { fontSize: 10, fill: "var(--muted-foreground)" };
  const marker = relaunchLabel ? <ReferenceLine x="P1" stroke={ACCENT} strokeDasharray="3 3" label={{ value: `12 Oct 2026: ${relaunchLabel}`, position: "insideTopRight", fontSize: 10, fill: "var(--primary)" }} /> : null;
  const chart = (key: "followers" | "impressions", name: string) => (
    <div className="chart-box"><ResponsiveContainer width="100%" height={250}>
      <BarChart data={rows} margin={{ top: 22, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={axis} interval={0} angle={-40} textAnchor="end" height={56} stroke="var(--border)" />
        <YAxis tick={axis} width={48} stroke="var(--border)" tickFormatter={(v: number) => fmt(v)} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} formatter={(v: number) => fmt(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
        <Bar dataKey={key} name={name} isAnimationActive={false}>
          {rows.map((b) => <Cell key={b.id} fill={b.id === selected ? ACCENT : DATA} fillOpacity={b.partial ? 0.45 : 1} />)}
          {rows.length <= 16 && <LabelList dataKey={key} position="top" formatter={(v: number) => fmt(v)} style={{ fontSize: 9, fill: "var(--muted-foreground)" }} />}
        </Bar>
        {marker}
      </BarChart></ResponsiveContainer></div>
  );
  return (
    <section className="strategy-card"><h2 className="measure-h">Trends</h2>
      <p className="field-label mt-4">New followers per 14-day period</p>{chart("followers", "New followers")}
      <p className="field-label mt-6">Impressions per 14-day period</p>{chart("impressions", "Impressions")}
    </section>
  );
}

type SortKey = "published_at" | "impressions" | "followers_gained" | "followers_per_1000" | "saves_reposts_per_1000" | "profile_views" | "age_days";
function Posts({ posts }: { posts: PostRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "published_at", desc: true });
  const [topic, setTopic] = useState(""); const [format, setFormat] = useState("");
  const topics = [...new Set(posts.map((p) => p.topic).filter(Boolean))].sort() as string[];
  const formats = [...new Set(posts.map((p) => p.format).filter(Boolean))].sort() as string[];
  const rows = posts.filter((p) => (!topic || p.topic === topic) && (!format || p.format === format)).sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (x == null) return 1; if (y == null) return -1;
    const r = typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y);
    return sort.desc ? -r : r;
  });
  const { strongest, weakest } = rankPosts(posts);
  const head = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <Button variant="ghost" size="sm" className="sort-btn" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : true })}>
        {label}{sort.key === key ? (sort.desc ? <ArrowDown /> : <ArrowUp />) : <ArrowUpDown className="opacity-40" />}
      </Button>
    </th>);
  const list = (title: string, items: PostRow[]) => (
    <div className="strategy-card"><p className="card-label">{title}</p>
      <ol className="rank-list">{items.map((p) => <li key={p.urn}><a href={p.url ?? undefined} target="_blank" rel="noreferrer" className="cta-link">{p.hook}</a><span>{fmt(Number(p.followers_per_1000), 2)} per 1,000 · {fmt(p.impressions)} impressions</span></li>)}</ol>
    </div>);
  return (
    <section aria-labelledby="posts-h"><h2 id="posts-h" className="section-heading">Posts</h2>
      <p className="measure-note mb-4">Lifetime numbers of the baseline posts. Strongest and weakest by followers per 1,000 impressions, among posts with at least 2,000 impressions.</p>
      <div className="strategy-grid mb-4">{list("Strongest", strongest)}{list("Weakest", weakest)}</div>
      <div className="strategy-card">
        <div className="measure-controls mb-3">
          <label className="field-label flex items-center gap-2">Topic<select className="version-select" value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">All</option>{topics.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="field-label flex items-center gap-2">Format<select className="version-select" value={format} onChange={(e) => setFormat(e.target.value)}><option value="">All</option>{formats.map((t) => <option key={t}>{t}</option>)}</select></label>
          <span className="field-label">{rows.length} of {posts.length} posts</span>
        </div>
        <div className="table-scroll"><table className="measure-table">
          <thead><tr>{head("published_at", "Date")}<th>Hook</th><th>Format</th><th>Topic</th>{head("impressions", "Impressions")}{head("followers_gained", "Followers gained")}{head("followers_per_1000", "Followers / 1,000")}{head("saves_reposts_per_1000", "Saves + reposts / 1,000")}{head("profile_views", "Profile views")}{head("age_days", "Age (days)")}</tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.urn}>
              <td className="whitespace-nowrap">{day(p.published_at)}</td>
              <td className="hook-cell">{p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="cta-link">{p.hook ?? "—"}</a> : p.hook ?? "—"}</td>
              <td>{p.format ?? "—"}</td><td>{p.topic ?? "—"}</td>
              <td className="num">{fmt(p.impressions)}</td><td className="num">{fmt(p.followers_gained)}</td>
              <td className="num">{p.followers_per_1000 == null ? "—" : fmt(Number(p.followers_per_1000), 2)}</td>
              <td className="num">{p.saves_reposts_per_1000 == null ? "—" : fmt(Number(p.saves_reposts_per_1000), 2)}</td>
              <td className="num">{fmt(p.profile_views)}</td><td className="num">{fmt(p.age_days)}</td>
            </tr>))}</tbody>
        </table></div>
      </div>
    </section>
  );
}

function Audience({ data, selected }: { data: MeasurementData; selected: string }) {
  const hasOwn = data.periodAudience.some((a) => a.period_label === selected);
  const label = hasOwn ? selected : "BASE";
  const highlight: Record<string, string[]> = { industry: TARGET_INDUSTRIES, seniority: SENIOR_LEVELS, location: [] };
  const chart = (scope: string, dimension: string) => {
    const rows = data.periodAudience.filter((a) => a.period_label === label && a.scope === scope && a.dimension === dimension)
      .sort((a, b) => Number(b.share_pct ?? 0) - Number(a.share_pct ?? 0)).map((a) => ({ label: a.label, share: a.share_pct == null ? 0.5 : Number(a.share_pct), below: !!a.below_one_pct }));
    if (!rows.length) return <p className="kpi-missing">not yet measured</p>;
    return <ResponsiveContainer width="100%" height={rows.length * 24 + 10}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={0} axisLine={false} tickLine={false} />
        <Bar dataKey="share" isAnimationActive={false} barSize={12}>
          {rows.map((r) => <Cell key={r.label} fill={highlight[dimension]?.includes(r.label) ? ACCENT : DATA} />)}
          <LabelList dataKey="share" position="right" content={(p: any) => { const r = rows[p.index ?? 0]; return <text x={Number(p.x) + Number(p.width) + 4} y={Number(p.y) + Number(p.height) / 2 + 3} fontSize={10} fill="var(--muted-foreground)">{r?.below ? "< 1%" : `${r?.share}%`}</text>; }} />
        </Bar>
      </BarChart></ResponsiveContainer>;
  };
  const checks = data.spotChecks;
  const check = [...checks].sort((a, b) => b.checked_on.localeCompare(a.checked_on))[0];
  return (
    <section aria-labelledby="aud-h"><h2 id="aud-h" className="section-heading">Audience</h2>
      <p className="measure-note mb-4">{hasOwn ? `LinkedIn export for ${selected}. Follower demographics are the state at download; viewer demographics cover the period.` : "Baseline import."} Target industries and senior levels in blue.</p>
      {(["industry", "seniority", "location"] as const).map((dim) => (
        <div key={dim} className="strategy-grid mb-4">
          <div className="strategy-card"><p className="card-label">Followers · {dim}</p><div className="mt-3">{chart("followers", dim)}</div></div>
          <div className="strategy-card"><p className="card-label">Content viewers · {dim}</p><div className="mt-3">{chart("content_viewers", dim)}</div></div>
        </div>))}
      <div className="strategy-card"><p className="card-label">Latest spot check of new followers</p>
        {check ? (() => { const s = spotCheck(check); return <>
          <div className="funnel mt-3"><div className="funnel-step"><p className="field-label">Strict match</p><p className="kpi-value">{fmt(s.strict * 100, 1)}%</p><p className="kpi-note">{check.strict_count} of {check.sample_size}</p></div>
          <div className="funnel-step"><p className="field-label">Strict or broad</p><p className="kpi-value">{fmt(s.strictOrBroad * 100, 1)}%</p><p className="kpi-note">{check.strict_count + check.broad_count} of {check.sample_size}</p></div>
          <div className="funnel-step"><p className="field-label">No match</p><p className="kpi-value">{check.none_count}</p></div></div>
          <p className="measure-note mt-3">Sample size {check.sample_size}, checked {day(check.checked_on)} · self-reported · {SOURCE_NAME[check.source_key] ?? check.source_key} · Method: {check.method_version}</p></>; })() : <p className="kpi-missing">not yet measured</p>}
      </div>
    </section>
  );
}

function PeriodSummary({ data, periodId }: { data: MeasurementData; periodId?: string | undefined }) {
  const s = [...data.summaries].filter((x) => x.period_id === periodId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const name = (k: string) => data.definitions.find((d) => d.key === k)?.name ?? k;
  return (
    <section className="strategy-card"><h2 className="measure-h">Period summary</h2>
      {s ? <>
        <p className="strategy-copy">{s.summary.headline}</p>
        <ul className="rank-list">{s.summary.findings.map((f, i) => <li key={i}>{f.text}<span>{name(f.kpi_key)}</span></li>)}</ul>
        {!!s.summary.flags.length && <p className="measure-note mt-3">Flags: {s.summary.flags.join(" · ")}</p>}
        <p className="measure-note mt-3">Written {when(s.created_at)} from the computed KPI values only.</p>
      </> : <p className="measure-note">The first written summary appears after P1 is measured on 27 October.</p>}
    </section>
  );
}

const toBase64 = async (f: File) => {
  const b = new Uint8Array(await f.arrayBuffer());
  let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

function DataRuns({ data }: { data: MeasurementData }) {
  const qc = useQueryClient();
  const upload = useServerFn(uploadLinkedInExport);
  const log = useServerFn(logManualEntry);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | string | null>(null);
  const [lead, setLead] = useState({ date: "", kind: "meeting", person_type: "investor", attribution: "said_linkedin", post_urn: "", note: "" });
  const [check, setCheck] = useState({ checked_on: "", sample_size: "", strict_count: "", broad_count: "", none_count: "", method_version: "" });
  const runs = [...data.runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const metrics = [...new Set(data.caps.map((c) => c.metric_key))];
  const sources = ["linkedin_api", "linkedin_export", "manual"];
  const cap = (m: string, s: string) => data.caps.find((c) => c.metric_key === m && c.source_key === s);
  const go = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what); setResult(null);
    try { setResult((await fn()) as RunResult); }
    catch (e) { setResult(e instanceof Error ? e.message.replace(/^\[.*?\]\s*/, "") : "Something went wrong. Please try again."); }
    finally { setBusy(null); void qc.invalidateQueries({ queryKey: ["measurement"] }); }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setResult("The file is larger than 5 MB."); return; }
    void go("upload", async () => upload({ data: { filename: f.name, base64: await toBase64(f) } }));
  };
  const num = (s: string) => Number(s);
  return (
    <details className="strategy-card data-runs">
      <summary className="measure-h">Data &amp; runs</summary>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild disabled={!!busy}>
          <label className="cursor-pointer"><Upload /> {busy === "upload" ? "Uploading and measuring…" : "Upload LinkedIn export"}
            <input type="file" accept=".xlsx" className="sr-only" disabled={!!busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </Button>
        <span className="measure-note">LinkedIn → Analytics → Content → time range Individuell (the period's Monday to Sunday) → Export</span>
      </div>
      <ResultNote r={result} />
      <SchedulePanel />
      <Step7DataRuns posts={data.posts} />

      <div className="strategy-grid mt-6">
        <form className="strategy-card manual-form" onSubmit={(e) => { e.preventDefault(); void go("lead", () => log({ data: { entry_type: "lead", date: lead.date, kind: lead.kind as "meeting", person_type: lead.person_type as "investor", attribution: lead.attribution as "said_linkedin", post_urn: lead.post_urn || null, note: lead.note || null } })); }}>
          <p className="card-label">Log a lead</p>
          <label>Date<input type="date" required value={lead.date} onChange={(e) => setLead({ ...lead, date: e.target.value })} /></label>
          <label>Kind<select value={lead.kind} onChange={(e) => setLead({ ...lead, kind: e.target.value })}>{["meeting", "inquiry", "intro"].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Person type<select value={lead.person_type} onChange={(e) => setLead({ ...lead, person_type: e.target.value })}>{[["investor", "Investor"], ["rollup_operator", "Rollup operator"], ["founder", "Founder"], ["other", "Other"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Attribution<select value={lead.attribution} onChange={(e) => setLead({ ...lead, attribution: e.target.value })}>{["tracked_link", "named_post", "said_linkedin", "unknown"].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Post (optional)<select value={lead.post_urn} onChange={(e) => setLead({ ...lead, post_urn: e.target.value })}><option value="">—</option>{data.posts.map((p) => <option key={p.urn} value={p.urn}>{day(p.published_at)} · {(p.hook ?? p.urn).slice(0, 60)}</option>)}</select></label>
          <label>Note (optional)<input value={lead.note} maxLength={1000} onChange={(e) => setLead({ ...lead, note: e.target.value })} /></label>
          <Button type="submit" size="sm" disabled={!!busy}>{busy === "lead" ? "Saving…" : "Log lead"}</Button>
        </form>
        <form className="strategy-card manual-form" onSubmit={(e) => { e.preventDefault(); void go("check", () => log({ data: { entry_type: "spot_check", checked_on: check.checked_on, sample_size: num(check.sample_size), strict_count: num(check.strict_count), broad_count: num(check.broad_count), none_count: num(check.none_count), method_version: check.method_version } })); }}>
          <p className="card-label">Log a spot check</p>
          <label>Checked on<input type="date" required value={check.checked_on} onChange={(e) => setCheck({ ...check, checked_on: e.target.value })} /></label>
          {(["sample_size", "strict_count", "broad_count", "none_count"] as const).map((k) => <label key={k}>{k.replace("_count", "").replace("_", " ")}<input type="number" min={0} required value={check[k]} onChange={(e) => setCheck({ ...check, [k]: e.target.value })} /></label>)}
          <label>Method version<input required maxLength={300} value={check.method_version} onChange={(e) => setCheck({ ...check, method_version: e.target.value })} /></label>
          <Button type="submit" size="sm" disabled={!!busy}>{busy === "check" ? "Saving…" : "Log spot check"}</Button>
        </form>
      </div>

      <h3 className="card-label mt-6">Logged leads</h3>
      {data.manualLeads.length ? <div className="table-scroll"><table className="measure-table"><thead><tr><th>Date</th><th>Period</th><th>Kind</th><th>Person</th><th>Attribution</th><th>Note</th><th /></tr></thead>
        <tbody>{data.manualLeads.map((l) => <tr key={l.id}><td>{day(l.date)}</td><td>{l.period_label}</td><td>{l.kind}</td><td>{l.person_type}</td><td>{l.attribution}</td><td>{l.note ?? "—"}</td>
          <td><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void go("remove", () => log({ data: { entry_type: "lead_removal", lead_id: l.id } }))}>Remove</Button></td></tr>)}</tbody></table></div>
        : <p className="measure-note">No leads logged here yet.</p>}

      <h3 className="card-label mt-6">Runs</h3>
      {runs.map((r) => (
        <div key={r.id} className="run-item">
          <p className="status-line"><span className={`run-dot ${runDot(r.status)}`} aria-hidden="true" />{when(r.created_at)} · {r.trigger} · <strong>{r.status}</strong> · {r.workflow_version ?? "—"} · read {fmt(r.records_read)} · written {fmt(r.records_written)}</p>
          {r.changes_summary && <p className={`measure-note${["failed", "needs_attention"].includes(r.status) ? " run-error" : ""}`}>{r.changes_summary}</p>}
          <ul className="step-list">{data.steps.filter((s) => s.run_id === r.id).sort((a, b) => (a.finished_at ?? "").localeCompare(b.finished_at ?? "")).map((s) => <li key={s.id}>{s.step}: {s.status}{s.message ? ` — ${s.message}` : ""}</li>)}</ul>
          {(() => { const iss = data.issues.filter((i) => i.run_id === r.id && i.severity !== "info"); const info = data.issues.filter((i) => i.run_id === r.id && i.severity === "info").length;
            return iss.length || info ? <p className="measure-note">{iss.map((i) => `${i.severity}: ${i.message}`).join(" ")}{info ? ` ${info} info note${info > 1 ? "s" : ""}.` : ""}</p> : null; })()}
        </div>))}
      <h3 className="card-label mt-6">Raw imports</h3>
      <div className="table-scroll"><table className="measure-table"><thead><tr><th>File or entry</th><th>Received</th><th>Source</th><th>Range</th><th>Status</th><th>SHA-256</th></tr></thead>
        <tbody>{[...data.raws].sort((a, b) => b.received_at.localeCompare(a.received_at)).map((r) => <tr key={r.id}><td>{r.payload?.filename ?? r.payload?.entry_type ?? "—"}</td><td>{when(r.received_at)}</td><td>{r.source_key}</td><td>{r.period_hint ?? "—"}</td><td>{r.status}</td><td className="mono">{r.sha256.slice(0, 12)}…</td></tr>)}</tbody></table></div>
      <h3 className="card-label mt-6">Source capabilities (latest row per source and metric)</h3>
      <div className="table-scroll"><table className="measure-table"><thead><tr><th>Metric</th>{sources.map((s) => <th key={s}>{s}</th>)}</tr></thead>
        <tbody>{metrics.map((m) => <tr key={m}><td>{m}</td>{sources.map((s) => { const c = cap(m, s); return <td key={s}>{c?.available ?? "—"}{c?.note ? <span className="cap-note"> · {c.note}</span> : null}{c ? <span className="cap-note"> · {c.verified_on ? `verified ${c.verified_on}` : "not yet verified"}</span> : null}</td>; })}</tr>)}</tbody></table></div>
    </details>
  );
}
