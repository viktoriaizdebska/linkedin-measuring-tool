// Server-only writers for Step 7: config/benchmark CSV imports, calendar sync, meeting review and post tags.
// Measurement rows are written only through logEntry → measure-period; posts only get tag-column updates.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kindFromFilename, parseConfig, type ConfigKind } from "./imports/config-csv";
import { meetingCandidates, SYNC_FROM, type CalEvent } from "./calendar-rule";
import { aiJson } from "./ai-json.server";
import { logEntry } from "./linkedin/pipeline.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const CALENDAR_ID = "viktoria@izdebska.com";
const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

// ---------- CSV imports ----------
export async function importConfigCsv(db: DB, file: { filename: string; text: string; only?: ConfigKind; testRollback?: boolean }) {
  const kind = file.only ?? kindFromFilename(file.filename);
  if (!kind) return { status: "rejected", reason: "Unknown file; expected one of the benchmark or plan CSVs." };
  const hash = sha(`${kind}\n${file.text}`);
  const seen = (await db.from("raw_imports").select("id,status").eq("sha256", hash).maybeSingle()).data;
  if (seen && seen.status !== "received") return { status: "already processed", reason: "This file was imported before; nothing changed." };
  if (file.testRollback) { const p = await parseChecked(db, kind, file.text); if (p.errors.length) return { status: "rejected", reason: p.errors.slice(0, 3).join(" ") }; }
  let rid = seen?.id as string | undefined;
  if (!rid) {
    const r = await db.rpc("register_raw_import", { p_source: "benchmark_csv", p_path: null, p_sha: hash, p_from: "upload", p_hint: kind, p_payload: { filename: file.filename, kind, text: file.text } });
    if (r.error) throw new Error(r.error.message);
    rid = r.data as string;
  }
  return commitConfigText(db, kind, rid, file.text, !!file.testRollback);
}

async function parseChecked(db: DB, kind: ConfigKind, text: string) {
  const known = kind === "benchmark_observations" ? new Set(((await db.from("benchmark_profiles").select("key")).data ?? []).map((r) => r.key as string)) : undefined;
  return parseConfig(kind, text, known);
}

// Shared check + write path for manual uploads and the Drive collector. Any failing row → nothing written, raw import rejected.
export async function commitConfigText(db: DB, kind: ConfigKind, rid: string, text: string, testRollback = false) {
  const parsed = await parseChecked(db, kind, text);
  if (parsed.errors.length) {
    const reason = parsed.errors.slice(0, 3).join(" ") + (parsed.errors.length > 3 ? ` (+${parsed.errors.length - 3} more)` : "");
    if (!testRollback) await db.from("raw_imports").update({ status: "rejected", status_reason: reason }).eq("id", rid);
    return { status: "rejected", reason, written: 0 };
  }
  const c = await db.rpc("commit_config_import", { payload: { kind, raw_import_id: rid, rows: parsed.rows, test_rollback: testRollback } });
  if (c.error) return { status: "failed", reason: c.error.message, written: 0 };
  const n = Number(c.data);
  if (n === 0 && kind === "benchmark_observations") return { status: "already imported", reason: "Every row already exists; nothing written.", written: 0 };
  return { status: "succeeded", reason: `${n} rows imported into ${kind.replace(/_/g, " ")}.`, written: n };
}

// ---------- calendar ----------
const SUGGEST_SCHEMA = { type: "object", additionalProperties: false, required: ["type", "reason"], properties: { type: { type: "string", enum: ["investor", "rollup_operator", "founder", "other"] }, reason: { type: "string" } } };
async function suggestType(title: string, domains: string[]) {
  const r = await aiJson<{ type: string; reason: string }>("meeting_type",
    "Classify a meeting from its calendar title and the guests' email domains only. Types: investor (VC, PE, family office, fund), rollup_operator (runs or builds a rollup / buy-and-build company), founder, other. Give a one-sentence reason. This is only a suggestion for the owner to confirm.",
    { title, domains }, SUGGEST_SCHEMA);
  return r.value ?? { type: null, reason: `No suggestion (${r.note})` };
}

export function calendarConnected() { return !!process.env["GOOGLE_CALENDAR_API_KEY"] && !!process.env["LOVABLE_API_KEY"]; }

export async function calendarSync(db: DB, now = new Date()) {
  if (!calendarConnected()) return { status: "not connected", found: 0, added: 0 };
  const events: CalEvent[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ timeMin: `${SYNC_FROM}T00:00:00+02:00`, timeMax: now.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "2500", fields: "nextPageToken,items(id,summary,status,start,end,organizer(email,self),attendees(email,self,responseStatus,resource))" });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await fetch(`${GATEWAY}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${q}`, {
      headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key": process.env["GOOGLE_CALENDAR_API_KEY"]! },
    });
    if (!res.ok) {
      const body = await res.text();
      await db.from("integration_status").upsert({ provider: "google_calendar", status: `error ${res.status}` });
      return { status: "failed", reason: `Calendar request failed [${res.status}]: ${body.slice(0, 300)}`, found: 0, added: 0 };
    }
    const j = (await res.json()) as { items?: CalEvent[]; nextPageToken?: string };
    events.push(...(j.items ?? [])); pageToken = j.nextPageToken;
  } while (pageToken);
  const cands = meetingCandidates(events, now);
  const known = new Set(((await db.from("meeting_candidates").select("event_id")).data ?? []).map((r) => r.event_id as string));
  let added = 0;
  for (const c of cands) {
    if (known.has(c.event_id)) continue; // stored once; never changed automatically
    const s = await suggestType(c.title, c.domains);
    const r = await db.from("meeting_candidates").insert({ ...c, suggested_type: s.type, suggested_reason: s.reason });
    if (!r.error) added++;
  }
  await db.from("integration_status").upsert({ provider: "google_calendar", status: "ok", last_success_at: now.toISOString() });
  return { status: "succeeded", found: cands.length, added };
}

