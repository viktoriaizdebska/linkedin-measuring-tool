// Direct Postgres access with the small part of the Supabase query API this app uses
// (from/select/eq/in/is/not/like/match/order/range/limit/single/maybeSingle/insert/update/upsert/delete,
// rpc, and storage upload/download). It replaces Supabase so the existing queries keep working unchanged.
//
// The connection runs as the database role `service_role` (set on the login user, see db/prelude.sql),
// so the database functions' service-role checks and the immutability triggers apply exactly as before.
import postgres from "postgres";

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string; details?: string };
type Result = { data: any; error: DbError | null; count?: number | null };

let _sql: postgres.Sql | undefined;
export function sql(): postgres.Sql {
  if (_sql) return _sql;
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set.");
  _sql = postgres(url, {
    max: 5,
    connection: { TimeZone: "UTC", application_name: "measuring-tool" },
    // Match the JSON shapes the app got from Supabase: timestamps as ISO strings, numbers as numbers.
    types: {
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: unknown) => String(x),
        parse: (x: string) => x,
      },
      timestamp: {
        to: 1114,
        from: [1114],
        serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)),
        parse: (x: string) => x.replace(" ", "T"),
      },
      timestamptz: {
        to: 1184,
        from: [1184],
        serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)),
        parse: (x: string) => new Date(x).toISOString(),
      },
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (x: unknown) => String(x),
        parse: (x: string) => Number(x),
      },
      bigint: {
        to: 20,
        from: [20],
        serialize: (x: unknown) => String(x),
        parse: (x: string) => Number(x),
      },
    },
  });
  return _sql;
}

const ident = (name: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
};
const toError = (e: unknown): DbError => {
  const err = e as { message?: string; code?: string; detail?: string };
  return {
    message: err?.message ?? String(e),
    ...(err?.code ? { code: err.code } : {}),
    ...(err?.detail ? { details: err.detail } : {}),
  };
};

const pkCache = new Map<string, string[]>();
async function primaryKey(table: string): Promise<string[]> {
  const hit = pkCache.get(table);
  if (hit) return hit;
  const rows = await sql().unsafe(
    `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
     where i.indrelid = $1::regclass and i.indisprimary`,
    [`public.${ident(table)}`],
  );
  const cols = rows.map((r) => String(r["attname"]));
  pkCache.set(table, cols);
  return cols;
}

type Filter = { sql: string; values: unknown[] };

class Query implements PromiseLike<Result> {
  private action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private payload: Row[] = [];
  private filters: Filter[] = [];
  private orders: string[] = [];
  private lim: number | null = null;
  private off: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private countMode: { head: boolean } | null = null;
  private onConflict: string | null = null;
  private ignoreDuplicates = false;

