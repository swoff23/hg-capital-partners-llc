import type { AttachmentKind, TaskEventKind, TaskStatus, Visibility } from "@prisma/client";
import { todayYmdEastern, toYmd, type Ymd } from "@/lib/dates";
import { addressKey } from "@/lib/normalize";
import { isActiveStatus } from "@/lib/task-scope";
import { statusEventVisibility } from "@/lib/tasks/rules";
import { isAsanaHosted } from "./snapshot-helpers";

/**
 * Pure mapping for the Asana import (scripts/asana/20-load.ts) and the daily
 * delta (scripts/asana/30-delta.ts): snapshot shapes in, a plan of database
 * writes out. No I/O and no Prisma client, so both scripts share one set of
 * rules and map.test.ts covers them (docs/asana-migration-plan.md §5.5).
 *
 * The plan is plain JSON (dates as ISO strings) so a dry run can print or save
 * exactly what an --apply would write. src/lib/asana/import.ts writes it.
 */

// ---------------------------------------------------------------------------
// Snapshot shapes (what scripts/asana/10-snapshot.ts saves)
// ---------------------------------------------------------------------------

export interface AsanaRef {
  gid: string;
  name?: string | null;
  email?: string | null;
}

export interface AsanaDates {
  start_on?: string | null;
  due_on?: string | null;
  due_at?: string | null;
}

export interface AsanaTask {
  gid: string;
  name: string;
  notes?: string | null;
  html_notes?: string | null;
  resource_subtype?: string;
  assignee?: AsanaRef | null;
  created_by?: AsanaRef | null;
  created_at?: string | null;
  modified_at?: string | null;
  completed: boolean;
  completed_at?: string | null;
  completed_by?: AsanaRef | null;
  due_on?: string | null;
  due_at?: string | null;
  start_on?: string | null;
  followers?: AsanaRef[];
  memberships?: Array<{ project?: AsanaRef | null; section?: AsanaRef | null }>;
  parent?: AsanaRef | null;
  num_subtasks?: number;
  permalink_url?: string | null;
  tags?: AsanaRef[];
  /** Set by the snapshot: true for a direct member of the project, false for a subtask found under one. */
  in_project?: boolean;
}

export interface AsanaStory {
  gid: string;
  created_at: string;
  created_by?: AsanaRef | null;
  resource_subtype?: string;
  type?: string;
  text?: string | null;
  html_text?: string | null;
  is_edited?: boolean;
  is_pinned?: boolean;
  old_dates?: AsanaDates | null;
  new_dates?: AsanaDates | null;
  old_section?: AsanaRef | null;
  new_section?: AsanaRef | null;
  assignee?: AsanaRef | null;
  old_name?: string | null;
  new_name?: string | null;
}

export interface AsanaAttachment {
  gid: string;
  name: string;
  resource_subtype?: string;
  host?: string | null;
  size?: number | null;
  created_at?: string | null;
  view_url?: string | null;
  permanent_url?: string | null;
  parent?: AsanaRef | null;
}

// ---------------------------------------------------------------------------
// Sections (D5, D24, D28)
// ---------------------------------------------------------------------------

export type SectionClass =
  | { kind: "property"; key: string }
  | { kind: "general" }
  | { kind: "unfiled" }
  | { kind: "playbook"; name: string }
  | { kind: "archive" };

/** Pieter's and JMPL's own ventures: archived, never imported (D5). */
const ARCHIVE_SECTIONS = [/^pieter properties$/i, /^jmpl properties$/i];
/** "NEW TENANT [Address]" and friends: playbooks, loaded as templates (D28). */
const PLAYBOOK_SECTION = /^new\s.*\[address\]\s*$/i;
/** "58 Mariner (Conventus) (HG1)", "118 Congress (HG)", "765/767 Prospect". */
const PROPERTY_SECTION = /^\d+[a-z]?[/\d]*\s+[A-Za-z]/;

export function classifySection(name: string | null | undefined): SectionClass {
  const s = (name ?? "").trim();
  if (ARCHIVE_SECTIONS.some((re) => re.test(s))) return { kind: "archive" };
  if (PLAYBOOK_SECTION.test(s)) return { kind: "playbook", name: s.replace(/\s*\[address\]\s*$/i, "").trim() };
  if (/^general$/i.test(s)) return { kind: "general" };
  if (PROPERTY_SECTION.test(s)) return { kind: "property", key: addressKey(s) };
  return { kind: "unfiled" };
}

/** Sections whose open tasks are HG work and get imported. */
export function importsTasks(c: SectionClass): boolean {
  return c.kind === "property" || c.kind === "general" || c.kind === "unfiled";
}

export interface Place {
  propertyId: string | null;
  bucket: string;
}

/** Where a task in this section lives in the app. A property section with no matching Property lands in Unfiled. */
export function placeFor(c: SectionClass, propertyIdByKey: ReadonlyMap<string, string>): Place & { unmatchedProperty: boolean } {
  if (c.kind === "property") {
    const id = propertyIdByKey.get(c.key) ?? null;
    return id ? { propertyId: id, bucket: "Property", unmatchedProperty: false } : { propertyId: null, bucket: "Unfiled", unmatchedProperty: true };
  }
  if (c.kind === "general") return { propertyId: null, bucket: "General", unmatchedProperty: false };
  if (c.kind === "playbook") return { propertyId: null, bucket: "Template", unmatchedProperty: false };
  return { propertyId: null, bucket: "Unfiled", unmatchedProperty: false };
}

/** What the template picker calls each playbook's anchor date. */
export function playbookAnchorLabel(name: string): string | null {
  if (/tenant/i.test(name)) return "Move-in date";
  if (/move ?out/i.test(name)) return "Move-out date";
  if (/refi|property/i.test(name)) return "Closing date";
  return null;
}

/**
 * A playbook item's title as a pattern for the tasks copied from it: a fill-in
 * like "[Tenant]" matches whatever was typed there, the rest must match, case
 * and spacing aside. Null for a title with nothing left to match once the
 * fill-ins are out.
 */
