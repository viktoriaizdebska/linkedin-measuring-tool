// Which Google Calendar events count as LinkedIn meetings. Pure, so it can be tested on sample events.
export type CalEvent = {
  id: string; summary?: string; status?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
  organizer?: { email?: string; self?: boolean }; attendees?: { email?: string; self?: boolean; responseStatus?: string; resource?: boolean }[];
};
export const OWN_DOMAINS = ["izdebska.com"];
export const OWN_ADDRESSES = ["viktoria.izdebska@gmail.com"];
export const SLOT_TEXT = "room for luck";
export const SYNC_FROM = "2026-09-28";

const isOwn = (email: string) => { const e = email.toLowerCase(); return OWN_ADDRESSES.includes(e) || OWN_DOMAINS.some((d) => e.endsWith(`@${d}`)); };
const isSlot = (e: CalEvent) => (e.summary ?? "").toLowerCase().includes(SLOT_TEXT);
const timed = (e: CalEvent) => !!e.start?.dateTime && !!e.end?.dateTime;
const declinedByMe = (e: CalEvent) => (e.attendees ?? []).some((a) => a.self && a.responseStatus === "declined");

export type Candidate = { event_id: string; start_at: string; end_at: string; title: string; domains: string[]; guest_count: number };
export function meetingCandidates(events: CalEvent[], now: Date): Candidate[] {
  const slots = events.filter((e) => isSlot(e) && timed(e) && e.status !== "cancelled");
  const out: Candidate[] = [];
  for (const e of events) {
    if (isSlot(e) || !timed(e) || e.status === "cancelled" || declinedByMe(e)) continue;
    const s = Date.parse(e.start!.dateTime!), en = Date.parse(e.end!.dateTime!);
    if (en > now.getTime()) continue;
    if (!slots.some((x) => s < Date.parse(x.end!.dateTime!) && en > Date.parse(x.start!.dateTime!))) continue;
    const people = [...(e.attendees ?? []).filter((a) => !a.resource).map((a) => a.email ?? ""), e.organizer?.email ?? ""].filter(Boolean);
    const outside = people.filter((p) => !isOwn(p));
    if (!outside.length) continue;
    out.push({
      event_id: e.id, start_at: new Date(s).toISOString(), end_at: new Date(en).toISOString(), title: e.summary ?? "",
      domains: [...new Set(outside.map((p) => p.split("@")[1]!.toLowerCase()))].sort(),
      guest_count: (e.attendees ?? []).filter((a) => !a.resource && !a.self).length,
    });
  }
  return out;
}
