import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { saveSchema, eventSchema } from "./strategy-schema";
import type { Database } from "@/integrations/supabase/types";
import type { StrategyData } from "@/data/strategy";

export const loadStrategy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed, error: accessError } = await context.supabase.rpc("is_allowed_user");
    if (accessError || !allowed) throw new Error("This tool is private.");
    async function all<T>(table: keyof Database["public"]["Tables"]): Promise<T[]> {
      const rows: T[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await context.supabase
          .from(table)
          .select("*")
          .order("created_at")
          .range(offset, offset + 999);
        if (error) throw new Error("Strategy could not be loaded. Please try again.");
        rows.push(...(data as unknown as T[]));
        if (data.length < 1000) return rows;
      }
    }
    const [
      versions,
      positioning,
      pillars,
      ctas,
      definitions,
      targets,
      annotations,
      values,
      periods,
      checks,
    ] = await Promise.all([
      all<StrategyData["versions"][number]>("strategy_versions"),
      all<StrategyData["positioning"][number]>("positioning"),
      all<StrategyData["pillars"][number]>("content_pillars"),
      all<StrategyData["ctas"][number]>("ctas"),
      all<StrategyData["definitions"][number]>("kpi_definitions"),
      all<StrategyData["targets"][number]>("kpi_targets"),
      all<StrategyData["annotations"][number]>("annotations"),
      all<StrategyData["values"][number]>("kpi_values"),
      all<StrategyData["periods"][number]>("periods"),
      context.supabase.from("v_spot_checks").select("snapshot_period_label").then(({ data, error }) => { if (error) throw new Error("Strategy could not be loaded. Please try again."); return (data ?? []) as { snapshot_period_label: string | null }[]; }),
    ]);
    // A spot check belongs only to the period whose snapshot holds it (e.g. the baseline check belongs to BASE, not B-1).
    const checkPeriods = new Set(checks.map((c) => c.snapshot_period_label));
    const okValue = (v: StrategyData["values"][number]) => v.kpi_key !== "follower_target_spot_check" || checkPeriods.has(periods.find((p) => p.id === v.period_id)?.label ?? "");
    if (!versions.length) throw new Error("No strategy version is available.");
    return {
      versions: versions.sort((a, b) => b.version_no - a.version_no),
      positioning,
      pillars,
      ctas,
      definitions: definitions.sort((a, b) => a.sort_order - b.sort_order),
      targets,
      annotations,
      values: values.filter(okValue),
      periods,
    };
  });
export const saveStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => saveSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("save_strategy_version", {
      payload: data,
    });
    if (error) {
      if (error.message.includes("newer strategy"))
        throw new Error("A newer strategy version exists. Cancel and reload before editing.");
      throw new Error("Strategy could not be saved. Your edits are still here; please try again.");
    }
    return id;
  });
export const addStrategyEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => eventSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("annotations").insert(data);
    if (error) throw new Error("Event could not be saved. Please try again.");
    return { ok: true };
  });
