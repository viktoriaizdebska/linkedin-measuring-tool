<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application rules
- Read Positioning & CTA exclusively through authenticated database reads; `src/data/strategy.ts` contains types only so static content cannot mask failed reads.
- Save strategy edits through the security-invoker atomic version writer with a serialized highest-version check; copy baselines and metadata server-side to preserve immutable history.
- Never create strategy versions or annotations during automated checks; use read-only database assertions and edit/cancel UI verification because only the user may add history.
- Keep the three dashboard views as accessible client-side tabs at `/`; they are views of one private workspace, not separate public content pages.
- Use Lovable Cloud for private email/password accounts and database storage; measurement displays remain empty until real runs are connected.
- Disable direct Cloud signup and mediate account invitations and password login through a server function that checks allowed_users before authentication; this prevents public account creation and enforces the live allowlist.
- Use the pathless authenticated layout at `/` and a public `/auth` entry page; all dashboard data access is also allowlist-scoped by RLS.
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
