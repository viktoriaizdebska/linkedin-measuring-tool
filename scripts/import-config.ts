// Usage: bun ./scripts/import-config.ts <dir>   (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Imports the five Step 7 CSVs through raw_imports.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { importConfigCsv } from "../src/lib/diagnosis-io.server";

const dir = process.argv[2] ?? "/mnt/user-uploads";
const db = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
for (const f of ["benchmark_profiles", "framework_criteria", "reference_benchmarks", "plan_targets", "benchmark_observations"]) {
  console.log(f, JSON.stringify(await importConfigCsv(db as never, { filename: `${f}.csv`, text: readFileSync(`${dir}/${f}.csv`, "utf8") })));
}
