# LinkedIn Measuring Tool

Viktoria Izdebska's private LinkedIn positioning and measurement workspace.

- **Stack:** TanStack Start (React 19), Tailwind, Postgres. Runs on Railway.
- **Run locally:** `bun install`, set `DATABASE_URL`, then `node scripts/migrate.mjs` and `bun run dev`.
- **Checks:** `bun run typecheck`, `bun run test`, `bun run build`.
- **Settings:** see `.env.example`. Rules for changes: see `CLAUDE.md`.

## Moving the data from Lovable (one time)
Open `/restore` on the deployed app, choose the export file (`lovable-data-2026-10-23.json`) and click **Load data**.
It only runs while the database is empty, loads everything in one transaction, and checks every table against
the export (row count and checksum) and every stored file against its fingerprint. If any check fails, nothing is saved.
Once data is in, `/restore` switches itself off.
