# Step 9: Scheduling and monitoring

## Daily job (07:00 Vienna), in order
1. calendar-sync (unchanged)
2. benchmark-drive (unchanged)
3. measure-due (new)

## measure-due
- Finds every closed biweekly period (end_date before today in Vienna) with no succeeded run, oldest first. History, baseline and window periods are skipped. A missed day catches up the next morning.
- Takes the schedule_state lock first; a lock older than 30 minutes is taken over; a second concurrent run exits.
- Per period:
  - **Export present** (a complete linkedin_export snapshot covers the whole period): runs measure-period exactly like "Run now", trigger schedule.
  - **Export missing, before the Friday deadline**: keeps one waiting_for_data run row for the period, refreshed daily, naming the source and the export: "LinkedIn → Analytics → Content → Individuell <start>–<end> → Export, then upload it here".
  - **Friday after the period's Tuesday, 07:00, still missing**: runs measure-period with what exists (manual leads, confirmed meetings, latest benchmarks), KPI values only where data exists, no summary; run marked partial and needs_attention. A later upload measures the period completely as a new run; the partial run stays.
  - **Failure**: retried on the next mornings, up to 4 days, then left failed with needs_attention. A rejected file goes straight to needs_attention, never retried.
- Updates schedule_state: last_measured_period_id and next_due (next period's Tuesday, 07:00 Vienna).
- Every decision is made by one pure function that takes a clock, so tests use a clock override.

## Reminders
- **Banner on every tab** while a period waits: amber "P1 (12–25 Oct) is waiting for your LinkedIn export", the exact export instruction, and an upload button.
- **Emails** (only ever to viktoria@izdebska.com, no numbers about other people):
  - reminder on the Tuesday and Thursday while waiting
  - one email when a period is measured (summary headline + link)
  - one email when a run ends failed or needs_attention
- **Settings panel in Data & runs**: "Email reminders" and "Email summaries" switches, both off.
- Sending email needs a sender domain you own (for example izdebska.com), and none is set up yet. I'll build the decision logic and the switches now and log what would have been sent. After you set up the domain, I'll connect the actual sending.

## Monitoring
- Status pill and status bar: age of the last successful run, amber after 16 days, red after 21.
- **Schedule panel in Data & runs**:
  - next due period and its Tuesday
  - every P period with status: upcoming, open, waiting for data since, measured, partial or failed
  - next reminder and Friday deadline
  - last result of each daily step
  - the linkedin_api integration row, with warnings 60 days before a sunset date and 14 days before a token expiry
- integration_status: add or refresh linkedin_api (status "not applied", no token, no sunset date).
- Failed-job alerts: Lovable has no built-in email alert for failed scheduled jobs that I can turn on. The failure email above and the red status cover this. Job history stays visible under Cloud → Jobs.

## Capability matrix
- New insert-only linkedin_export rows, verified_on 2026-10-12, as listed in the request. Older rows stay. The table shows the latest row per source and metric.

## Tests (clock override, nothing kept)
- Pure decision tests:
  - 27 Oct: P1 waiting, banner shown, reminder due
  - 29 Oct: second reminder
  - 30 Oct: partial run, no summary
  - 31 Oct with export: complete run, partial run kept
  - 4 failing mornings: 3 retries, then failed
  - rejected file: needs_attention, no retry
  - missed day: two periods processed, oldest first
- Rolled-back database test: two simultaneous runs, the second exits.
- P1 is not measured. No real measurement runs.

## Technical details
- Additions only:
  - new nullable columns on agent_runs: `next_retry_at`, `retry_count`, `due_kind`
  - new table `notification_log` (kind, period_id, would_send, sent_at), used to keep reminders and emails to once each
  - new table `app_settings` (`email_reminders`, `email_summaries` booleans, default false)
- `src/lib/schedule-rules.ts`: pure planner `planDue(periods, runs, snapshots, now)`.
- `src/lib/schedule.server.ts`: executor that calls the existing `measurePeriod` with `trigger: "schedule"` and an `allowPartial` / `skipSummary` option for the Friday deadline.
- The daily route `/api/public/jobs/calendar-sync` calls measure-due after the two collectors, and records each step's result.
- waiting_for_data rows are updated in place, which is allowed because agent_runs is a system table, not a measurement table.
