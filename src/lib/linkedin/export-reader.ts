// Pure reader for LinkedIn AggregateAnalytics exports (German or English layout). No database access.
import { strFromU8, unzipSync } from "fflate";

export const PARSER_VERSION = "linkedin-export-xlsx-1";
export const TRANSFORM_VERSION = "1";

export class FormatError extends Error {
  constructor(public sheet: string, public expected: string) {
    super(`The export format changed: ${sheet}, ${expected}`);
  }
}

type Sheet = { name: string; rows: string[][] };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k[0] === "#") return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[k]!;
  });
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => decode(m[1] ?? "")).join("");
const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;

export function readXlsx(bytes: Uint8Array): Sheet[] {
  let zip: Record<string, Uint8Array>;
  try { zip = unzipSync(bytes); } catch { throw new FormatError("file", "an .xlsx workbook"); }
  const get = (p: string) => (zip[p] ? strFromU8(zip[p]!) : null);
  const wb = get("xl/workbook.xml"), rels = get("xl/_rels/workbook.xml.rels");
  if (!wb || !rels) throw new FormatError("file", "an .xlsx workbook");
  const shared = [...(get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]!));
  const targets = new Map([...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [/Id="([^"]+)"/.exec(m[1]!)?.[1], /Target="([^"]+)"/.exec(m[1]!)?.[1]]));
  return [...wb.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => {
    const name = decode(/name="([^"]*)"/.exec(m[1]!)?.[1] ?? "");
    const target = targets.get(/r:id="([^"]+)"/.exec(m[1]!)?.[1]) ?? "";
    const xml = get(target.startsWith("/") ? target.slice(1) : `xl/${target}`) ?? "";
    const rows: string[][] = [];
    for (const r of xml.replace(/<row\b[^>]*\/>/g, "").matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rn = Number(/\br="(\d+)"/.exec(r[1] ?? "")?.[1] ?? rows.length + 1) - 1;
      const row: string[] = [];
      for (const c of (r[2] ?? "").replace(/<c\b[^>]*\/>/g, "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]!, body = c[2] ?? "";
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const t = /t="([^"]+)"/.exec(attrs)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        const val = t === "s" ? shared[Number(v)] ?? "" : t === "inlineStr" ? texts(body) : decode(v ?? "");
        row[ref ? colIndex(ref) : row.length] = val;
      }
      rows[rn] = Array.from(row, (x) => x ?? "");
    }
    return { name, rows: Array.from(rows, (x) => x ?? []) };
  });
}