export function playbookTitlePattern(title: string): RegExp | null {
  const t = cleanTitle(title);
  if (t.replace(/\[[^\]]*\]/g, "").replace(/[^a-z0-9]/gi, "").length < 3) return null;
  const source = t
    .split(/(\[[^\]]*\])/)
    .map((part) => (/^\[[^\]]*\]$/.test(part) ? ".+?" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${source}$`, "i");
}

/**
 * Which playbook each task was copied from, as its Asana section gid, so
 * applying that playbook to the building again says what's still open
 * (BPLAY-V01). Asana kept no link: a run was the playbook's tasks copied into
 * the building's section with the fill-ins typed in, so a task is from a
 * playbook when its title is one of the playbook's items. A title more than
 * one playbook has ("Update SREO" is in NEW REFI and NEW PROPERTY) goes to the
 * one with more of its items on that building, and a tie links nothing. Tasks
 * with no building are left alone.
 */
export function playbookRuns(
  tasks: ReadonlyArray<{ taskId: string; title: string; propertyId: string | null }>,
  playbooks: ReadonlyArray<{ sectionGid: string; titles: readonly string[] }>,
): Map<string, string> {
  const patterns = playbooks.map((p) => ({ sectionGid: p.sectionGid, items: p.titles.map(playbookTitlePattern) }));
  const hits = new Map<string, string[]>();
  // The distinct items of each playbook found on each building.
  const found = new Map<string, Set<number>>();
  const key = (propertyId: string, sectionGid: string) => `${propertyId} ${sectionGid}`;
  for (const t of tasks) {
    if (!t.propertyId) continue;
    const title = cleanTitle(t.title);
    for (const p of patterns) {
      const item = p.items.findIndex((re) => re?.test(title));
      if (item < 0) continue;
      hits.set(t.taskId, [...(hits.get(t.taskId) ?? []), p.sectionGid]);
      const k = key(t.propertyId, p.sectionGid);
      found.set(k, (found.get(k) ?? new Set()).add(item));
    }
  }
  const runs = new Map<string, string>();
  for (const t of tasks) {
    const from = hits.get(t.taskId);
    if (!from || !t.propertyId) continue;
    const scored = from.map((sectionGid) => ({ sectionGid, n: found.get(key(t.propertyId!, sectionGid))!.size })).sort((a, b) => b.n - a.n);
    if (scored.length > 1 && scored[0].n === scored[1].n) continue;
    runs.set(t.taskId, scored[0].sectionGid);
  }
  return runs;
}

/** The section of `t` in the HG project, if it's a direct member. */
export function sectionOf(t: Pick<AsanaTask, "memberships">, projectGid: string): AsanaRef | null {
  return t.memberships?.find((m) => m.project?.gid === projectGid)?.section ?? null;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface DbUser {
  id: string;
  email: string;
  name: string | null;
  asanaGid: string | null;
}

export interface DbContact {
  id: string;
  fullName: string;
  email: string | null;
  asanaGid: string | null;
  active: boolean;
}

/** A contractor with no Contact yet, added by the import (people.json "createContact"). No login, no invite, no email. */
export interface ContactDraft {
  fullName: string;
  email: string | null;
}

/**
 * Connor's confirmations, by Asana user gid (people.json next to the snapshot):
 * a staff user, an existing contact, nobody, or a contact to create.
 */
export type PersonOverride = { userId: string } | { contactId: string } | { none: true } | { createContact: { fullName: string; email?: string | null } };

export type MatchVia = "asanaGid" | "override" | "email" | "name" | "create";

export type PersonMatch =
  | { kind: "user"; userId: string; via: MatchVia }
  // A name-only match isn't confirmed until Connor says so (people.json or --accept-name-matches).
  // via "create": `contactId` is the id the load gives the new Contact (ImportPlan.newContacts).
  | { kind: "contact"; contactId: string; via: MatchVia; confirmed: boolean; create?: ContactDraft }
  | { kind: "none"; reason: "override" | "unmatched" | "ambiguous" | "former"; suggestions: string[] };

/** A createContact entry's fields, trimmed, or null when it has no name or an email that isn't one address. */
export function contactDraft(o: unknown): ContactDraft | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const fullName = typeof r.fullName === "string" ? r.fullName.trim().replace(/\s+/g, " ") : "";
  if (!fullName) return null;
  const email = typeof r.email === "string" ? r.email.trim().toLowerCase() : "";
  if (email && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return null;
  return { fullName, email: email || null };
}

export interface Person {
  gid: string;
  name: string;
  email: string | null;
  match: PersonMatch;
}

/** "José  O'Neil" -> "jose o neil": for exact name matches only, never fuzzy ones. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Contact.email sometimes holds two addresses; split them. */
export function emailsOf(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    // "Brandon <kmiotek.realty@gmail.com>" keeps the address, not the brackets.
    .map((e) => e.trim().replace(/^<+|>+$/g, "").toLowerCase())
    .filter((e) => e.includes("@"));
}

/**
 * Match every Asana person to a staff User (by email) or a Contact (by email,
 * then by exact normalized name). Rows already carrying the gid win, and
 * Connor's overrides win over everything. Ambiguous matches match nothing.
 *
 * A createContact override plans a new Contact, with an id from `newId`,
 * unless one already exists: the row carrying the gid (a re-run after the
 * load made it) or the one row with that email. A contact already named
 * that, with neither, isn't guessed at: the person stays unmatched and the
 * report says to point people.json at it instead.
 */
export function matchPeople(
  refs: Iterable<AsanaRef>,
  users: readonly DbUser[],
  contacts: readonly DbContact[],
  opts: { overrides?: Readonly<Record<string, PersonOverride>>; acceptNameMatches?: boolean; newId?: () => string } = {},
): Map<string, Person> {
  const byGid = new Map<string, AsanaRef>();
  for (const r of refs) {
    if (!r?.gid) continue;
    const prev = byGid.get(r.gid);
    byGid.set(r.gid, { gid: r.gid, name: prev?.name || r.name || null, email: prev?.email || r.email || null });
  }
  const userById = new Map(users.map((u) => [u.id, u]));
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const usersByEmail = new Map<string, DbUser[]>();
  for (const u of users) for (const e of emailsOf(u.email)) usersByEmail.set(e, [...(usersByEmail.get(e) ?? []), u]);
  const contactsByEmail = new Map<string, DbContact[]>();
  for (const c of contacts) for (const e of emailsOf(c.email)) contactsByEmail.set(e, [...(contactsByEmail.get(e) ?? []), c]);
  const contactsByName = new Map<string, DbContact[]>();
  for (const c of contacts) {
    const k = normalizeName(c.fullName);
    if (k) contactsByName.set(k, [...(contactsByName.get(k) ?? []), c]);
  }

  const out = new Map<string, Person>();
  for (const ref of byGid.values()) {
    const name = ref.name?.trim() || "(unknown)";
    const email = ref.email?.trim().toLowerCase() || null;
    const person = (match: PersonMatch) => out.set(ref.gid, { gid: ref.gid, name, email, match });
    // A row already linked to a different Asana person can't be this one by name. By email it
    // can when it's the only row with that address: one person with two Asana accounts.
    const free = <T extends { asanaGid: string | null }>(rows: T[] | undefined) => (rows ?? []).filter((r) => !r.asanaGid || r.asanaGid === ref.gid);
    const byEmail = <T extends { asanaGid: string | null }>(rows: T[] | undefined) => (rows?.length === 1 ? rows : free(rows));

    const o = opts.overrides?.[ref.gid];
    if (o && "createContact" in o) {
      const draft = contactDraft(o.createContact);
      const linked = contacts.find((c) => c.asanaGid === ref.gid);
      const sameEmail = draft?.email ? byEmail(contactsByEmail.get(draft.email)) : [];
      const sameName = draft ? free(contactsByName.get(normalizeName(draft.fullName))) : [];
      if (!draft) person({ kind: "none", reason: "ambiguous", suggestions: [`people.json createContact needs a fullName and at most one email: ${JSON.stringify(o)}`] });
      else if (linked) person({ kind: "contact", contactId: linked.id, via: "asanaGid", confirmed: true });
      else if (sameEmail.length === 1) person({ kind: "contact", contactId: sameEmail[0].id, via: "email", confirmed: true });
      else if (sameEmail.length > 1) person({ kind: "none", reason: "ambiguous", suggestions: sameEmail.map((x) => `${x.fullName} (${x.id})`) });
      else if (sameName.length) {
        const hint = sameName.map((x) => `${x.fullName} (${x.id}) already has that name; to use it, put { "contactId": "${x.id}" } in people.json`);
        person({ kind: "none", reason: "ambiguous", suggestions: hint });
      } else {
        const id = opts.newId ? opts.newId() : `asana-contact-${ref.gid}`;
        person({ kind: "contact", contactId: id, via: "create", confirmed: true, create: draft });
      }
      continue;
    }
    if (o) {
      if ("userId" in o && userById.has(o.userId)) person({ kind: "user", userId: o.userId, via: "override" });
      else if ("contactId" in o && contactById.has(o.contactId)) person({ kind: "contact", contactId: o.contactId, via: "override", confirmed: true });
      else if ("none" in o) person({ kind: "none", reason: "override", suggestions: [] });
      else person({ kind: "none", reason: "ambiguous", suggestions: [`people.json points at an id that doesn't exist: ${JSON.stringify(o)}`] });
      continue;
    }
    const linkedUser = users.find((u) => u.asanaGid === ref.gid);
    if (linkedUser) {
      person({ kind: "user", userId: linkedUser.id, via: "asanaGid" });
      continue;
    }
    const linkedContact = contacts.find((c) => c.asanaGid === ref.gid);
    if (linkedContact) {
      person({ kind: "contact", contactId: linkedContact.id, via: "asanaGid", confirmed: true });
      continue;
    }
    if (email) {
      const u = byEmail(usersByEmail.get(email));
      if (u.length === 1) {
        person({ kind: "user", userId: u[0].id, via: "email" });
        continue;
      }
      const c = byEmail(contactsByEmail.get(email));
      if (c.length === 1) {
        person({ kind: "contact", contactId: c[0].id, via: "email", confirmed: true });
        continue;
      }
      if (c.length > 1) {
        person({ kind: "none", reason: "ambiguous", suggestions: c.map((x) => `${x.fullName} (${x.id})`) });
        continue;
      }
    }
    const byName = free(contactsByName.get(normalizeName(name)));
    if (byName.length === 1) {
      person({ kind: "contact", contactId: byName[0].id, via: "name", confirmed: !!opts.acceptNameMatches });
      continue;
    }
    if (byName.length > 1) {
      person({ kind: "none", reason: "ambiguous", suggestions: byName.map((x) => `${x.fullName} (${x.id})`) });
      continue;
    }
    // No match: suggest contacts sharing a first or last name, for Connor to confirm by hand.
    const tokens = normalizeName(name).split(" ").filter((t) => t.length > 2);
    const suggestions = contacts
      .filter((c) => normalizeName(c.fullName).split(" ").some((t) => tokens.includes(t)))
      .slice(0, 3)
      .map((c) => `${c.fullName} (${c.id})`);
    person({ kind: "none", reason: /former user/i.test(name) ? "former" : "unmatched", suggestions });
  }
  return out;
}

/** Who did something, as the timeline records it. Only confirmed contact matches carry the contact id. */
export interface Who {
  userId: string | null;
  contactId: string | null;
  label: string;
}

export function who(people: ReadonlyMap<string, Person>, ref: AsanaRef | null | undefined, fallback = "Asana"): Who {
  if (!ref?.gid) return { userId: null, contactId: null, label: fallback };
  const p = people.get(ref.gid);
  const label = p?.name && p.name !== "(unknown)" ? p.name : ref.name?.trim() || fallback;
  if (p?.match.kind === "user") return { userId: p.match.userId, contactId: null, label };
  if (p?.match.kind === "contact" && p.match.confirmed) return { userId: null, contactId: p.match.contactId, label };
  return { userId: null, contactId: null, label };
}

export type AssigneeValue = { userId: string } | { contactId: string } | { name: string; email: string | null } | null;

export function assigneeFor(people: ReadonlyMap<string, Person>, ref: AsanaRef | null | undefined): AssigneeValue {
  if (!ref?.gid) return null;
  const w = who(people, ref, "");
  if (w.userId) return { userId: w.userId };
  if (w.contactId) return { contactId: w.contactId };
  const p = people.get(ref.gid);
  return { name: w.label || "(unknown)", email: p?.email ?? ref.email?.toLowerCase() ?? null };
}