  constructor(private table: string) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    const c = cols.replace(/\s+/g, "");
    if (this.action === "select") this.columns = c || "*";
    else this.returning = c || "*";
    if (opts?.count) this.countMode = { head: !!opts.head };
    return this;
  }
  insert(values: Row | Row[]) {
    this.action = "insert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }
  upsert(values: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.action = "upsert";
    this.payload = Array.isArray(values) ? values : [values];
    this.onConflict = opts?.onConflict ?? null;
    this.ignoreDuplicates = !!opts?.ignoreDuplicates;
    return this;
  }
  update(values: Row) {
    this.action = "update";
    this.payload = [values];
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }

  private where(fragment: string, ...values: unknown[]) {
    this.filters.push({ sql: fragment, values });
    return this;
  }
  eq(col: string, v: unknown) {
    return v === null ? this.where(`${ident(col)} is null`) : this.where(`${ident(col)} = $?`, v);
  }
  neq(col: string, v: unknown) {
    return this.where(`${ident(col)} <> $?`, v);
  }
  gt(col: string, v: unknown) {
    return this.where(`${ident(col)} > $?`, v);
  }
  gte(col: string, v: unknown) {
    return this.where(`${ident(col)} >= $?`, v);
  }
  lt(col: string, v: unknown) {
    return this.where(`${ident(col)} < $?`, v);
  }
  lte(col: string, v: unknown) {
    return this.where(`${ident(col)} <= $?`, v);
  }
  like(col: string, pattern: string) {
    return this.where(`${ident(col)} like $?`, pattern);
  }
  in(col: string, values: unknown[]) {
    if (!values.length) return this.where("false");
    return this.where(`${ident(col)} in (${values.map(() => "$?").join(", ")})`, ...values);
  }
  is(col: string, v: null | boolean) {
    return this.where(`${ident(col)} is ${v === null ? "null" : v ? "true" : "false"}`);
  }
  not(col: string, op: string, v: unknown) {
    if (op === "is")
      return this.where(`${ident(col)} is not ${v === null ? "null" : v ? "true" : "false"}`);
    if (op === "eq") return this.where(`${ident(col)} <> $?`, v);
    throw new Error(`Unsupported not() operator: ${op}`);
  }
  match(obj: Row) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const dir = opts?.ascending === false ? "desc" : "asc";
    const nulls =
      opts?.nullsFirst === undefined ? "" : opts.nullsFirst ? " nulls first" : " nulls last";
    this.orders.push(`${ident(col)} ${dir}${nulls}`);
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(from: number, to: number) {
    this.off = from;
    this.lim = to - from + 1;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  private cols(spec: string) {
    return spec === "*" ? "*" : spec.split(",").map(ident).join(", ");
  }

  private build(): { text: string; values: unknown[] } {
    const values: unknown[] = [];
    const bind = (fragment: string, vals: unknown[]) => {
      let i = 0;
      return fragment.replace(/\$\?/g, () => {
        values.push(vals[i++]);
        return `$${values.length}`;
      });
    };
    const whereSql = () =>
      this.filters.length
        ? " where " + this.filters.map((f) => bind(f.sql, f.values)).join(" and ")
        : "";
    const t = `public.${ident(this.table)}`;
    const ret = this.returning ? ` returning ${this.cols(this.returning)}` : "";
    if (this.action === "select") {
      let text = `select ${this.cols(this.columns)} from ${t}${whereSql()}`;
      if (this.orders.length) text += ` order by ${this.orders.join(", ")}`;
      if (this.lim !== null) text += ` limit ${Math.max(0, Math.floor(this.lim))}`;
      if (this.off !== null) text += ` offset ${Math.max(0, Math.floor(this.off))}`;
      return { text, values };
    }
    if (this.action === "delete") return { text: `delete from ${t}${whereSql()}${ret}`, values };
    if (this.action === "update") {
      const entries = Object.entries(this.payload[0] ?? {});
      const sets = entries
        .map(([k, v]) => {
          values.push(v);
          return `${ident(k)} = $${values.length}`;
        })
        .join(", ");
      return { text: `update ${t} set ${sets}${whereSql()}${ret}`, values };
    }
    const keys = [...new Set(this.payload.flatMap((r) => Object.keys(r)))];
    const rows = this.payload.map(
      (r) =>
        "(" +
        keys
          .map((k) => {
            values.push(k in r ? r[k] : null);
            return `$${values.length}`;
          })
          .join(", ") +
        ")",
    );
    let text = `insert into ${t} (${keys.map(ident).join(", ")}) values ${rows.join(", ")}`;
    if (this.action === "upsert") text += "__CONFLICT__";
    return { text: text + ret, values };
  }

  private async run(): Promise<Result> {
    try {
      const db = sql();
      let { text, values } = this.build();
      if (this.action === "upsert") {
        const target = this.onConflict
          ? this.onConflict.split(",").map((c) => c.trim())
          : await primaryKey(this.table);
        const keys = [...new Set(this.payload.flatMap((r) => Object.keys(r)))].filter(
          (k) => !target.includes(k),
        );
        const clause =
          this.ignoreDuplicates || !keys.length
            ? ` on conflict (${target.map(ident).join(", ")}) do nothing`
            : ` on conflict (${target.map(ident).join(", ")}) do update set ${keys.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ")}`;
        text = text.replace("__CONFLICT__", clause);
      }
      if (this.countMode) {
        const filtersOnly = this.filters.length
          ? text.slice(text.indexOf(" where ")).replace(/ order by .*$| limit .*$| offset .*$/, "")
          : "";
        const c = await db.unsafe(
          `select count(*)::int as n from public.${ident(this.table)}${filtersOnly}`,
          values as never[],
        );
        const count = Number(c[0]?.["n"] ?? 0);
        if (this.countMode.head) return { data: null, error: null, count };
        const rows = [...(await db.unsafe(text, values as never[]))];
        return { data: rows, error: null, count };
      }
      const rows = [...(await db.unsafe(text, values as never[]))] as Row[];
      const wantsRows = this.action === "select" || this.returning !== null;
      if (!wantsRows) return { data: null, error: null };
      if (this.mode === "single") {
        if (rows.length !== 1)
          return {
            data: null,
            error: { message: `Expected one row, got ${rows.length}.`, code: "PGRST116" },
          };
        return { data: rows[0], error: null };
      }
      if (this.mode === "maybe") {
        if (rows.length > 1)
          return {
            data: null,
            error: { message: `Expected at most one row, got ${rows.length}.`, code: "PGRST116" },
          };
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    } catch (e) {
      return { data: null, error: toError(e) };
    }
  }

  then<A = Result, B = never>(
    onOk?: ((v: Result) => A | PromiseLike<A>) | null,
    onErr?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.run().then(onOk, onErr);
  }
}

const fnCache = new Map<string, { set: boolean; composite: boolean }>();
async function rpc(fn: string, args: Row = {}): Promise<Result> {
  try {
    const db = sql();
    let shape = fnCache.get(fn);
    if (!shape) {
      const r = await db.unsafe(
        `select p.proretset as set, t.typtype as typ from pg_proc p join pg_type t on t.oid = p.prorettype
         where p.proname = $1 and p.pronamespace = 'public'::regnamespace limit 1`,
        [fn],
      );
      if (!r[0])
        return { data: null, error: { message: `Function ${fn} not found.`, code: "PGRST202" } };
      shape = { set: !!r[0]["set"], composite: r[0]["typ"] === "c" };
      fnCache.set(fn, shape);
    }
    const entries = Object.entries(args);
    const params = entries.map(([k], i) => `${ident(k)} => $${i + 1}`).join(", ");
    const values = entries.map(([, v]) =>
      v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)
        ? db.json(v as never)
        : v,
    );
    if (shape.set || shape.composite) {
      const rows = [
        ...(await db.unsafe(`select * from public.${ident(fn)}(${params})`, values as never[])),
      ];
      return { data: shape.set ? rows : (rows[0] ?? null), error: null };
    }
    const rows = await db.unsafe(`select public.${ident(fn)}(${params}) as r`, values as never[]);
    return { data: rows[0]?.["r"] ?? null, error: null };
  } catch (e) {
    return { data: null, error: toError(e) };
  }
}

// Files the app used to keep in Supabase Storage now live in public.stored_files (see migration 0012).
function storage(bucket: string) {
  return {
    async upload(
      path: string,
      bytes: Uint8Array | ArrayBuffer | Blob | string,
      opts?: { contentType?: string; upsert?: boolean },
    ) {
      try {
        const buf =
          typeof bytes === "string"
            ? Buffer.from(bytes)
            : bytes instanceof Blob
              ? Buffer.from(await bytes.arrayBuffer())
              : Buffer.from(bytes as ArrayBuffer);
        const db = sql();
        const conflict = opts?.upsert
          ? "on conflict (bucket, path) do update set bytes = excluded.bytes, content_type = excluded.content_type"
          : "";
        await db.unsafe(
          `insert into public.stored_files (bucket, path, content_type, bytes) values ($1, $2, $3, $4) ${conflict}`,
          [bucket, path, opts?.contentType ?? "application/octet-stream", buf] as never[],
        );
        return { data: { path }, error: null };
      } catch (e) {
        const err = toError(e);
        return {
          data: null,
          error: err.code === "23505" ? { ...err, message: "The resource already exists" } : err,
        };
      }
    },
    async download(path: string) {
      try {
        const rows = await sql().unsafe(
          `select bytes, content_type from public.stored_files where bucket = $1 and path = $2`,
          [bucket, path],
        );
        if (!rows[0]) return { data: null, error: { message: "Object not found" } };
        return {
          data: new Blob([new Uint8Array(rows[0]["bytes"] as Buffer)], {
            type: String(rows[0]["content_type"]),
          }),
          error: null,
        };
      } catch (e) {
        return { data: null, error: toError(e) };
      }
    },
  };
}

export function createDbClient() {
  return {
    from: (table: string) => new Query(table),
    rpc: (fn: string, args?: Row) => rpc(fn, args),
    storage: { from: storage },
  };
}

export type DbClient = ReturnType<typeof createDbClient>;
export const db: DbClient = createDbClient();
