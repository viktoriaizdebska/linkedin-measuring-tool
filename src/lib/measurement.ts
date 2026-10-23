// Pure KPI rules for Tab 2. Every input comes from the database views; nothing here invents values.
export type PeriodRow = { id: string; label: string; kind: string; start_date: string; end_date: string };
export type FollowerRow = { label: string; kind: string; period_id: string; source_key: string; start_date: string; end_date: string; new_followers: number; days_covered: number; days_in_period: number; is_complete: boolean };
export type LeadRow = { label: string; kind: string; start_date: string; leads: number; meetings: number; fully_covered: boolean };
export type PostRow = {
  urn: string; published_at: string; url: string | null; format: string | null; topic: string | null; pillar_key: string | null; hook: string | null;
  age_days: number | null; impressions: number | null; followers_gained: number | null; profile_views: number | null; saves: number | null; reposts: number | null;
  followers_per_1000: number | null; saves_reposts_per_1000: number | null;
};
export type AudienceRow = { scope: string; dimension: string; label: string; share_pct: number | null };
export type CheckRow = { checked_on: string; sample_size: number; strict_count: number; broad_count: number; none_count: number; method_version: string };
export type CompareMode = 'previous' | '28d' | '12w' | 'baseline';

export const TARGET_INDUSTRIES = ['Venture capital and private equity principals', 'Financial services', 'Banking'];
export const SENIOR_LEVELS = ['Owner', 'Partner', 'CXO', 'VP', 'Director'];
export const isBaselineLabel = (label: string) => /^B-\d+$/.test(label) || label === 'BASE';

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export const medianFollowersPer1000 = (posts: PostRow[]) =>
  median(posts.flatMap((p) => (p.followers_per_1000 == null ? [] : [Number(p.followers_per_1000)])));

/** Sum of saves + reposts divided by sum of impressions × 1,000, over posts that report all three. */
export function savesRepostsPer1000(posts: PostRow[]): number | null {
  const ok = posts.filter((p) => p.impressions != null && p.impressions > 0 && p.saves != null && p.reposts != null);
  const imp = ok.reduce((a, p) => a + p.impressions!, 0);
  return imp ? (ok.reduce((a, p) => a + p.saves! + p.reposts!, 0) / imp) * 1000 : null;
}
/** Sum of share_pct for the given labels; null when the scope/dimension has no rows (not yet measured). */
export function shareOf(rows: AudienceRow[], scope: string, dimension: string, labels: string[]): number | null {
  const r = rows.filter((x) => x.scope === scope && x.dimension === dimension);
  if (!r.length) return null;
  return r.filter((x) => labels.includes(x.label)).reduce((a, x) => a + Number(x.share_pct), 0);
}
export const spotCheck = (c: CheckRow) => ({ strict: c.strict_count / c.sample_size, strictOrBroad: (c.strict_count + c.broad_count) / c.sample_size });

/** Post funnel from one source: only posts that report impressions, profile views and followers gained. */
export function postFunnel(posts: PostRow[]) {
  const ok = posts.filter((p) => p.impressions != null && p.profile_views != null && p.followers_gained != null);
  const impressions = ok.reduce((a, p) => a + p.impressions!, 0);
  const profileViews = ok.reduce((a, p) => a + p.profile_views!, 0);
  const followers = ok.reduce((a, p) => a + p.followers_gained!, 0);
  return { posts: ok.length, impressions, profileViews, followers, viewRate: impressions ? profileViews / impressions : null, followRate: profileViews ? followers / profileViews : null };
}

export type Series = { label: string; value: number; complete: boolean; kind?: string }[];
export type Comparison = { available: true; reference: number; delta: number; label: string } | { available: false; reason: string };
const MODE_LABEL: Record<CompareMode, string> = { previous: 'previous period', '28d': 'previous 28 days', '12w': 'previous 12 weeks', baseline: 'baseline average' };

/** Compares a 14-day count with the per-14-day average of the comparison window; only complete periods are used. */
export function compare(series: Series, selected: string, mode: CompareMode): Comparison {
  const i = series.findIndex((s) => s.label === selected);
  const cur = series[i];
  if (!cur) return { available: false, reason: `No data for ${selected} yet.` };
  if (!cur.complete) return { available: false, reason: `${selected} is partial, so a comparison would mislead.` };
  let ref: Series;
  if (mode === 'baseline') {
    if (cur.kind === 'baseline') return { available: false, reason: `${selected} is part of the baseline.` };
    ref = series.filter((s) => s.kind === 'baseline');
    if (ref.length < 13) return { available: false, reason: 'The baseline (B-13 to B-1) is not complete for this measure.' };
  } else {
    const n = mode === 'previous' ? 1 : mode === '28d' ? 2 : 6;
    ref = series.slice(Math.max(0, i - n), i);
    if (ref.length < n) return { available: false, reason: `Needs ${n} earlier period${n > 1 ? 's' : ''} with data; ${ref.length} available.` };
  }
  if (!ref.length || ref.some((r) => !r.complete)) return { available: false, reason: 'The comparison window has no complete data.' };
  const reference = ref.reduce((a, r) => a + r.value, 0) / ref.length;
  return { available: true, reference, delta: cur.value - reference, label: MODE_LABEL[mode] };
}
export const followerSeries = (rows: FollowerRow[]): Series =>
  rows.filter((r) => r.label !== 'BASE' && r.kind !== 'window').sort((a, b) => a.start_date.localeCompare(b.start_date)).map((r) => ({ label: r.label, value: r.new_followers, complete: r.is_complete, kind: r.kind }));
export const leadSeries = (rows: LeadRow[]): Series =>
  rows.filter((r) => r.label !== 'BASE' && r.kind !== 'window').sort((a, b) => a.start_date.localeCompare(b.start_date)).map((r) => ({ label: r.label, value: r.leads, complete: r.fully_covered, kind: r.kind }));
/** 14-day impressions: the export's discovery total when it matches the period, else the sum of a complete set of daily values. */
export function impressionSeries(rows: { label: string; kind: string; start_date: string; range_impressions: number | null; daily_impressions: number | null; daily_complete: boolean | null }[]): Series {
  return rows.filter((r) => r.label !== 'BASE' && r.kind !== 'window').sort((a, b) => a.start_date.localeCompare(b.start_date)).flatMap((r) => {
    const v = r.range_impressions ?? (r.daily_complete ? r.daily_impressions : null);
    return v == null ? [] : [{ label: r.label, value: Number(v), complete: true, kind: r.kind }];
  });
}
/** Share for a label set; atLeast when a label is absent from LinkedIn's top list or below 1%. */
export function shareAtLeast(rows: AudienceRow[], dimension: string, labels: string[]): { value: number; atLeast: boolean } | null {
  const r = rows.filter((x) => x.dimension === dimension);
  if (!r.length) return null;
  const present = r.filter((x) => labels.includes(x.label));
  return { value: present.reduce((a, x) => a + Number(x.share_pct ?? 0), 0), atLeast: present.length < labels.length || present.some((x) => x.share_pct == null) };
}

/** Strongest/weakest posts by followers per 1,000 impressions among posts with at least minImpressions. */
export function rankPosts(posts: PostRow[], minImpressions = 2000, n = 3) {
  const eligible = posts.filter((p) => (p.impressions ?? 0) >= minImpressions && p.followers_per_1000 != null)
    .sort((a, b) => Number(b.followers_per_1000) - Number(a.followers_per_1000));
  return { strongest: eligible.slice(0, n), weakest: eligible.slice(-n).reverse() };
}
