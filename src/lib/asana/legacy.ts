import type { TaskStatus } from "@prisma/client";
import { isActiveStatus } from "@/lib/task-scope";
import { matchPeople, normalizeName, type AsanaRef, type DbContact, type DbUser, type MatchVia, type Person, type PersonOverride } from "./map";

/**
 * Tasks whose assignee is only a name: the August CSV's free text, or an
 * Asana person the load couldn't match. They sit in Unassigned, and the
 * contractor never sees them (D12). This plans linking each one to the
 * person it names, with the importer's own matching (map.ts matchPeople):
 * the Asana id saved on a User or Contact, Connor's people.json, email, and
 * an exact name only once confirmed. scripts/asana/40-link-legacy.ts runs it;
 * import.ts linkLegacyAssignee writes each link.
 *
 * Left alone, and listed: closed tasks (the CSV's are deleted under D25,
 * and a contractor's history starts at cutover, D18), and CSV rows the
 * Asana load hasn't reconciled yet (it updates or deletes them itself).
 * While the daily delta runs, it links synced rows on its own once the
 * person matches; this is for what's left after it, and app-only rows.
 */

export interface LegacyRow {
  id: string;
  title: string;
  status: TaskStatus;
  assigneeName: string;
  assigneeEmail: string | null;
  asanaId: string | null;
  asanaSyncedAt: Date | null;
}

export type LegacyAssignee = { userId: string } | { contactId: string };

export type LegacyDecision =
  | { kind: "link"; assignee: LegacyAssignee; to: string; via: MatchVia }
  | { kind: "leave"; reason: string };

export interface LegacyPlanRow {
  row: LegacyRow;
  person: Person;
  decision: LegacyDecision;
}

export interface LegacyPlan {
  rows: LegacyPlanRow[];
  /** One line per distinct name, for the report. */
  people: Array<{ name: string; email: string | null; open: number; closed: number; match: string }>;
}

/** The address a legacy value names: its email, or the name itself when the CSV put an address there. */
function emailOf(name: string, email: string | null): string | null {
  const e = email?.trim().toLowerCase();
  if (e && e.includes("@")) return e;
  const n = name.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(n) ? n : null;
}

/** One entry per Asana person, from every place the snapshot names them. */
export function asanaPeopleOf(refs: Iterable<AsanaRef | null | undefined>): AsanaRef[] {
  const byGid = new Map<string, AsanaRef>();
  for (const r of refs) {
    if (!r?.gid) continue;
    const prev = byGid.get(r.gid);
    byGid.set(r.gid, { gid: r.gid, name: prev?.name || r.name || null, email: prev?.email || r.email || null });
  }
  return [...byGid.values()];
}

/**
 * The Asana person a legacy value names, when the snapshot has exactly one:
 * by email first, then by the exact name (the CSV's names are Asana's).
 * `people` is asanaPeopleOf's list.
 */
export function asanaPersonFor(name: string, email: string | null, people: readonly AsanaRef[]): AsanaRef | null {
  const e = emailOf(name, email);
  if (e) {
    const hits = people.filter((p) => p.email?.trim().toLowerCase() === e);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  const n = normalizeName(name);
  if (!n) return null;
  const hits = people.filter((p) => normalizeName(p.name) === n);
  return hits.length === 1 ? hits[0] : null;
}

const describe = (p: Person, names: ReadonlyMap<string, string>): string => {
  const m = p.match;
  if (m.kind === "user") return `${names.get(m.userId) ?? m.userId} (by ${m.via})`;
  if (m.kind === "contact" && m.create) return `${m.create.fullName}, a contact the Asana load creates (people.json)`;
  if (m.kind === "contact") return `${names.get(m.contactId) ?? m.contactId} (by ${m.via}${m.confirmed ? "" : ", NOT confirmed"})`;
  const why = { override: "people.json says no one", unmatched: "no match", ambiguous: "ambiguous", former: "former Asana user" }[m.reason];
  return m.suggestions.length ? `${why}; maybe ${m.suggestions.join(", ")}` : why;
};

export function planLegacyLinks(
  rows: readonly LegacyRow[],
  db: { users: readonly DbUser[]; contacts: readonly DbContact[] },
  asanaPeople: readonly AsanaRef[],
  opts: { overrides?: Readonly<Record<string, PersonOverride>>; acceptNameMatches?: boolean } = {},
): LegacyPlan {
  // One Asana person (real gid) or one stand-in per distinct name and email.
  const asana = asanaPeopleOf(asanaPeople);
  const refOf = new Map<string, AsanaRef>();
  const keyOf = (r: LegacyRow) => `${normalizeName(r.assigneeName)}|${emailOf(r.assigneeName, r.assigneeEmail) ?? ""}`;
  for (const r of rows) {
    const k = keyOf(r);
    if (refOf.has(k)) continue;
    const found = asanaPersonFor(r.assigneeName, r.assigneeEmail, asana);
    refOf.set(k, found ?? { gid: `legacy:${k}`, name: r.assigneeName.trim(), email: emailOf(r.assigneeName, r.assigneeEmail) });
  }
  const people = matchPeople(refOf.values(), db.users, db.contacts, opts);
  const names = new Map<string, string>([...db.users.map((u) => [u.id, u.name || u.email] as [string, string]), ...db.contacts.map((c) => [c.id, c.fullName] as [string, string])]);

  const out: LegacyPlanRow[] = rows.map((row) => {
    const person = people.get(refOf.get(keyOf(row))!.gid)!;
    const m = person.match;
    let decision: LegacyDecision;
    if (!isActiveStatus(row.status)) {
      decision = { kind: "leave", reason: "closed: the CSV's are deleted under D25, and contractor history starts at cutover (D18)" };
    } else if (row.asanaId && !row.asanaSyncedAt) {
      decision = { kind: "leave", reason: "a CSV row the Asana load hasn't reconciled yet; the load updates or deletes it" };
    } else if (m.kind === "contact" && m.create) {
      // This linker never creates contacts; the load does, and the next run here links to it by gid.
      decision = { kind: "leave", reason: `people.json creates ${m.create.fullName} as a contact during the Asana load; run the load first` };
    } else if (m.kind === "user") {
      decision = { kind: "link", assignee: { userId: m.userId }, to: names.get(m.userId) ?? m.userId, via: m.via };
    } else if (m.kind === "contact" && m.confirmed) {
      decision = { kind: "link", assignee: { contactId: m.contactId }, to: names.get(m.contactId) ?? m.contactId, via: m.via };
    } else if (m.kind === "contact") {
      decision = { kind: "leave", reason: `matches ${names.get(m.contactId) ?? m.contactId} by name only: confirm in people.json or pass --accept-name-matches` };
    } else {
      decision = { kind: "leave", reason: describe(person, names) };
    }
    return { row, person, decision };
  });

  const byPerson = new Map<string, LegacyPlan["people"][number]>();
  for (const r of out) {
    const p = byPerson.get(r.person.gid) ?? { name: r.row.assigneeName, email: r.person.email, open: 0, closed: 0, match: describe(r.person, names) };
    if (isActiveStatus(r.row.status)) p.open++;
    else p.closed++;
    byPerson.set(r.person.gid, p);
  }
  return { rows: out, people: [...byPerson.values()].sort((a, b) => b.open - a.open || b.closed - a.closed) };
}
