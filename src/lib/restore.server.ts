// One-time restore of the data exported from Lovable into an EMPTY database.
// Refuses to run once any measurement data exists, so it can never overwrite or mix with live history.
// Everything happens in one transaction: either all rows and files land and every check passes, or nothing does.
import { createHash } from "node:crypto";
import { sql } from "@/integrations/db/client.server";

export type RestoreBundle = {
  format: "lovable-export-v1";
  owner_user_id: string;
  owner_email: string;
  counts: Record<string, number>;
  tables: Record<string, string[]>; // each row exactly as Postgres' to_jsonb(row)::text produced it in Lovable
  files: { path: string; content_type: string; sha256: string; base64: string }[];
  files_not_migrated?: string[];
};

export type RestoreReport = {
  ok: boolean;
  message: string;
  tables: { table: string; expected: number; restored: number; checksumMatches: boolean }[];
  files: { path: string; sha256Matches: boolean }[];
  filesNotMigrated: string[];
  alwaysOnTriggers: number;
  setupRowsKept: string[];
};

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const tableChecksum = (rows: string[]) => sha([...rows].sort().join("\n"));

export async function databaseIsEmpty(): Promise<boolean> {
  const [r] = await sql()`select (select count(*) from public.periods)::int as periods, (select count(*) from public.snapshots)::int as snaps`;
  return r?.["periods"] === 0 && r?.["snaps"] === 0;
}