/** Equality key: two assignees are the same person if their keys match. */
export function assigneeKey(a: AssigneeValue): string {
  if (!a) return "";
  if ("userId" in a) return `u:${a.userId}`;
  if ("contactId" in a) return `c:${a.contactId}`;
  return `n:${normalizeName(a.name)}|${(a.email ?? "").toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Field values and the three-way merge
// ---------------------------------------------------------------------------

/** Asana's due date as a calendar date. due_at (a time) is read in Buffalo time. */
export function asanaYmd(d: AsanaDates | null | undefined): Ymd | null {
  if (!d) return null;
  if (d.due_on) return toYmd(d.due_on);
  if (d.due_at) {
    const t = new Date(d.due_at);
    return Number.isNaN(t.getTime()) ? null : todayYmdEastern(t);
  }
  return null;
}

export function cleanText(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/\r\n?/g, "\n").trim();
  return t || null;
}

export function cleanTitle(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim() || "(no title)";
}

/**
 * The fields the merge compares, as the app stores them. Saved on the task
 * as `asanaLastSynced` (what Asana said at the last sync), so the next sync
 * can tell an Asana change from an app change.
 */
export interface SyncedFields {
  v: 1;
  title: string;
  description: string | null;
  dueDate: Ymd | null;
  startDate: Ymd | null;
  place: Place;
  assignee: AssigneeValue;
  /** Done (or canceled) in the app; completed in Asana. */
  completed: boolean;
  sectionGid: string | null;
  sectionName: string | null;
  /** Subtasks, by gid, for the checklist's own three-way merge. */
  checklist?: Record<string, { title: string; done: boolean }>;
  /** When Asana said this (the snapshot's or delta run's start). Older input never overwrites it. */
  asOf?: string;
}

export const MERGE_FIELDS = ["title", "description", "dueDate", "startDate", "place", "assignee", "completed"] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
type Comparable = Pick<SyncedFields, MergeField>;

function fieldKey(f: MergeField, v: Comparable): string {
  switch (f) {
    case "place":
      return `${v.place.propertyId ?? ""}|${v.place.bucket}`;
    case "assignee":
      return assigneeKey(v.assignee);
    default:
      return JSON.stringify(v[f] ?? null);
  }
}

/** Parse a stored asanaLastSynced value; null when absent or from an unknown version. */
export function parseSynced(json: unknown): SyncedFields | null {
  if (!json || typeof json !== "object") return null;
  const v = json as Partial<SyncedFields>;
  if (v.v !== 1 || typeof v.title !== "string" || !v.place || typeof v.completed !== "boolean") return null;
  return v as SyncedFields;
}

export interface FieldConflict {
  /** "section": moved to a section that isn't imported. "checklist": a subtask renamed on both sides. */
  field: MergeField | "section" | "checklist";
  app: unknown;
  asana: unknown;
  base: unknown;
}

export interface MergeResult {
  /** Asana values to write. */
  apply: Partial<Comparable>;
  /** Fields both sides changed: the app value is kept and a CONFLICT event says so. */
  conflicts: FieldConflict[];
  /** "close" when Asana completed the task, "reopen" when it reopened one the app had done. */
  status: "close" | "reopen" | null;
}

/**
 * Three-way merge of one task. For each field: if Asana's value hasn't moved
 * since the last sync, nothing happens (whatever the app did stands). If it
 * has, it's applied only when the app's value still equals the last-synced
 * one; otherwise it's a conflict and the app's value is kept. Completing a
 * task in Asana always applies.
 *
 * `base` is null for rows the importer has never synced (the August CSV),
 * so there's no record of which side moved. Then `appEdited` decides: when
 * the app hasn't edited the row, Asana wins every field that differs; when
 * it has, every difference is a conflict. `appEdited` comes from
 * Task.appEditedAt (set only by app and portal writes) being later than
 * Task.asanaSyncedAt; never from updatedAt, which the importer's own writes
 * bump.
 */
export function mergeFields(current: Comparable, base: Comparable | null, incoming: Comparable, appEdited: boolean): MergeResult {
  const result: MergeResult = { apply: {}, conflicts: [], status: null };
  for (const f of MERGE_FIELDS) {
    const inc = fieldKey(f, incoming);
    const cur = fieldKey(f, current);
    if (inc === cur) continue;
    // Newly completed in Asana: always applies. (Completed before the last sync and reopened in the app: the app's choice stands.)
    if (f === "completed" && incoming.completed && !base?.completed) {
      result.status = "close";
      continue;
    }
    if (base && inc === fieldKey(f, base)) continue; // Asana didn't change it
    const appTouched = base ? cur !== fieldKey(f, base) : appEdited;
    if (appTouched) {
      result.conflicts.push({ field: f, app: current[f], asana: incoming[f], base: base ? base[f] : null });
      continue;
    }
    if (f === "completed") result.status = "reopen";
    else (result.apply as Record<string, unknown>)[f] = incoming[f];
  }
  return result;
}

/** A sentence for a CONFLICT event and the console. */
export function describeConflict(c: FieldConflict): string {
  const show = (v: unknown) => {
    if (v == null || v === "") return "(empty)";
    if (typeof v === "string") return v.length > 60 ? `"${v.slice(0, 57)}..."` : `"${v}"`;
    if (typeof v === "object" && v && "bucket" in v) return `${(v as Place).propertyId ?? (v as Place).bucket}`;
    if (typeof v === "object" && v && "name" in v) return (v as { name: string }).name;
    return JSON.stringify(v);
  };
  if (c.field === "section") return `Moved to Asana section ${show(c.asana)}, which isn't imported. The app kept it where it is.`;
  if (c.field === "checklist") return `Asana renamed a checklist item to ${show(c.asana)}; the app had renamed it ${show(c.app)}, which was kept.`;
  const label: Record<MergeField, string> = {
    title: "title",
    description: "notes",
    dueDate: "due date",
    startDate: "start date",
    place: "property",
    assignee: "assignee",
    completed: "status",
  };
  return `Asana changed the ${label[c.field]} to ${show(c.asana)}; the app had changed it to ${show(c.app)}, which was kept.`;
}

// ---------------------------------------------------------------------------
// Links, lockbox codes, file names
// ---------------------------------------------------------------------------

// https://app.asana.com/0/<project>/<task>[/f], .../0/0/<task>, and the newer
// https://app.asana.com/1/<workspace>/project/<project>/task/<task>[?...]
const ASANA_TASK_LINK =
  /https:\/\/app\.asana\.com\/(?:0\/\d+\/(\d+)(?:\/f)?|1\/\d+\/(?:project\/\d+\/)?task\/(\d+)(?:\?[^\s)\]]*)?)/g;

/** Rewrite Asana task links to the imported task's page. Links to tasks that weren't imported stay as they are. */
export function rewriteAsanaTaskLinks(text: string, taskIdFor: (gid: string) => string | null): { text: string; rewritten: number; unresolved: number } {
  let rewritten = 0;
  let unresolved = 0;
  const out = text.replace(ASANA_TASK_LINK, (whole, a: string | undefined, b: string | undefined) => {
    const id = taskIdFor((a ?? b)!);
    if (!id) {
      unresolved++;
      return whole;
    }
    rewritten++;
    return `/tasks/${id}`;
  });
  return { text: out, rewritten, unresolved };
}

/** Text that looks like it carries a lockbox or door code (contractors will see imported notes and comments). */
export const LOCKBOX_PATTERNS: readonly RegExp[] = [
  /lock ?box[^\n]{0,20}\d{3,6}/i,
  /\b(?:door|gate|garage|key|access|entry) ?code[^\n]{0,15}\d{3,6}/i,
  /\bcombo\b[^\n]{0,15}\d{3,6}/i,
];

/** `text` with the digits of anything that looks like a code masked, for printing it in a report. */
export function maskLockbox(text: string): string {
  let out = text;
  for (const re of LOCKBOX_PATTERNS) out = out.replace(new RegExp(re.source, `${re.flags}g`), (m) => m.replace(/\d/g, "#"));
  return out;
}

/** Matching snippets with every digit masked, so the report itself doesn't spread the codes. */
export function findLockboxMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const re of LOCKBOX_PATTERNS) {
    const m = re.exec(text);
    if (m) out.push(m[0].replace(/\d/g, "#"));
  }
  return out;
}

/** Extensions a browser or Blob could treat as active content (§5.3: no SVG or HTML). Stored as .bin instead. */
const ACTIVE_EXTENSIONS = new Set(["html", "htm", "xhtml", "shtml", "svg", "svgz", "xml", "xsl", "xslt", "js", "mjs", "cjs"]);

/**
 * A Blob-safe file name: [A-Za-z0-9._-] only (the upload route's rule in
 * docs/asana-migration-plan.md §5.3), short enough to leave room for Blob's
 * random suffix, extension kept unless it's an active type, which becomes
 * .bin so nothing can infer HTML or SVG from the stored path. The original
 * name stays in TaskAttachment.filename.
 */
export function blobSafeName(name: string, max = 80): string {
  const dot = name.lastIndexOf(".");
  const rawExt = dot > 0 ? name.slice(dot + 1) : "";
  const ext = /^[A-Za-z0-9]{1,8}$/.test(rawExt) ? (ACTIVE_EXTENSIONS.has(rawExt.toLowerCase()) ? ".bin" : `.${rawExt.toLowerCase()}`) : "";
  const stem = (ext ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return `${(stem || "file").slice(0, max - ext.length)}${ext}`;
}

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
  mov: "video/quicktime",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  avi: "video/x-msvideo",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  zip: "application/zip",
};

/** A type no browser renders: anything outside the list above, HTML and SVG included, is stored and served as this. */
export const OPAQUE_TYPE = "application/octet-stream";

/**
 * Asana gives no content type, so it comes from the extension, from an
 * allowlist. Everything else is opaque bytes, so neither Blob nor the files
 * route can pick an active type (text/html, image/svg+xml) from the name.
 */
export function contentTypeFor(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return Object.hasOwn(TYPES, ext) ? TYPES[ext] : OPAQUE_TYPE;
}

export function attachmentKind(name: string, hosted: boolean): AttachmentKind {
  if (!hosted) return "LINK";
  const t = contentTypeFor(name);
  return t?.startsWith("image/") ? "IMAGE" : t?.startsWith("video/") ? "VIDEO" : "FILE";
}

// ---------------------------------------------------------------------------
// Stories -> timeline events
// ---------------------------------------------------------------------------

/** Story subtypes that become timeline events. Everything else (likes, followers, reminders, "due today") is noise. */
const KEPT_SUBTYPES = new Set([
  "comment_added",
  "due_date_changed",
  "assigned",
  "unassigned",
  "section_changed",
  "name_changed",
  "notes_changed",
  "marked_complete",
  "marked_incomplete",
  "attachment_added",
]);

export function storySubtype(s: Pick<AsanaStory, "resource_subtype" | "type">): string {
  return s.resource_subtype || (s.type === "comment" ? "comment_added" : "(none)");
}

