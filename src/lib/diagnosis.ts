// Fixed rules for the Diagnosis tab. Every number shown there is computed here from database rows; no AI is involved.
export type Pt = { label: string; value: number | null; complete: boolean; start: string; end: string };
export const RELAUNCH = "2026-10-12";
export const P4_END = "2026-12-06";
export const P12_END = "2027-03-28";

export function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export const mad = (v: number[]) => { const m = median(v); return m == null ? null : median(v.map((x) => Math.abs(x - m))); };

/** Theil–Sen slope (median of pairwise slopes) with median intercept. */
export function theilSen(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  if (xs.length < 2) return null;
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[j] !== xs[i]) slopes.push((ys[j]! - ys[i]!) / (xs[j]! - xs[i]!));
  const slope = median(slopes); if (slope == null) return null;
  return { slope, intercept: median(ys.map((y, i) => y - slope * xs[i]!))! };
}

export type Fit = { slope: number; intercept: number; spread: number; fromLabel: string; toLabel: string };
function fitOn(points: { x: number; y: number; label: string }[]): Fit | null {
  const f = theilSen(points.map((p) => p.x), points.map((p) => p.y)); if (!f) return null;
  const res = points.map((p) => Math.abs(p.y - (f.intercept + f.slope * p.x)));
  return { ...f, spread: 1.48 * (median(res) ?? 0), fromLabel: points[0]!.label, toLabel: points.at(-1)!.label };
}
const completeIdx = (s: Pt[]) => s.map((p, x) => ({ x, y: p.value as number, label: p.label, complete: p.complete && p.value != null, start: p.start })).filter((p) => p.complete);

export type Projection = {
  recent: Fit | null; longRun: Fit | null; usesPreRelaunch: boolean; sinceRelaunch: number;
  p4: { x: number; value: number; low: number; high: number } | null; p12: { x: number; value: number; low: number; high: number } | null;
};
/** Recent trend on the last 6 complete periods, long-run trend on all; projected to the periods ending on P4_END and P12_END. */
export function project(s: Pt[], endIdx: (end: string) => number): Projection {
  const c = completeIdx(s);
  const sinceRelaunch = c.filter((p) => p.start >= RELAUNCH).length;
  const usesPreRelaunch = sinceRelaunch < 3;
  const pool = usesPreRelaunch ? c.filter((p) => p.start < RELAUNCH) : c;
  const recent = fitOn(pool.slice(-6)), longRun = fitOn(c);
  const at = (x: number) => recent ? { x, value: recent.intercept + recent.slope * x, low: recent.intercept + recent.slope * x - recent.spread, high: recent.intercept + recent.slope * x + recent.spread } : null;
  return { recent, longRun, usesPreRelaunch, sinceRelaunch, p4: at(endIdx(P4_END)), p12: at(endIdx(P12_END)) };
}
export type Status = { kind: "on track" | "off track" | "uncertain" | "too early" | "no target"; text: string; against: string | null };
export function status(p: Projection, target: number | null, against: string | null): Status {
  if (p.sinceRelaunch < 3) return { kind: "too early", text: `too early (${p.sinceRelaunch} of 3 periods since relaunch)`, against };
  if (target == null || !p.p4) return { kind: "no target", text: "no target", against };
  if (p.p4.value >= target) return { kind: "on track", text: "on track", against };
  if (p.p4.high < target) return { kind: "off track", text: "off track", against };
  return { kind: "uncertain", text: "uncertain", against };
}

