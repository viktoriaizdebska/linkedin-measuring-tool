// One Lovable AI call per run that gets only the computed KPI numbers. Output is validated; on any problem no summary is saved.
export const SUMMARY_MODEL = "openai/gpt-6-astra";
export const PROMPT_VERSION = "1";

export type SummaryInput = {
  period: { label: string; start_date: string; end_date: string; days: number; partial: boolean };
  kpis: { kpi_key: string; name: string; kind: string; value: number; vs_previous: number | null; vs_28_days: number | null; vs_12_weeks: number | null; vs_baseline: number | null; change_vs_previous: number | null; change_vs_baseline: number | null; change_vs_baseline_pct: number | null; note: string | null }[];
  reference_numbers: number[];
};
export type Summary = { headline: string; findings: { kpi_key: string; text: string }[]; flags: string[] };

const schema = {
  type: "object", additionalProperties: false, required: ["headline", "findings", "flags"],
  properties: {
    headline: { type: "string" },
    findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["kpi_key", "text"], properties: { kpi_key: { type: "string" }, text: { type: "string" } } } },
    flags: { type: "array", items: { type: "string" } },
  },
};
const INSTRUCTIONS = `You summarise one LinkedIn measurement period for the account owner, in calm, plain English.
Use only numbers that appear in the input JSON, exactly or rounded; never calculate, estimate or invent another number.
Return a headline, 3 to 5 findings (each names the kpi_key it is about, taken from the input) and flags (caveats such as partial data or missing sources; may be empty).`;

/** Collects every number that may legitimately appear in the summary. */
export function inputNumbers(input: SummaryInput): number[] {
  const out: number[] = [...input.reference_numbers, input.period.days];
  // Every number written anywhere in the input (values, labels, names, notes, dates) counts as given.
  for (const m of JSON.stringify(input).matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  for (const k of input.kpis) for (const v of [k.value, k.vs_previous, k.vs_28_days, k.vs_12_weeks, k.vs_baseline, k.change_vs_previous, k.change_vs_baseline, k.change_vs_baseline_pct]) if (v != null) out.push(v, Math.abs(v));
  return out;
}
export let lastRejection = "";
export function validateSummary(raw: unknown, input: SummaryInput): Summary | null {
  lastRejection = "structure";
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Summary;
  if (typeof s.headline !== "string" || !Array.isArray(s.findings) || !Array.isArray(s.flags)) return null;
  if (Object.keys(s).sort().join() !== "findings,flags,headline") return null;
  if (s.findings.length < 3 || s.findings.length > 5) return null;
  const keys = new Set(input.kpis.map((k) => k.kpi_key));
  if (s.findings.some((f) => !f || typeof f.text !== "string" || typeof f.kpi_key !== "string" || !keys.has(f.kpi_key))) return null;
  if (s.flags.some((f) => typeof f !== "string")) return null;
  const allowed = inputNumbers(input);
  const text = [s.headline, ...s.findings.map((f) => f.text), ...s.flags].join(" ");
  for (const m of text.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    const dec = (m[0].split(".")[1] ?? "").length;
    const tol = 0.5 * 10 ** -dec + 1e-9;
    if (!allowed.some((v) => Math.abs(v - n) <= tol)) { lastRejection = `number ${m[0]} is not in the input`; return null; }
  }
  return s;
}

export async function summarize(input: SummaryInput): Promise<{ summary: Summary | null; tokens: number | null; note: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { summary: null, tokens: null, note: "AI key missing; no summary." };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: SUMMARY_MODEL, instructions: INSTRUCTIONS, stream: true, store: false,
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] }],
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "period_summary", strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    return { summary: null, tokens: null, note: `AI call failed (${res.status}): ${body.slice(0, 200)}` };
  }
  let text = "", tokens: number | null = null, buf = "";
  const reader = res.body.getReader(), dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        if (ev.type === "response.completed") tokens = ev.response?.usage?.total_tokens ?? null;
        if (ev.type === "response.failed" || ev.type === "error") return { summary: null, tokens, note: "AI call failed; no summary." };
      } catch { /* partial frame */ }
    }
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { summary: null, tokens, note: "AI output was not JSON; no summary saved." }; }
  const summary = validateSummary(parsed, input);
  return { summary, tokens, note: summary ? "Summary saved." : `AI output rejected (${lastRejection}); no summary saved.` };
}