export interface EventPlan {
  asanaStoryGid: string;
  kind: TaskEventKind;
  visibility: Visibility;
  actorUserId: string | null;
  actorContactId: string | null;
  actorLabel: string;
  body: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  /** Already in the database (the writer skips it). */
  existing: boolean;
}

export interface ChecklistRef {
  asanaGid: string;
  title: string;
}

export interface StoryContext {
  people: ReadonlyMap<string, Person>;
  /** The task ends up with a contractor assignee: status events they care about are Shared (rules.ts). */
  hasContractor: boolean;
  placeOfSection: (name: string | null | undefined) => Place;
  /** Set for a subtask's story, which moves to the parent task. */
  fromChecklistItem?: ChecklistRef;
  rewrite: (text: string) => string;
}

/** One Asana story as a timeline event, or null for noise. Comments are Shared (D17); system events Internal. */
export function mapStory(s: AsanaStory, ctx: StoryContext): EventPlan | null {
  const subtype = storySubtype(s);
  if (!KEPT_SUBTYPES.has(subtype)) return null;
  const actor = who(ctx.people, s.created_by);
  const base = {
    asanaStoryGid: s.gid,
    actorUserId: actor.userId,
    actorContactId: actor.contactId,
    actorLabel: actor.label,
    createdAt: s.created_at,
    existing: false,
  };
  const text = s.text?.trim() || null;
  const from = ctx.fromChecklistItem ? { fromChecklistItem: ctx.fromChecklistItem } : {};

  if (subtype === "comment_added") {
    const body = cleanText(s.text);
    return {
      ...base,
      kind: "COMMENT",
      visibility: "SHARED",
      body: body ? ctx.rewrite(body) : null,
      data: { ...from, ...(s.html_text ? { html: s.html_text } : {}), ...(s.is_edited ? { edited: true } : {}), ...(s.is_pinned ? { pinned: true } : {}) },
    };
  }
  if (subtype === "attachment_added") {
    return { ...base, kind: "ATTACHMENT", visibility: "SHARED", body: null, data: { ...from, text } };
  }

  const done = subtype === "marked_complete";
  if (ctx.fromChecklistItem) {
    // A subtask's own changes describe the checklist item, not the parent task.
    const change =
      subtype === "marked_complete" || subtype === "marked_incomplete"
        ? { done }
        : subtype === "due_date_changed"
          ? { change: "due", from: asanaYmd(s.old_dates), to: asanaYmd(s.new_dates) }
          : subtype === "name_changed"
            ? { change: "title", from: s.old_name ?? null, to: s.new_name ?? null }
            : { change: subtype.replace(/_/g, " ") };
    return { ...base, kind: "CHECKLIST", visibility: "INTERNAL", body: null, data: { ...from, title: ctx.fromChecklistItem.title, ...change, text } };
  }

  switch (subtype) {
    case "due_date_changed":
      return { ...base, kind: "DUE", visibility: "INTERNAL", body: null, data: { from: asanaYmd(s.old_dates), to: asanaYmd(s.new_dates), text } };
    case "assigned":
    case "unassigned": {
      const to = subtype === "assigned" && s.assignee ? who(ctx.people, s.assignee, s.assignee.name ?? "") : null;
      return {
        ...base,
        kind: "ASSIGNED",
        visibility: "INTERNAL",
        body: null,
        data: { to: to ? { userId: to.userId, contactId: to.contactId, name: to.label } : null, text },
      };
    }
    case "section_changed": {
      const fromPlace = s.old_section ? ctx.placeOfSection(s.old_section.name) : null;
      const toPlace = s.new_section ? ctx.placeOfSection(s.new_section.name) : null;
      return {
        ...base,
        kind: "PROPERTY",
        visibility: "INTERNAL",
        body: null,
        data: { from: fromPlace?.propertyId ?? null, to: toPlace?.propertyId ?? null, fromSection: s.old_section?.name ?? null, toSection: s.new_section?.name ?? null, text },
      };
    }
    case "name_changed":
      return { ...base, kind: "TITLE", visibility: "INTERNAL", body: null, data: { from: s.old_name ?? null, to: s.new_name ?? null, text } };
    case "notes_changed":
      return { ...base, kind: "NOTES", visibility: "INTERNAL", body: null, data: { text } };
    case "marked_complete":
    case "marked_incomplete": {
      const to: TaskStatus = done ? "DONE" : "OPEN";
      return {
        ...base,
        kind: "STATUS",
        visibility: statusEventVisibility(to, ctx.hasContractor),
        body: null,
        data: { from: done ? "OPEN" : "DONE", to, text },
      };
    }
  }
  return null;
}

/**
 * Which story each file belongs to. An image pasted into a comment is named
 * in the comment's HTML (data-asana-gid); otherwise the nearest
 * "attachment_added" story, preferring one whose text names the file. Each
 * story claims at most one file. Unclaimed files get an event of their own.
 */
export function matchAttachmentStories(attachments: readonly AsanaAttachment[], stories: readonly AsanaStory[]): Map<string, string> {
  const out = new Map<string, string>();
  const ids = new Set(attachments.map((a) => a.gid));
  for (const s of stories) {
    if (storySubtype(s) !== "comment_added" || !s.html_text) continue;
    for (const m of s.html_text.matchAll(/data-asana-gid="([^"]+)"/g)) if (ids.has(m[1]) && !out.has(m[1])) out.set(m[1], s.gid);
  }
  const added = stories.filter((s) => storySubtype(s) === "attachment_added");
  const pairs: Array<{ att: string; story: string; named: boolean; dt: number }> = [];
  for (const a of attachments) {
    if (out.has(a.gid)) continue;
    const at = Date.parse(a.created_at ?? "");
    for (const s of added) {
      const dt = Math.abs(Date.parse(s.created_at) - at);
      if (!Number.isFinite(dt)) continue;
      const named = !!s.text && s.text.toLowerCase().includes(a.name.toLowerCase());
      // A named story can be a while off (a slow upload); an unnamed one must be close.
      if (named ? dt <= 86_400_000 : dt <= 120_000) pairs.push({ att: a.gid, story: s.gid, named, dt });
    }
  }
  pairs.sort((x, y) => Number(y.named) - Number(x.named) || x.dt - y.dt);
  const used = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.att) || used.has(p.story)) continue;
    out.set(p.att, p.story);
    used.add(p.story);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export interface DbTaskRow {
  id: string;
  asanaId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: Date | null;
  startDate: Date | null;
  propertyId: string | null;
  bucket: string;
  sectionRaw: string | null;
  assigneeUserId: string | null;
  assigneeContactId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  appEditedAt: Date | null;
  asanaSyncedAt: Date | null;
  asanaLastSynced: unknown;
  hasRepeat: boolean;
  /** Files on the row, and timeline events the app (not the importer) wrote. */
  attachmentCount: number;
  appEventCount: number;
  /** The playbook the row is already linked to: the importer leaves that link alone. */
  taskTemplateId?: string | null;
}

export interface DbChecklistRow {
  id: string;
  taskId: string;
  asanaGid: string;
  title: string;
  done: boolean;
}

export interface PlanInput {
  mode: "load" | "delta";
  projectGid: string;
  /** When this Asana data was read: manifest.snapshotStartedAt, or the delta run's start. */
  asOf: string;
  /** Top-level tasks and subtasks (subtasks carry `parent`). */
  tasks: readonly AsanaTask[];
  stories: Readonly<Record<string, AsanaStory[]>>;
  attachments: Readonly<Record<string, AsanaAttachment[]>>;
  users: readonly AsanaRef[];
  /** Delta: tasks fetched with every field. Others are a light listing; their fields aren't merged. Default: all. */
  fresh?: ReadonlySet<string>;
  /** Delta: tasks or subtasks whose subtask list failed to fetch. Their task's checklist and its baseline are left alone. */
  subtasksIncomplete?: ReadonlySet<string>;
  /** Asana-hosted files on disk, by attachment gid. */
  files: ReadonlyMap<string, { path: string; bytes: number }>;
}

export interface PlanDb {
  users: readonly DbUser[];
  contacts: readonly DbContact[];
  properties: ReadonlyArray<{ id: string; address: string }>;
  tasks: readonly DbTaskRow[];
  checklist: readonly DbChecklistRow[];
  /** `name` and `itemTitles`: the stored playbook, for linking tasks when this input has no copy of it. */
  templates: ReadonlyArray<{ id: string; sourceAsanaSectionGid: string | null; name?: string; itemTitles?: readonly string[] }>;
  storyGids: ReadonlySet<string>;
  attachmentGids: ReadonlySet<string>;
}

export interface PlanOptions {
  overrides?: Readonly<Record<string, PersonOverride>>;
  acceptNameMatches?: boolean;
  /** Ids for new tasks, assigned up front so links between imported tasks can be rewritten. */
  newId: () => string;
}

/** Task columns the writer sets. Dates are ISO strings, calendar dates Ymd. */
export interface TaskWrite {
  title?: string;
  description?: string | null;
  dueDate?: Ymd | null;
  startDate?: Ymd | null;
  propertyId?: string | null;
  bucket?: string;
  assigneeUserId?: string | null;
  assigneeContactId?: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  status?: TaskStatus;
  completedAt?: string | null;
  completedByUserId?: string | null;
  completedByContactId?: string | null;
  sectionRaw?: string | null;
  tags?: string | null;
  createdAt?: string;
  createdByUserId?: string | null;
}

export interface ChecklistPlan {
  asanaGid: string;
  op: "create" | "update" | "none";
  title: string;
  write: {
    title?: string;
    done?: boolean;
    doneAt?: string | null;
    doneByUserId?: string | null;
    doneByContactId?: string | null;
    assigneeLabel?: string | null;
    dueDate?: Ymd | null;
    position?: number;
    createdAt?: string;
  };
}

export type AttachmentSource = { type: "file"; path: string; bytes: number } | { type: "link"; url: string } | { type: "missing"; reason: string };