export type Break = { label: string; index: number; direction: "up" | "down"; pct: number; level: number; before: number };
/** Break at i: median of complete periods i..i+2 differs >30% from the median of the 6 before, all 3 on the same side. Consecutive same-direction flags merge. */
export function breaks(s: Pt[]): Break[] {
  const c = completeIdx(s), out: Break[] = [];
  let prev: { i: number; dir: string } | null = null;
  for (let i = 6; i + 2 < c.length; i++) {
    const before = median(c.slice(i - 6, i).map((p) => p.y))!, win = c.slice(i, i + 3).map((p) => p.y), lvl = median(win)!;
    const pct = before ? (lvl - before) / before : 0;
    const dir = pct > 0 ? "up" : "down";
    const flagged = before > 0 && Math.abs(pct) > 0.3 && win.every((y) => (dir === "up" ? y > before : y < before));
    if (flagged && !(prev && prev.dir === dir && prev.i === i - 1)) out.push({ label: c[i]!.label, index: c[i]!.x, direction: dir, pct: pct * 100, level: lvl, before });
    prev = flagged ? { i, dir } : null;
  }
  return out;
}
export type Spike = { label: string; index: number; value: number; median: number; direction: "up" | "down" };
/** Spike: more than 4 × max(1.48 × MAD, 25% of median) from the median of up to 3 complete neighbours on each side. */
export function spikes(s: Pt[]): Spike[] {
  const c = completeIdx(s), out: Spike[] = [];
  c.forEach((p, i) => {
    const nb = [...c.slice(Math.max(0, i - 3), i), ...c.slice(i + 1, i + 4)].map((q) => q.y);
    if (nb.length < 2) return;
    if ((median(nb) ?? 0) <= 0) return; // a zero baseline makes every non-zero value a "spike"
    const m = median(nb)!, d = mad(nb)!;
    if (Math.abs(p.y - m) > 4 * Math.max(1.48 * d, 0.25 * m)) out.push({ label: p.label, index: p.x, value: p.y, median: m, direction: p.y > m ? "up" : "down" });
  });
  return out;
}
/** Nearest annotation within 2 periods (28 days) of a period start. */
export function nearestAnnotation(start: string, annotations: { date: string; label: string }[]) {
  const t = Date.parse(start), near = annotations.map((a) => ({ a, d: Math.abs(Date.parse(a.date) - t) })).filter((x) => x.d <= 28 * 864e5).sort((x, y) => x.d - y.d)[0];
  return near?.a ?? null;
}

// ---------- positioning per period ----------
export type TaggedPost = { urn: string; published_at: string; topic: string | null; pillar_key: string | null; concept: string | null; named_person: boolean | null };
export const isAutomationBand = (c: string | null) => !!c && /automation[ -]band|automation-rate/i.test(c);
export const isPrediction = (c: string | null) => !!c && /prediction/i.test(c);
export function positioning(posts: TaggedPost[], start: string, end: string) {
  const inP = posts.filter((p) => { const d = viennaDay(p.published_at); return d >= start && d <= end; });
  const tagged = inP.filter((p) => p.topic != null);
  const weeks = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / (7 * 864e5) + 1 / 7;
  return {
    posts: inP.length, untagged: inP.length - tagged.length, tagged: tagged.length,
    coreShare: tagged.length ? (tagged.filter((p) => p.topic === "core").length / tagged.length) * 100 : null,
    automationPerWeek: tagged.length || inP.length ? tagged.filter((p) => isAutomationBand(p.concept)).length / weeks : null,
    personal: tagged.filter((p) => p.topic === "personal").length,
    personalShare: tagged.length ? tagged.filter((p) => p.topic === "personal").length / tagged.length : null,
    prediction: tagged.filter((p) => isPrediction(p.concept)).length,
    namedPerson: tagged.filter((p) => p.named_person === true).length,
  };
}
export const viennaDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date(iso));

// ---------- findings ----------
export type Confidence = "high" | "medium" | "low";
export type Finding = { side: "strong" | "lacking"; rule: string; metric: string; value: string; comparedWith: string; gap: string; why: string; confidence: Confidence; confirm: string; score: number; note?: string };
export const confidenceFor = (periods: number, opts: { direct?: boolean; selfReported?: boolean; lowerBound?: boolean } = {}): Confidence =>
  opts.selfReported || opts.lowerBound ? "low" : opts.direct || periods >= 6 ? "high" : periods >= 3 ? "medium" : "low";
export const pickVerdict = (f: Finding[]) => ({
  strong: f.filter((x) => x.side === "strong").sort((a, b) => b.score - a.score).slice(0, 5),
  lacking: f.filter((x) => x.side === "lacking").sort((a, b) => b.score - a.score).slice(0, 5),
});
