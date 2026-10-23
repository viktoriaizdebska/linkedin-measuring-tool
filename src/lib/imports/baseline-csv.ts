// Pure parsing and validation of the 8 April–8 October 2026 baseline CSV files.
export const BASELINE_START = '2026-04-08';
export const BASELINE_END = '2026-10-08';
export const BASELINE_FILES = {
  baseline_posts: 61,
  baseline_post_observations: 61,
  baseline_follower_daily: 184,
  baseline_leads: 47,
  baseline_audience: 93,
  baseline_account_monthly: 64,
  baseline_audience_check: 1,
} as const;
export type BaselineFile = keyof typeof BASELINE_FILES;
export const FOLLOWER_SUM = 2486;

type Rec = Record<string, string | undefined>;

export function parseCsv(text: string): Rec[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => {
    if (r.length !== head.length) throw new Error(`Row has ${r.length} columns, expected ${head.length}`);
    return Object.fromEntries(head.map((h, i) => [h, r[i]]));
  });
}

const blank = (v: string | undefined) => v === undefined || v.trim() === '';
const str = (v: string | undefined) => (blank(v) ? null : v!);
function int(v: string | undefined, where: string): number | null {
  if (blank(v)) return null;
  if (!/^\d+$/.test(v!.trim())) throw new Error(`${where}: "${v}" is not a non-negative whole number`);
  return Number(v);
}
function num(v: string | undefined, where: string): number {
  if (blank(v) || !/^\d+(\.\d+)?$/.test(v!.trim())) throw new Error(`${where}: "${v}" is not a non-negative number`);
  return Number(v);
}
function day(v: string | undefined, where: string): string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${where}: invalid date "${v}"`);
  if (v < BASELINE_START || v > BASELINE_END) throw new Error(`${where}: ${v} is outside 8 April–8 October 2026`);
  return v;
}
const viennaDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
function stamp(v: string | undefined, where: string): string {
  if (!v || Number.isNaN(Date.parse(v))) throw new Error(`${where}: invalid timestamp "${v}"`);
  day(viennaDate(v), where);
  return v;
}

export function validateBaseline(texts: Record<BaselineFile, string>, metricKeys: Set<string>) {
  const raw = {} as Record<BaselineFile, Rec[]>;
  for (const [f, n] of Object.entries(BASELINE_FILES) as [BaselineFile, number][]) {
    raw[f] = parseCsv(texts[f]);
    if (raw[f].length !== n) throw new Error(`${f}: expected ${n} rows, found ${raw[f].length}`);
  }
  const posts = raw.baseline_posts.map((r, i) => {
    const w = `baseline_posts row ${i + 2}`;
    if (!/^urn:li:/.test(r['urn'] ?? '')) throw new Error(`${w}: invalid urn`);
    if (r['named_person'] !== 'True' && r['named_person'] !== 'False') throw new Error(`${w}: named_person must be True or False`);
    return {
      urn: r['urn'], published_at: stamp(r['published_at'], w), url: str(r['url']), format: str(r['format']),
      hook: str(r['hook']), length_chars: int(r['length_chars'], w), visual: str(r['visual']),
      link_position: str(r['link_position']), pillar_key: str(r['pillar_key']), topic: str(r['topic']),
      named_person: r['named_person'] === 'True', concept: str(r['concept']),
    };
  });
  const urns = new Set(posts.map((p) => p.urn));
  if (urns.size !== posts.length) throw new Error('baseline_posts: duplicate urn');
  const metrics = ['impressions', 'members_reached', 'reactions', 'comments', 'reposts', 'saves', 'sends', 'link_clicks', 'profile_views', 'followers_gained'] as const;
  const observations = raw.baseline_post_observations.map((r, i) => {
    const w = `baseline_post_observations row ${i + 2}`;
    if (!urns.has(r['post_urn']!)) throw new Error(`${w}: unknown post ${r['post_urn']}`);
    if (r['obs_window'] !== 'lifetime') throw new Error(`${w}: obs_window must be lifetime`);
    const o: Record<string, unknown> = { post_urn: r['post_urn'], observed_at: stamp(r['observed_at'], w), age_days: int(r['age_days'], w), obs_window: 'lifetime' };
    if (o['age_days'] === null) throw new Error(`${w}: age_days is required`);
    for (const m of metrics) o[m] = int(r[m], `${w} ${m}`);
    return o;
  });
  const followers = raw.baseline_follower_daily.map((r, i) => ({
    date: day(r['date'], `baseline_follower_daily row ${i + 2}`),
    new_followers: int(r['new_followers'], `baseline_follower_daily row ${i + 2}`),
  }));
  const dates = new Set(followers.map((f) => f.date));
  for (let d = new Date(`${BASELINE_START}T00:00:00Z`); d <= new Date(`${BASELINE_END}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    if (!dates.has(d.toISOString().slice(0, 10))) throw new Error(`baseline_follower_daily: missing ${d.toISOString().slice(0, 10)}`);
  }
  if (followers.some((f) => f.new_followers === null)) throw new Error('baseline_follower_daily: new_followers is required');
  const sum = followers.reduce((a, f) => a + (f.new_followers ?? 0), 0);
  if (sum !== FOLLOWER_SUM) throw new Error(`baseline_follower_daily: new_followers sum ${sum}, expected ${FOLLOWER_SUM}`);
  const leads = raw.baseline_leads.map((r, i) => {
    const w = `baseline_leads row ${i + 2}`;
    const urn = str(r['post_urn']);
    if (urn && !urns.has(urn)) throw new Error(`${w}: unknown post ${urn}`);
    return { date: day(r['date'], w), kind: r['kind'], person_type: r['person_type'], attribution: r['attribution'], post_urn: urn, note: str(r['note']) };
  });
  const audience = raw.baseline_audience.map((r, i) => ({ scope: r['scope'], dimension: r['dimension'], label: r['label'], share_pct: num(r['share_pct'], `baseline_audience row ${i + 2}`) }));
  const account = raw.baseline_account_monthly.map((r, i) => {
    const w = `baseline_account_monthly row ${i + 2}`;
    if (!metricKeys.has(r['metric_key']!)) throw new Error(`${w}: unknown metric ${r['metric_key']}`);
    const window_start = day(r['window_start'], w), window_end = day(r['window_end'], w);
    if (window_end < window_start) throw new Error(`${w}: window ends before it starts`);
    return { metric_key: r['metric_key'], value: num(r['value'], w), window_start, window_end };
  });
  const checks = raw.baseline_audience_check.map((r, i) => {
    const w = `baseline_audience_check row ${i + 2}`;
    const c = { checked_on: day(r['checked_on'], w), sample_size: int(r['sample_size'], w), strict_count: int(r['strict_count'], w), broad_count: int(r['broad_count'], w), none_count: int(r['none_count'], w), method_version: str(r['method_version']) };
    if (Object.values(c).some((v) => v === null)) throw new Error(`${w}: missing value`);
    if (c.strict_count! + c.broad_count! + c.none_count! !== c.sample_size) throw new Error(`${w}: strict + broad + none must equal sample_size`);
    return c;
  });
  const recordsRead = Object.values(raw).reduce((a, r) => a + r.length, 0);
  return { posts, observations, followers, leads, audience, account, checks, followerSum: sum, recordsRead };
}
