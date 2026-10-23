import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: "is_allowed_user") => PromiseLike<{ data: unknown; error: unknown }> } };
async function admin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("is_allowed_user");
  if (error || !data) throw new Error("This tool is private.");
  const [{ supabaseAdmin }, io] = await Promise.all([import("@/integrations/supabase/client.server"), import("./diagnosis-io.server")]);
  return { db: supabaseAdmin as never, io };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rec = Record<string, any>;
export type DiagnosisData = {
  periods: Rec[]; followers: Rec[]; impressions: Rec[]; leads: Rec[]; posts: Rec[]; exportObs: Rec[]; annotations: Rec[];
  profiles: Rec[]; observations: Rec[]; criteria: Rec[]; references: Rec[]; planTargets: Rec[]; meetings: Rec[];
  tab1Targets: Rec[]; audience: Rec[]; integration: Rec | null; calendarConnected: boolean;
  drive: { connected: boolean; status: Rec | null; runs: Rec[]; steps: Rec[]; imports: Rec[] };
};

export const loadDiagnosis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const { data: allowed, error: e0 } = await db.rpc("is_allowed_user");
    if (e0 || !allowed) throw new Error("This tool is private.");
    async function all(table: string, order: string, select = "*"): Promise<Rec[]> {
      const rows: Rec[] = [];
      for (let o = 0; ; o += 1000) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (db.from(table as never) as any).select(select).order(order).range(o, o + 999);
        if (error) throw new Error("Diagnosis data could not be loaded. Please try again.");
        rows.push(...(data as Rec[]));
        if (data.length < 1000) return rows;
      }
    }
    const [periods, followers, impressions, leads, posts, exportObs, annotations, profiles, observations, criteria, references, planTargets, meetings, versions, targets, audience, integration] = await Promise.all([
      all("periods", "start_date"), all("v_period_followers", "start_date"), all("v_period_impressions", "start_date"), all("v_current_leads", "date"),
      all("posts", "published_at", "urn,url,hook,published_at,topic,pillar_key,concept,named_person"),
      all("post_observations", "id", "post_urn,impressions,obs_window,observed_at"),
      all("annotations", "date"), all("benchmark_profiles", "key"), all("benchmark_observations", "observed_on"), all("framework_criteria", "sort_order"),
      all("reference_benchmarks", "key"), all("plan_targets", "created_at"), all("meeting_candidates", "start_at"),
      all("strategy_versions", "version_no"), all("kpi_targets", "created_at"),
      all("v_period_audience", "period_id", "period_id,period_label,period_kind,scope,dimension,label,share_pct,below_one_pct,source_key,completeness"),
      all("integration_status", "provider"),
    ]);
    const latest = versions.at(-1);
    const driveRuns = ((await db.from("agent_runs").select("id,trigger,status,started_at,finished_at,changes_summary").eq("workflow_version", "benchmark-drive-1").order("started_at", { ascending: false }).limit(5)).data ?? []) as Rec[];
    const driveSteps = driveRuns[0] ? ((await db.from("run_steps").select("step,status,message,details").eq("run_id", driveRuns[0]["id"])).data ?? []) as Rec[] : [];
    const driveImports = ((await db.from("raw_imports").select("id,status,status_reason,drive_file_name,received_at").eq("source_key", "benchmark_drive").order("received_at", { ascending: false })).data ?? []) as Rec[];
    return {
      periods, followers, impressions, leads, posts, exportObs: exportObs.filter((o) => o["obs_window"] === "export_range"), annotations,
      profiles, observations, criteria, references, planTargets, meetings,
      tab1Targets: targets.filter((t) => t["version_id"] === latest?.["id"]),
      audience: audience.filter((a) => a["scope"] === "content_viewers"),
      integration: integration.find((i) => i["provider"] === "google_calendar") ?? null,
      calendarConnected: !!process.env["GOOGLE_CALENDAR_API_KEY"],
      drive: { connected: !!process.env["GOOGLE_DRIVE_API_KEY"], status: integration.find((i) => i["provider"] === "google_drive") ?? null, runs: driveRuns, steps: driveSteps, imports: driveImports },
    } as DiagnosisData;
  });

export const checkDriveNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("is_allowed_user");
    if (error || !data) throw new Error("This tool is private.");
    const [{ supabaseAdmin }, drive] = await Promise.all([import("@/integrations/supabase/client.server"), import("./benchmark-drive.server")]);
    return JSON.parse(JSON.stringify(await drive.driveSync(supabaseAdmin as never, "manual"))) as Rec;
  });

export const uploadConfigCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ filename: z.string().min(1).max(300), text: z.string().max(2_000_000) }).parse(v))
  .handler(async ({ data, context }) => {
    const { db, io } = await admin(context);
    return io.importConfigCsv(db, { filename: data.filename, text: data.text, only: "benchmark_observations" });
  });

export const checkCalendarNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, io } = await admin(context);
    return (await io.calendarSync(db)) as Record<string, string | number>;
  });

export const decideMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    event_id: z.string().min(1).max(300), decision: z.enum(["confirm", "drop"]),
    type: z.enum(["investor", "rollup_operator", "founder", "other"]).optional(),
    attribution: z.enum(["tracked_link", "named_post", "said_linkedin", "unknown"]).optional(),
    post_urn: z.string().max(200).nullable().optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { db, io } = await admin(context);
    return (await io.decideMeeting(db, data)) as Record<string, string>;
  });

export const suggestPostTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, io } = await admin(context);
    return io.suggestTags(db);
  });

export const savePostTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    urn: z.string().min(1).max(200), topic: z.enum(["core", "adjacent", "personal", "promo"]), pillar: z.enum(["buying", "running", "thesis", "none"]),
    concept: z.string().max(200), named_person: z.boolean(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { db, io } = await admin(context);
    return (await io.saveTags(db, data)) as Record<string, string>;
  });
