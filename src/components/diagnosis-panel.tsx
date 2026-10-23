// Diagnosis tab: verdict, trends with projections, breaks and spikes, findings, benchmarks, meetings and positioning.
// Every number is computed by fixed rules in src/lib/diagnosis*.ts from database rows.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { diagnosisQuery } from "@/lib/strategy-query";
import { buildDiagnosis, type SeriesBlock } from "@/lib/diagnosis-build";
import { CRITERIA } from "@/lib/imports/config-csv";
import type { Finding } from "@/lib/diagnosis";
import type { DiagnosisData, Rec } from "@/lib/diagnosis.functions";

const DATA = "var(--chart-data)", ACCENT = "var(--primary)", MUTED = "var(--muted-foreground)";
const fmt = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : Number(v).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
const axis = { fontSize: 10, fill: "var(--muted-foreground)" };
const tip = { background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 };
const short = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function DiagnosisPanel() {
  const q = useQuery(diagnosisQuery());
  if (q.isPending) return <p className="measure-note">Loading diagnosis…</p>;
  if (q.isError) return <p role="alert" className="error-note">The diagnosis could not be loaded. Please try again.</p>;
  return <Diagnosis data={q.data} />;
}

function Diagnosis({ data }: { data: DiagnosisData }) {
  const today = new Date().toISOString().slice(0, 10);
  const r = useMemo(() => buildDiagnosis(data, today), [data, today]);
  return (
    <div className="measure-stack">
      <Verdict strong={r.verdict.strong} lacking={r.verdict.lacking} gap={r.attributionGap} />
      <section aria-labelledby="trends-h"><h2 id="trends-h" className="section-heading">Trends and projections</h2>
        <div className="multiples">{r.blocks.map((b) => <Multiple key={b.key} b={b} grid={r.grid} annotations={data.annotations} />)}</div>
      </section>
      <Changes blocks={r.blocks} />
      <Findings findings={r.findings} />
      <p className="measure-note">Benchmarks as of {data.observations.reduce<string | null>((m, o) => (!m || String(o["observed_on"]) > m ? String(o["observed_on"]) : m), null) ?? "—"}</p>
      <Benchmarks r={r} />
      <MeetingsPositioning r={r} data={data} />
    </div>
  );
}

function FindingCard({ f }: { f: Finding }) {
  return (
    <li className={`finding finding-${f.side}`}>
      <p className="finding-metric">{f.metric}: <strong>{f.value}</strong></p>
      <p className="finding-cmp">vs {f.comparedWith} · gap {f.gap}</p>
      <p className="finding-why">{f.why}</p>
      <p className="finding-meta"><span className={`kind-badge${f.confidence === "high" ? " measured" : ""}`}>{f.confidence} confidence</span></p>
    </li>
  );
}
function Verdict({ strong, lacking, gap }: { strong: Finding[]; lacking: Finding[]; gap: string | null }) {
  return (
    <section className="verdict-grid" aria-label="Verdict">
      <div className="strategy-card"><h2 className="measure-h">Strong</h2>{strong.length ? <ul className="finding-list">{strong.map((f) => <FindingCard key={f.rule + f.metric} f={f} />)}</ul> : <p className="kpi-missing">No rule finds a strength yet.</p>}</div>
      <div className="strategy-card"><h2 className="measure-h">Lacking</h2>{lacking.length ? <ul className="finding-list">{lacking.map((f) => <FindingCard key={f.rule + f.metric} f={f} />)}</ul> : <p className="kpi-missing">No rule finds a gap yet.</p>}
        {gap && <p className="measure-note mt-3">{gap}</p>}</div>
    </section>
  );
}