// ---------- values ----------
const clean = (s: string | undefined) => (s ?? "").replace(/[\u00a0\u202f]/g, " ").trim();
export function parseDate(s: string | undefined): string | null {
  const v = clean(s);
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  const iso = (y: string, mo: string, d: string) => {
    const r = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const t = new Date(`${r}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === r ? r : null;
  };
  if (m) return iso(m[3]!, m[2]!, m[1]!);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return iso(m[3]!, m[1]!, m[2]!);
  return null;
}
export function parseRange(s: string | undefined) {
  const parts = clean(s).split(/\s+(?:bis|to|-|–)\s+/);
  if (parts.length !== 2) return null;
  const start = parseDate(parts[0]), end = parseDate(parts[1]);
  return start && end && start <= end ? { start, end } : null;
}
const parseInt0 = (s: string | undefined) => { const v = clean(s).replace(/\s/g, ""); return /^-?\d+$/.test(v) ? Number(v) : null; };
export function parsePercent(s: string | undefined): { share: number | null; below: boolean } | null {
  const v = clean(s).replace(/\s/g, "");
  if (/^<1%$/.test(v)) return { share: null, below: true };
  const m = /^(\d+(?:[.,]\d+)?)%$/.exec(v);
  return m ? { share: Number(m[1]!.replace(",", ".")), below: false } : null;
}

// ---------- posts ----------
export function postUrnFromUrl(url: string): string | null {
  const g = /urn:li:groupPost:(\d+)-(\d+)/.exec(url);
  if (g) return `urn:li:groupPost:${g[1]}-${g[2]}`;
  const m = /[-:](share|ugcPost|activity)[-:](\d{10,})/.exec(url);
  return m ? `urn:li:${m[1]}:${m[2]}` : null;
}
/** Milliseconds encoded in a LinkedIn ID (first 41 bits). */
export function idTime(urn: string): number | null {
  const id = /(\d{15,})$/.exec(urn)?.[1];
  return id ? Number(BigInt(id) >> 22n) : null;
}

// ---------- labels ----------
const DIM: Record<string, string> = {
  Unternehmen: "company", Standort: "location", Firmengröße: "company_size", Karrierestufe: "seniority", Position: "job_title", Branche: "industry",
  Company: "company", Location: "location", "Company size": "company_size", Seniority: "seniority", "Job title": "job_title", Industry: "industry",
};
const SENIORITY: Record<string, string> = { Inhaber: "Owner", Partner: "Partner", Geschäftsführung: "CXO", VP: "VP", Director: "Director", Manager: "Manager", Berufserfahren: "Senior", Berufseinsteiger: "Entry", "Praktikum/Ausbildung": "Training", Unbezahlt: "Unpaid" };
const INDUSTRY: Record<string, string> = {
  "Wagniskapital- und Private-Equity-Auftraggeber": "Venture capital and private equity principals", Finanzdienstleistungen: "Financial services", Bankwesen: "Banking",
  "Investment Banking": "Investment banking", "IT-Dienstleistungen und IT-Beratung": "IT services and IT consulting", Softwareentwicklung: "Software development",
  "Technologie, Information und Internet": "Technology, information and internet", Unternehmensberatung: "Business consulting", Werbedienstleistungen: "Advertising services",
  Marketingdienstleistungen: "Marketing services", Immobilien: "Real estate", "Hochschulen und Universitäten": "Higher education", Rechtskanzleien: "Law practice",
};
const JOB: Record<string, string> = {
  "Gründer:in": "Founder", Mitbegründer: "Co-founder", Geschäftsführer: "Managing director", Unternehmensinhaber: "Business owner", "Softwareingenieur:in": "Software engineer",
  Vorstandsmitglied: "Board member", "Geschäftsführende:r Teilhaber:in": "Managing partner", Projektmanager: "Project manager", Produktmanager: "Product manager", CEO: "CEO", CTO: "CTO",
};
/** Returns the English label, or null when the label is not in the mapping (kept as the original). */
export function translateLabel(dimension: string, raw: string, lang: "de" | "en"): string | null {
  const v = clean(raw);
  if (lang === "en" || dimension === "company") return v;
  if (dimension === "seniority") return SENIORITY[v] ?? null;
  if (dimension === "industry") return INDUSTRY[v] ?? null;
  if (dimension === "job_title") return JOB[v] ?? null;
  if (dimension === "company_size") {
    const m = /^(.+?)\s*Beschäftigte$/.exec(v);
    return m ? `${m[1]!.replace(/\./g, ",")} employees` : null;
  }
  if (dimension === "location") {
    if (v === "Wien") return "Vienna";
    if (v === "Metropolregion San Francisco Bay Area") return "San Francisco Bay Area";
    if (v === "Region London, Vereinigtes Königreich") return "London area";
    if (v === "Zürich Metropolitan Area") return "Zurich area";
    if (v === "Frankfurt/Rhein-Main") return "Frankfurt area";
    let m = /^Metropolregion (.+)$/.exec(v); if (m) return `${m[1]} area`;
    m = /^(.+) und Umgebung$/.exec(v); if (m) return `${m[1]} area`;
    return null;
  }
  return null;
}

// ---------- layout ----------
const SHEETS = {
  discovery: ["AUFFINDBARKEIT", "DISCOVERY"],
  engagement: ["ENGAGEMENT"],
  topPosts: ["TOP-BEITRÄGE", "TOP POSTS"],
  followers: ["FOLLOWER_INNEN", "FOLLOWERS"],
  demoFollowers: ["DEMOGRAFISCHE DATEN ZU ZIELGRUP", "DEMOGRAPHICS OF FOLLOWERS", "FOLLOWER DEMOGRAPHICS"],
  demoContent: ["DEMOGRAFISCHE DATEN ZU INHALTEN", "DEMOGRAPHICS OF CONTENT VIEWERS", "CONTENT DEMOGRAPHICS"],
} as const;
const eq = (a: string | undefined, ...b: string[]) => b.some((x) => clean(a).toLowerCase() === x.toLowerCase());

export type AudienceRow = { scope: "followers" | "content_viewers"; dimension: string; label: string; label_raw: string; share_pct: number | null; below_one_pct: boolean; mapped: boolean };
export type ParsedExport = {
  lang: "de" | "en"; range: { start: string; end: string };
  discovery: { impressions: number; membersReached: number };
  daily: { date: string; impressions: number; engagements: number }[];
  followersDaily: { date: string; newFollowers: number }[];
  totalFollowers: number;
  topPosts: { url: string; urn: string; published: string; engagements: number | null; impressions: number | null }[];
  audience: AudienceRow[];
  rowsRead: number;
};

export function parseExport(bytes: Uint8Array): ParsedExport {
  const sheets = readXlsx(bytes);
  const find = (names: readonly string[], label: string) => {
    const s = sheets.find((x) => names.some((n) => x.name.trim().toUpperCase() === n.toUpperCase()));
    if (!s) throw new FormatError(label, `a sheet named ${names.join(" or ")}`);
    return s;
  };
  const disc = find(SHEETS.discovery, "AUFFINDBARKEIT");
  const lang = disc.name.toUpperCase() === "DISCOVERY" ? "en" : "de";
  // Discovery
  const [d1, d2, d3] = disc.rows;
  const range = parseRange(d1?.[1]);
  if (!eq(d1?.[0], "Performance insgesamt", "Overall performance") || !range) throw new FormatError(disc.name, 'A1 "Performance insgesamt" with the date range in B1');
  const impRow = disc.rows.find((r) => eq(r[0], "Impressions")), memRow = disc.rows.find((r) => eq(r[0], "Erreichte Mitglieder", "Members reached"));
  const impressions = parseInt0(impRow?.[1]), membersReached = parseInt0(memRow?.[1]);
  if (impressions == null || membersReached == null || !d2 || !d3) throw new FormatError(disc.name, 'rows "Impressions" and "Erreichte Mitglieder" with numbers');
  // Engagement (daily)
  const eng = find(SHEETS.engagement, "ENGAGEMENT");
  const eh = eng.rows[0];
  if (!eq(eh?.[0], "Datum", "Date") || !eq(eh?.[1], "Impressions") || !eq(eh?.[2], "Engagement", "Engagements")) throw new FormatError(eng.name, "header Datum | Impressions | Engagement");
  const daily = eng.rows.slice(1).filter((r) => r.some((c) => clean(c))).map((r, i) => {
    const date = parseDate(r[0]), imp = parseInt0(r[1]), e = parseInt0(r[2]);
    if (!date || imp == null || e == null) throw new FormatError(eng.name, `a date and two numbers in row ${i + 2}`);
    return { date, impressions: imp, engagements: e };
  });
  // Top posts
  const top = find(SHEETS.topPosts, "TOP-BEITRÄGE");
  const th = top.rows[2];
  const urlH = ["URL des Beitrags", "Post URL"], dateH = ["Beitrag veröffentlicht am", "Post publish date"];
  if (!eq(th?.[0], ...urlH) || !eq(th?.[1], ...dateH) || !eq(th?.[2], "Engagement", "Engagements") || !eq(th?.[4], ...urlH) || !eq(th?.[5], ...dateH) || !eq(th?.[6], "Impressions"))
    throw new FormatError(top.name, "header in row 3: URL | date | Engagement | (empty) | URL | date | Impressions");
  const posts = new Map<string, ParsedExport["topPosts"][number]>();
  top.rows.slice(3).forEach((r, i) => {
    for (const [u, d, n, key] of [[0, 1, 2, "engagements"], [4, 5, 6, "impressions"]] as const) {
      if (![r[u], r[d], r[n]].some((c) => clean(c))) continue;
      const url = clean(r[u]), urn = postUrnFromUrl(url), published = parseDate(r[d]), value = parseInt0(r[n]);
      if (!urn || !published || value == null) throw new FormatError(top.name, `a post URL, a date and a number in row ${i + 4}`);
      const p = posts.get(urn) ?? { url, urn, published, engagements: null, impressions: null };
      p[key] = value;
      posts.set(urn, p);
    }
  });
  // Followers
  const fol = find(SHEETS.followers, "FOLLOWER_INNEN");
  const totalFollowers = parseInt0(fol.rows[0]?.[1]);
  if (!/^(Follower:innen insgesamt am|Total followers on)/i.test(clean(fol.rows[0]?.[0])) || totalFollowers == null) throw new FormatError(fol.name, 'A1 "Follower:innen insgesamt am …" with the total in B1');
  if (!eq(fol.rows[2]?.[0], "Datum", "Date") || !eq(fol.rows[2]?.[1], "Neue Follower:innen", "New followers")) throw new FormatError(fol.name, "header Datum | Neue Follower:innen in row 3");
  const followersDaily = fol.rows.slice(3).filter((r) => r.some((c) => clean(c))).map((r, i) => {
    const date = parseDate(r[0]), n = parseInt0(r[1]);
    if (!date || n == null) throw new FormatError(fol.name, `a date and a number in row ${i + 4}`);
    return { date, newFollowers: n };
  });
  // Demographics
  const audience: AudienceRow[] = [];
  for (const [names, scope, label] of [[SHEETS.demoFollowers, "followers", "DEMOGRAFISCHE DATEN ZU ZIELGRUP"], [SHEETS.demoContent, "content_viewers", "DEMOGRAFISCHE DATEN ZU INHALTEN"]] as const) {
    const s = find(names, label);
    const h = s.rows[0];
    if (!eq(h?.[0], "Wichtige demografische Daten", "Top demographics") || !eq(h?.[1], "Wert", "Value") || !eq(h?.[2], "Prozentsatz", "Percentage")) throw new FormatError(s.name, "header Wichtige demografische Daten | Wert | Prozentsatz");
    s.rows.slice(1).filter((r) => r.some((c) => clean(c))).forEach((r, i) => {
      const dimension = DIM[clean(r[0])], pct = parsePercent(r[2]), raw = clean(r[1]);
      if (!dimension || !pct || !raw) throw new FormatError(s.name, `category | value | percent in row ${i + 2}`);
      const en = translateLabel(dimension, raw, lang);
      audience.push({ scope, dimension, label: en ?? raw, label_raw: raw, share_pct: pct.share, below_one_pct: pct.below, mapped: en != null });
    });
  }
  const rowsRead = 2 + daily.length + posts.size + followersDaily.length + 1 + audience.length;
  return { lang, range, discovery: { impressions, membersReached }, daily, followersDaily, totalFollowers, topPosts: [...posts.values()], audience, rowsRead };
}

export type Issue = { severity: "info" | "warning" | "blocker"; rule: string; subject: string | null; message: string };
/** Validation before any normalization (the incomplete last day is still included). */
export function validateExport(p: ParsedExport, lastTotalFollowers: number | null): Issue[] {
  const issues: Issue[] = [];
  const inRange = (d: string) => d >= p.range.start && d <= p.range.end;
  for (const r of [...p.daily, ...p.followersDaily]) if (!inRange(r.date)) issues.push({ severity: "blocker", rule: "date_in_range", subject: r.date, message: `${r.date} is outside the file's range ${p.range.start}–${p.range.end}.` });
  const dup = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
  for (const d of [...new Set([...dup(p.daily.map((r) => r.date)), ...dup(p.followersDaily.map((r) => r.date))])]) issues.push({ severity: "blocker", rule: "duplicate_day", subject: d, message: `${d} appears twice.` });
  for (const r of p.daily) {
    if (r.impressions < 0) issues.push({ severity: "blocker", rule: "negative_impressions", subject: r.date, message: `Negative impressions on ${r.date}.` });
    if (r.engagements < 0) issues.push({ severity: "info", rule: "negative_engagement", subject: r.date, message: `Engagement on ${r.date} is ${r.engagements} (LinkedIn nets out withdrawn reactions).` });
  }
  for (const r of p.followersDaily) if (r.newFollowers < 0) issues.push({ severity: "blocker", rule: "negative_followers", subject: r.date, message: `Negative new followers on ${r.date}.` });
  for (const t of p.topPosts) if ((t.impressions ?? 0) < 0) issues.push({ severity: "blocker", rule: "negative_impressions", subject: t.urn, message: `Negative impressions for ${t.urn}.` });
  if (p.discovery.impressions < 0 || p.discovery.membersReached < 0 || p.totalFollowers < 0) issues.push({ severity: "blocker", rule: "negative_total", subject: null, message: "A total is negative." });
  const sum = p.daily.reduce((a, r) => a + r.impressions, 0);
  if (sum !== p.discovery.impressions) issues.push({ severity: "blocker", rule: "impressions_total", subject: null, message: `Daily impressions add up to ${sum}, but the discovery total is ${p.discovery.impressions}.` });
  if (lastTotalFollowers != null && p.totalFollowers < lastTotalFollowers * 0.95) issues.push({ severity: "warning", rule: "total_followers_drop", subject: null, message: `Total followers ${p.totalFollowers} is more than 5% below the last stored ${lastTotalFollowers}.` });
  for (const a of p.audience) if (!a.mapped) issues.push({ severity: "info", rule: "unmapped_label", subject: `${a.scope}/${a.dimension}`, message: `No English label for "${a.label_raw}"; kept the original.` });
  return issues;
}

export const viennaDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
/** Drops the incomplete download day: if the range ends on or after the upload date, that day leaves the daily data and range-level data is partial. */
export function dropIncompleteDay(p: ParsedExport, uploadDate: string) {
  if (p.range.end < uploadDate) return { ...p, rangePartial: false, droppedDay: null as string | null };
  const end = p.range.end;
  return { ...p, daily: p.daily.filter((r) => r.date < uploadDate), followersDaily: p.followersDaily.filter((r) => r.date < uploadDate), rangePartial: true, droppedDay: end };
}
