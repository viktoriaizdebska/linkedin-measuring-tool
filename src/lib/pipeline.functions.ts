import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// The caller must be the allowlisted user; the pipeline itself writes only through service-role database functions.
async function admin(context: { supabase: { rpc: (fn: "is_allowed_user") => PromiseLike<{ data: unknown; error: unknown }> } }) {
  const { data, error } = await context.supabase.rpc("is_allowed_user");
  if (error || !data) throw new Error("This tool is private.");
  const [{ supabaseAdmin }, pipeline] = await Promise.all([import("@/integrations/supabase/client.server"), import("./linkedin/pipeline.server")]);
  return { db: supabaseAdmin as never, pipeline };
}

const uploadSchema = z.object({ filename: z.string().min(1).max(300), base64: z.string().max(7_200_000) });
export const uploadLinkedInExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => uploadSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { db, pipeline } = await admin(context);
    const bytes = new Uint8Array(Buffer.from(data.base64, "base64"));
    return (await pipeline.uploadExport(db, { bytes, filename: data.filename })) as unknown as Record<string, string>;
  });

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const entrySchema = z.discriminatedUnion("entry_type", [
  z.object({ entry_type: z.literal("lead"), date, kind: z.enum(["meeting", "inquiry", "intro"]), person_type: z.enum(["investor", "operator", "other", "founder", "rollup_operator"]), attribution: z.enum(["tracked_link", "named_post", "said_linkedin", "unknown"]), post_urn: z.string().max(200).nullable().optional(), note: z.string().max(1000).nullable().optional() }),
  z.object({ entry_type: z.literal("spot_check"), checked_on: date, sample_size: z.number().int().min(1).max(100000), strict_count: z.number().int().min(0), broad_count: z.number().int().min(0), none_count: z.number().int().min(0), method_version: z.string().trim().min(1).max(300) }),
  z.object({ entry_type: z.literal("lead_removal"), lead_id: z.string().uuid() }),
]);
export const logManualEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => {
    const e = entrySchema.parse(v);
    if (e.entry_type === "spot_check" && e.strict_count + e.broad_count + e.none_count !== e.sample_size) throw new Error("Strict + broad + none must equal the sample size.");
    return e;
  })
  .handler(async ({ data, context }) => {
    const { db, pipeline } = await admin(context);
    return (await pipeline.logEntry(db, data)) as unknown as Record<string, string>;
  });

export const runMeasurementNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ period_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { db, pipeline } = await admin(context);
    return (await pipeline.measurePeriod(db, { periodId: data.period_id, trigger: "manual" })) as unknown as Record<string, string>;
  });
