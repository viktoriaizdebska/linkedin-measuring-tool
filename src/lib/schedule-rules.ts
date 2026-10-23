// Pure rules for the daily measure-due step. Every decision takes an explicit clock so tests can override the date.
export type SPeriod = { id: string; label: string; kind: string; start_date: string; end_date: string };
export type SRun = { id: string; period_id: string | null; status: string; due_kind: string | null; retryable: boolean | null; created_at: string };
export type PeriodStatus = "upcoming" | "open" | "waiting for data" | "measured" | "partial" | "failed" | "needs attention" | "due";
export type Action =
  | { type: "wait"; period: SPeriod; message: string }
  | { type: "measure"; period: SPeriod; attempt: number; giveUpOnFail: boolean }
  | { type: "deadline"; period: SPeriod };
export type PlanInput = { periods: SPeriod[]; runs: SRun[]; measured: Set<string>; exportComplete: Set<string>; now: Date };

export const MAX_ATTEMPTS = 4;
export const viennaDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const viennaHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", hour: "2-digit", hourCycle: "h23" }).format(d));
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** The period closes on Sunday; it is measured on the Tuesday, reminded on Tuesday and Thursday, and the deadline is Friday 07:00. */
export const tuesdayOf = (p: SPeriod) => addDays(p.end_date, 2);
export const thursdayOf = (p: SPeriod) => addDays(p.end_date, 4);
export const fridayOf = (p: SPeriod) => addDays(p.end_date, 5);
/** 07:00 Vienna on a date, as an ISO timestamp (handles summer and winter time). */
export function vienna7(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d, 7));
  return new Date(Date.UTC(y, m - 1, d, 7 - (viennaHour(probe) - 7))).toISOString();
}
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const rangeText = (p: SPeriod) => p.start_date.slice(0, 7) === p.end_date.slice(0, 7) ? `${Number(p.start_date.slice(8))}–${short(p.end_date)}` : `${short(p.start_date)}–${short(p.end_date)}`;
export const exportInstruction = (p: SPeriod) => `LinkedIn → Analytics → Content → Individuell ${short(p.start_date)}–${short(p.end_date)} → Export, then upload it here`;

export function planDue({ periods, runs, measured, exportComplete, now }: PlanInput) {
  const today = viennaDate(now), hour = viennaHour(now);
  const grid = periods.filter((p) => p.kind === "biweekly").sort((a, b) => a.start_date.localeCompare(b.start_date));
  const actions: Action[] = [];
  const reminders: { period: SPeriod; date: string }[] = [];
  const statuses: { period: SPeriod; status: PeriodStatus; since?: string; tuesday: string; friday: string }[] = [];
  for (const p of grid) {
    const pr = runs.filter((r) => r.period_id === p.id);
    const base = { period: p, tuesday: tuesdayOf(p), friday: fridayOf(p) };
    if (measured.has(p.id)) { statuses.push({ ...base, status: "measured" }); continue; }
    if (p.start_date > today) { statuses.push({ ...base, status: "upcoming" }); continue; }
    if (p.end_date >= today) { statuses.push({ ...base, status: "open" }); continue; }
    // closed and not measured
    if (pr.some((r) => r.status === "needs_attention" && r.retryable === false)) { statuses.push({ ...base, status: "needs attention" }); continue; }
    if (pr.some((r) => r.due_kind === "gave_up")) { statuses.push({ ...base, status: "failed" }); continue; }
    const failures = pr.filter((r) => r.due_kind === "scheduled" && r.status === "failed");
    if (exportComplete.has(p.id)) {
      if (failures.some((r) => viennaDate(new Date(r.created_at)) === today)) { statuses.push({ ...base, status: "failed" }); continue; } // one try per morning
      actions.push({ type: "measure", period: p, attempt: failures.length + 1, giveUpOnFail: failures.length + 1 >= MAX_ATTEMPTS });
      statuses.push({ ...base, status: failures.length ? "failed" : "due" });
      continue;
    }
    if (pr.some((r) => r.due_kind === "deadline")) { statuses.push({ ...base, status: "partial" }); continue; }
    const deadlinePassed = today > fridayOf(p) || (today === fridayOf(p) && hour >= 7);
    if (deadlinePassed) { actions.push({ type: "deadline", period: p }); statuses.push({ ...base, status: "partial" }); continue; }
    const since = pr.find((r) => r.due_kind === "waiting")?.created_at ?? vienna7(addDays(p.end_date, 1));
    actions.push({ type: "wait", period: p, message: `Waiting for the LinkedIn export (source linkedin_export). ${exportInstruction(p)}.` });
    statuses.push({ ...base, status: "waiting for data", since });
    if (today === tuesdayOf(p) || today === thursdayOf(p)) reminders.push({ period: p, date: today });
  }
  const next = grid.find((p) => p.end_date >= today);
  const waiting = statuses.filter((s) => s.status === "waiting for data");
  const nextReminder = waiting.length
    ? [tuesdayOf(waiting[0]!.period), thursdayOf(waiting[0]!.period)].find((d) => d > today || (d === today && hour < 7)) ?? null
    : next ? tuesdayOf(next) : null;
  return { actions, reminders, statuses, nextDue: next ? { period: next, at: vienna7(tuesdayOf(next)) } : null, nextReminder, waiting };
}

/** Colour for the age of the last successful run: amber after 16 days, red after 21. */
export function runAgeLevel(lastSuccessIso: string | null, now = new Date()): "ok" | "warn" | "bad" {
  if (!lastSuccessIso) return "warn";
  const days = (now.getTime() - Date.parse(lastSuccessIso)) / 864e5;
  return days > 21 ? "bad" : days > 16 ? "warn" : "ok";
}

/** Warnings for an integration row: 60 days before a version sunset, 14 days before token expiry. */
export function integrationWarnings(row: { version_sunset_date: string | null; token_expires_at: string | null } | null, now = new Date()) {
  const out: string[] = [];
  if (!row) return out;
  const days = (iso: string) => Math.ceil((Date.parse(iso) - now.getTime()) / 864e5);
  if (row.version_sunset_date && days(`${row.version_sunset_date}T00:00:00Z`) <= 60) out.push(`API version sunset in ${days(`${row.version_sunset_date}T00:00:00Z`)} days (${row.version_sunset_date}).`);
  if (row.token_expires_at && days(row.token_expires_at) <= 14) out.push(`Token expires in ${days(row.token_expires_at)} days.`);
  return out;
}
