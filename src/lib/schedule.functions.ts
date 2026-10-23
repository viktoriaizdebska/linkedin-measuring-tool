import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exportInstruction, integrationWarnings, planDue, rangeText, type SPeriod, type SRun } from "./schedule-rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;
export type ScheduleData = {
  nextDue: { label: string; range: string; at: string } | null;
  periods: { id: string; label: string; range: string; status: string; since: string | null; tuesday: string; friday: string }[];
  waiting: { label: string; range: string; instruction: string; since: string | null }[];
  nextReminder: string | null; nextDeadline: string | null;
  dailySteps: { step: string; status: string; message: string | null; finished_at: string | null }[]; dailyRunAt: string | null;
  linkedinApi: Rec | null; apiWarnings: string[];
  settings: { email_reminders: boolean; email_summaries: boolean } | null;
  notifications: Rec[]; lastSuccessAt: string | null;
};

export const loadSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const { data: allowed, error } = await db.rpc("is_allowed_user");
    if (error || !allowed) throw new Error("This tool is private.");
    const now = new Date();
    const periods = ((await db.from("periods").select("id,label,kind,start_date,end_date").eq("kind", "biweekly").order("start_date")).data ?? []) as SPeriod[];
    const runs = ((await db.from("agent_runs").select("id,period_id,status,due_kind,retryable,created_at").not("period_id", "is", null)).data ?? []) as SRun[];
    const kv = ((await db.from("kpi_values").select("period_id,run_id").in("period_id", periods.map((p) => p.id))).data ?? []) as Rec[];
    const ok = (await db.from("agent_runs").select("id,finished_at").eq("status", "succeeded").eq("workflow_version", "measure-period-1").order("finished_at", { ascending: false })).data ?? [];
    const okIds = new Set(ok.map((r) => r.id));
    const snaps = ((await db.from("current_snapshots").select("period_id").eq("source_key", "linkedin_export").eq("completeness", "complete")).data ?? []) as Rec[];
    const plan = planDue({ periods, runs, measured: new Set(kv.filter((k) => okIds.has(k["run_id"])).map((k) => k["period_id"] as string)), exportComplete: new Set(snaps.map((s) => s["period_id"] as string)), now });
    const daily = (await db.from("agent_runs").select("id,finished_at").eq("workflow_version", "daily-job-1").order("started_at", { ascending: false }).limit(1)).data?.[0];
    const dailySteps = daily ? ((await db.from("run_steps").select("step,status,message,finished_at").eq("run_id", daily.id)).data ?? []) : [];
    const api = (await db.from("integration_status").select("*").eq("provider", "linkedin_api").maybeSingle()).data as Rec | null;
    const settings = (await db.from("app_settings").select("email_reminders,email_summaries").maybeSingle()).data;
    const notifications = (await db.from("notification_log").select("kind,subject,outcome,created_at").order("created_at", { ascending: false }).limit(10)).data ?? [];
    const firstWaiting = plan.waiting[0];
    return {
      nextDue: plan.nextDue ? { label: plan.nextDue.period.label, range: rangeText(plan.nextDue.period), at: plan.nextDue.at } : null,
      periods: plan.statuses.map((s) => ({ id: s.period.id, label: s.period.label, range: rangeText(s.period), status: s.status, since: s.since ?? null, tuesday: s.tuesday, friday: s.friday })),
      waiting: plan.waiting.map((w) => ({ label: w.period.label, range: rangeText(w.period), instruction: exportInstruction(w.period), since: w.since ?? null })),
      nextReminder: plan.nextReminder,
      nextDeadline: firstWaiting ? firstWaiting.friday : plan.nextDue ? plan.statuses.find((s) => s.period.id === plan.nextDue!.period.id)?.friday ?? null : null,
      dailySteps, dailyRunAt: daily?.finished_at ?? null,
      linkedinApi: api, apiWarnings: integrationWarnings(api as never, now),
      settings, notifications, lastSuccessAt: ok[0]?.finished_at ?? null,
    } as ScheduleData;
  });

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ email_reminders: z.boolean(), email_summaries: z.boolean() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_allowed_user");
    if (!allowed) throw new Error("This tool is private.");
    const { error } = await context.supabase.from("app_settings").update(data).eq("singleton", true);
    if (error) throw new Error("Settings could not be saved. Please try again.");
    return { status: "saved" };
  });
