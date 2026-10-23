import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Daily job, scheduled at 05:00 and 06:00 UTC; runs only when it is 07:00 in Vienna (handles summer and winter time).
// Steps in order: calendar-sync → benchmark-drive → measure-due. Each step's result is logged as a run step of one daily-job run.
export const Route = createFileRoute("/api/public/jobs/calendar-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vienna", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
        if (hour !== 7) return Response.json({ skipped: "not 07:00 in Vienna" });
        const [{ supabaseAdmin }, io, drive, due] = await Promise.all([
          import("@/integrations/supabase/client.server"), import("@/lib/diagnosis-io.server"), import("@/lib/benchmark-drive.server"), import("@/lib/schedule.server"),
        ]);
        const db = supabaseAdmin as never as Parameters<typeof due.measureDue>[0];
        const started = new Date().toISOString();
        const run = (await db.from("agent_runs").insert({ trigger: "schedule", input_key: `daily-job:${started}`, status: "running", workflow_version: "daily-job-1", started_at: started }).select("id").single()).data as { id: string } | null;
        const results: Record<string, unknown> = {};
        let failed = 0;
        const step = async (name: string, fn: () => Promise<{ status: string } & Record<string, unknown>>) => {
          const t = new Date().toISOString();
          try {
            const r = await fn(); results[name] = r;
            const bad = ["failed", "needs attention"].includes(r.status); if (bad) failed++;
            if (run) await db.from("run_steps").insert({ run_id: run.id, step: name, status: bad ? "failed" : "succeeded", started_at: t, finished_at: new Date().toISOString(), message: String(r.status), details: JSON.parse(JSON.stringify(r)) });
          } catch (e) {
            failed++; results[name] = { status: "failed" };
            if (run) await db.from("run_steps").insert({ run_id: run.id, step: name, status: "failed", started_at: t, finished_at: new Date().toISOString(), message: e instanceof Error ? e.message : String(e) });
          }
        };
        await step("calendar-sync", () => io.calendarSync(db as never) as never);
        await step("benchmark-drive", () => drive.driveSync(db as never, "schedule") as never);
        await step("measure-due", () => due.measureDue(db) as never);
        if (run) await db.from("agent_runs").update({ status: failed ? "needs_attention" : "succeeded", finished_at: new Date().toISOString(), changes_summary: Object.entries(results).map(([k, v]) => `${k}: ${(v as { status: string }).status}`).join(" · ") }).eq("id", run.id);
        return Response.json(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, (v as { status: string }).status])));
      },
    },
  },
});