const PERSON: Record<string, string> = { investor: "investor", rollup_operator: "rollup_operator", founder: "founder", other: "other" };
export async function decideMeeting(db: DB, d: { event_id: string; decision: "confirm" | "drop"; type?: string | undefined; attribution?: string | undefined; post_urn?: string | null | undefined }) {
  const m = (await db.from("meeting_candidates").select("*").eq("event_id", d.event_id).maybeSingle()).data;
  if (!m) return { status: "rejected", reason: "Meeting not found." };
  if (m.status !== "pending") return { status: "rejected", reason: `This meeting is already ${m.status}.` };
  if (d.decision === "drop") {
    const r = await db.from("meeting_candidates").update({ status: "dropped", decided_at: new Date().toISOString() }).eq("event_id", d.event_id);
    return r.error ? { status: "failed", reason: r.error.message } : { status: "dropped" };
  }
  const dup = (await db.from("v_current_leads").select("id").eq("calendar_event_id", d.event_id).limit(1)).data;
  if (dup?.length) return { status: "rejected", reason: "This meeting is already logged as a lead." };
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna" }).format(new Date(m.start_at));
  const run = await logEntry(db, { entry_type: "lead", date, kind: "meeting", person_type: PERSON[d.type ?? "other"] ?? "other", attribution: d.attribution ?? "unknown", post_urn: d.post_urn ?? null, note: null, source: "google_calendar", calendar_event_id: d.event_id });
  if (run.status !== "succeeded" && run.status !== "partial") return { status: "failed", reason: run.reason ?? "The measurement run failed; the meeting stays pending." };
  const lead = (await db.from("v_current_leads").select("id").eq("calendar_event_id", d.event_id).limit(1)).data?.[0];
  await db.from("meeting_candidates").update({ status: "confirmed", confirmed_type: d.type, attribution: d.attribution, post_urn: d.post_urn ?? null, lead_id: lead?.id ?? null, decided_at: new Date().toISOString() }).eq("event_id", d.event_id);
  return { status: "confirmed", reason: run.reason };
}

// ---------- post tags ----------
const TAG_SCHEMA = {
  type: "object", additionalProperties: false, required: ["posts"],
  properties: { posts: { type: "array", items: { type: "object", additionalProperties: false, required: ["urn", "topic", "pillar", "concept", "named_person"], properties: {
    urn: { type: "string" }, topic: { type: "string", enum: ["core", "adjacent", "personal", "promo"] }, pillar: { type: "string", enum: ["buying", "running", "thesis", "none"] },
    concept: { type: "string" }, named_person: { type: "boolean" } } } } },
};
export async function suggestTags(db: DB) {
  const posts = ((await db.from("posts").select("urn,url,published_at").is("topic", null)).data ?? []) as { urn: string; url: string | null }[];
  if (!posts.length) return { suggestions: [] };
  const slug = (u: string | null) => (u ?? "").replace(/^https?:\/\/[^/]+\/(posts|feed\/update)\//, "").replace(/-(share|ugcPost|activity)-\d+.*$/, "").replace(/[_-]+/g, " ").slice(0, 200);
  const r = await aiJson<{ posts: { urn: string; topic: string; pillar: string; concept: string; named_person: boolean }[] }>("post_tags",
    "Suggest tags for LinkedIn posts by Viktoria Izdebska, who writes about distribution for AI rollups (buying and running AI-enabled rollups, the automation band thesis, the prediction economy). You only get each post's URL slug. topic: core (buying or running AI rollups), adjacent (related AI/business), personal, promo. pillar: buying, running, thesis or none. concept: a short free-text concept, e.g. 'automation band', 'prediction economy', or empty if unclear. named_person: true if the slug names a specific person. These are suggestions the owner confirms.",
    posts.map((p) => ({ urn: p.urn, slug: slug(p.url) })), TAG_SCHEMA);
  return { suggestions: r.value?.posts ?? [], note: r.note };
}
export async function saveTags(db: DB, t: { urn: string; topic: string; pillar: string; concept: string; named_person: boolean }) {
  const r = await db.from("posts").update({ topic: t.topic, pillar_key: t.pillar === "none" ? null : t.pillar, concept: t.concept.trim() || null, named_person: t.named_person }).eq("urn", t.urn);
  return r.error ? { status: "failed", reason: r.error.message } : { status: "saved" };
}
