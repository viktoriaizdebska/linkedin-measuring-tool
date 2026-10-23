// Collector "benchmark-drive": reads benchmark_snapshot_YYYY-MM-DD.csv files directly in one Drive folder (read-only: list + download only)
// and sends each new file through the same checks and write path as the manual benchmark upload.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSnapshotName } from "./imports/config-csv";
import { commitConfigText } from "./diagnosis-io.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;
export const DRIVE_FOLDER_ID = "1XUNWTgB03ZMjhQeoZxKOYXMDBq_4Dwey";
const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const WORKFLOW = "benchmark-drive-1";
const BUCKET = "raw-imports";

export function driveConnected() { return !!process.env["GOOGLE_DRIVE_API_KEY"] && !!process.env["LOVABLE_API_KEY"]; }
const headers = () => ({ Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key": process.env["GOOGLE_DRIVE_API_KEY"]! });

type DriveFile = { id: string; name: string; mimeType: string };
export type FileOutcome = { name: string; status: "imported" | "already imported" | "already seen" | "rejected" | "failed"; reason?: string; written?: number };

export async function driveSync(db: DB, trigger: "schedule" | "manual", now = new Date()) {
  if (!driveConnected()) return { status: "not connected" };
  const started = now.toISOString();
  const prior = (await db.from("agent_runs").select("attempt").eq("workflow_version", WORKFLOW).order("attempt", { ascending: false }).limit(1)).data?.[0];
  const run = (await db.from("agent_runs").insert({ trigger, input_key: `benchmark-drive:${started}`, status: "running", workflow_version: WORKFLOW, started_at: started, attempt: (prior?.attempt ?? 0) + 1 }).select("id").single()).data!;
  const step = (name: string, status: string, message: string | null, details?: unknown) =>
    db.from("run_steps").insert({ run_id: run.id, step: name, status, started_at: started, finished_at: new Date().toISOString(), message, details: details ?? null });
  const finish = async (status: string, summary: string, read: number, written: number, errors: number) => {
    const end = new Date();
    await db.from("agent_runs").update({ status, finished_at: end.toISOString(), duration_ms: end.getTime() - now.getTime(), records_read: read, records_written: written, error_count: errors, changes_summary: summary }).eq("id", run.id);
  };

  // 1. List the folder (direct children only, not trashed, no subfolders).
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`, fields: "nextPageToken,files(id,name,mimeType)", pageSize: "1000", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await fetch(`${GATEWAY}/files?${q}`, { headers: headers() });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      await step("list folder", "failed", `Drive request failed [${res.status}]: ${body}`);
      await db.from("integration_status").upsert({ provider: "google_drive", status: `error ${res.status}` });
      await finish("failed", `Drive folder could not be read [${res.status}]`, 0, 0, 1);
      return { status: "failed", reason: `Drive request failed [${res.status}]: ${body}` };
    }
    const j = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    all.push(...(j.files ?? [])); pageToken = j.nextPageToken;
  } while (pageToken);
  const files = all.filter((f) => f.mimeType !== "application/vnd.google-apps.folder" && isSnapshotName(f.name));
  await step("list folder", "succeeded", `${files.length} matching files, ${all.length - files.length} ignored`, { matching: files.map((f) => f.name), ignored: all.length - files.length });

  // 2. Each file: download, hash, store unchanged, register, then the shared checks + write path.
  const out: FileOutcome[] = [];
  for (const f of files) {
    try {
      const res = await fetch(`${GATEWAY}/files/${encodeURIComponent(f.id)}?alt=media`, { headers: headers() });
      if (!res.ok) { out.push({ name: f.name, status: "failed", reason: `Download failed [${res.status}]: ${(await res.text()).slice(0, 200)}` }); continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const hash = createHash("sha256").update(bytes).digest("hex");
      const seen = (await db.from("raw_imports").select("id,status").eq("sha256", hash).maybeSingle()).data;
      if (seen && seen.status !== "received") { out.push({ name: f.name, status: "already seen", reason: `Seen before (${seen.status}).` }); continue; }
      let rid = seen?.id as string | undefined;
      if (!rid) {
        const path = `benchmark_drive/${f.id}/${hash}.csv`;
        const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "text/csv", upsert: false });
        if (up.error && !/exists/i.test(up.error.message)) throw new Error(`Storage: ${up.error.message}`);
        const r = await db.rpc("register_raw_import", { p_source: "benchmark_drive", p_path: `${BUCKET}/${path}`, p_sha: hash, p_from: "drive", p_hint: "benchmark_observations", p_payload: { filename: f.name, kind: "benchmark_observations", drive_file_id: f.id } });
        if (r.error) throw new Error(r.error.message);
        rid = r.data as string;
        await db.from("raw_imports").update({ drive_file_id: f.id, drive_file_name: f.name }).eq("id", rid);
      }
      const c = await commitConfigText(db, "benchmark_observations", rid, new TextDecoder().decode(bytes));
      const status = c.status === "succeeded" ? "imported" : (c.status as FileOutcome["status"]);
      out.push({ name: f.name, status, reason: c.reason, written: c.written });
    } catch (e) {
      out.push({ name: f.name, status: "failed", reason: e instanceof Error ? e.message : String(e) });
    }
  }
  const count = (s: FileOutcome["status"][]) => out.filter((o) => s.includes(o.status)).length;
  const counts = { found: files.length, imported: count(["imported"]), skipped: count(["already imported", "already seen"]), rejected: count(["rejected", "failed"]) };
  const written = out.reduce((s, o) => s + (o.written ?? 0), 0);
  await step("import files", counts.rejected ? "failed" : "succeeded", `${counts.imported} imported, ${counts.skipped} skipped, ${counts.rejected} rejected`, { counts, files: out });
  await db.from("integration_status").upsert({ provider: "google_drive", status: "ok", last_success_at: new Date().toISOString() });
  await finish(counts.rejected ? "needs_attention" : "succeeded", `${counts.found} found · ${counts.imported} imported · ${counts.skipped} skipped · ${counts.rejected} rejected`, files.length, written, counts.rejected);
  return { status: counts.rejected ? "needs attention" : "succeeded", ...counts, written, files: out };
}
