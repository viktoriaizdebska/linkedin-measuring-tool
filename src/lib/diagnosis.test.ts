import { describe, expect, it } from 'vitest';
import { breaks, positioning, spikes, theilSen, type Pt } from './diagnosis';

const LABELS = Array.from({ length: 26 }, (_, i) => `B-${26 - i}`);
const series = (vals: number[]): Pt[] => vals.map((value, i) => ({ label: LABELS[i]!, value, complete: true, start: '', end: '' }));
// New followers and impressions per 14 days, B-26…B-1, as imported from the LinkedIn exports.
const FOLLOWERS = [238, 195, 122, 117, 78, 56, 61, 195, 53, 265, 98, 59, 62, 423, 117, 204, 394, 218, 223, 146, 152, 115, 116, 120, 97, 155];
const IMPRESSIONS = [21270, 9629, 3588, 715, 460, 262, 566, 1273, 594, 50807, 6857, 2233, 294, 17578, 12520, 25950, 54155, 47276, 35389, 30626, 23836, 17968, 27221, 25656, 20718, 22301];

describe('diagnosis rules', () => {
  it('Theil–Sen on 1..6 gives slope 1', () => { expect(theilSen([0, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6])!.slope).toBe(1); });
  it('follower breaks: up from B-13 (+155%), down from B-7 (146 vs 220)', () => {
    const b = breaks(series(FOLLOWERS));
    expect(b.map((x) => `${x.label} ${x.direction}`)).toEqual(['B-13 up', 'B-7 down']);
    expect(Math.round(b[0]!.pct)).toBe(155);
    expect(b[1]!.level).toBe(146); expect(b[1]!.before).toBe(220.5);
  });
  it('impression breaks: down from B-20, up from B-17 and B-13', () => {
    expect(breaks(series(IMPRESSIONS)).map((x) => `${x.label} ${x.direction}`)).toEqual(['B-20 down', 'B-17 up', 'B-13 up']);
  });
  it('follower spikes in B-19, B-17 and B-13', () => { expect(spikes(series(FOLLOWERS)).map((s) => s.label)).toEqual(['B-19', 'B-17', 'B-13']); });
  it('impression spikes in B-26, B-24 and B-17', () => { expect(spikes(series(IMPRESSIONS)).map((s) => s.label)).toEqual(['B-26', 'B-24', 'B-17']); });
  it('untagged posts count only as untagged', () => {
    const p = positioning([{ urn: 'a', published_at: '2026-10-13T10:00:00Z', topic: null, pillar_key: null, concept: null, named_person: null }, { urn: 'b', published_at: '2026-10-14T10:00:00Z', topic: 'core', pillar_key: 'buying', concept: 'automation band', named_person: false }], '2026-10-12', '2026-10-25');
    expect(p).toMatchObject({ untagged: 1, tagged: 1, coreShare: 100, personal: 0 });
    expect(p.automationPerWeek).toBe(0.5);
  });
});
