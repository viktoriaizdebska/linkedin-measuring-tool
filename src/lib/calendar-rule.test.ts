import { describe, expect, it } from 'vitest';
import { meetingCandidates, type CalEvent } from './calendar-rule';
import { parseConfig } from './imports/config-csv';

const t = (h: string) => ({ dateTime: `2026-10-09T${h}:00+02:00` });
const me = { email: 'viktoria@izdebska.com', self: true };
const SAMPLES: CalEvent[] = [
  { id: 'slot', summary: 'Room for luck', start: t('14:00'), end: t('16:00'), organizer: me },
  { id: 'own-block', summary: 'Let Evelyn Run', start: t('14:30'), end: t('15:00'), organizer: me },
  { id: 'intro', summary: 'Intro | Viktoria x Markus (Wolf)', start: t('14:00'), end: t('14:30'), organizer: me, attendees: [{ ...me, responseStatus: 'accepted' }, { email: 'markus@wolf.vc', responseStatus: 'accepted' }] },
  { id: 'after-slot', summary: 'Call', start: t('16:30'), end: t('17:00'), organizer: me, attendees: [{ email: 'x@fund.com' }] },
  { id: 'declined', summary: 'Pitch', start: t('15:00'), end: t('15:30'), organizer: { email: 'y@pe.com' }, attendees: [{ ...me, responseStatus: 'declined' }, { email: 'y@pe.com' }] },
  { id: 'all-day', summary: 'Offsite', start: { date: '2026-10-09' }, end: { date: '2026-10-10' }, attendees: [{ email: 'z@co.com' }] },
  { id: 'only-me', summary: 'Sync', start: t('15:30'), end: t('16:00'), organizer: me, attendees: [{ ...me }, { email: 'viktoria.izdebska@gmail.com' }] },
];

describe('calendar meeting rule', () => {
  it('only the in-slot event with an outside guest becomes a candidate', () => {
    const c = meetingCandidates(SAMPLES, new Date('2026-10-12T10:00:00Z'));
    expect(c.map((x) => x.event_id)).toEqual(['intro']);
    expect(c[0]!.domains).toEqual(['wolf.vc']);
  });
  it('a meeting that has not ended is not a candidate', () => {
    expect(meetingCandidates(SAMPLES, new Date('2026-10-09T12:10:00Z'))).toEqual([]);
  });
});

describe('benchmark upload', () => {
  it('rejects a score of 3', () => {
    const head = 'key,observed_on,followers,posts_per_week,cadence_text,median_reactions,median_comments,reactions_per_follower_pct,headline_stake,banner_featured,conversion_device,one_story,topic_focus,owned_concept,substance_format,cadence,conversation_audience,authority_beyond,framework_total,method';
    const r = parseConfig('benchmark_observations', `${head}\nviktoria,2026-10-20,8700,3,,,,,3,2,1,2,1,1,1,2,1,1,15,test`, new Set(['viktoria']));
    expect(r.errors.join(' ')).toMatch(/headline_stake is 3/);
  });
  it('rejects an unknown profile key', () => {
    const head = 'key,observed_on,followers,posts_per_week,cadence_text,median_reactions,median_comments,reactions_per_follower_pct,headline_stake,banner_featured,conversion_device,one_story,topic_focus,owned_concept,substance_format,cadence,conversation_audience,authority_beyond,framework_total,method';
    expect(parseConfig('benchmark_observations', `${head}\nnobody,2026-10-20,1,,,,,,,,,,,,,,,,,x`, new Set(['viktoria'])).errors.join(' ')).toMatch(/unknown profile key/);
  });
});
