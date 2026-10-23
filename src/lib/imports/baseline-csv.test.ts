import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASELINE_FILES, parseCsv, validateBaseline, type BaselineFile } from './baseline-csv';

const dir = '/mnt/user-uploads';
const has = existsSync(`${dir}/baseline_posts.csv`);
const keys = new Set(['impressions', 'members_reached', 'reactions', 'comments', 'reposts', 'saves', 'sends', 'link_clicks', 'new_followers', 'total_followers']);
const load = () => Object.fromEntries(Object.keys(BASELINE_FILES).map((f) => [f, readFileSync(`${dir}/${f}.csv`, 'utf8')])) as Record<BaselineFile, string>;

describe('baseline CSV', () => {
  it('parses quoted fields', () => {
    expect(parseCsv('a,b\n"x, y","""q"""\n')).toEqual([{ a: 'x, y', b: '"q"' }]);
  });
  it.skipIf(!has)('validates the uploaded files: follower sum 2486, empty cells null', () => {
    const d = validateBaseline(load(), keys);
    expect(d.followerSum).toBe(2486);
    expect(d.followers).toHaveLength(184);
    expect(d.observations[1]!['link_clicks']).toBeNull();
  });
  it.skipIf(!has)('rejects a negative number', () => {
    const t = load();
    t.baseline_follower_daily = t.baseline_follower_daily.replace('2026-04-09,7', '2026-04-09,-7');
    expect(() => validateBaseline(t, keys)).toThrow(/non-negative/);
  });
  it.skipIf(!has)('rejects a date outside the window', () => {
    const t = load();
    t.baseline_leads = t.baseline_leads.replace('2026-05-18,', '2026-10-09,');
    expect(() => validateBaseline(t, keys)).toThrow(/outside/);
  });
});
