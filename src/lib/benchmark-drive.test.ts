import { describe, expect, it } from "vitest";
import { isSnapshotName, parseConfig } from "./imports/config-csv";

const HEAD = "key,observed_on,followers,posts_per_week,cadence_text,median_reactions,median_comments,reactions_per_follower_pct,headline_stake,banner_featured,conversion_device,one_story,topic_focus,owned_concept,substance_format,cadence,conversation_audience,authority_beyond,framework_total,method";
const row = (scores: number[], total: number, date = "2026-10-12") => `viktoria,${date},1000,2,,10,2,1,${scores.join(",")},${total},manual`;
const known = new Set(["viktoria"]);
const parse = (text: string) => parseConfig("benchmark_observations", text, known, "2026-10-12");

describe("benchmark snapshot checks (shared by upload and Drive)", () => {
  it("rejects a score of 3 with that reason", () => {
    const r = parse(`${HEAD}\n${row([3, 1, 1, 1, 1, 1, 1, 1, 1, 1], 12)}`);
    expect(r.errors.join(" ")).toContain("headline_stake is 3; scores must be 0, 1 or 2");
  });
  it("rejects a wrong header with that reason", () => {
    const r = parse(`key,date,followers\nviktoria,2026-10-12,1`);
    expect(r.errors[0]).toMatch(/^Wrong header/);
  });
  it("rejects a framework_total that is not the sum of the ten scores", () => {
    expect(parse(`${HEAD}\n${row([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 11)}`).errors.join(" ")).toContain("add up to 10");
  });
  it("rejects a future or impossible observed_on", () => {
    expect(parse(`${HEAD}\n${row([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 10, "2026-10-13")}`).errors.join(" ")).toContain("in the future");
    expect(parse(`${HEAD}\n${row([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 10, "2026-02-30")}`).errors.join(" ")).toContain("not a valid date");
  });
  it("accepts a valid row with empty cells as null", () => {
    const r = parse(`${HEAD}\n${row([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 10)}`);
    expect(r.errors).toEqual([]); expect(r.rows[0]!["cadence_text"]).toBeNull();
  });
  it("only picks up files named benchmark_snapshot_YYYY-MM-DD.csv", () => {
    expect(isSnapshotName("benchmark_snapshot_2026-10-12.csv")).toBe(true);
    for (const n of ["benchmark_snapshot_2026-10-12 (1).csv", "Benchmark_snapshot_2026-10-12.csv", "benchmark_observations.csv", "benchmark_snapshot_2026-10-12.xlsx", "notes.txt"]) expect(isSnapshotName(n)).toBe(false);
  });
});
