# Step 8: Benchmark snapshots from Google Drive

## Connection
- Google Drive is not connected yet. I will show a connect card once; if you skip it, everything else is built and Data & runs shows "Drive not connected" with the steps to connect (sign in as viktoria@izdebska.com, read-only).
- The tool only lists and downloads files. It never creates, changes, moves or deletes anything in Drive.

## Collector "benchmark-drive"
1. Lists files directly in folder 1XUNWTgB03ZMjhQeoZxKOYXMDBq_4Dwey (not trashed, not subfolders) and keeps only names exactly matching `benchmark_snapshot_YYYY-MM-DD.csv`; everything else is counted as ignored.
2. For each file: download, compute sha256. If a raw import with the same Drive file id and sha256 exists, skip it (already seen). A changed file (new sha256) is treated as new.
3. Store the file unchanged in the raw-imports bucket; add a raw_imports row with new source `benchmark_drive` ("Benchmark snapshot from Drive"), received_from `drive`, Drive file id and name.
4. Same checks and write path as "Upload benchmark snapshot", tightened for both: exact header, known profile keys, scores 0-2, framework_total = sum of the ten scores, observed_on a real date not in the future, empty cells null.
5. Rows whose key + observed_on already exist are skipped. All existing -> raw import marked "already imported", nothing written. Any failing row -> nothing written, raw import rejected with the reason, shown as needs attention.
6. Every run logged in agent_runs / run_steps (trigger schedule or manual, workflow_version benchmark-drive-1).
- Runs in the daily 07:00 Vienna job right after calendar sync, and from a "Check Drive now" button.

## Screens
- Tab 2, Data & runs: new "Benchmarks" panel - last folder check, files found / imported / skipped / rejected (with reasons), latest snapshot date, connect instructions when not connected, "Check Drive now".
- Tab 2 status bar: amber note "Benchmarks are N days old" when the newest observed_on is more than 40 days old.
- Diagnosis tab: "Benchmarks as of <latest observed_on>" above the benchmark section.

## Tests (leave no rows)
- Pure tests: score 3 rejected with reason; wrong header rejected; wrong total rejected; future date rejected; file-name filter ignores other names.
- Rolled-back database transaction: all-existing file writes nothing ("already imported"); one new + eleven existing writes exactly one row.
- End-to-end once connected: "Check Drive now" on benchmark_snapshot_2026-10-12.csv reports "already imported", benchmark row count unchanged.

## Technical details
- Additions only: allow `benchmark_drive` source, `drive` received_from, `already imported` status, nullable `drive_file_id` / `drive_file_name` columns on raw_imports; skip-existing logic added inside commit_config_import (insert ... on conflict do nothing on profile_key+observed_on, returns inserted count).
- Drive gateway: `GET /files?q='<folder>' in parents and trashed=false` and `GET /files/{id}?alt=media`, server-side only.
- integration_status row `google_drive` records last check and counts.
- No measurement rows are updated or deleted; triggers untouched.
