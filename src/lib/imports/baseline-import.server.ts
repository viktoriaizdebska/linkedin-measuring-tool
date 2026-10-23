// Server-only baseline import: raw files -> raw_imports -> agent_run -> commit_snapshot.
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BASELINE_END, BASELINE_FILES, BASELINE_START, validateBaseline, type BaselineFile } from './baseline-csv';

const SOURCE = 'baseline_2026_10_08';
const BUCKET = 'raw-imports';
const WORKFLOW = 'baseline-import-1';

export async function importBaseline(db: SupabaseClient, files: Record<BaselineFile, Uint8Array>) {
  const must = <T,>(r: { data: T; error: { message: string } | null }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data as NonNullable<T>; };
  const hashes = Object.fromEntries(Object.entries(files).map(([f, b]) => [f, createHash('sha256').update(b).digest('hex')])) as Record<BaselineFile, string>;
  const inputKey = `${SOURCE}:${createHash('sha256').update(Object.keys(BASELINE_FILES).map((f) => hashes[f as BaselineFile]).join(',')).digest('hex')}`;

  const done = must(await db.from('agent_runs').select('id,status,records_read,records_written').eq('input_key', inputKey).eq('status', 'succeeded').maybeSingle(), 'run lookup');
  if (done) return { skipped: true as const, run: done };

  // BASE period covering the whole analysis window (insert once).
  let base = must(await db.from('periods').select('id').eq('label', 'BASE').maybeSingle(), 'BASE lookup');
  if (!base) base = must(await db.from('periods').insert({ label: 'BASE', kind: 'baseline', start_date: BASELINE_START, end_date: BASELINE_END }).select('id').single(), 'BASE insert');

  const prior = must(await db.from('agent_runs').select('attempt').eq('input_key', inputKey).order('attempt', { ascending: false }).limit(1), 'attempt lookup');
  const run = must(await db.from('agent_runs').insert({ trigger: 'manual', input_key: inputKey, status: 'running', workflow_version: WORKFLOW, started_at: new Date().toISOString(), attempt: (prior[0]?.attempt ?? 0) + 1 }).select('id').single(), 'run insert');
  const step = async <T,>(name: string, fn: () => Promise<T>, details?: (r: T) => unknown): Promise<T> => {
    const started_at = new Date().toISOString();
    try {
      const r = await fn();
      must(await db.from('run_steps').insert({ run_id: run.id, step: name, status: 'succeeded', started_at, finished_at: new Date().toISOString(), details: details?.(r) ?? null }), 'step log');
      return r;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.from('run_steps').insert({ run_id: run.id, step: name, status: 'failed', started_at, finished_at: new Date().toISOString(), message });
      await db.from('agent_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error_count: 1, changes_summary: `${name} failed: ${message}` }).eq('id', run.id);
      throw e;
    }
  };

  const rawIds = await step('store_raw_files', async () => {
    const ids = {} as Record<BaselineFile, string>;
    for (const f of Object.keys(BASELINE_FILES) as BaselineFile[]) {
      const path = `${SOURCE}/${hashes[f]}/${f}.csv`;
      const up = await db.storage.from(BUCKET).upload(path, files[f], { contentType: 'text/csv', upsert: false });
      if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error(`upload ${f}: ${up.error.message}`);
      const existing = must(await db.from('raw_imports').select('id').eq('sha256', hashes[f]).maybeSingle(), 'raw lookup');
      ids[f] = existing?.id ?? must(await db.from('raw_imports').insert({ source_key: SOURCE, storage_path: `${BUCKET}/${path}`, sha256: hashes[f], received_from: 'manual upload', status: 'received', period_hint: 'BASE', payload: { filename: `${f}.csv`, bytes: files[f].byteLength } }).select('id').single(), 'raw insert').id;
    }
    return ids;
  }, (r) => ({ raw_import_ids: r }));

  const metricKeys = await step('load_catalog', async () => new Set(must(await db.from('metric_catalog').select('key'), 'catalog').map((m) => m.key)));
  const text = Object.fromEntries(Object.entries(files).map(([f, b]) => [f, new TextDecoder().decode(b)])) as Record<BaselineFile, string>;
  const data = await step('validate', async () => validateBaseline(text, metricKeys), (d) => ({ records_read: d.recordsRead, follower_sum: d.followerSum }));

  const periods = must(await db.from('periods').select('id,label,start_date,end_date').eq('kind', 'baseline').like('label', 'B-%').order('start_date'), 'periods');
  const snap = (period_id: string, completeness: 'complete' | 'partial', raw_import_id: string) => ({ period_id, source_key: SOURCE, run_id: run.id, raw_import_id, parser_version: 'baseline-csv-1', transform_version: '1', captured_at: '2026-10-08T15:00:00+02:00', completeness });
  const commit = (payload: Record<string, unknown>) => db.rpc('commit_snapshot', { payload } as never);

  const firstStart = periods[0]!.start_date;
  await step('commit_snapshots', async () => {
    const payloads: Record<string, unknown>[] = periods.map((p) => ({
      snapshot: snap(p.id, p.end_date > BASELINE_END ? 'partial' : 'complete', rawIds.baseline_follower_daily),
      follower_daily: data.followers.filter((f) => f.date >= p.start_date && f.date <= p.end_date),
    }));
    payloads.push({
      snapshot: snap(base!.id, 'complete', rawIds.baseline_account_monthly),
      account_metrics: data.account, posts: data.posts, post_observations: data.observations,
      audience_observations: data.audience, audience_checks: data.checks, leads: data.leads,
      follower_daily: data.followers.filter((f) => f.date < firstStart),
      final_status: 'succeeded', records_read: data.recordsRead, error_count: 0,
      changes_summary: `Baseline ${BASELINE_START}–${BASELINE_END} imported: ${periods.length + 1} snapshots`,
    });
    // One transaction: every snapshot is written, or none is.
    return must(await db.rpc('commit_snapshots', { payloads } as never), 'commit snapshots') as string[];
  }, (ids) => ({ snapshots: ids.length }));

  await step('mark_parsed', async () => must(await db.from('raw_imports').update({ status: 'parsed' }).in('id', Object.values(rawIds)), 'raw update'));
  return { skipped: false as const, run: must(await db.from('agent_runs').select('id,status,records_read,records_written').eq('id', run.id).single(), 'run read') };
}