export interface AttachmentPlan {
  asanaGid: string;
  taskId: string;
  filename: string;
  kind: AttachmentKind;
  contentType: string | null;
  source: AttachmentSource;
  /** The event it hangs on: a comment, an attachment_added story, or a synthetic "att:<gid>" one. */
  eventStoryGid: string;
  uploadedByUserId: string | null;
  uploadedByContactId: string | null;
  createdAt: string | null;
  fromChecklistItem: ChecklistRef | null;
  /** Already in the database: never uploaded twice. */
  existing: boolean;
}

export interface TaskPlan {
  op: "create" | "update";
  taskId: string;
  asanaGid: string;
  /** The row's appEditedAt when planned. The writer skips the task if the app edited it since. */
  rowAppEditedAt: string | null;
  title: string;
  sectionName: string | null;
  place: Place;
  /** Delta: false when only the light listing was fetched, so scalar fields weren't merged. */
  fresh: boolean;
  write: TaskWrite;
  baseline: SyncedFields;
  conflicts: FieldConflict[];
  status: "close" | "reopen" | null;
  /** The contractor assigned once this is written; TaskAccess follows it. */
  contactId: string | null;
  /** Done or canceled once this is written. */
  closed: boolean;
  hasNotes: boolean;
  /** The task repeats and Asana just completed it, and this input has no copy of it: the writer creates the next copy. */
  repeatOnClose: boolean;
  /**
   * A new task that is the next copy of a repeating task Asana just completed
   * (Asana's own recurrence, or a hand copy): that task's id. The writer puts
   * this one in its series instead of the app making a second copy.
   */
  seriesFrom: string | null;
  /** The playbook (its Asana section) this task was copied from: the writer links it to that template. */
  templateSectionGid: string | null;
  created: { createdAt: string | null; actor: Who; htmlNotes: string | null };
  events: EventPlan[];
  checklist: ChecklistPlan[];
  attachments: AttachmentPlan[];
  notes: string[];
}

export interface TemplateItem {
  title: string;
  notes?: string;
  assigneeUserId?: string;
  assigneeContactId?: string;
  assigneeName?: string;
  checklist?: string[];
  asanaGid: string;
}

export interface TemplatePlan {
  sectionGid: string;
  name: string;
  anchorLabel: string | null;
  items: TemplateItem[];
  existingId: string | null;
  /** Completed tasks in the playbook section, left out of the template. */
  skippedCompleted: string[];
}

export type DeleteReason =
  | "completed in Asana"
  | "archived section (Pieter or JMPL)"
  | "playbook placeholder"
  | "subtask, now a checklist item"
  | "subtask of a task that isn't imported"
  | "not in the Asana snapshot";

export interface DeleteRow {
  taskId: string;
  asanaId: string;
  title: string;
  status: TaskStatus;
  bucket: string;
  sectionRaw: string | null;
  reason: DeleteReason;
  attachmentCount: number;
  /** Rows the app has touched are held back from the delete and listed. */
  heldBack: string | null;
}

export interface WillSeeJob {
  taskId: string;
  title: string;
  /** Done or canceled: the contractor keeps read-only access to it (D18), so it's reviewed too. */
  closed: boolean;
  where: string;
  hasNotes: boolean;
  comments: number;
  files: number;
  lockbox: number;
  /** What Connor reads before PORTAL_ENABLED: each shared comment ("date, author: text") and file name. */
  commentLines: string[];
  fileNames: string[];
}

export interface WillSee {
  contactId: string;
  name: string;
  jobs: WillSeeJob[];
}

export interface PlanReport {
  sections: Array<{ name: string; gid: string; kind: SectionClass["kind"]; property: string | null; total: number; open: number; importing: number; subtasks: number }>;
  skipped: { completed: number; archive: number; playbook: number };
  eventsByKind: Record<string, { new: number; existing: number }>;
  droppedStories: Record<string, number>;
  checklist: { create: number; update: number; unchanged: number };
  files: { upload: number; uploadBytes: number; existing: number; links: number; missing: Array<{ asanaGid: string; taskTitle: string; filename: string; reason: string }> };
  conflicts: Array<{ taskId: string; title: string; text: string }>;
  lockbox: Array<{ taskId: string; title: string; where: string; snippet: string }>;
  willSee: WillSee[];
  /** Name-only contact matches waiting for Connor (people.json or --accept-name-matches). */
  pendingNameMatches: Array<{ gid: string; name: string; contactId: string }>;
  unmatchedPropertySections: string[];
  links: { rewritten: number; unresolved: number };
  /** Rows synced before that the snapshot no longer has: left alone, listed. */
  goneFromAsana: Array<{ taskId: string; title: string; asanaId: string }>;
  /** New links to the playbook a task was copied from, by playbook and section (BPLAY-V01). */
  playbookLinks: Array<{ playbook: string; section: string; tasks: number }>;
  notes: string[];
}

export interface ImportPlan {
  mode: "load" | "delta";
  /** Everyone in the snapshot; `refs` counts mentions on the tasks and playbooks being written (0: only on archived or completed work). */
  people: Array<Person & { refs: number }>;
  /** Contacts people.json asks the import to create (createContact). Written before anything that names them. */
  newContacts: NewContactPlan[];
  templates: TemplatePlan[];
  tasks: TaskPlan[];
  deletes: DeleteRow[];
  appOnly: Array<{ taskId: string; title: string; status: TaskStatus }>;
  report: PlanReport;
}

export interface NewContactPlan extends ContactDraft {
  /** Assigned up front, so the plan's tasks can already name the contact. */
  id: string;
  asanaGid: string;
}

/** Done or canceled in the app; what Asana's `completed` maps to. */
const closedInApp = (s: TaskStatus) => !isActiveStatus(s);

/** The app's current values, in the merge's terms. */
export function appFields(row: DbTaskRow): Comparable {
  return {
    title: row.title,
    description: row.description,
    dueDate: toYmd(row.dueDate),
    startDate: toYmd(row.startDate),
    place: { propertyId: row.propertyId, bucket: row.bucket },
    assignee: row.assigneeUserId
      ? { userId: row.assigneeUserId }
      : row.assigneeContactId
        ? { contactId: row.assigneeContactId }
        : row.assigneeName
          ? { name: row.assigneeName, email: row.assigneeEmail }
          : null,
    completed: closedInApp(row.status),
  };
}

/** The app has edited the row since the importer last synced it. */
export function appEditedSinceSync(row: Pick<DbTaskRow, "appEditedAt" | "asanaSyncedAt">): boolean {
  if (!row.appEditedAt) return false;
  return !row.asanaSyncedAt || row.appEditedAt.getTime() > row.asanaSyncedAt.getTime();
}

function assigneeWrite(a: AssigneeValue): Pick<TaskWrite, "assigneeUserId" | "assigneeContactId" | "assigneeName" | "assigneeEmail"> {
  if (a && "userId" in a) return { assigneeUserId: a.userId, assigneeContactId: null, assigneeName: null, assigneeEmail: null };
  if (a && "contactId" in a) return { assigneeUserId: null, assigneeContactId: a.contactId, assigneeName: null, assigneeEmail: null };
  if (a) return { assigneeUserId: null, assigneeContactId: null, assigneeName: a.name, assigneeEmail: a.email };
  return { assigneeUserId: null, assigneeContactId: null, assigneeName: null, assigneeEmail: null };
}

const bump = (rec: Record<string, number>, k: string) => (rec[k] = (rec[k] ?? 0) + 1);

/** Asana stamps a recurring task's next copy at the moment of completion; allow for clock skew between the two. */
const REPEAT_COPY_SLACK_MS = 5 * 60_000;

/**
 * Turn a snapshot (load) or a fetched delta into the writes that bring the
 * app in line with it. See docs/asana-migration-plan.md §5.5 for the rules;
 * the comments below name the decision each step follows.
 */
