// Turns database rows into the Diagnosis tab: series, trends, breaks, spikes, benchmarks and findings. Fixed rules only.
import type { DiagnosisData, Rec } from "./diagnosis.functions";
import {
  breaks, confidenceFor, median, nearestAnnotation, pickVerdict, positioning, project, spikes, status,
  type Break, type Finding, type Projection, type Pt, type Spike, type Status, type TaggedPost,
} from "./diagnosis";
import { CRITERIA } from "./imports/config-csv";

const n = (v: unknown) => (v == null ? null : Number(v));
const fmt = (v: number | null, d = 0) => (v == null ? "—" : v.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const TARGET_IND = ["Venture capital and private equity principals", "Financial services", "Banking"];
export const SENIOR = ["Owner", "Partner", "CXO", "VP", "Director"];

export type SeriesBlock = {
  key: string; title: string; unit: string; points: Pt[]; currentLabel: string | null;
  baseline: number | null; plan: number | null; tab1: number | null;
  projection: Projection; status: Status; breaks: (Break & { cause: string | null })[]; spikes: (Spike & { driver: string | null })[];
  decimals: number;
};

export function buildDiagnosis(d: DiagnosisData, today = new Date().toISOString().slice(0, 10)) {
  const grid = d.periods.filter((p) => ["history", "baseline", "biweekly"].includes(String(p["kind"])) && p["label"] !== "BASE")
    .sort((a, b) => String(a["start_date"]).localeCompare(String(b["start_date"])));
  const shown = grid.filter((p) => String(p["start_date"]) <= today); // B-26 … current period
  const current = shown.at(-1) ?? null;
  const endIdx = (end: string) => grid.findIndex((p) => p["end_date"] === end);
  const byId = (rows: Rec[]) => new Map(rows.map((r) => [String(r["period_id"]), r]));
  const fol = byId(d.followers), imp = byId(d.impressions);
  const plan = (k: string) => n(d.planTargets.filter((t) => t["key"] === k).at(-1)?.["target"]);
  const tab1 = (k: string) => n(d.tab1Targets.find((t) => t["kpi_key"] === k)?.["target_value"]);
  const annotations = d.annotations.map((a) => ({ date: String(a["date"]), label: String(a["label"]) }));
  const isBase = (p: Rec) => p["kind"] === "baseline";

  // top post by export impressions per period (posts published in that period)
  const postImp = new Map<string, number>();
  for (const o of d.exportObs) { const k = String(o["post_urn"]), v = Number(o["impressions"] ?? 0); if (v > (postImp.get(k) ?? 0)) postImp.set(k, v); }
  const topPost = (p: Rec) => {
    const s = String(p["start_date"]), e = String(p["end_date"]);
    const c = d.posts.filter((x) => { const day = String(x["published_at"]).slice(0, 10); return day >= s && day <= e && postImp.has(String(x["urn"])); })
      .sort((a, b) => postImp.get(String(b["urn"]))! - postImp.get(String(a["urn"]))!)[0];
    return c ? `${String(c["hook"] ?? c["url"] ?? c["urn"]).slice(0, 80)} (${fmt(postImp.get(String(c["urn"]))!)} impressions)` : null;
  };

  const pts = (f: (p: Rec) => { v: number | null; complete: boolean }): Pt[] => shown.map((p) => { const r = f(p); return { label: String(p["label"]), value: r.v, complete: r.complete && r.v != null, start: String(p["start_date"]), end: String(p["end_date"]) }; });
  const followers = pts((p) => { const r = fol.get(String(p["id"])); return { v: n(r?.["new_followers"]), complete: !!r?.["is_complete"] }; });
  const impressions = pts((p) => { const r = imp.get(String(p["id"])); const v = n(r?.["range_impressions"]) ?? (r?.["daily_complete"] ? n(r?.["daily_impressions"]) : null); return { v, complete: !!(r?.["daily_complete"] || r?.["range_complete"]) }; });
  const engagement = pts((p) => { const r = imp.get(String(p["id"])); const i = n(r?.["daily_impressions"]), e = n(r?.["daily_engagements"]); return { v: i && e != null ? (e / i) * 1000 : null, complete: !!r?.["daily_complete"] }; });
  // meetings from P1 on: confirmed calendar meetings + manual meeting leads, by lead date
  const meetingLeads = d.leads.filter((l) => l["kind"] === "meeting" && l["source_key"] !== "baseline_2026_10_08");
  const inPeriod = (date: string, p: Rec) => date >= String(p["start_date"]) && date <= String(p["end_date"]);
  const isLive = (p: Rec) => p["kind"] === "biweekly";
  const meetings = pts((p) => isLive(p) ? { v: meetingLeads.filter((l) => inPeriod(String(l["date"]), p)).length, complete: String(p["end_date"]) < today } : { v: null, complete: false });
  const targetMeet = pts((p) => isLive(p) ? { v: meetingLeads.filter((l) => inPeriod(String(l["date"]), p) && ["investor", "operator", "rollup_operator"].includes(String(l["person_type"]))).length, complete: String(p["end_date"]) < today } : { v: null, complete: false });
  const tagged = d.posts as unknown as TaggedPost[];
  const pos = new Map(shown.map((p) => [String(p["label"]), positioning(tagged, String(p["start_date"]), String(p["end_date"]))]));
  const coreShare = pts((p) => { const x = pos.get(String(p["label"]))!; return { v: x.coreShare, complete: String(p["end_date"]) < today && x.tagged > 0 }; });
  const bandWeek = pts((p) => { const x = pos.get(String(p["label"]))!; return { v: x.posts ? x.automationPerWeek : null, complete: String(p["end_date"]) < today && x.posts > 0 }; });

  const baselineOf = (s: Pt[]) => { const b = s.filter((p, i) => isBase(shown[i]!) && p.value != null); return b.length ? b.reduce((a, p) => a + p.value!, 0) / b.length : null; };
  const block = (key: string, title: string, unit: string, points: Pt[], planKey: string | null, tab1Key: string | null, decimals = 0): SeriesBlock => {
    const baseline = baselineOf(points), pl = planKey ? plan(planKey) : null, t1 = tab1Key ? tab1(tab1Key) : null;
    const projection = project(points, endIdx);
    const against = pl != null ? "plan target" : baseline != null ? "baseline" : null;
    return {
      key, title, unit, points, currentLabel: current ? String(current["label"]) : null, baseline, plan: pl, tab1: t1, decimals,
      projection, status: status(projection, pl ?? baseline, against),
      breaks: breaks(points).map((b) => ({ ...b, cause: nearestAnnotation(points[b.index]!.start, annotations)?.label ?? null })),
      spikes: spikes(points).map((s) => ({ ...s, driver: topPost(shown[s.index]!) })),
    };
  };
  const blocks = [
    block("followers", "New followers per 14 days", "followers", followers, "new_followers_per_14d", "new_followers_14d"),
    block("impressions", "Impressions per 14 days", "impressions", impressions, null, "impressions_14d"),
    block("engagement", "Engagements per 1,000 impressions", "per 1,000", engagement, null, null, 1),
    block("meetings", "Meetings per 14 days (from P1)", "meetings", meetings, null, null),
    block("target_meetings", "Meetings with investors or rollup operators per 14 days", "meetings", targetMeet, "target_meetings_per_14d", null),
    block("core_share", "Core-topic share of posts", "%", coreShare, "core_topic_share_pct", null),
    block("band", "Automation-band posts per week", "per week", bandWeek, "automation_band_posts_per_week", null, 2),
  ];

  // ---------- benchmarks ----------
  const latestOf = (key: string) => {
    const rows = d.observations.filter((o) => o["profile_key"] === key).sort((a, b) => String(a["observed_on"]).localeCompare(String(b["observed_on"])));
    const out: Record<string, number | null> = {};
    for (const m of [...CRITERIA, "followers", "reactions_per_follower_pct", "posts_per_week", "framework_total"]) out[m] = n([...rows].reverse().find((r) => r[m] != null)?.[m]);
    out["framework_total"] = CRITERIA.every((c) => out[c] != null) ? CRITERIA.reduce((a, c) => a + out[c]!, 0) : out["framework_total"]!;
    return out;
  };
  const self = d.profiles.find((p) => p["is_self"]);
  const others = d.profiles.filter((p) => !p["is_self"] && p["active"] !== false);
  const latest = new Map(d.profiles.map((p) => [String(p["key"]), latestOf(String(p["key"]))]));
  const me = self ? latest.get(String(self["key"]))! : null;
  const benchMedian = (m: string) => median(others.map((p) => latest.get(String(p["key"]))![m]).filter((v): v is number => v != null));
  const myObs = self ? d.observations.filter((o) => o["profile_key"] === self["key"]).sort((a, b) => String(a["observed_on"]).localeCompare(String(b["observed_on"]))) : [];

  // ---------- findings ----------
  const F: Finding[] = [];
  const completeCount = (s: Pt[]) => s.filter((p) => p.complete).length;
  for (const b of blocks) {
    // a. projection off track
    if (b.status.kind === "off track" && b.projection.p4) {
      const t = (b.plan ?? b.baseline)!;
      F.push({ side: "lacking", rule: "a", metric: b.title, value: `${fmt(b.projection.p4.value, b.decimals)} projected for P4`, comparedWith: `${b.status.against} ${fmt(t, b.decimals)}`, gap: `${fmt(b.projection.p4.value - t, b.decimals)}`, why: `Even the top of the likely range (${fmt(b.projection.p4.high, b.decimals)}) misses the ${b.status.against} at the end of P4.`, confidence: confidenceFor(completeCount(b.points)), confirm: "Two more complete periods on the same slope.", score: Math.abs((b.projection.p4.value - t) / (t || 1)) });
    }
    // b. a break in the last 3 complete periods
    const c = b.points.filter((p) => p.complete);
    const recent = b.breaks.filter((x) => c.slice(-3).some((p) => p.label === x.label));
    for (const x of recent) F.push({ side: x.direction === "up" ? "strong" : "lacking", rule: "b", metric: b.title, value: `${fmt(x.level, b.decimals)} (median of the new level)`, comparedWith: `median of the 6 periods before, ${fmt(x.before, b.decimals)}`, gap: `${x.pct > 0 ? "+" : ""}${fmt(x.pct)}%`, why: `A level change from ${x.label}${x.cause ? `; possible cause, not proven: ${x.cause}` : ""}.`, confidence: confidenceFor(9), confirm: "The next period staying on the new level.", score: Math.abs(x.pct) / 100 });
  }
  // c. reach without engagement
  const lastC = (s: Pt[]) => s.filter((p) => p.complete && p.value != null);
  const ic = lastC(impressions), ec = lastC(engagement);
  if (ic.length >= 4 && ec.length >= 4) {
    const avg = (xs: Pt[]) => xs.reduce((a, p) => a + p.value!, 0) / xs.length;
    const di = ic.at(-1)!.value! / avg(ic.slice(-4, -1)) - 1, de = ec.at(-1)!.value! / avg(ec.slice(-4, -1)) - 1;
    if ((di > 0.2 && de < -0.2) || (di < -0.2 && de > 0.2))
      F.push({ side: "lacking", rule: "c", metric: "Reach without engagement", value: `impressions ${di > 0 ? "+" : ""}${fmt(di * 100)}%, engagements per 1,000 ${de > 0 ? "+" : ""}${fmt(de * 100)}%`, comparedWith: "the previous 3 periods", gap: `${fmt(Math.abs(di - de) * 100)} points apart`, why: "Reach and engagement moved in opposite directions, so the extra reach (or engagement) is not compounding.", confidence: "medium", confirm: "The same split in the next period.", score: Math.abs(di - de) });
  }
  // d. positioning drift
  const lastPos = shown.filter((p) => String(p["end_date"]) < today).map((p) => ({ label: String(p["label"]), ...pos.get(String(p["label"]))! })).filter((x) => x.tagged > 0).slice(-2);
  if (lastPos.length === 2) {
    const corePlan = plan("core_topic_share_pct") ?? 75, bandPlan = plan("automation_band_posts_per_week") ?? 1;
    const lowCore = lastPos.every((x) => (x.coreShare ?? 0) < 75);
    const band = lastPos.reduce((a, x) => a + (x.automationPerWeek ?? 0), 0) / 2;
    const personal = lastPos.reduce((a, x) => a + x.personal, 0) / lastPos.reduce((a, x) => a + x.tagged, 0);
    const untagged = lastPos.reduce((a, x) => a + x.untagged, 0);
    const conf = untagged ? "low" : "medium";
    const lbl = lastPos.map((x) => x.label).join(" and ");
    if (lowCore) F.push({ side: "lacking", rule: "d", metric: "Core-topic share of posts", value: lastPos.map((x) => `${fmt(x.coreShare)}%`).join(", "), comparedWith: `plan target ${fmt(corePlan)}%`, gap: `${fmt(Math.max(...lastPos.map((x) => x.coreShare ?? 0)) - corePlan)} points`, why: `Below 75% in both ${lbl}; the profile tells more than one story.`, confidence: conf, confirm: "Core share in the next two periods.", score: (corePlan - Math.max(...lastPos.map((x) => x.coreShare ?? 0))) / corePlan });
    if (band < 1) F.push({ side: "lacking", rule: "d", metric: "Automation-band posts per week", value: fmt(band, 2), comparedWith: `plan target ${fmt(bandPlan)}`, gap: fmt(band - bandPlan, 2), why: `The owned concept appears less than once a week over ${lbl}; the strongest benchmarks repeat theirs constantly.`, confidence: conf, confirm: "One band post a week for a month.", score: (bandPlan - band) / bandPlan });
    if (personal > 1 / 8) F.push({ side: "lacking", rule: "d", metric: "Personal posts", value: `${fmt(personal * 100)}% of tagged posts`, comparedWith: "at most 1 in 8 (12.5%)", gap: `${fmt(personal * 100 - 12.5)} points`, why: `Personal posts above 1 in 8 over ${lbl} dilute the thesis.`, confidence: conf, confirm: "Personal share in the next two periods.", score: (personal - 0.125) / 0.125 });
    if (!lowCore && band >= 1 && personal <= 1 / 8) F.push({ side: "strong", rule: "d", metric: "Positioning focus", value: `core ${lastPos.map((x) => `${fmt(x.coreShare)}%`).join(", ")}, band ${fmt(band, 2)}/week`, comparedWith: "the plan", gap: "plan met", why: `Topic focus, concept repetition and personal share all meet the plan in ${lbl}.`, confidence: conf, confirm: "The same mix next period.", score: 0.2 });
  }
  // e. meetings
  const liveDone = shown.filter((p) => isLive(p) && String(p["end_date"]) < today).slice(-2);
  const lastMeet = meetingLeads.filter((l) => liveDone.some((p) => inPeriod(String(l["date"]), p)));
  let attributionGap: string | null = null;
  if (lastMeet.length) {
    const tgt = lastMeet.filter((l) => ["investor", "operator", "rollup_operator"].includes(String(l["person_type"]))).length, share = tgt / lastMeet.length;
    if (share < 0.5) F.push({ side: "lacking", rule: "e", metric: "Meetings with investors or rollup operators", value: `${tgt} of ${lastMeet.length} (${fmt(share * 100)}%)`, comparedWith: "50%", gap: `${fmt(share * 100 - 50)} points`, why: "Most meetings are with people outside the target audience.", confidence: "low", confirm: "The share over the next two periods.", score: (0.5 - share) / 0.5 });
    const noPost = lastMeet.filter((l) => !l["post_urn"]).length / lastMeet.length;
    if (noPost > 0.5) attributionGap = `Attribution gap: ${fmt(noPost * 100)}% of recent meetings have no attributed post.`;
  }
  // f. audience
  const aud = (() => {
    const per = new Map<string, Rec[]>();
    for (const a of d.audience) { const k = String(a["period_id"]); per.set(k, [...(per.get(k) ?? []), a]); }
    const cands = shown.filter((p) => per.has(String(p["id"])) && p["label"] !== "BASE");
    const p = cands.at(-1); if (!p) return null;
    const rows = per.get(String(p["id"]))!;
    const share = (dim: string, labels: string[]) => { const r = rows.filter((x) => x["dimension"] === dim && labels.includes(String(x["label"]))); return { v: r.reduce((a, x) => a + Number(x["share_pct"] ?? 0), 0), lb: r.length < labels.length || r.some((x) => x["share_pct"] == null) }; };
    return { label: String(p["label"]), ind: share("industry", TARGET_IND), sen: share("seniority", SENIOR) };
  })();
  if (aud) {
    for (const [name, x, base] of [["Viewers in VC/PE, financial services or banking", aud.ind, 16], ["Viewers at owner-to-director level", aud.sen, 42]] as const) {
      const strong = x.v >= base;
      F.push({ side: strong ? "strong" : "lacking", rule: "f", metric: name, value: `${x.lb ? "at least " : ""}${fmt(x.v)}% (${aud.label})`, comparedWith: `baseline ${base}%`, gap: `${x.v - base > 0 ? "+" : ""}${fmt(x.v - base)} points`, why: strong ? `The content reaches the target audience at least as well as in the baseline.` : `Fewer content viewers from the target audience than in the baseline${x.lb ? "; a label missing from LinkedIn's top list makes this a lower bound" : ""}.`, confidence: confidenceFor(1, { lowerBound: x.lb, direct: true }), confirm: "The next export's viewer demographics.", score: Math.abs(x.v - base) / base });
    }
  }
  // g. benchmarks
  if (me) {
    for (const c of d.criteria) {
      const k = String(c["key"]), mine = me[k], med = benchMedian(k);
      if (mine == null || med == null) continue;
      const leaders = others.filter((p) => latest.get(String(p["key"]))![k] === 2);
      if (mine < med) F.push({ side: "lacking", rule: "g", metric: `Framework: ${c["label"]}`, value: `${mine} of 2`, comparedWith: `benchmark median ${fmt(med, 1)}`, gap: fmt(mine - med, 1), why: `Top scorers: ${leaders.slice(0, 2).map((p) => `${p["name"]} — ${p["how_visitors_become_followers"]}`).join("; ") || "none"}.`, confidence: "medium", confirm: "The next benchmark snapshot.", score: (med - mine) / 2 });
      else F.push({ side: "strong", rule: "g", metric: `Framework: ${c["label"]}`, value: `${mine} of 2`, comparedWith: `benchmark median ${fmt(med, 1)}`, gap: `+${fmt(mine - med, 1)}`, why: `At or above the median of the ten benchmarks.`, confidence: "medium", confirm: "The next benchmark snapshot.", score: (mine - med) / 2 });
    }
    const rpf = me["reactions_per_follower_pct"], rmed = benchMedian("reactions_per_follower_pct");
    if (rpf != null && rmed != null && rpf >= rmed) F.push({ side: "strong", rule: "g", metric: "Reactions per follower", value: `${fmt(rpf, 2)}%`, comparedWith: `benchmark median ${fmt(rmed, 2)}%`, gap: `+${fmt(rpf - rmed, 2)} points`, why: `Engagement per follower is ${fmt(rpf / rmed, 1)}× the benchmark median; the audience responds.`, confidence: "medium", confirm: "The next benchmark snapshot.", score: (rpf - rmed) / rmed });
    const ref = n(d.references.find((r) => r["key"] === "follower_growth_per_month_pct")?.["value"]);
    const fc = followers.filter((p) => p.complete).slice(-2);
    const total = me["followers"];
    if (ref != null && fc.length === 2 && total) {
      const g = ((fc[0]!.value! + fc[1]!.value!) / (total - fc[0]!.value! - fc[1]!.value!)) * (30.44 / 28) * 100;
      F.push({ side: g >= ref ? "strong" : "lacking", rule: "g", metric: "Follower growth per month", value: `${fmt(g, 1)}%`, comparedWith: `reference ${fmt(ref, 1)}% (AuthoredUp)`, gap: `${g - ref > 0 ? "+" : ""}${fmt(g - ref, 1)} points`, why: `New followers in ${fc.map((p) => p.label).join(" and ")} (${fc[0]!.value! + fc[1]!.value!}) against ${fmt(total)} followers.`, confidence: "high", confirm: "The next two periods.", score: Math.abs(g - ref) / ref });
    }
  }
  return {
    blocks, verdict: pickVerdict(F), findings: F, attributionGap, current, shown, grid, pos,
    bench: { self, others, latest, me, benchMedian, myObs, profiles: d.profiles, criteria: d.criteria, observations: d.observations, references: d.references },
    meetingLeads, aud,
  };
}
