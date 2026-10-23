// Live checks that leave no measurement rows behind: forced crash in the commit step, and re-running the same file.
// Usage: bun scripts/pipeline-live-checks.ts   (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
import { createClient } from "@supabase/supabase-js";
import { measurePeriod } from "../src/lib/linkedin/pipeline.server";

const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const TABLES = ["snapshots", "follower_daily", "account_metrics", "post_observations", "audience_observations", "audience_checks", "leads", "kpi_values", "period_summaries", "posts", "post_aliases", "periods"];
const counts = async () => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, (await db.from(t).select("*", { count: "exact", head: true })).count])));

const before = await counts();
const b1 = (await db.from("periods").select("id").eq("label", "B-1").single()).data!;
const crash = await measurePeriod(db as never, { periodId: b1.id, trigger: "manual", testCrash: true, skipSummary: true });
const steps = (await db.from("run_steps").select("step,status,message").eq("run_id", crash.run_id!).order("finished_at")).data;
const raw = (await db.from("raw_imports").select("id").eq("source_key", "linkedin_export").order("received_at").limit(1)).data![0]!;
const again = await measurePeriod(db as never, { rawImportIds: [raw.id], trigger: "retry" });
const after = await counts();
console.log(JSON.stringify({ crash: { status: crash.status, reason: crash.reason, steps }, same_file_again: { status: again.status, reason: again.reason }, unchanged: JSON.stringify(before) === JSON.stringify(after), before, after }, null, 1));
