// Usage: bun scripts/import-baseline.ts <dir-with-csvs>   (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { BASELINE_FILES, type BaselineFile } from '../src/lib/imports/baseline-csv';
import { importBaseline } from '../src/lib/imports/baseline-import.server';

const dir = process.argv[2] ?? '/mnt/user-uploads';
const db = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!, { auth: { persistSession: false } });
const files = Object.fromEntries(Object.keys(BASELINE_FILES).map((f) => [f, new Uint8Array(readFileSync(`${dir}/${f}.csv`))])) as Record<BaselineFile, Uint8Array>;
importBaseline(db, files).then((r) => console.log(JSON.stringify(r)), (e) => { console.error('FAILED:', e.message); process.exit(1); });
