// One streamed Lovable AI call with strict JSON-schema output. Used only for suggestions the user confirms (meeting type, post tags).
export const SUGGEST_MODEL = "openai/gpt-6-astra";

export async function aiJson<T>(name: string, instructions: string, input: unknown, schema: Record<string, unknown>): Promise<{ value: T | null; note: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { value: null, note: "AI key missing." };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: SUGGEST_MODEL, instructions, stream: true, store: false, reasoning: { effort: "low" },
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] }],
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) return { value: null, note: `AI call failed (${res.status}).` };
  let text = "", buf = "";
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
        if (ev.type === "response.failed" || ev.type === "error") return { value: null, note: "AI call failed." };
      } catch { /* partial frame */ }
    }
  }
  try { return { value: JSON.parse(text) as T, note: "ok" }; } catch { return { value: null, note: "AI output was not JSON." }; }
}
