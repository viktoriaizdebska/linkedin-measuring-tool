import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AudienceRow, CheckRow, FollowerRow, LeadRow, PeriodRow, PostRow } from "./measurement";

export const loadMeasurement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const { data: allowed, error: accessError } = await db.rpc("is_allowed_user");
    if (accessError || !allowed) throw new Error("This tool is private.");
    async function all(table: string, order = "created_at"): Promise<Record<string, unknown>[]> {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += 1000) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (db.from(table as never) as any).select("*").order(order).range(offset, offset + 999);
        if (error) throw new Error("Measurement data could not be loaded. Please try again.");
        rows.push(...(data as Record<string, unknown>[]));
        if (data.length < 1000) return rows;
      }
    }
    const [periods, followers, monthly, posts, audience, leads, runs, steps, raws, caps, schedule, definitions, annotations, impressions, periodAudience, periodPosts, spotChecks, manualLeads, summaries, kpiValues, issues] = await Promise.all([
      all("periods", "start_date"), all("v_period_followers", "start_date"), all("v_monthly_account", "window_start"), all("v_post_metrics", "published_at"),
      all("v_audience_latest", "share_pct"), all("v_leads_by_period", "start_date"), all("agent_runs"), all("run_steps"), all("raw_imports"),
      all("v_source_capabilities_latest"), all("schedule_state"), all("kpi_definitions", "sort_order"), all("annotations", "date"),
      all("v_period_impressions", "start_date"), all("v_period_audience", "period_id"), all("v_period_posts", "published_at"), all("v_spot_checks", "checked_on"),
      all("v_manual_leads", "date"), all("period_summaries"), all("kpi_values"), all("data_quality_issues"),
    ]);
    return { periods, followers, monthly, posts, audience, leads, runs, steps, raws, caps, definitions, annotations, impressions, periodAudience, periodPosts, spotChecks, manualLeads, summaries, kpiValues, issues, schedule: schedule[0] ?? null } as unknown as MeasurementData;
  });

export type MeasurementData = {
  periods: PeriodRow[]; followers: FollowerRow[]; leads: LeadRow[]; posts: PostRow[]; audience: AudienceRow[];
  monthly: { window_start: string; window_end: string; days: number; impressions: number | null; new_followers: number | null }[];
  runs: { id: string; created_at: string; trigger: string; status: string; workflow_version: string | null; started_at: string | null; finished_at: string | null; records_read: number | null; records_written: number | null; changes_summary: string | null }[];
  steps: { id: string; run_id: string; step: string; status: string; started_at: string | null; finished_at: string | null; message: string | null }[];
  raws: { id: string; received_at: string; source_key: string; status: string; sha256: string; period_hint: string | null; payload: { filename?: string; entry_type?: string } | null }[];
  caps: { source_key: string; metric_key: string; available: string; note: string | null; verified_on: string | null }[];
  schedule: { next_due: string } | null;
  definitions: { key: string; name: string; goal_category: string; kind: string; sources_needed: string[]; is_north_star: boolean; sort_order: number }[];
  annotations: { date: string; label: string; kind: string }[];
  impressions: { period_id: string; label: string; kind: string; start_date: string; daily_source: string | null; daily_impressions: number | null; daily_engagements: number | null; days_covered: number | null; daily_complete: boolean | null; range_source: string | null; range_impressions: number | null; range_members_reached: number | null; range_complete: boolean | null }[];
  periodAudience: (AudienceRow & { period_id: string; period_label: string; label_raw: string | null; below_one_pct: boolean | null; source_key: string; completeness: string })[];
  periodPosts: { period_id: string; period_label: string; urn: string; published_at: string; url: string | null; hook: string | null; impressions: number | null; engagements: number | null; age_days: number }[];
  spotChecks: (CheckRow & { id: string; source_key: string; period_label: string | null })[];
  manualLeads: { id: string; date: string; kind: string; person_type: string; attribution: string; post_urn: string | null; note: string | null; period_label: string }[];
  summaries: { id: string; created_at: string; period_id: string; run_id: string; summary: { headline: string; findings: { kpi_key: string; text: string }[]; flags: string[] }; model: string | null }[];
  kpiValues: { id: string; created_at: string; period_id: string; kpi_key: string; value: number; vs_previous: number | null; vs_baseline: number | null }[];
  issues: { id: string; run_id: string; severity: string; rule: string; message: string }[];
};
