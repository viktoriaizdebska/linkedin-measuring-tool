// Executor for the daily "measure-due" step. Decisions come from planDue (pure, clock-driven); this file only reads,
// calls measurePeriod (the same path as "Run now") and writes system rows (agent_runs, notification_log, schedule_state).
// It never updates or deletes measurement rows.
import type { SupabaseClient } from "@supabase/supabase-js";
import { measurePeriod } from "./linkedin/pipeline.server";
import { planDue, rangeText, viennaDate, type SPeriod, type SRun } from "./schedule-rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;
export const OWNER = "viktoria@izdebska.com"; // the only recipient, ever
const WORKFLOW = "measure-due-1";
const APP_URL = "https://project--46031964-3b2a-40c6-9c74-0ae0462ae90f.lovable.app";

export async function loadPlanInput(db: DB, now: Date) {
  const periods = ((await db.from("periods").select("id,label,kind,start_date,end_date").eq("kind", "biweekly").order("start_date")).data ?? []) as SPeriod[];
  const runs = ((await db.from("agent_runs").select("id,period_id,status,due_kind,retryable,created_at").not("period_id", "is", null)).data ?? []) as SRun[];
  const ids = periods.map((p) => p.id);
  const kv = ((await db.from("kpi_values").select("period_id,run_id").in("period_id", ids)).data ?? []) as { period_id: string; run_id: string }[];
  const okRuns = new Set((((await db.from("agent_runs").select("id").in("id", [...new Set(kv.map((k) => k.run_id))]).eq("status", "succeeded")).data ?? []) as { id: string }[]).map((r) => r.id));
  const measured = new Set(kv.filter((k) => okRuns.has(k.run_id)).map((k) => k.period_id));
  const snaps = ((await db.from("current_snapshots").select("period_id,source_key,completeness").in("period_id", ids).eq("source_key", "linkedin_export").eq("completeness", "complete")).data ?? []) as { period_id: string }[];
  return { periods, runs, measured, exportComplete: new Set(snaps.map((s) => s.period_id)), now };
}

/** Records every email decision once (dedupe key) and sends only when the matching switch is on. */
async function notify(db: DB, n: { kind: "reminder" | "summary" | "failure"; key: string; subject: string; period_id?: string | null; run_id?: string | null }) {
  const s = (await db.from("app_settings").select("email_reminders,email_summaries").maybeSingle()).data;
  const on = n.kind === "reminder" ? !!s?.email_reminders : !!s?.email_summaries;
  // App email sending needs a verified sender domain; until it exists, a switched-on email is logged as not sent.
  const outcome = on ? "not sent: email sender domain not set up yet" : "not sent: switch off";
  await db.from("notification_log").insert({ kind: n.kind, dedupe_key: n.key, subject: n.subject, period_id: n.period_id ?? null, run_id: n.run_id ?? null, recipient: OWNER, outcome });
  return outcome;
}

export async function measureDue(db: DB, now = new Date()) {
  const input = await loadPlanInput(db, now);
  const plan = planDue(input);
  const out: { period: string; action: string; result: string }[] = [];
  const waitingRow = (pid: string) => input.runs.find((r) => r.period_id === pid && r.due_kind === "waiting" && r.status === "waiting_for_data");
  const closeWaiting = async (pid: string, status: string, note: string) => {
    const w = waitingRow(pid);
    if (w) await db.from("agent_runs").update({ status, finished_at: now.toISOString(), changes_summary: note }).eq("id", w.id);
  };

  for (const a of plan.actions) {
    const p = a.period;
    if (a.type === "wait") {
      const w = waitingRow(p.id);
      if (w) await db.from("agent_runs").update({ finished_at: now.toISOString(), changes_summary: a.message }).eq("id", w.id);
      else await db.from("agent_runs").insert({ trigger: "schedule", period_id: p.id, input_key: `waiting:${p.id}`, status: "waiting_for_data", workflow_version: WORKFLOW, started_at: now.toISOString(), finished_at: now.toISOString(), due_kind: "waiting", changes_summary: a.message });
      out.push({ period: p.label, action: "waiting for data", result: a.message });
      continue;
    }
    if (a.type === "deadline") {
      const r = await measurePeriod(db, { periodId: p.id, trigger: "schedule", skipSummary: true, summaryNote: "No summary: LinkedIn export missing at the Friday deadline.", now });
      if (r.run_id) await db.from("agent_runs").update({ status: "needs_attention", due_kind: "deadline", changes_summary: `Partial: the LinkedIn export was still missing at the Friday deadline; measured with manual leads, confirmed meetings and benchmarks only. ${r.kpis ?? 0} KPI values, no summary.` }).eq("id", r.run_id);
      await closeWaiting(p.id, "partial", `Friday deadline passed; partial run ${r.run_id ?? "—"}.`);
      await notify(db, { kind: "failure", key: `failure:${r.run_id}`, subject: `${p.label} (${rangeText(p)}) measured partially: LinkedIn export missing`, period_id: p.id, run_id: r.run_id ?? null });
      out.push({ period: p.label, action: "deadline (partial)", result: r.status });
      continue;
    }
    const r = await measurePeriod(db, { periodId: p.id, trigger: "schedule", now });
    const ok = r.status === "succeeded" || r.status === "already processed";
    if (r.run_id && !ok) {
      const rejected = r.status === "needs_attention";
      const giveUp = !rejected && r.status === "failed" && a.giveUpOnFail;
      await db.from("agent_runs").update({ due_kind: giveUp ? "gave_up" : "scheduled", retryable: !rejected, ...(giveUp ? { status: "needs_attention", changes_summary: `Failed ${a.attempt} mornings in a row; no more retries. Last error: ${r.reason ?? "—"}` } : {}) }).eq("id", r.run_id);
      await notify(db, { kind: "failure", key: `failure:${r.run_id}`, subject: `${p.label} (${rangeText(p)}) needs attention`, period_id: p.id, run_id: r.run_id });
    } else if (r.run_id) {
      await db.from("agent_runs").update({ due_kind: "scheduled" }).eq("id", r.run_id);
      await closeWaiting(p.id, "succeeded", `Measured by run ${r.run_id}.`);
      const s = (await db.from("period_summaries").select("summary").eq("run_id", r.run_id).maybeSingle()).data as { summary?: { headline?: string } } | null;
      await notify(db, { kind: "summary", key: `summary:${p.id}`, subject: `${p.label} (${rangeText(p)}) measured${s?.summary?.headline ? `: ${s.summary.headline}` : ""} · ${APP_URL}`, period_id: p.id, run_id: r.run_id });
    }
    out.push({ period: p.label, action: `measure (attempt ${a.attempt})`, result: r.status });
  }
  for (const rem of plan.reminders) {
    await notify(db, { kind: "reminder", key: `reminder:${rem.period.id}:${rem.date}`, subject: `${rem.period.label} (${rangeText(rem.period)}) is waiting for your LinkedIn export`, period_id: rem.period.id });
  }

  // schedule_state: next due Tuesday and the latest measured period.
  const after = await loadPlanInput(db, now);
  const lastMeasured = after.periods.filter((p) => after.measured.has(p.id)).at(-1);
  const st = (await db.from("schedule_state").select("id").limit(1).maybeSingle()).data;
  if (st) await db.from("schedule_state").update({ ...(plan.nextDue ? { next_due: plan.nextDue.at } : {}), last_measured_period_id: lastMeasured?.id ?? null }).eq("id", st.id);
  return { status: "succeeded", today: viennaDate(now), actions: out, reminders: plan.reminders.length };
}
