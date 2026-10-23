import { describe, expect, it } from "vitest";
import { integrationWarnings, planDue, runAgeLevel, type SPeriod, type SRun } from "./schedule-rules";

const P1: SPeriod = { id: "p1", label: "P1", kind: "biweekly", start_date: "2026-10-12", end_date: "2026-10-25" };
const P2: SPeriod = { id: "p2", label: "P2", kind: "biweekly", start_date: "2026-10-26", end_date: "2026-11-08" };
const B1: SPeriod = { id: "b1", label: "B-1", kind: "baseline", start_date: "2026-09-28", end_date: "2026-10-11" };
const periods = [B1, P1, P2];
const at = (iso: string) => new Date(iso); // UTC; Vienna is UTC+1 from 25 Oct
const plan = (now: string, runs: SRun[] = [], exportComplete: string[] = [], measured: string[] = []) =>
  planDue({ periods, runs, measured: new Set(measured), exportComplete: new Set(exportComplete), now: at(now) });

describe("measure-due rules (clock override)", () => {
  it("27 Oct 07:00, no P1 export: P1 waits for data, banner shows, a reminder is due", () => {
    const r = plan("2026-10-27T06:00:00Z");
    expect(r.actions).toEqual([expect.objectContaining({ type: "wait", period: P1 })]);
    expect(r.waiting.map((w) => w.period.label)).toEqual(["P1"]);
    expect(r.reminders.map((x) => x.date)).toEqual(["2026-10-27"]);
    expect(r.actions[0]!.type === "wait" && r.actions[0]!.message).toContain("LinkedIn → Analytics → Content → Individuell 12 Oct–25 Oct → Export");
  });
  it("29 Oct (Thursday): a second reminder; 28 Oct none", () => {
    expect(plan("2026-10-29T06:00:00Z").reminders.map((x) => x.date)).toEqual(["2026-10-29"]);
    expect(plan("2026-10-28T06:00:00Z").reminders).toEqual([]);
  });
  it("30 Oct (Friday) 07:00, still no export: a partial deadline run; before 07:00 still waiting", () => {
    expect(plan("2026-10-30T06:00:00Z").actions).toEqual([{ type: "deadline", period: P1 }]);
    expect(plan("2026-10-30T05:30:00Z").actions[0]!.type).toBe("wait");
  });
  it("after the deadline run nothing more runs until the export arrives; the partial run stays", () => {
    const runs: SRun[] = [{ id: "d", period_id: "p1", status: "needs_attention", due_kind: "deadline", retryable: null, created_at: "2026-10-30T06:00:00Z" }];
    expect(plan("2026-10-31T06:00:00Z", runs).actions).toEqual([]);
    // 31 Oct upload measures P1 completely (a new run); the deadline run is still in the list and P1 now counts as measured
    const after = plan("2026-11-01T06:00:00Z", runs, ["p1"], ["p1"]);
    expect(after.statuses.find((s) => s.period.id === "p1")!.status).toBe("measured");
    expect(runs).toHaveLength(1);
  });
  it("export present: measured with trigger schedule", () => {
    expect(plan("2026-10-27T06:00:00Z", [], ["p1"]).actions).toEqual([{ type: "measure", period: P1, attempt: 1, giveUpOnFail: false }]);
  });
  it("a run failing 4 mornings in a row is retried 3 times, then left failed with needs_attention", () => {
    const runs: SRun[] = [];
    let tries = 0;
    for (const d of ["27", "28", "29", "30", "31"]) {
      const now = `2026-10-${d}T06:00:00Z`;
      for (const a of plan(now, runs, ["p1"]).actions) if (a.type === "measure") {
        tries++;
        runs.push({ id: d, period_id: "p1", status: a.giveUpOnFail ? "needs_attention" : "failed", due_kind: a.giveUpOnFail ? "gave_up" : "scheduled", retryable: true, created_at: now });
      }
    }
    expect(tries - 1).toBe(3);
    expect(runs.at(-1)).toMatchObject({ status: "needs_attention", due_kind: "gave_up" });
    expect(plan("2026-11-01T06:00:00Z", runs, ["p1"]).statuses.find((s) => s.period.id === "p1")!.status).toBe("failed");
  });
  it("a rejected file goes to needs_attention at once and is not retried", () => {
    const runs: SRun[] = [{ id: "x", period_id: "p1", status: "needs_attention", due_kind: "scheduled", retryable: false, created_at: "2026-10-27T06:00:00Z" }];
    const r = plan("2026-10-28T06:00:00Z", runs, ["p1"]);
    expect(r.actions).toEqual([]);
    expect(r.statuses.find((s) => s.period.id === "p1")!.status).toBe("needs attention");
  });
  it("a missed day: two closed periods without runs are both processed, oldest first; baseline is never touched", () => {
    const r = plan("2026-11-10T06:00:00Z", [], ["p1", "p2"]);
    expect(r.actions.map((a) => a.period.label)).toEqual(["P1", "P2"]);
  });
  it("next due is the next period's Tuesday at 07:00 Vienna", () => {
    expect(plan("2026-10-12T14:00:00Z").nextDue).toEqual({ period: P1, at: "2026-10-27T06:00:00.000Z" });
  });
  it("run age turns amber after 16 days and red after 21", () => {
    const now = at("2026-11-30T12:00:00Z");
    expect(runAgeLevel("2026-11-15T12:00:00Z", now)).toBe("ok");
    expect(runAgeLevel("2026-11-13T11:00:00Z", now)).toBe("warn");
    expect(runAgeLevel("2026-11-08T11:00:00Z", now)).toBe("bad");
  });
  it("warns 60 days before a sunset date and 14 days before a token expires", () => {
    const now = at("2026-10-12T12:00:00Z");
    expect(integrationWarnings({ version_sunset_date: null, token_expires_at: null }, now)).toEqual([]);
    expect(integrationWarnings({ version_sunset_date: "2026-12-10", token_expires_at: "2026-10-25T12:00:00Z" }, now)).toHaveLength(2);
    expect(integrationWarnings({ version_sunset_date: "2026-12-12", token_expires_at: "2026-10-27T12:00:00Z" }, now)).toEqual([]);
  });
});