export function buildPlan(input: PlanInput, db: PlanDb, opts: PlanOptions): ImportPlan {
  const { projectGid, mode } = input;
  const byGid = new Map(input.tasks.map((t) => [t.gid, t]));
  const children = new Map<string, AsanaTask[]>();
  for (const t of input.tasks) if (t.parent?.gid) children.set(t.parent.gid, [...(children.get(t.parent.gid) ?? []), t]);
  const topLevel = input.tasks.filter((t) => t.in_project !== false && !t.parent?.gid);
  const isFresh = (gid: string) => !input.fresh || input.fresh.has(gid);

  // People: everyone named anywhere in the snapshot.
  const refs: AsanaRef[] = [...input.users];
  for (const t of input.tasks) for (const r of [t.assignee, t.created_by, t.completed_by]) if (r) refs.push(r);
  for (const list of Object.values(input.stories)) for (const s of list) for (const r of [s.created_by, s.assignee]) if (r) refs.push(r);
  const people = matchPeople(refs, db.users, db.contacts, { overrides: opts.overrides, acceptNameMatches: opts.acceptNameMatches, newId: opts.newId });
  const newContacts: NewContactPlan[] = [...people.values()].flatMap((p) =>
    p.match.kind === "contact" && p.match.create ? [{ id: p.match.contactId, asanaGid: p.gid, ...p.match.create }] : [],
  );
  const contactName = new Map([...db.contacts.map((c) => [c.id, c.fullName] as const), ...newContacts.map((c) => [c.id, c.fullName] as const)]);

  const propertyIdByKey = new Map(db.properties.map((p) => [addressKey(p.address), p.id]));
  const propertyAddress = new Map(db.properties.map((p) => [p.id, p.address]));
  const placeOfSection = (name: string | null | undefined) => placeFor(classifySection(name), propertyIdByKey);
  const rowsByAsanaId = new Map(db.tasks.filter((r) => r.asanaId).map((r) => [r.asanaId!, r]));
  const checklistByGid = new Map(db.checklist.map((c) => [c.asanaGid, c]));
  const templateBySection = new Map(db.templates.filter((t) => t.sourceAsanaSectionGid).map((t) => [t.sourceAsanaSectionGid!, t.id]));

  const report: PlanReport = {
    sections: [],
    skipped: { completed: 0, archive: 0, playbook: 0 },
    eventsByKind: {},
    droppedStories: {},
    checklist: { create: 0, update: 0, unchanged: 0 },
    files: { upload: 0, uploadBytes: 0, existing: 0, links: 0, missing: [] },
    conflicts: [],
    lockbox: [],
    willSee: [],
    pendingNameMatches: [],
    unmatchedPropertySections: [],
    links: { rewritten: 0, unresolved: 0 },
    goneFromAsana: [],
    playbookLinks: [],
    notes: [],
  };

  // --- Which tasks get written (D24, D25) -------------------------------------
  type Pick_ = { task: AsanaTask; row: DbTaskRow | undefined; section: AsanaRef | null; cls: SectionClass };
  const picked: Pick_[] = [];
  const deletes: DeleteRow[] = [];
  const playbookTasks = new Map<string, { section: AsanaRef; tasks: AsanaTask[] }>();
  const seenTop = new Set<string>();
  const sectionStats = new Map<string, PlanReport["sections"][number]>();

  for (const t of topLevel) {
    seenTop.add(t.gid);
    const section = sectionOf(t, projectGid);
    const cls = classifySection(section?.name);
    const row = rowsByAsanaId.get(t.gid);
    const key = section?.gid ?? "(none)";
    const stat =
      sectionStats.get(key) ??
      ({ name: section?.name ?? "(no section)", gid: key, kind: cls.kind, property: null, total: 0, open: 0, importing: 0, subtasks: 0 } as PlanReport["sections"][number]);
    sectionStats.set(key, stat);
    stat.total++;
    if (!t.completed) stat.open++;
    if (cls.kind === "property") {
      const place = placeFor(cls, propertyIdByKey);
      stat.property = place.propertyId ? (propertyAddress.get(place.propertyId) ?? null) : null;
      if (place.unmatchedProperty && !report.unmatchedPropertySections.includes(section?.name ?? "")) report.unmatchedPropertySections.push(section?.name ?? "");
    }

    if (cls.kind === "playbook") {
      if (mode === "load" && section) {
        const pb = playbookTasks.get(section.gid) ?? { section, tasks: [] };
        pb.tasks.push(t);
        playbookTasks.set(section.gid, pb);
      }
    }
    const openHere = !t.completed && importsTasks(cls);
    if (openHere) {
      stat.importing++;
      stat.subtasks += descendants(t.gid, children).length;
      picked.push({ task: t, row, section, cls });
      continue;
    }
    if (t.completed) report.skipped.completed++;
    else if (cls.kind === "archive") report.skipped.archive++;
    else if (cls.kind === "playbook") report.skipped.playbook++;
    if (!row) continue;
    if (row.asanaSyncedAt) {
      // Synced before: it stays as history. Completion applies; a move out of HG sections is noted.
      picked.push({ task: t, row, section, cls });
    } else if (mode === "load") {
      const reason: DeleteReason = t.completed ? "completed in Asana" : cls.kind === "archive" ? "archived section (Pieter or JMPL)" : "playbook placeholder";
      deletes.push(deleteRow(row, reason));
    }
  }

  // Rows whose Asana task isn't a top-level task in this snapshot.
  for (const row of db.tasks) {
    if (!row.asanaId || seenTop.has(row.asanaId)) continue;
    const t = byGid.get(row.asanaId);
    if (row.asanaSyncedAt) {
      report.goneFromAsana.push({ taskId: row.id, title: row.title, asanaId: row.asanaId });
      continue;
    }
    if (mode !== "load") continue;
    if (t?.parent?.gid) {
      const top = topAncestor(t, byGid);
      const parentImported = picked.some((p) => p.task.gid === top.gid && !p.task.completed && importsTasks(p.cls));
      deletes.push(deleteRow(row, parentImported ? "subtask, now a checklist item" : "subtask of a task that isn't imported"));
    } else {
      deletes.push(deleteRow(row, "not in the Asana snapshot"));
    }
  }

  // Ids up front, so links between imported tasks resolve.
  const taskIdByGid = new Map<string, string>();
  for (const row of db.tasks) if (row.asanaId) taskIdByGid.set(row.asanaId, row.id);
  for (const d of deletes) taskIdByGid.delete(d.asanaId);
  const newIds = new Map<string, string>();
  for (const p of picked) {
    if (!p.row) {
      const id = opts.newId();
      newIds.set(p.task.gid, id);
      taskIdByGid.set(p.task.gid, id);
    }
  }
  const rewrite = (text: string) => {
    const r = rewriteAsanaTaskLinks(text, (gid) => taskIdByGid.get(gid) ?? null);
    report.links.rewritten += r.rewritten;
    report.links.unresolved += r.unresolved;
    return r.text;
  };
  const rewriteOrNull = (text: string | null) => (text == null ? null : rewrite(text));

  // --- Each picked task --------------------------------------------------------
  const tasks: TaskPlan[] = [];
  for (const p of picked) {
    const { task: t, row, section, cls } = p;
    const fresh = isFresh(t.gid);
    const taskId = row?.id ?? newIds.get(t.gid)!;
    const base = row ? parseSynced(row.asanaLastSynced) : null;
    if (!fresh && !base) {
      // Its full record failed to fetch: new to the app, or never synced. The next run fetches it again.
      report.notes.push(`Skipped "${row?.title ?? cleanTitle(t.name)}" (${t.gid}): only the light listing was fetched and it has never been synced.`);
      continue;
    }
    const sectionPlace = placeOfSection(section?.name);
    const inHg = importsTasks(cls);
    const notes: string[] = [];
    const conflicts: FieldConflict[] = [];
    // Synced from newer Asana data than this input (an old snapshot re-run after a delta):
    // its fields stay as they are; only history that's missing is appended.
    const stale = !!(base?.asOf && base.asOf > input.asOf);
    if (stale) notes.push(`synced from newer Asana data (${base!.asOf}) than this input (${input.asOf}); fields left alone`);

    // Incoming values. A task moved out of HG sections keeps its place in the app.
    const incoming: Comparable = stale
      ? { ...base! }
      : fresh
        ? {
            title: cleanTitle(t.name),
            description: rewriteOrNull(cleanText(t.notes)),
            dueDate: asanaYmd(t),
            startDate: toYmd(t.start_on ?? null),
            place: inHg ? { propertyId: sectionPlace.propertyId, bucket: sectionPlace.bucket } : row ? { propertyId: row.propertyId, bucket: row.bucket } : sectionPlace,
            assignee: assigneeFor(people, t.assignee),
            completed: t.completed,
          }
        : { ...base!, completed: t.completed, place: inHg ? { propertyId: sectionPlace.propertyId, bucket: sectionPlace.bucket } : base!.place };
    if (row && !stale && !inHg && section && base?.sectionGid !== section.gid) {
      conflicts.push({ field: "section", app: row.sectionRaw, asana: section.name ?? section.gid, base: base?.sectionName ?? null });
    }

    let write: TaskWrite = {};
    let status: MergeResult["status"] = null;
    let final: Comparable;
    if (!row) {
      final = incoming;
      write = {
        title: incoming.title,
        description: incoming.description,
        dueDate: incoming.dueDate,
        startDate: incoming.startDate,
        propertyId: incoming.place.propertyId,
        bucket: incoming.place.bucket,
        ...assigneeWrite(incoming.assignee),
        status: "OPEN", // status-write: imported open tasks start as To do
        createdByUserId: who(people, t.created_by).userId,
      };
    } else {
      const current = appFields(row);
      const m = mergeFields(current, base, incoming, appEditedSinceSync(row));
      conflicts.push(...m.conflicts);
      status = m.status;
      final = { ...current, ...m.apply };
      if (m.apply.title !== undefined) write.title = m.apply.title;
      if (m.apply.description !== undefined) write.description = m.apply.description;
      if (m.apply.dueDate !== undefined) write.dueDate = m.apply.dueDate;
      if (m.apply.startDate !== undefined) write.startDate = m.apply.startDate;
      if (m.apply.place !== undefined) write = { ...write, propertyId: m.apply.place.propertyId, bucket: m.apply.place.bucket };
      if (m.apply.assignee !== undefined) write = { ...write, ...assigneeWrite(m.apply.assignee) };
      if (status === "close") {
        const by = who(people, t.completed_by);
        write = { ...write, status: "DONE", completedAt: t.completed_at ?? new Date().toISOString(), completedByUserId: by.userId, completedByContactId: by.contactId };
        final = { ...final, completed: true };
        notes.push("completed in Asana");
      } else if (status === "reopen") {
        write = { ...write, status: "OPEN", completedAt: null, completedByUserId: null, completedByContactId: null }; // status-write: reopened in Asana
        final = { ...final, completed: false };
        notes.push(row.asanaSyncedAt ? "reopened in Asana" : `reopened (open in Asana, ${row.status} in the app)`);
      }
    }
    if (fresh && !stale) {
      write.sectionRaw = section?.name ?? null;
      write.tags = t.tags?.length ? t.tags.map((x) => x.name).filter(Boolean).join(", ") : null;
      if (!base && t.created_at) write.createdAt = t.created_at;
    }
    const contactId = final.assignee && "contactId" in final.assignee ? final.assignee.contactId : null;
    const hasContractor = !!contactId;

    // --- Subtasks become the checklist (their history moves up) --------------
    const subs = descendants(t.gid, children);
    const baselineChecklist: Record<string, { title: string; done: boolean }> = {};
    const checklist: ChecklistPlan[] = [];
    // A subtask list that failed to fetch says nothing about the checklist: leave it, and its baseline, as they are.
    const subsIncomplete = !!input.subtasksIncomplete && [t.gid, ...subs.map((s) => s.gid)].some((g) => input.subtasksIncomplete!.has(g));
    if (subsIncomplete) notes.push("its subtasks couldn't be fetched this run; the checklist was left as it is");
    (subsIncomplete ? [] : subs).forEach((s, position) => {
      const title = cleanTitle(s.name);
      const done = s.completed;
      baselineChecklist[s.gid] = { title, done };
      const by = who(people, s.completed_by);
      const display = { assigneeLabel: s.assignee ? who(people, s.assignee).label : null, dueDate: asanaYmd(s), position };
      const doneFields = done
        ? { done: true, doneAt: s.completed_at ?? null, doneByUserId: by.userId, doneByContactId: by.contactId }
        : { done: false, doneAt: null, doneByUserId: null, doneByContactId: null };
      const existing = checklistByGid.get(s.gid);
      if (!existing) {
        checklist.push({ asanaGid: s.gid, op: "create", title, write: { title, ...doneFields, ...display, createdAt: s.created_at ?? undefined } });
        report.checklist.create++;
        return;
      }
      if (existing.taskId !== taskId) {
        notes.push(`checklist item "${title}" is on another task in the app; left there`);
        return;
      }
      if (stale) {
        checklist.push({ asanaGid: s.gid, op: "none", title, write: {} });
        report.checklist.unchanged++;
        return;
      }
      // Same three-way rule as the task, per item. Asana ticking it applies when the tick is new
      // since the last sync; one ticked before then and unticked in the app stays unticked.
      const b = base?.checklist?.[s.gid];
      const w: ChecklistPlan["write"] = { ...display };
      if (title !== existing.title && (!b || existing.title === b.title)) w.title = title;
      else if (title !== existing.title && b && title !== b.title) {
        conflicts.push({ field: "checklist", app: existing.title, asana: title, base: b.title });
      }
      if (done !== existing.done && (!b || existing.done === b.done || (done && !b.done))) Object.assign(w, doneFields);
      const changed = w.title !== undefined || w.done !== undefined;
      checklist.push({ asanaGid: s.gid, op: "update", title, write: w });
      if (changed) report.checklist.update++;
      else report.checklist.unchanged++;
    });

    // --- Stories -> events -----------------------------------------------------
    const events: EventPlan[] = [];
    const owners: Array<{ gid: string; item?: ChecklistRef }> = [{ gid: t.gid }, ...subs.map((s) => ({ gid: s.gid, item: { asanaGid: s.gid, title: cleanTitle(s.name) } }))];
    for (const o of owners) {
      for (const s of input.stories[o.gid] ?? []) {
        const e = mapStory(s, { people, hasContractor, placeOfSection, fromChecklistItem: o.item, rewrite });
        if (!e) {
          bump(report.droppedStories, `${o.item ? "subtask " : ""}${storySubtype(s)}`);
          continue;
        }
        e.existing = db.storyGids.has(e.asanaStoryGid);
        events.push(e);
      }
    }
    // A subtask's notes have no column; they join the timeline as a shared note on that item.
    for (const s of subs) {
      const n = cleanText(s.notes);
      if (!n) continue;
      const actor = who(people, s.created_by);
      const gid = `notes:${s.gid}`;
      events.push({
        asanaStoryGid: gid,
        kind: "COMMENT",
        visibility: "SHARED",
        actorUserId: actor.userId,
        actorContactId: actor.contactId,
        actorLabel: actor.label,
        body: rewrite(n),
        data: { fromChecklistItem: { asanaGid: s.gid, title: cleanTitle(s.name) }, subtaskNotes: true },
        createdAt: s.created_at ?? t.created_at ?? new Date(0).toISOString(),
        existing: db.storyGids.has(gid),
      });
    }
    // Completion from Asana gets one STATUS event: its story, or a stand-in when there's none.
    if (status) {
      const wanted = status === "close" ? "marked_complete" : "marked_incomplete";
      const has = events.some((e) => e.kind === "STATUS" && !e.data.fromChecklistItem && e.data.to === (status === "close" ? "DONE" : "OPEN"));
      const story = (input.stories[t.gid] ?? []).some((s) => storySubtype(s) === wanted);
      if (!has && !story) {
        const at = status === "close" ? (t.completed_at ?? new Date().toISOString()) : (t.modified_at ?? new Date().toISOString());
        const by = status === "close" ? who(people, t.completed_by) : { userId: null, contactId: null, label: "Asana" };
        const gid = `status:${t.gid}:${at}`;
        const to: TaskStatus = status === "close" ? "DONE" : "OPEN";
        events.push({
          asanaStoryGid: gid,
          kind: "STATUS",
          visibility: statusEventVisibility(to, hasContractor),
          actorUserId: by.userId,
          actorContactId: by.contactId,
          actorLabel: by.label,
          body: null,
          data: { from: row?.status ?? "OPEN", to },
          createdAt: at,
          existing: db.storyGids.has(gid),
        });
      }
    }

    // --- Files (D17: shared) ------------------------------------------------------
    const attachments: AttachmentPlan[] = [];
    for (const o of owners) {
      const atts = input.attachments[o.gid] ?? [];
      const matched = matchAttachmentStories(atts, input.stories[o.gid] ?? []);
      for (const a of atts) {
        const hosted = isAsanaHosted(a);
        const storyGid = matched.get(a.gid);
        const story = storyGid ? (input.stories[o.gid] ?? []).find((s) => s.gid === storyGid) : undefined;
        const uploader = who(people, story?.created_by);
        let eventStoryGid = storyGid ?? `att:${a.gid}`;
        const ev = events.find((e) => e.asanaStoryGid === eventStoryGid);
        if (ev && ev.kind === "ATTACHMENT") Object.assign(ev.data, { filename: a.name, asanaAttachmentGid: a.gid });
        if (!ev) {
          eventStoryGid = `att:${a.gid}`;
          events.push({
            asanaStoryGid: eventStoryGid,
            kind: "ATTACHMENT",
            visibility: "SHARED",
            actorUserId: null,
            actorContactId: null,
            actorLabel: "Asana",
            body: null,
            data: { filename: a.name, asanaAttachmentGid: a.gid, ...(o.item ? { fromChecklistItem: o.item } : {}) },
            createdAt: a.created_at ?? t.created_at ?? new Date(0).toISOString(),
            existing: db.storyGids.has(eventStoryGid),
          });
        }
        const file = input.files.get(a.gid);
        const link = a.view_url ?? a.permanent_url ?? null;
        const source: AttachmentSource = hosted
          ? file
            ? { type: "file", path: file.path, bytes: file.bytes }
            : { type: "missing", reason: "not in the snapshot's files/" }
          : link
            ? { type: "link", url: link }
            : { type: "missing", reason: "link with no URL" };
        const existing = db.attachmentGids.has(a.gid);
        attachments.push({
          asanaGid: a.gid,
          taskId,
          filename: a.name,
          kind: attachmentKind(a.name, hosted),
          contentType: hosted ? contentTypeFor(a.name) : null,
          source,
          eventStoryGid,
          uploadedByUserId: ev && ev.kind === "COMMENT" ? ev.actorUserId : uploader.userId,
          uploadedByContactId: ev && ev.kind === "COMMENT" ? ev.actorContactId : uploader.contactId,
          createdAt: a.created_at ?? null,
          fromChecklistItem: o.item ?? null,
          existing,
        });
        if (existing) report.files.existing++;
        else if (source.type === "file") {
          report.files.upload++;
          report.files.uploadBytes += source.bytes;
        } else if (source.type === "link") report.files.links++;
        else report.files.missing.push({ asanaGid: a.gid, taskTitle: t.name, filename: a.name, reason: source.reason });
      }
    }
    for (const e of events) {
      const k = (report.eventsByKind[e.kind] ??= { new: 0, existing: 0 });
      if (e.existing) k.existing++;
      else k.new++;
    }

    // --- Report: lockbox codes in what contractors will read -------------------------
    const scan = (where: string, text: string | null | undefined) => {
      for (const snippet of findLockboxMentions(text)) report.lockbox.push({ taskId, title: final.title, where, snippet });
    };
    scan("title", final.title);
    scan("notes", final.description);
    for (const e of events) if (e.kind === "COMMENT") scan(`comment by ${e.actorLabel}`, e.body);
    for (const c of checklist) scan("checklist item", c.title);
    for (const a of attachments) scan("file name", a.filename);

    // Items from earlier syncs stay in the baseline, so a subtask missing from this input never loses its record.
    const checklistBase = subsIncomplete ? (base?.checklist ?? {}) : { ...(base?.checklist ?? {}), ...baselineChecklist };
    const where = { sectionGid: section?.gid ?? null, sectionName: section?.name ?? null, checklist: checklistBase, asOf: input.asOf };
    const baseline: SyncedFields = stale
      ? base!
      : fresh
        ? { v: 1, ...incoming, ...where }
        : { ...base!, completed: t.completed, place: incoming.place, ...where };
    for (const c of conflicts) report.conflicts.push({ taskId, title: final.title, text: describeConflict(c) });

    tasks.push({
      op: row ? "update" : "create",
      taskId,
      asanaGid: t.gid,
      rowAppEditedAt: row?.appEditedAt?.toISOString() ?? null,
      title: final.title,
      sectionName: section?.name ?? null,
      place: final.place,
      fresh,
      write,
      baseline,
      conflicts,
      status,
      contactId,
      closed: final.completed,
      hasNotes: !!final.description,
      repeatOnClose: status === "close" && !!row?.hasRepeat,
      seriesFrom: null,
      templateSectionGid: null,
      created: { createdAt: t.created_at ?? null, actor: who(people, t.created_by), htmlNotes: t.html_notes ?? null },
      events,
      checklist,
      attachments,
      notes,
    });
  }

  // --- Repeats: a next copy Asana already made -----------------------------------------
  // Completing a recurring task in Asana makes a new task (a new gid) in the same section,
  // and people copy recurring work by hand too. When this input brings such a copy, created
  // at or after the completion, it joins the app's series instead of the app making a second.
  const takenCopies = new Set<string>();
  for (const tp of tasks) {
    if (!tp.repeatOnClose) continue;
    const doneTask = byGid.get(tp.asanaGid)!;
    const doneAt = Date.parse(doneTask.completed_at ?? "");
    const createdAt = (c: TaskPlan) => Date.parse(byGid.get(c.asanaGid)?.created_at ?? "");
    const copies = tasks
      .filter(
        (c) =>
          c.op === "create" &&
          !c.closed &&
          !takenCopies.has(c.taskId) &&
          c.baseline.sectionGid === tp.baseline.sectionGid &&
          cleanTitle(byGid.get(c.asanaGid)?.name) === cleanTitle(doneTask.name) &&
          (!Number.isFinite(doneAt) || !Number.isFinite(createdAt(c)) || createdAt(c) >= doneAt - REPEAT_COPY_SLACK_MS),
      )
      .sort((a, b) => (createdAt(a) || 0) - (createdAt(b) || 0));
    const copy = copies[0];
    if (!copy) continue;
    takenCopies.add(copy.taskId);
    copy.seriesFrom = tp.taskId;
    copy.notes.push(`the next copy of a repeating task Asana completed (${tp.taskId}); joins its series`);
    tp.repeatOnClose = false;
    tp.notes.push(`repeats: Asana already made the next copy (${copy.taskId}), so the app doesn't make another`);
  }

  // --- Playbooks become templates (D28) ------------------------------------------
  const templates: TemplatePlan[] = [];
  for (const { section, tasks: pts } of playbookTasks.values()) {
    const cls = classifySection(section.name);
    const name = cls.kind === "playbook" ? cls.name : (section.name ?? "Playbook");
    const items: TemplateItem[] = [];
    const skippedCompleted: string[] = [];
    for (const t of pts) {
      if (t.completed) {
        skippedCompleted.push(cleanTitle(t.name));
        continue;
      }
      const a = assigneeFor(people, t.assignee);
      const notesText = cleanText(t.notes);
      const subs = descendants(t.gid, children).filter((s) => !s.completed);
      items.push({
        title: cleanTitle(t.name),
        ...(notesText ? { notes: notesText } : {}),
        ...(a && "userId" in a ? { assigneeUserId: a.userId } : {}),
        ...(a && "contactId" in a ? { assigneeContactId: a.contactId } : {}),
        ...(a && "name" in a ? { assigneeName: a.name } : {}),
        ...(subs.length ? { checklist: subs.map((s) => cleanTitle(s.name)) } : {}),
        asanaGid: t.gid,
      });
    }
    templates.push({ sectionGid: section.gid, name, anchorLabel: playbookAnchorLabel(name), items, existingId: templateBySection.get(section.gid) ?? null, skippedCompleted });
  }

  // --- Tasks copied from a playbook (BPLAY-V01) ---------------------------------------
  // This input's playbooks, else the stored ones (a delta doesn't bring the playbook sections).
  // Items completed in the playbook since still match: a run copied before that has them open.
  const playbooks = new Map<string, { name: string; titles: readonly string[] }>();
  for (const t of db.templates) {
    if (t.sourceAsanaSectionGid && t.itemTitles?.length) playbooks.set(t.sourceAsanaSectionGid, { name: t.name ?? t.sourceAsanaSectionGid, titles: t.itemTitles });
  }
  for (const t of templates) playbooks.set(t.sectionGid, { name: t.name, titles: [...t.items.map((i) => i.title), ...t.skippedCompleted] });
  const runs = playbookRuns(
    tasks.map((tp) => ({ taskId: tp.taskId, title: tp.title, propertyId: tp.place.propertyId })),
    [...playbooks].map(([sectionGid, p]) => ({ sectionGid, titles: p.titles })),
  );
  const alreadyLinked = new Set(db.tasks.filter((r) => r.taskTemplateId).map((r) => r.id));
  const linkCount = new Map<string, { playbook: string; section: string; tasks: number }>();
  for (const tp of tasks) {
    const from = alreadyLinked.has(tp.taskId) ? null : (runs.get(tp.taskId) ?? null);
    tp.templateSectionGid = from;
    if (!from) continue;
    const section = tp.sectionName ?? "?";
    const k = `${from} ${section}`;
    const c = linkCount.get(k) ?? { playbook: playbooks.get(from)!.name, section, tasks: 0 };
    c.tasks++;
    linkCount.set(k, c);
  }
  report.playbookLinks = [...linkCount.values()];

  // --- Who will see what (Connor reviews this before PORTAL_ENABLED) ------------------
  // Closed jobs too: the importer keeps the assignee's access, so they stay on the contractor's Done list (D18).
  const byContact = new Map<string, WillSee>();
  for (const tp of tasks) {
    if (!tp.contactId) continue;
    const ws = byContact.get(tp.contactId) ?? { contactId: tp.contactId, name: contactName.get(tp.contactId) ?? tp.contactId, jobs: [] };
    byContact.set(tp.contactId, ws);
    const shared = tp.events.filter((e) => e.kind === "COMMENT" && e.visibility === "SHARED").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const files = tp.attachments.filter((a) => a.source.type !== "missing");
    ws.jobs.push({
      taskId: tp.taskId,
      title: tp.title,
      closed: tp.closed,
      where: tp.place.propertyId ? (propertyAddress.get(tp.place.propertyId) ?? tp.place.bucket) : tp.place.bucket,
      hasNotes: tp.hasNotes,
      comments: shared.length,
      files: files.length,
      lockbox: report.lockbox.filter((l) => l.taskId === tp.taskId).length,
      commentLines: shared.map((e) => `${e.createdAt.slice(0, 10)}, ${e.actorLabel}: ${maskLockbox(e.body ?? "(files only)").replace(/\s+/g, " ")}`),
      fileNames: files.map((a) => a.filename),
    });
  }
  report.willSee = [...byContact.values()].sort((a, b) => a.name.localeCompare(b.name));

  report.sections = [...sectionStats.values()];

  const mentions = new Map<string, number>();
  const count = (r: AsanaRef | null | undefined) => {
    if (r?.gid) mentions.set(r.gid, (mentions.get(r.gid) ?? 0) + 1);
  };
  for (const p of picked) {
    for (const t of [p.task, ...descendants(p.task.gid, children)]) {
      for (const r of [t.assignee, t.created_by, t.completed_by]) count(r);
      for (const s of input.stories[t.gid] ?? []) for (const r of [s.created_by, s.assignee]) count(r);
    }
  }
  for (const pb of playbookTasks.values()) for (const t of pb.tasks) count(t.assignee);
  for (const p of people.values()) {
    if (p.match.kind === "contact" && p.match.via === "name" && !p.match.confirmed && mentions.has(p.gid)) {
      report.pendingNameMatches.push({ gid: p.gid, name: p.name, contactId: p.match.contactId });
    }
  }

  const appOnly =
    mode === "load"
      ? db.tasks.filter((r) => !r.asanaId).map((r) => ({ taskId: r.id, title: r.title, status: r.status }))
      : [];

  return { mode, people: [...people.values()].map((p) => ({ ...p, refs: mentions.get(p.gid) ?? 0 })), newContacts, templates, tasks, deletes, appOnly, report };
}

