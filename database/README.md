# Standing rule (every step)

Never update or delete rows in measurement tables, never disable, drop or weaken the immutability triggers, and never use session_replication_role or similar to get around them. If a run ever leaves partial data behind, stop and ask Viktoria instead of cleaning up.

# Step 2 foundation

Lovable Cloud is enabled; the dashboard appearance and `src/data/strategy.ts` remain unchanged.

## Created tables (27)

- Access: `allowed_users`.
- Strategy: `strategy_versions`, `positioning`, `content_pillars`, `ctas`, `kpi_definitions`, `kpi_targets`, `annotations`.
- Measurement: `sources`, `source_capabilities`, `periods`, `metric_catalog`, `snapshots`, `account_metrics`, `follower_daily`, `posts`, `post_observations`, `audience_observations`, `audience_checks`, `leads`, `kpi_values`, `period_summaries`.
- System: `raw_imports`, `agent_runs`, `run_steps`, `data_quality_issues`, `schedule_state`, `integration_status`.
- Reserved Tab 3: `content_items`.

Every table has `created_at`. Tables explicitly specified with natural primary keys retain those keys; all others use UUID primary keys.

## Triggers and policies

- `immutable_history`: ALWAYS-enabled UPDATE/DELETE rejection on all 13 insert-only measurement tables and six versioned strategy tables (19 triggers).
- `protect_posts`: ALWAYS-enabled DELETE rejection and tag-only UPDATE protection on `posts`.
- `allowed_read`: one SELECT policy on each of the 27 tables, restricted to authenticated allowlisted users.
- `allowed_insert`: eight INSERT policies on `strategy_versions`, `positioning`, `content_pillars`, `ctas`, `kpi_definitions`, `kpi_targets`, `annotations`, `content_items`.
- No user write policies on measurement or system tables; no user UPDATE/DELETE policies anywhere.

## Functions and view

- `is_allowed_user()`: authenticated allowlist check.
- `reject_history_mutation()`: immutable-history trigger function.
- `protect_post_fields()`: post-tag protection trigger function.
- `commit_snapshot(payload jsonb)`: service-role-only atomic snapshot/child-row insertion, new-post upsert and run finalization.
- `test_foundation_invariants()`: service-role-only regression tests; all temporary rows roll back.
- `current_snapshots`: security-invoker view preferring the newest complete snapshot, otherwise newest partial, per period/source.

The successful-run input-key partial unique index and schedule singleton index are installed.

## Seeds and verification

Seeded the allowed email, four sources, 25 periods, 14 metrics, nine KPI definitions, strategy version 1 and its content/baseline labels, the relaunch annotation and the Vienna measurement due time. No measurement rows or fake values were seeded. The newsletter KPI retains `not yet measured` rather than being misclassified.

Seven automated tests passed. Live database tests confirmed that an UPDATE on `account_metrics` is rejected, strategy edits cannot update history, only post tags can change, post deletes fail, null remains null, complete snapshots are preferred, and a failed commit rolls back every write.

Browser checks passed for email/password login with a temporary allowlisted identity, dashboard reload, tab navigation, sign-out and Back protection. Nonallowlisted sign-in and signup show exactly “This tool is private.” The temporary identity and allowlist entry were removed.

To create the real account, choose “Create an account” using the allowed email, follow its confirmation invitation, then set a password. Passwords are set only by the authenticated invitation recipient, never by an unauthenticated invitation requester.
## Step 5 measurement views

Security-invoker views over `current_snapshots`: `v_period_followers`, `v_monthly_account`, `v_post_metrics`, `v_audience_latest`, `v_leads_by_period`. Seeded 54 `source_capabilities` rows (verified_on empty) and four catalog entries they reference: `followers_gained`, `profile_views`, `newsletter_subscribers`, `leads`.
## Step 7 diagnosis
Tables: benchmark_profiles (editable), benchmark_observations and plan_targets (insert-only, immutable trigger), framework_criteria, reference_benchmarks, meeting_candidates (system; decided rows locked). leads.calendar_event_id, person types founder/rollup_operator, sources google_calendar and benchmark_csv. Views v_current_leads; v_spot_checks gained snapshot_period_label. Daily calendar job at 05:00/06:00 UTC runs only at 07:00 Vienna.
