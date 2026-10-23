import { existsSync, readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { dropIncompleteDay, FormatError, idTime, parseExport, parsePercent, postUrnFromUrl, translateLabel, validateExport } from "./export-reader";
import { validateSummary, type SummaryInput } from "./ai-summary.server";

const B1 = "/mnt/user-uploads/AggregateAnalytics_Viktoria_Izdebska_2026-09-28_2026-10-11.xlsx";
const Y = "/mnt/user-uploads/AggregateAnalytics_Viktoria_Izdebska_2025-10-13_2026-10-12.xlsx";
const has = existsSync(B1) && existsSync(Y);
const doctor = (path: string, edit: (files: Record<string, string>) => void) => {
  const z = unzipSync(new Uint8Array(readFileSync(path)));
  const text: Record<string, string> = {};
  for (const k of ["xl/workbook.xml", "xl/worksheets/sheet2.xml"]) text[k] = strFromU8(z[k]!);
  edit(text);
  for (const [k, v] of Object.entries(text)) z[k] = strToU8(v);
  return zipSync(z);
};

describe("LinkedIn export reader", () => {
  it("parses percent cells, including '< 1 %' with a non-breaking space", () => {
    expect(parsePercent("7\u00a0%")).toEqual({ share: 7, below: false });
    expect(parsePercent("< 1\u00a0%")).toEqual({ share: null, below: true });
  });
  it("translates labels by the agreed rules", () => {
    expect(translateLabel("seniority", "Geschäftsführung", "de")).toBe("CXO");
    expect(translateLabel("industry", "Bankwesen", "de")).toBe("Banking");
    expect(translateLabel("company_size", "10.001+ Beschäftigte", "de")).toBe("10,001+ employees");
    expect(translateLabel("location", "Metropolregion San Francisco Bay Area", "de")).toBe("San Francisco Bay Area");
    expect(translateLabel("location", "Graz und Umgebung", "de")).toBe("Graz area");
    expect(translateLabel("location", "Frankfurt/Rhein-Main", "de")).toBe("Frankfurt area");
    expect(translateLabel("industry", "Something new", "de")).toBeNull();
  });
  it("reads share, ugcPost and groupPost URLs and the time inside the ID", () => {
    expect(postUrnFromUrl("https://www.linkedin.com/posts/viktoria-izdebska_x-share-7513600270979870721-H1_S")).toBe("urn:li:share:7513600270979870721");
    expect(postUrnFromUrl("https://www.linkedin.com/posts/v_x-ugcPost-7495406385195708416-TJnI")).toBe("urn:li:ugcPost:7495406385195708416");
    expect(postUrnFromUrl("https://www.linkedin.com/feed/update/urn:li:groupPost:46723-7431673257017102336")).toBe("urn:li:groupPost:46723-7431673257017102336");
    expect(Math.abs(idTime("urn:li:share:7513600270979870721")! - idTime("urn:li:activity:7513600274066788353")!)).toBeLessThan(10_000);
  });
  it.skipIf(!has)("B-1 file: totals match and the range is complete when uploaded on 12 October", () => {
    const p = parseExport(new Uint8Array(readFileSync(B1)));
    expect(p.range).toEqual({ start: "2026-09-28", end: "2026-10-11" });
    expect(validateExport(p, 8590).filter((i) => i.severity !== "info")).toEqual([]);
    expect(dropIncompleteDay(p, "2026-10-12").rangePartial).toBe(false);
  });
  it.skipIf(!has)("365-day file: 12 October is dropped and range-level data is partial; negative engagement is only info", () => {
    const p = parseExport(new Uint8Array(readFileSync(Y)));
    const issues = validateExport(p, 8590);
    expect(issues.filter((i) => i.severity === "blocker")).toEqual([]);
    expect(issues.filter((i) => i.rule === "negative_engagement")).toHaveLength(7);
    const d = dropIncompleteDay(p, "2026-10-12");
    expect(d.rangePartial).toBe(true);
    expect(d.daily.at(-1)!.date).toBe("2026-10-11");
  });
  it.skipIf(!has)("doctored copy with a renamed sheet is rejected as a format change", () => {
    const bytes = doctor(B1, (f) => { f["xl/workbook.xml"] = f["xl/workbook.xml"]!.replace('name="ENGAGEMENT"', 'name="ENGAGEMENT_X"'); });
    expect(() => parseExport(bytes)).toThrow(FormatError);
    expect(() => parseExport(bytes)).toThrow("The export format changed: ENGAGEMENT, a sheet named ENGAGEMENT");
  });
  it.skipIf(!has)("doctored copy with one daily impression changed is blocked: daily impressions no longer match the total", () => {
    const bytes = doctor(B1, (f) => { f["xl/worksheets/sheet2.xml"] = f["xl/worksheets/sheet2.xml"]!.replace(/<c r="B2"[^>]*>.*?<\/c>/, '<c r="B2" t="inlineStr"><is><t>9999</t></is></c>'); });
    const p = parseExport(bytes);
    const blockers = validateExport(p, 8590).filter((i) => i.severity === "blocker");
    expect(blockers.map((b) => b.rule)).toEqual(["impressions_total"]);
    expect(blockers[0]!.message).toContain("discovery total is 22301");
  });
  it("summary validation rejects other structures and numbers not in the input", () => {
    const input: SummaryInput = { period: { label: "B-1", start_date: "2026-09-28", end_date: "2026-10-11", days: 14, partial: false },
      kpis: [{ kpi_key: "new_followers_14d", name: "New followers", kind: "measured", value: 155, vs_previous: 97, vs_28_days: null, vs_12_weeks: null, vs_baseline: 190.77, change_vs_previous: 58, change_vs_baseline: -35.77, change_vs_baseline_pct: -18.75, note: null }],
      reference_numbers: [14] };
    const f = (text: string) => ({ kpi_key: "new_followers_14d", text });
    expect(validateSummary({ headline: "155 new followers", findings: [f("Up 58 on 97"), f("Below the 190.8 baseline"), f("14 days")], flags: [] }, input)).not.toBeNull();
    expect(validateSummary({ headline: "160 new followers", findings: [f("a"), f("b"), f("c")], flags: [] }, input)).toBeNull();
    expect(validateSummary({ headline: "x", findings: [f("a"), f("b")], flags: [] }, input)).toBeNull();
    expect(validateSummary({ headline: "x", findings: [f("a"), f("b"), { kpi_key: "made_up", text: "c" }], flags: [] }, input)).toBeNull();
  });
});
