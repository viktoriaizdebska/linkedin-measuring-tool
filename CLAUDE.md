# LinkedIn Measuring Tool: rules for Claude

## Setup (since 24 Oct 2026)
- Runs on Railway: one app service (Dockerfile, Node server from `bun run build`) and Postgres. No Lovable, no Supabase.
- No login. Optional site-wide password via `APP_PASSWORD` (src/server.ts). `/healthz` and `/api/public/jobs/*` bypass it; the job endpoint checks `CRON_SECRET`.
- Database access goes through `src/integrations/db/client.server.ts`, a small Supabase-compatible query API over Postgres. The app connects as a login user whose default role is `service_role` (db/prelude.sql), so the database functions' service-role checks still apply.
- Schema changes: add a new numbered file in `drizzle/migrations/`. `scripts/migrate.mjs` applies pending files on every start. Additive changes only.
- Not yet moved off Lovable: AI suggestions/summaries (`ai-json.server.ts`, `linkedin/ai-summary.server.ts`) and Google Calendar/Drive (`diagnosis-io.server.ts`, `benchmark-drive.server.ts`). They stay off until replaced (Claude API, Google service account).

## Data rules (never break these)
- Never update or delete measurement rows. Never weaken, disable or drop the immutability triggers.
- No test data in the production database. Tests run locally, on staging, or in rolled-back transactions.
- Secrets live only in Railway and GitHub settings, never in the repo.
- LinkedIn is read-only for any automation.

## Application rules (from the Lovable build)

- Read Positioning & CTA exclusively through authenticated database reads; `src/data/strategy.ts` contains types only so static content cannot mask failed reads.
- Save strategy edits through the security-invoker atomic version writer with a serialized highest-version check; copy baselines and metadata server-side to preserve immutable history.
- Never create strategy versions or annotations during automated checks; use read-only database assertions and edit/cancel UI verification because only the user may add history.
- Keep the three dashboard views as accessible client-side tabs at `/`; they are views of one private workspace, not separate public content pages.
- Preserve immutable strategy and measurement history with always-enabled triggers; only the service role can call the atomic snapshot writer.
- Preserve explicit text primary keys on catalog tables and posts as requested; all other tables use UUID primary keys.
- Include not yet measured in KPI kind constraints to preserve the newsletter definition from the strategy source.
- Define visual styles and theme colors in `src/styles.css` and use the shared Button for interactive controls; this keeps both themes consistent.
- Commit all snapshots of one import run through commit_snapshots in a single call; partial multi-snapshot writes cannot then be left behind in immutable history.
- Never update/delete measurement rows or weaken immutability triggers; if a run leaves partial data, stop and ask the user (see database/README.md standing rule).
- Compute every Diagnosis number with pure rules in `src/lib/diagnosis.ts`/`diagnosis-build.ts` over database rows; AI only suggests meeting types and post tags that the user confirms, so no shown number comes from a model.
- Store calendar meetings as system rows in meeting_candidates and write confirmed ones as leads only through logEntry → measure-period (source google_calendar); decided candidates are locked by a trigger so nothing changes them automatically.
- Import configuration and benchmark CSVs through raw_imports and the service-role commit_config_import function; benchmark_observations and plan_targets are insert-only.
- Import Drive benchmark snapshots through `benchmark-drive.server.ts` using the same `commitConfigText` checks/write path as manual uploads; Drive access is list/download only, so imports can never change Drive.
- Run the daily measure-due step through pure clock-driven rules in `schedule-rules.ts` and the executor `schedule.server.ts`, which only calls measurePeriod and writes system rows; emails are recorded once per dedupe key in notification_log and go only to the owner.
