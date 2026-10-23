import { describe, expect, it } from 'vitest';
import { compare, median, postFunnel, savesRepostsPer1000, shareOf, spotCheck, TARGET_INDUSTRIES, SENIOR_LEVELS, shareAtLeast, type PostRow } from './measurement';

const post = (p: Partial<PostRow>): PostRow => ({ urn: 'u', published_at: '', url: null, format: null, topic: null, pillar_key: null, hook: null, age_days: 1, impressions: null, followers_gained: null, profile_views: null, saves: null, reposts: null, followers_per_1000: null, saves_reposts_per_1000: null, ...p });

describe('measurement rules', () => {
  it('median of even and odd lists', () => { expect(median([3, 1, 2])).toBe(2); expect(median([1, 2, 3, 4])).toBe(2.5); expect(median([])).toBeNull(); });
  it('saves + reposts rate is sum over sum, skipping posts with missing values', () => {
    expect(savesRepostsPer1000([post({ impressions: 1000, saves: 2, reposts: 1 }), post({ impressions: 3000, saves: 1, reposts: 0 }), post({ impressions: 5000, saves: null, reposts: 1 })])).toBe(1);
  });
  it('missing audience source is null, not zero', () => { expect(shareOf([], 'content_viewers', 'industry', TARGET_INDUSTRIES)).toBeNull(); });
  it('viewer shares sum the named labels only', () => {
    const rows = [['Financial services', 9], ['Banking', 2], ['Venture capital and private equity principals', 5], ['Software development', 10]].map(([label, share_pct]) => ({ scope: 'content_viewers', dimension: 'industry', label: label as string, share_pct: share_pct as number }));
    expect(shareOf(rows, 'content_viewers', 'industry', TARGET_INDUSTRIES)).toBe(16);
    expect(SENIOR_LEVELS).toEqual(['Owner', 'Partner', 'CXO', 'VP', 'Director']);
  });
  it('spot check ratios', () => { expect(spotCheck({ checked_on: '', sample_size: 252, strict_count: 44, broad_count: 120, none_count: 88, method_version: '' })).toEqual({ strict: 44 / 252, strictOrBroad: 164 / 252 }); });
  it('funnel uses only posts with all three steps', () => { expect(postFunnel([post({ impressions: 1000, profile_views: 10, followers_gained: 2 }), post({ impressions: 500 })]).impressions).toBe(1000); });
  it('comparisons refuse partial periods, missing history and baseline-vs-baseline', () => {
    const s = [{ label: 'B-3', value: 120, complete: true, kind: 'baseline' }, { label: 'B-2', value: 97, complete: true, kind: 'baseline' }, { label: 'B-1', value: 134, complete: false, kind: 'baseline' }];
    expect(compare(s, 'B-2', 'previous')).toMatchObject({ available: true, delta: -23 });
    expect(compare(s, 'B-1', 'previous').available).toBe(false);
    expect(compare(s, 'B-2', '12w').available).toBe(false);
    expect(compare(s, 'B-2', 'baseline').available).toBe(false);
    expect(compare(s, 'P1', 'previous').available).toBe(false);
  });
  it('baseline comparison uses only the 13 baseline periods, never history periods', () => {
    const base = Array.from({ length: 13 }, (_, i) => ({ label: `B-${13 - i}`, value: 100, complete: true, kind: 'baseline' }));
    const s = [{ label: 'B-14', value: 1000, complete: true, kind: 'history' }, ...base, { label: 'P1', value: 130, complete: true, kind: 'biweekly' }];
    expect(compare(s, 'P1', 'baseline')).toMatchObject({ available: true, reference: 100, delta: 30 });
    expect(compare(s.filter((x) => x.label !== 'B-5'), 'P1', 'baseline').available).toBe(false);
  });
  it('a label missing from the top list makes the share "at least"', () => {
    const rows = [{ scope: 'content_viewers', dimension: 'industry', label: 'Financial services', share_pct: 9 }, { scope: 'content_viewers', dimension: 'industry', label: 'Banking', share_pct: null }];
    expect(shareAtLeast(rows, 'industry', TARGET_INDUSTRIES)).toEqual({ value: 9, atLeast: true });
  });
});