export async function restoreBundle(bundle: RestoreBundle): Promise<RestoreReport> {
  if (bundle.format !== "lovable-export-v1") throw new Error("This is not a Lovable export bundle.");
  for (const [t, rows] of Object.entries(bundle.tables)) {
    if (bundle.counts[t] !== rows.length) throw new Error(`Bundle is incomplete: ${t} has ${rows.length} rows, expected ${bundle.counts[t]}.`);
  }
  if (!(await databaseIsEmpty())) throw new Error("The database already holds data. Restore only runs on an empty database.");

  return await sql().begin(async (tx) => {
    await tx`set local role none`; // the owner loads the data; triggers stay on and still block any update/delete
    await tx`delete from auth.single_user`;
    await tx`insert into auth.single_user (id, email) values (${bundle.owner_user_id}, ${bundle.owner_email})`;

    // Load parent tables before child tables (foreign keys). A few catalog rows (sources) are already created by the migrations:
    // "on conflict do nothing" keeps those, and the checksum below proves they equal the exported rows.
    const fks = await tx`select conrelid::regclass::text as child, confrelid::regclass::text as parent from pg_constraint
                         where contype = 'f' and connamespace = 'public'::regnamespace and conrelid <> confrelid`;
    const strip = (n: string) => n.replace(/^public\./, "");
    const names = Object.keys(bundle.tables);
    const deps = new Map(names.map((n) => [n, new Set<string>()]));
    for (const fk of fks) {
      const c = strip(String(fk["child"])), p = strip(String(fk["parent"]));
      if (deps.has(c) && deps.has(p)) deps.get(c)!.add(p);
    }
    const order: string[] = [];
    const visit = (n: string, seen: Set<string>) => {
      if (order.includes(n)) return;
      if (seen.has(n)) throw new Error(`Circular table dependency at ${n}`);
      seen.add(n);
      for (const p of deps.get(n) ?? []) visit(p, seen);
      order.push(n);
    };
    for (const n of names) visit(n, new Set());

    // Rows the migrations already created (3 catalog rows in sources). They are protected history, so they stay as they are;
    // the check below accepts them only if they equal the exported row in everything except created_at.
    const before = new Map<string, string[]>();
    for (const t of names) before.set(t, (await tx.unsafe(`select to_jsonb(x)::text as r from public."${t}" x`)).map((r) => String(r["r"])));

    for (const t of order) {
      let rows = bundle.tables[t] ?? [];
      if (!rows.length) continue;
      if (t === "snapshots") {
        // snapshots can point at an earlier snapshot they supersede: insert those first
        const parsed = rows.map((r) => ({ r, o: JSON.parse(r) as { id: string; supersedes_id: string | null } }));
        const done = new Set<string>(), sorted: string[] = [];
        while (sorted.length < parsed.length) {
          const before = sorted.length;
          for (const p of parsed) if (!done.has(p.o.id) && (!p.o.supersedes_id || done.has(p.o.supersedes_id))) { done.add(p.o.id); sorted.push(p.r); }
          if (sorted.length === before) throw new Error("Could not order snapshots by supersedes_id.");
        }
        rows = sorted;
      }
      await tx.unsafe(`insert into public."${t}" select * from jsonb_populate_recordset(null::public."${t}", $1::text::jsonb) on conflict do nothing`, [`[${rows.join(",")}]`]);
    }

    for (const f of bundle.files) {
      const bytes = Buffer.from(f.base64, "base64");
      if (sha(bytes) !== f.sha256) throw new Error(`File ${f.path} does not match its fingerprint.`);
      await tx`insert into public.stored_files (bucket, path, content_type, bytes) values ('raw-imports', ${f.path}, ${f.content_type}, ${bytes})`;
    }

    // Checks, inside the same transaction: any mismatch rolls everything back.
    const tables: RestoreReport["tables"] = [];
    const setupRowsKept: string[] = [];
    const withoutCreatedAt = (r: string) => { const o = JSON.parse(r) as Record<string, unknown>; delete o["created_at"]; return JSON.stringify(o, Object.keys(o).sort()); };
    for (const t of names) {
      const got = (await tx.unsafe(`select to_jsonb(x)::text as r from public."${t}" x`)).map((r) => String(r["r"]));
      const expected = [...(bundle.tables[t] ?? [])];
      for (const kept of before.get(t) ?? []) {
        const i = expected.findIndex((e) => withoutCreatedAt(e) === withoutCreatedAt(kept));
        if (i >= 0 && expected[i] !== kept) { expected[i] = kept; setupRowsKept.push(`${t}: ${String((JSON.parse(kept) as Record<string, unknown>)["key"] ?? "")}`); }
      }
      tables.push({ table: t, expected: bundle.counts[t] ?? 0, restored: got.length, checksumMatches: tableChecksum(got) === tableChecksum(expected) });
    }
    const raws = await tx`select storage_path, sha256 from public.raw_imports where storage_path is not null`;
    const stored = await tx`select path, bytes from public.stored_files where bucket = 'raw-imports'`;
    const files = stored.map((s) => {
      const path = String(s["path"]);
      const raw = raws.find((r) => String(r["storage_path"]).replace(/^raw-imports\//, "") === path);
      return { path, sha256Matches: !!raw && sha(s["bytes"] as Buffer) === String(raw["sha256"]) };
    });
    const [trig] = await tx`select count(*)::int as n from pg_trigger t join pg_class c on c.oid = t.tgrelid
                            where not t.tgisinternal and t.tgenabled = 'A' and c.relnamespace = 'public'::regnamespace`;
    const report: RestoreReport = {
      ok: tables.every((x) => x.expected === x.restored && x.checksumMatches) && files.every((x) => x.sha256Matches),
      message: "",
      tables,
      files,
      filesNotMigrated: bundle.files_not_migrated ?? [],
      alwaysOnTriggers: Number(trig?.["n"] ?? 0),
      setupRowsKept,
    };
    if (!report.ok) {
      const bad = [...tables.filter((x) => x.expected !== x.restored || !x.checksumMatches).map((x) => x.table), ...files.filter((x) => !x.sha256Matches).map((x) => x.path)];
      throw new Error(`Restore checks failed, nothing was saved: ${bad.join(", ")}`);
    }
    report.message = `Restored ${tables.reduce((s, x) => s + x.restored, 0)} rows in ${tables.length} tables and ${files.length} files. Every table matches its checksum.`;
    return report;
  });
}