function Multiple({ b, grid, annotations }: { b: SeriesBlock; grid: Rec[]; annotations: Rec[] }) {
  const p12 = grid.findIndex((p) => p["end_date"] === "2027-03-28");
  const p4 = grid.findIndex((p) => p["end_date"] === "2026-12-06");
  const rec = b.projection.recent, lr = b.projection.longRun;
  const firstFit = rec ? b.points.findIndex((p) => p.label === rec.fromLabel) : -1;
  const lastData = b.points.length - 1;
  const rows = grid.slice(0, p12 + 1).map((p, x) => {
    const pt = b.points[x];
    const fitted = rec ? rec.intercept + rec.slope * x : null;
    return {
      label: String(p["label"]), value: pt?.value ?? null, partial: pt ? !pt.complete && pt.value != null : false,
      recent: rec && x >= firstFit && x <= lastData ? fitted : null,
      proj: rec && x >= lastData ? fitted : null,
      low: rec && x >= lastData ? fitted! - rec.spread : null, high: rec && x >= lastData ? fitted! + rec.spread : null,
      long: lr && x <= lastData ? lr.intercept + lr.slope * x : null,
    };
  });
  const periodOf = (date: string) => grid.find((p) => date >= String(p["start_date"]) && date <= String(p["end_date"]))?.["label"] as string | undefined;
  const marks = annotations.flatMap((a) => { const x = periodOf(String(a["date"])); return x && rows.some((r) => r.label === x) ? [{ x, label: String(a["label"]) }] : []; });
  const hasData = b.points.some((p) => p.value != null);
  const chipClass = b.status.kind === "on track" ? "chip-good" : b.status.kind === "off track" ? "chip-bad" : "chip-neutral";
  return (
    <article className="strategy-card multiple">
      <div className="flex items-start justify-between gap-2"><h3 className="kpi-name">{b.title}</h3><span className={`status-chip ${chipClass}`}>{b.status.text}</span></div>
      {!hasData ? <p className="kpi-missing mt-3">not yet measured</p> : (<>
        <div className="chart-box"><ResponsiveContainer width="100%" height={210}>
          <ComposedChart data={rows} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
            <defs><pattern id={`hatch-${b.key}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--card)" /><line x1="0" y1="0" x2="0" y2="5" stroke={DATA} strokeWidth="2.5" /></pattern></defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={axis} interval={3} stroke="var(--border)" />
            <YAxis tick={axis} width={44} stroke="var(--border)" tickFormatter={(v: number) => fmt(v, b.decimals > 1 ? 1 : 0)} />
            <Tooltip contentStyle={tip} formatter={(v: number) => fmt(v, b.decimals)} />
            <Bar dataKey="value" name={b.unit} isAnimationActive={false}>
              {rows.map((r) => <Cell key={r.label} fill={r.partial ? `url(#hatch-${b.key})` : r.label === b.currentLabel ? ACCENT : DATA} stroke={b.breaks.some((x) => x.label === r.label) ? ACCENT : b.spikes.some((s) => s.label === r.label) ? "var(--foreground)" : undefined} strokeWidth={1.5} />)}
            </Bar>
            <Line dataKey="long" name="long-run trend" stroke={MUTED} strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line dataKey="recent" name="recent trend" stroke="var(--foreground)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line dataKey="proj" name="projection" stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            <Line dataKey="low" name="likely range" stroke={MUTED} strokeWidth={1} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
            <Line dataKey="high" name="likely range" stroke={MUTED} strokeWidth={1} strokeDasharray="2 3" dot={false} isAnimationActive={false} legendType="none" />
            {b.baseline != null && <ReferenceLine y={b.baseline} stroke={MUTED} strokeDasharray="6 3" label={{ value: "baseline", position: "insideTopLeft", fontSize: 9, fill: MUTED }} />}
            {b.plan != null && <ReferenceLine y={b.plan} stroke={ACCENT} strokeDasharray="6 3" label={{ value: "Plan target (8 Dec)", position: "insideTopRight", fontSize: 9, fill: "var(--primary)" }} />}
            {b.tab1 != null && <ReferenceLine y={b.tab1} stroke="var(--foreground)" strokeDasharray="1 3" label={{ value: "Tab 1 target", position: "insideBottomRight", fontSize: 9 }} />}
            {marks.map((m) => <ReferenceLine key={m.label} x={m.x} stroke={MUTED} strokeDasharray="2 2" />)}
            {p4 >= 0 && <ReferenceLine x={String(grid[p4]!["label"])} stroke={MUTED} label={{ value: "P4", position: "insideTop", fontSize: 9, fill: MUTED }} />}
          </ComposedChart></ResponsiveContainer></div>
        <p className="kpi-note">
          {b.projection.p4 ? `End of P4 (6 Dec): ${fmt(b.projection.p4.value, b.decimals)} (likely ${fmt(b.projection.p4.low, b.decimals)}–${fmt(b.projection.p4.high, b.decimals)})` : "No projection: fewer than 2 complete periods."}
          {b.projection.p12 ? ` · end of P12 (28 Mar 2027): ${fmt(b.projection.p12.value, b.decimals)}` : ""}
        </p>
        <p className="kpi-compare">
          {b.projection.usesPreRelaunch && rec ? `Uses the pre-relaunch trend (${rec.fromLabel}–${rec.toLabel}). ` : rec ? `Recent trend ${rec.fromLabel}–${rec.toLabel}. ` : ""}
          Baseline {fmt(b.baseline, b.decimals)}{b.plan != null ? ` · Plan target (8 Dec) ${fmt(b.plan, b.decimals)}` : ""}{b.tab1 != null ? ` · Tab 1 target ${fmt(b.tab1, b.decimals)}` : ""}
        </p>
      </>)}
    </article>
  );
}

function Changes({ blocks }: { blocks: SeriesBlock[] }) {
  const items = blocks.filter((b) => ["followers", "impressions", "engagement"].includes(b.key));
  return (
    <section className="strategy-card"><h2 className="measure-h">Where something changed</h2>
      <p className="measure-note mt-2">Break: the median of 3 complete periods differs from the 6 before by more than 30%, all on one side. Spike: more than 4 × max(1.48 × MAD, 25% of the median) from up to 3 neighbours on each side. Annotations within 2 periods are possible causes, not proven.</p>
      <div className="strategy-grid mt-4">{items.map((b) => (
        <div key={b.key}><p className="card-label">{b.title}</p>
          <ul className="change-list">
            {b.breaks.map((x) => <li key={`b${x.label}`}><strong>Break {x.direction} from {x.label}</strong> ({short(b.points[x.index]!.start)}): {x.pct > 0 ? "+" : ""}{fmt(x.pct)}%, {fmt(x.level, b.decimals)} vs {fmt(x.before, b.decimals)}{x.cause ? ` — possible cause, not proven: ${x.cause}` : ""}</li>)}
            {b.spikes.map((s) => <li key={`s${s.label}`}><strong>Spike {s.direction} in {s.label}</strong>: {fmt(s.value, b.decimals)} vs neighbours' median {fmt(s.median, b.decimals)}{s.driver ? ` — driven by: ${s.driver}` : ""}</li>)}
            {!b.breaks.length && !b.spikes.length && <li>No breaks or spikes.</li>}
          </ul></div>))}
      </div>
    </section>
  );
}

function Findings({ findings }: { findings: Finding[] }) {
  return (
    <details className="strategy-card"><summary className="measure-h">All findings ({findings.length})</summary>
      <ul className="finding-list mt-4">{findings.map((f) => (
        <li key={f.rule + f.metric} className={`finding finding-${f.side}`}>
          <p className="finding-metric">{f.side === "strong" ? "Working" : "Wrong"}: {f.metric} — <strong>{f.value}</strong></p>
          <p className="finding-cmp">Evidence: vs {f.comparedWith}, gap {f.gap}.</p>
          <p className="finding-why">Why it matters: {f.why}</p>
          <p className="finding-cmp">Confidence: {f.confidence}. What would confirm it: {f.confirm}</p>
        </li>))}</ul>
    </details>
  );
}

type Built = ReturnType<typeof buildDiagnosis>;
function Benchmarks({ r }: { r: Built }) {
  const [sortTotal, setSortTotal] = useState(true);
  const b = r.bench;
  const people = [...b.profiles].filter((p) => p["active"] !== false);
  const total = (k: string) => b.latest.get(k)?.["framework_total"] ?? 0;
  if (sortTotal) people.sort((x, y) => total(String(y["key"])) - total(String(x["key"])));
  const crit = b.criteria;
  const myRows = b.myObs;
  const bars = people.map((p) => ({ name: String(p["name"]).split(" ")[0], key: String(p["key"]), self: !!p["is_self"], followers: b.latest.get(String(p["key"]))?.["followers"] ?? null, rpf: b.latest.get(String(p["key"]))?.["reactions_per_follower_pct"] ?? null }));
  const multi = b.profiles.filter((p) => b.observations.filter((o) => o["profile_key"] === p["key"] && o["followers"] != null).length >= 2);
  const dates = [...new Set(b.observations.map((o) => String(o["observed_on"])))].sort();
  const growth = dates.map((dt) => { const row: Record<string, unknown> = { date: dt }; for (const p of multi) { const obs = b.observations.filter((o) => o["profile_key"] === p["key"] && o["followers"] != null).sort((x, y) => String(x["observed_on"]).localeCompare(String(y["observed_on"]))); const base = Number(obs[0]!["followers"]); const o = obs.find((x) => x["observed_on"] === dt); if (o) row[String(p["key"])] = (Number(o["followers"]) / base) * 100; } return row; });
  const totals = dates.map((dt) => { const row: Record<string, unknown> = { date: dt }; for (const p of b.profiles) { const o = b.observations.find((x) => x["profile_key"] === p["key"] && x["observed_on"] === dt); if (o) row[String(p["key"])] = o["framework_total"]; } return row; });
  const below = b.me ? crit.filter((c) => { const m = b.benchMedian(String(c["key"])); return m != null && (b.me![String(c["key"])] ?? 0) < m; }) : [];
  return (
    <section className="strategy-card" aria-labelledby="bench-h"><h2 id="bench-h" className="measure-h">Benchmarks</h2>
      <div className="mt-3 flex items-center gap-3"><Button size="sm" variant={sortTotal ? "default" : "outline"} onClick={() => setSortTotal(!sortTotal)}>{sortTotal ? "Sorted by total" : "Sort by total"}</Button>
        <span className="measure-note">Framework v1 scores 0–2 per criterion. Your 8 Oct and 12 Oct rows are shown side by side.</span></div>
      <div className="table-scroll mt-3"><table className="heatmap">
        <thead><tr><th>Person</th>{crit.map((c) => <th key={String(c["key"])} title={String(c["description"])}>{String(c["label"])}</th>)}<th>Total</th></tr></thead>
        <tbody>{people.flatMap((p) => {
          const k = String(p["key"]);
          const rows = p["is_self"] ? myRows.map((o) => ({ label: `${p["name"]} · ${short(String(o["observed_on"]))}`, vals: CRITERIA.map((c) => (o[c] as number | null)), tot: Number(o["framework_total"]) })) : [{ label: String(p["name"]), vals: CRITERIA.map((c) => b.latest.get(k)?.[c] ?? null), tot: total(k) }];
          return rows.map((row) => <tr key={row.label} className={p["is_self"] ? "heat-self" : ""}><th scope="row">{row.label}</th>{row.vals.map((v, i) => <td key={i} className={`heat-${v ?? "na"}`}>{v ?? "—"}</td>)}<td className="heat-total">{row.tot}</td></tr>);
        })}
          <tr><th scope="row">Benchmark median (10)</th>{CRITERIA.map((c) => <td key={c}>{fmt(b.benchMedian(c), 1)}</td>)}<td className="heat-total">{fmt(b.benchMedian("framework_total"), 1)}</td></tr>
        </tbody></table></div>

      <div className="strategy-grid mt-6">
        <div><p className="field-label">Followers</p><div className="chart-box"><ResponsiveContainer width="100%" height={220}><BarChart data={bars} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="name" tick={axis} interval={0} angle={-35} textAnchor="end" height={50} stroke="var(--border)" /><YAxis tick={axis} width={52} stroke="var(--border)" tickFormatter={(v: number) => fmt(v)} /><Tooltip contentStyle={tip} formatter={(v: number) => fmt(v)} />
          <Bar dataKey="followers" isAnimationActive={false}>{bars.map((x) => <Cell key={x.key} fill={x.self ? ACCENT : DATA} />)}</Bar></BarChart></ResponsiveContainer></div></div>
        <div><p className="field-label">Reactions per follower (%)</p><div className="chart-box"><ResponsiveContainer width="100%" height={220}><BarChart data={bars} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="name" tick={axis} interval={0} angle={-35} textAnchor="end" height={50} stroke="var(--border)" /><YAxis tick={axis} width={40} stroke="var(--border)" /><Tooltip contentStyle={tip} formatter={(v: number) => `${fmt(v, 2)}%`} />
          <Bar dataKey="rpf" isAnimationActive={false}>{bars.map((x) => <Cell key={x.key} fill={x.self ? ACCENT : DATA} />)}</Bar></BarChart></ResponsiveContainer></div></div>
      </div>
      {dates.length >= 2 && multi.length > 0 && (
        <div className="strategy-grid mt-6">
          <div><p className="field-label">Follower growth, first snapshot = 100</p><div className="chart-box"><ResponsiveContainer width="100%" height={200}><LineChart data={growth}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="date" tick={axis} stroke="var(--border)" /><YAxis tick={axis} width={40} domain={["auto", "auto"]} stroke="var(--border)" /><Tooltip contentStyle={tip} formatter={(v: number) => fmt(v, 1)} /><Legend wrapperStyle={{ fontSize: 10 }} />
            {multi.map((p) => <Line key={String(p["key"])} dataKey={String(p["key"])} name={String(p["name"])} stroke={p["is_self"] ? ACCENT : DATA} dot isAnimationActive={false} connectNulls />)}</LineChart></ResponsiveContainer></div></div>
          <div><p className="field-label">Framework totals over time</p><div className="chart-box"><ResponsiveContainer width="100%" height={200}><LineChart data={totals}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="date" tick={axis} stroke="var(--border)" /><YAxis tick={axis} width={30} domain={[0, 20]} stroke="var(--border)" /><Tooltip contentStyle={tip} />
            {b.profiles.map((p) => <Line key={String(p["key"])} dataKey={String(p["key"])} name={String(p["name"])} stroke={p["is_self"] ? ACCENT : DATA} strokeWidth={p["is_self"] ? 2 : 1} dot isAnimationActive={false} connectNulls />)}</LineChart></ResponsiveContainer></div></div>
        </div>)}

      <h3 className="card-label mt-6">What the leaders do that you don't</h3>
      {below.length ? <ul className="change-list">{below.map((c) => { const k = String(c["key"]); const leaders = b.others.filter((p) => b.latest.get(String(p["key"]))?.[k] === 2);
        return <li key={k}><strong>{String(c["label"])}</strong> (you {b.me?.[k]}, median {fmt(b.benchMedian(k), 1)}): {leaders.map((p) => `${p["name"]} — ${p["how_visitors_become_followers"]}`).join("; ") || "no one scores 2"}</li>; })}</ul>
        : <p className="measure-note">You are at or above the median on every criterion.</p>}

      <h3 className="card-label mt-6">Reference benchmarks</h3>
      <div className="table-scroll"><table className="posts-table"><thead><tr><th>Benchmark</th><th>Value</th><th>Source</th><th>As of</th></tr></thead>
        <tbody>{b.references.map((x) => <tr key={String(x["key"])}><td>{String(x["description"])}</td><td>{x["value"] == null ? "—" : `${fmt(Number(x["value"]), 2)} ${x["unit"] ?? ""}`}</td><td>{String(x["source"] ?? "—")}</td><td>{String(x["as_of"] ?? "—")}</td></tr>)}</tbody></table></div>
    </section>
  );
}

const TYPE_LABEL: Record<string, string> = { investor: "Investor", operator: "Rollup operator", rollup_operator: "Rollup operator", founder: "Founder", other: "Other" };
function MeetingsPositioning({ r, data }: { r: Built; data: DiagnosisData }) {
  const live = r.shown.filter((p) => p["kind"] === "biweekly");
  const rows = live.map((p) => {
    const ms = r.meetingLeads.filter((l) => String(l["date"]) >= String(p["start_date"]) && String(l["date"]) <= String(p["end_date"]));
    const o: Record<string, unknown> = { label: p["label"], total: ms.length };
    for (const t of ["Investor", "Rollup operator", "Founder", "Other"]) o[t] = ms.filter((l) => TYPE_LABEL[String(l["person_type"])] === t).length;
    o["share"] = ms.length ? (((o["Investor"] as number) + (o["Rollup operator"] as number)) / ms.length) * 100 : null;
    return o;
  });
  const pending = data.meetings.filter((m) => m["status"] === "pending").length;
  const byPost = new Map<string, number>();
  for (const l of r.meetingLeads) if (l["post_urn"]) byPost.set(String(l["post_urn"]), (byPost.get(String(l["post_urn"])) ?? 0) + 1);
  const plan = (k: string) => data.planTargets.find((t) => t["key"] === k)?.["target"] as number | undefined;
  const focus = r.shown.slice(-8).map((p) => ({ label: String(p["label"]), ...r.pos.get(String(p["label"]))! }));
  return (
    <section className="strategy-card" aria-labelledby="mp-h"><h2 id="mp-h" className="measure-h">Meetings and positioning</h2>
      <div className="strategy-grid mt-4">
        <div><p className="field-label">Confirmed meetings per period, by type</p>
          {rows.some((x) => (x["total"] as number) > 0) ? <div className="chart-box"><ResponsiveContainer width="100%" height={200}><BarChart data={rows}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="label" tick={axis} stroke="var(--border)" /><YAxis tick={axis} width={30} allowDecimals={false} stroke="var(--border)" /><Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Investor" stackId="a" fill={ACCENT} isAnimationActive={false} /><Bar dataKey="Rollup operator" stackId="a" fill="var(--foreground)" isAnimationActive={false} /><Bar dataKey="Founder" stackId="a" fill={DATA} isAnimationActive={false} /><Bar dataKey="Other" stackId="a" fill="var(--border)" isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
            : <p className="kpi-missing">No confirmed meetings since P1 yet.</p>}
          <p className="measure-note">{pending} pending meetings are shown in Data &amp; runs and never counted here.</p>
        </div>
        <div><p className="field-label">Share with investors or rollup operators</p>
          <ul className="change-list">{rows.map((x) => <li key={String(x["label"])}>{String(x["label"])}: {x["total"] ? `${fmt(x["share"] as number)}% of ${x["total"]}` : "no confirmed meetings"}</li>)}</ul>
          <p className="field-label mt-4">Posts by attributed meetings</p>
          {byPost.size ? <ul className="change-list">{[...byPost].sort((a, b) => b[1] - a[1]).map(([urn, c]) => { const p = data.posts.find((x) => x["urn"] === urn); return <li key={urn}>{c} · {String(p?.["hook"] ?? p?.["url"] ?? urn).slice(0, 70)}</li>; })}</ul> : <p className="measure-note">No meeting is attributed to a post yet.</p>}
        </div>
      </div>
      <p className="field-label mt-6">Post focus per period</p>
      <div className="table-scroll"><table className="posts-table"><thead><tr><th>Period</th><th>Posts</th><th>Core share</th><th>Automation band / week</th><th>Personal</th><th>Prediction economy</th><th>Named person</th><th>Untagged</th></tr></thead>
        <tbody>{focus.map((x) => <tr key={x.label}><td>{x.label}</td><td>{x.posts}</td><td>{x.coreShare == null ? "—" : `${fmt(x.coreShare)}%`}</td><td>{x.posts ? fmt(x.automationPerWeek, 2) : "—"}</td><td>{x.personal}</td><td>{x.prediction}</td><td>{x.namedPerson}</td><td>{x.untagged}</td></tr>)}
          <tr><td>Plan target (8 Dec)</td><td /><td>≥ {fmt(plan("core_topic_share_pct"))}%</td><td>≥ {fmt(plan("automation_band_posts_per_week"))}</td><td>≤ 1 in 8</td><td /><td /><td /></tr></tbody></table></div>
    </section>
  );
}
