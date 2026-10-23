// Parses the benchmark/configuration CSVs. Empty cells become null; scores must be 0–2; unknown profile keys are rejected.
export const CRITERIA = ["headline_stake", "banner_featured", "conversion_device", "one_story", "topic_focus", "owned_concept", "substance_format", "cadence", "conversation_audience", "authority_beyond"] as const;
export type ConfigKind = "benchmark_profiles" | "benchmark_observations" | "framework_criteria" | "reference_benchmarks" | "plan_targets";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const COLUMNS: Record<ConfigKind, string[]> = {
  benchmark_profiles: ["key", "name", "linkedin_url", "person_for", "named_concepts", "how_visitors_become_followers", "is_self"],
  benchmark_observations: ["key", "observed_on", "followers", "posts_per_week", "cadence_text", "median_reactions", "median_comments", "reactions_per_follower_pct", ...CRITERIA, "framework_total", "method"],
  framework_criteria: ["key", "label", "criteria", "description", "max_score"],
  reference_benchmarks: ["key", "value", "unit", "description", "source", "as_of"],
  plan_targets: ["key", "label", "baseline", "comparator", "target", "unit", "where_target_comes_from", "source_needed", "target_by", "plan"],
};
const NUM = new Set(["followers", "posts_per_week", "median_reactions", "median_comments", "reactions_per_follower_pct", ...CRITERIA, "framework_total", "max_score", "value", "baseline", "target"]);
const DATE = new Set(["observed_on", "target_by"]);
const BOOL = new Set(["is_self"]);

export function kindFromFilename(name: string): ConfigKind | null {
  const base = name.toLowerCase().replace(/\.csv$/, "").replace(/[^a-z_]/g, "");
  return (Object.keys(COLUMNS) as ConfigKind[]).find((k) => base.startsWith(k)) ?? null;
}

export type ParsedConfig = { rows: Record<string, unknown>[]; errors: string[] };
export const SNAPSHOT_NAME = /^benchmark_snapshot_(\d{4}-\d{2}-\d{2})\.csv$/;
export const isSnapshotName = (name: string) => SNAPSHOT_NAME.test(name);
const realDate = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };

export function parseConfig(kind: ConfigKind, text: string, knownProfiles?: Set<string>, today = new Date().toISOString().slice(0, 10)): ParsedConfig {
  const [head, ...body] = parseCsv(text); const errors: string[] = [];
  const want = COLUMNS[kind];
  if (!head || head.map((h) => h.trim()).join(",") !== want.join(",")) return { rows: [], errors: [`Wrong header: expected the columns ${want.join(", ")}.`] };
  const rows = body.map((r, i) => {
    const o: Record<string, unknown> = {};
    want.forEach((col, j) => {
      const raw = (r[j] ?? "").trim();
      if (raw === "") { o[col] = null; return; }
      if (NUM.has(col)) { const n = Number(raw); if (!Number.isFinite(n)) errors.push(`Row ${i + 2}: ${col} "${raw}" is not a number.`); o[col] = n; }
      else if (DATE.has(col)) { if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !realDate(raw)) errors.push(`Row ${i + 2}: ${col} "${raw}" is not a valid date (yyyy-mm-dd).`); o[col] = raw; }
      else if (BOOL.has(col)) { if (!/^(true|false)$/i.test(raw)) errors.push(`Row ${i + 2}: ${col} must be true or false.`); o[col] = /^true$/i.test(raw); }
      else o[col] = raw;
    });
    if (!o["key"]) errors.push(`Row ${i + 2}: key is empty.`);
    if (kind === "benchmark_observations") {
      if (!o["observed_on"]) errors.push(`Row ${i + 2}: observed_on is empty.`);
      else if (String(o["observed_on"]) > today) errors.push(`Row ${i + 2}: observed_on ${o["observed_on"]} is in the future.`);
      for (const c of CRITERIA) { const v = o[c]; if (v != null && (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 2)) errors.push(`Row ${i + 2}: ${c} is ${v}; scores must be 0, 1 or 2.`); }
      for (const c of ["followers", "posts_per_week", "median_reactions", "median_comments", "reactions_per_follower_pct"]) if (o[c] != null && (o[c] as number) < 0) errors.push(`Row ${i + 2}: ${c} is negative.`);
      const sum = CRITERIA.reduce((s, c) => s + ((o[c] as number | null) ?? 0), 0);
      if (o["framework_total"] != null && o["framework_total"] !== sum) errors.push(`Row ${i + 2}: framework_total is ${o["framework_total"]} but the ten scores add up to ${sum}.`);
      if (knownProfiles && o["key"] && !knownProfiles.has(String(o["key"]))) errors.push(`Row ${i + 2}: unknown profile key "${o["key"]}".`);
      o["profile_key"] = o["key"]; delete o["key"];
    }
    if (kind === "framework_criteria") o["sort_order"] = i + 1;
    return o;
  });
  return { rows, errors };
}