// ---------------------------------------------------------------------------
// Delta scope (scripts/asana/30-delta.ts)
// ---------------------------------------------------------------------------

/**
 * From the light listing of every project task, which ones the delta works
 * on: open HG tasks and anything synced before. `full` is the subset whose
 * whole record must be fetched because the listing alone can't be merged:
 * new to the app, never synced, or moved between sections or completed
 * since the last sync (a section move doesn't change Asana's modified_at).
 */
export function deltaScope(listed: readonly AsanaTask[], rows: readonly DbTaskRow[], projectGid: string): { scope: Set<string>; full: Set<string> } {
  const byAsanaId = new Map(rows.filter((r) => r.asanaId).map((r) => [r.asanaId!, r]));
  const scope = new Set<string>();
  const full = new Set<string>();
  for (const t of listed) {
    if (t.parent?.gid || t.in_project === false) continue;
    const section = sectionOf(t, projectGid);
    const openHere = !t.completed && importsTasks(classifySection(section?.name));
    const row = byAsanaId.get(t.gid);
    if (!openHere && !row?.asanaSyncedAt) continue;
    scope.add(t.gid);
    const base = row ? parseSynced(row.asanaLastSynced) : null;
    if (!base || base.sectionGid !== (section?.gid ?? null) || base.completed !== t.completed) full.add(t.gid);
  }
  return { scope, full };
}

