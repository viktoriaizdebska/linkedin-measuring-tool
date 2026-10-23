// Applies database changes before the app starts (run by `npm start` on Railway).
// 1. db/prelude.sql (idempotent Supabase stand-ins)
// 2. every drizzle/migrations/NNNN_*.sql not applied yet, in order, each in its own transaction
// A database restored from Lovable already has 0000-0011; they are recorded as applied, not re-run.
// Seeds an empty database only when SEED_ON_EMPTY=true (staging), never in production by default.
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
const root = process.cwd();

try {
  await sql`set role none`; // migrations run as the database owner (the login user), not as service_role
  await sql.unsafe(readFileSync(join(root, "db/prelude.sql"), "utf8"));
  await sql`set role none`;
  await sql`create table if not exists public._schema_migrations (name text primary key, applied_at timestamptz not null default now())`;

  const files = readdirSync(join(root, "drizzle/migrations"))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  const applied = new Set(
    (await sql`select name from public._schema_migrations`).map((r) => r.name),
  );
  const [{ restored }] = await sql`select to_regclass('public.periods') is not null as restored`;
  if (applied.size === 0 && restored) {
    // Schema came from a restore: record the Lovable-era migrations without running them again.
    for (const f of files.filter((f) => f < "0012")) {
      await sql`insert into public._schema_migrations (name) values (${f}) on conflict do nothing`;
      applied.add(f);
    }
    console.log("[migrate] restored database detected; recorded 0000-0011 as applied");
  }
  for (const f of files) {
    if (applied.has(f)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(root, "drizzle/migrations", f), "utf8"));
      await tx`insert into public._schema_migrations (name) values (${f})`;
    });
    console.log(`[migrate] applied ${f}`);
  }

  if (process.env.SEED_ON_EMPTY === "true") {
    const [{ n }] = await sql`select count(*)::int as n from public.periods`;
    if (n === 0) {
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(join(root, "database/foundation-seed.sql"), "utf8"));
      });
      console.log("[migrate] seeded the empty database (SEED_ON_EMPTY=true)");
    }
  }
  console.log("[migrate] done");
  await sql.end();
} catch (e) {
  console.error("[migrate] failed:", e?.message ?? e);
  await sql.end({ timeout: 1 });
  process.exit(1);
}