/** Every subtask under `gid`, depth first, in Asana's order. */
export function descendants(gid: string, children: ReadonlyMap<string, AsanaTask[]>): AsanaTask[] {
  const out: AsanaTask[] = [];
  const walk = (g: string, depth: number) => {
    if (depth > 10) return; // Asana caps nesting at 5; anything deeper is a cycle
    for (const c of children.get(g) ?? []) {
      out.push(c);
      walk(c.gid, depth + 1);
    }
  };
  walk(gid, 0);
  return out;
}

function topAncestor(t: AsanaTask, byGid: ReadonlyMap<string, AsanaTask>): AsanaTask {
  let cur = t;
  for (let i = 0; i < 10 && cur.parent?.gid && byGid.has(cur.parent.gid); i++) cur = byGid.get(cur.parent.gid)!;
  return cur;
}

/** D25 deletes the CSV rows and their files; a row someone has worked on in the app since is held back instead. */
function deleteRow(row: DbTaskRow, reason: DeleteReason): DeleteRow {
  const held = row.appEditedAt ? "edited in the app" : row.appEventCount ? `${row.appEventCount} app timeline event(s)` : null;
  return {
    taskId: row.id,
    asanaId: row.asanaId!,
    title: row.title,
    status: row.status,
    bucket: row.bucket,
    sectionRaw: row.sectionRaw,
    reason,
    attachmentCount: row.attachmentCount,
    heldBack: held,
  };
}
