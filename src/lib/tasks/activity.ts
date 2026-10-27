import type { TaskEventKind, TaskStatus, Visibility } from "@prisma/client";
import { uploadCountPhrase } from "@/lib/attachments/media";
import { daysUntil, toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { STATUS_LABEL } from "@/lib/task-scope";
import { describeRepeat, parseRepeatRule } from "./repeat";

/**
 * The staff task page's Activity (docs/specs/activity-comments.md 2.2 and
 * 2.3): one oldest-first timeline built from TaskEvent rows. Comments stay
 * comments. Every other event becomes one plain sentence ("Connor set status
 * to In progress"), and a person's burst of changes folds into one line:
 *
 *  - back-to-back changes by one person within 30 minutes of the first form a
 *    burst; anyone else, or any comment, ends it. People are told apart by
 *    user, contact, label and source together, because the automated writers
 *    ("Asana sync", "Repeats", "Property reminder") and unmatched Asana people
 *    have no ids;
 *  - a burst's changes of one kind read as one sentence ("Zack checked 14
 *    items", "Pieter moved the due date from Oct 20 to Oct 30"), and a burst
 *    of three or more sentences shows the first and a count ("Connor
 *    assigned Zack and made 3 more changes"), each a folded run that opens
 *    onto its original lines;
 *  - never folded: comments, Mark done, Approve, Send back, a contractor's
 *    Start, creation, the next repeat, access changes and sync conflicts;
 *  - a change the same person reversed within 2 minutes doesn't show, when
 *    both were Internal (a reversed Shared change may already have been
 *    emailed or seen, so it stays);
 *  - a status change and the note written with it (`data.statusEventId`) are
 *    one decision; files posted within 2 minutes of each other by one person
 *    are one batch line; a soft-deleted comment leaves a staff-only line,
 *    except a photo post its contractor took back, which goes.
 *
 * Pure; see activity.test.ts.
 */

export interface ActivityEvent {
  id: string;
  kind: TaskEventKind;
  visibility: Visibility;
  actorLabel: string;
  actorUserId: string | null;
  actorContactId: string | null;
  body: string | null;
  data: unknown;
  createdAt: Date;
  /** "APP", "PORTAL", "SYSTEM" or "ASANA". Absent reads as "APP". */
  source?: string;
  /** Set on a story the Asana import brought in. */
  asanaStoryGid?: string | null;
  /** On a staff or system line: the contractor it was addressed to when written (rules.ts writeAudience). */
  audienceContactId?: string | null;
  editedAt?: Date | null;
  /** A deleted comment leaves a line; any other deleted event is left out. */
  deletedAt?: Date | null;
}

/** Names for the ids events carry. */
export interface ActivityNames {
  users?: Readonly<Record<string, string>>;
  contacts?: Readonly<Record<string, string>>;
  properties?: Readonly<Record<string, string>>;
}

/** What every entry says about the events behind it. */
interface Base<E> {
  /** The first event's id (the entry's anchor is `update-<id>`). */
  id: string;
  /** When it happened: the latest event behind it. */
  at: Date;
  /** Every event the entry stands for, oldest first. */
  events: E[];
  /** Brought in by the Asana import (a story row or the importer's creation line). */
  imported: boolean;
}

/** One system event as a line. */
export interface LineEntry<E extends ActivityEvent = ActivityEvent> extends Base<E> {
  type: "line";
  event: E;
  text: string;
  href?: string;
  /** A status change's new status, for the mark on the rail. */
  status?: TaskStatus;
  /** A notes change's text from before the save, for "View previous". Absent on imported and older rows. */
  previousNotes?: string;
  /** A live Asana sync event, after the move: " · via Asana". */
  viaAsana?: boolean;
}

export type ActivityEntry<E extends ActivityEvent = ActivityEvent> =
  | (Base<E> & { type: "comment"; event: E })
  | (Base<E> & { type: "deleted"; event: E })
  | LineEntry<E>
  /** Several events as one line, opening onto its members. */
  | (Base<E> & { type: "run"; text: string; lines: LineEntry<E>[]; status?: TaskStatus; previousNotes?: string })
  /** Files posted together by one person: "Zack added 4 photos". */
  | (Base<E> & { type: "batch"; text: string })
  /** A status change and the note written with it. */
  | (Base<E> & { type: "decision"; line: LineEntry<E>; note: E | null });

type Data = Record<string, unknown>;
const dataOf = (e: ActivityEvent): Data => (e.data && typeof e.data === "object" ? (e.data as Data) : {});
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const THIRTY_MINUTES = 30 * 60_000;
const TWO_MINUTES = 2 * 60_000;

/** "Thu, Oct 30", with the year when it isn't this one. */
export function fmtShortDay(v: Ymd | null | undefined, today: Ymd): string {
  const y = toYmd(v);
  if (!y) return "";
  const [yy, mm, dd] = y.split("-").map(Number);
  const sameYear = y.slice(0, 4) === today.slice(0, 4);
  return new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** The Buffalo calendar day an instant falls on. */
export const easternDay = (at: Date): Ymd => todayYmdEastern(at);

/** People by first name; automated writers ("Property reminder", "Repeats") by their label. */
function who(e: ActivityEvent): string {
  return e.actorUserId || e.actorContactId ? firstName(e.actorLabel) || e.actorLabel : e.actorLabel;
}

function quoted(t: string | null): string {
  return t ? `“${t}”` : "";
}

function statusLine(e: ActivityEvent, d: Data, today: Ymd): string {
  const a = who(e);
  const to = s(d.to) as TaskStatus | null;
  const from = s(d.from) as TaskStatus | null;
  if (!to || !(to in STATUS_LABEL)) return `${a} changed the status`;
  if (to === "REVIEW") return `${a} marked this done`;
  if (from === "REVIEW" && to === "DONE") return `${a} approved this`;
  if (from === "REVIEW" && to === "IN_PROGRESS") return `${a} sent this back`;
  const waiting = s(d.waitingOn);
  if (to === "WAITING" && waiting) return `${a} set status to Waiting on ${waiting}`;
  const visit = s(d.scheduledFor);
  if (to === "SCHEDULED" && visit) return `${a} set status to Scheduled for ${fmtShortDay(visit, today)}`;
  return `${a} set status to ${STATUS_LABEL[to]}`;
}

function assigneeName(to: unknown, names: ActivityNames): string | null {
  if (!to || typeof to !== "object") return null;
  const t = to as Data;
  const userId = s(t.userId);
  const contactId = s(t.contactId);
  return (
    (userId && names.users?.[userId]) || (contactId && names.contacts?.[contactId]) || s(t.name) || (userId || contactId ? "someone" : null)
  );
}

function propertyLine(e: ActivityEvent, d: Data, names: ActivityNames): string {
  const a = who(e);
  if ("unitTo" in d || "unitFrom" in d) {
    const unit = s(d.unitTo);
    return unit ? `${a} set the unit to ${unit}` : `${a} cleared the unit`;
  }
  const to = s(d.to);
  const place = (to && names.properties?.[to]) || s(d.toSection);
  if (place) return `${a} moved this to ${place}`;
  return to ? `${a} moved this to another property` : `${a} removed the property`;
}

/** What a sync conflict calls a field. */
const CONFLICT_FIELD: Record<string, string> = {
  title: "the title",
  description: "the notes",
  dueDate: "the due date",
  startDate: "the start date",
  place: "the property",
  assignee: "the assignee",
  completed: "the status",
  checklist: "a checklist item",
};

/** The value HG kept in a conflict, as a short phrase, or null when it can't be said plainly. Never a raw object or JSON. */
function keptValue(field: string, v: unknown, names: ActivityNames, today: Ymd): string | null {
  switch (field) {
    case "dueDate":
    case "startDate": {
      const day = toYmd(typeof v === "string" ? v : null);
      return day ? fmtShortDay(day, today) : "no date";
    }
    case "title": {
      const t = s(v);
      return t && t.length <= 60 ? quoted(t) : null;
    }
    case "description":
      return "the HG notes";
    case "completed":
      return v === true ? "Done" : v === false ? "it open" : null;
    case "place": {
      const p = v && typeof v === "object" ? (v as Data) : null;
      const id = s(p?.propertyId);
      return (id && names.properties?.[id]) || s(p?.bucket);
    }
    case "assignee":
      return assigneeName(v, names) ?? "nobody";
    default:
      return null;
  }
}

/** A sync conflict as a sentence: "Asana and HG disagreed on the due date. Kept Fri, Oct 30." Older rows with no field say so plainly. */
function conflictLine(d: Data, names: ActivityNames, today: Ymd): string {
  const field = s(d.field);
  if (field === "section") return "Asana moved this to a section that isn't imported. Kept where it is.";
  if (!field || !(field in CONFLICT_FIELD)) return "Asana and HG disagreed on a change";
  const kept = keptValue(field, d.app, names, today);
  return `Asana and HG disagreed on ${CONFLICT_FIELD[field]}.${kept ? ` Kept ${kept}.` : ""}`;
}

/** One system event as a sentence. Comments aren't lines. */
export function eventLine(e: ActivityEvent, names: ActivityNames, today: Ymd): { text: string; href?: string } {
  const d = dataOf(e);
  const a = who(e);
  switch (e.kind) {
    case "CREATED": {
      const of = s(d.repeatOf);
      return of ? { text: "Created as the next repeat", href: `/tasks/${of}` } : { text: `${a} created this task` };
    }
    case "ASSIGNED": {
      const name = assigneeName(d.to, names);
      return { text: name ? `${a} assigned ${name}` : `${a} unassigned this` };
    }
    case "STATUS":
      return { text: statusLine(e, d, today) };
    case "DUE": {
      const to = s(d.to);
      if (!to) return { text: `${a} cleared the due date` };
      return { text: `${a} ${s(d.from) ? "moved" : "set"} the due date to ${fmtShortDay(to, today)}` };
    }
    case "SCHEDULED": {
      const to = s(d.to);
      return { text: to ? `${a} moved the visit to ${fmtShortDay(to, today)}` : `${a} cleared the visit date` };
    }
    case "PROPERTY":
      return { text: propertyLine(e, d, names) };
    case "TITLE": {
      const from = s(d.from);
      return { text: from ? `${a} renamed this from ${quoted(from)}` : `${a} renamed this` };
    }
    case "NOTES":
      return { text: `${a} edited the notes` };
    case "ATTACHMENT": {
      const name = s(d.filename);
      // A posted file taken off the task leaves its own line (deleteTaskAttachment; uploads 2.4).
      if (d.removed === true) return { text: name ? `${a} removed ${name}` : `${a} removed a file` };
      return { text: name ? `${a} added ${name}` : `${a} added a file` };
    }
    case "CHECKLIST": {
      const title = quoted(s(d.title));
      // The edits to the list itself name their action; a tick carries `done`.
      if (d.action === "renamed") {
        const from = quoted(s(d.from));
        const to = quoted(s(d.to));
        return { text: from && to ? `${a} renamed ${from} to ${to}` : `${a} renamed ${title || "an item"}` };
      }
      if (d.action === "removed") return { text: `${a} removed ${title || "an item"}` };
      if (d.action === "restored") return { text: `${a} put back ${title || "an item"}` };
      if (d.done === true) return { text: `${a} checked ${title || "an item"}` };
      if (d.done === false) return { text: `${a} unchecked ${title || "an item"}` };
      return { text: `${a} updated ${title || "the checklist"}` };
    }
    case "ACCESS":
      return { text: `${a} changed who can see this` };
    case "REPEAT_CREATED": {
      const due = s(d.due);
      const next = s(d.next);
      return {
        text: due ? `Next repeat created, due ${fmtShortDay(due, today)}` : "Next repeat created",
        ...(next ? { href: `/tasks/${next}` } : {}),
      };
    }
    case "REPEAT": {
      // Turning repeats on, changing them or turning them off (activity 2.3 rule 9): `to` is the rule now, null when off.
      if (d.to == null) return { text: `${a} turned off repeats` };
      const rule = parseRepeatRule(d.to);
      return { text: rule ? `${a} set this to repeat ${describeRepeat(rule).replace(/^Every/, "every")}` : `${a} changed how this repeats` };
    }
    case "CONFLICT":
      return { text: conflictLine(d, names, today) };
    case "COMMENT":
      return { text: e.body ?? "" };
  }
}

/* ---------------- Who did it, and what folds ---------------- */

/**
 * One person for burst purposes. User, contact, label and source together,
 * since "Asana sync", "Repeats", "Property reminder" and unmatched Asana
 * people all have no ids, and two partners with the same first name differ by id.
 */
const actorKey = (e: ActivityEvent) => [e.actorUserId ?? "", e.actorContactId ?? "", e.actorLabel, e.source ?? "APP"].join("|");

/** Brought in by the Asana import: a story row, or the importer's own creation line. */
export function isImported(e: ActivityEvent): boolean {
  return e.source === "ASANA" && (!!e.asanaStoryGid || e.kind === "CREATED");
}

/** A status change that is a decision or a contractor's first move: Mark done, Approve, Send back, Start. Never folded. */
function isDecisionStatus(e: ActivityEvent): boolean {
  if (e.kind !== "STATUS") return false;
  const d = dataOf(e);
  const to = s(d.to);
  const from = s(d.from);
  if (to === "REVIEW" || from === "REVIEW") return true;
  return !!e.actorContactId && to === "IN_PROGRESS";
}

const NEVER_FOLD: ReadonlySet<TaskEventKind> = new Set(["CREATED", "REPEAT_CREATED", "CONFLICT", "ACCESS"]);

const neverFolds = (e: ActivityEvent) => NEVER_FOLD.has(e.kind) || isDecisionStatus(e);

/** The notes text from before a save, when the event kept it (`from` present, even when empty). */
function notesBefore(e: ActivityEvent): string | undefined {
  if (e.kind !== "NOTES") return undefined;
  const d = dataOf(e);
  return typeof d.from === "string" ? d.from : undefined;
}

function statusOf(e: ActivityEvent): TaskStatus | undefined {
  if (e.kind !== "STATUS") return undefined;
  const to = s(dataOf(e).to);
  return to && to in STATUS_LABEL ? (to as TaskStatus) : undefined;
}

/* ---------------- Reversals ---------------- */

/** What a reversal compares: the value a change moved from, and the one it moved to. */
function moveOf(e: ActivityEvent): { key: string; from: string; to: string } | null {
  const d = dataOf(e);
  const v = (x: unknown) => (typeof x === "string" ? x : x == null ? "" : null);
  switch (e.kind) {
    case "DUE":
    case "SCHEDULED":
    case "STATUS":
    case "TITLE": {
      const from = v(d.from);
      const to = v(d.to);
      return from === null || to === null ? null : { key: e.kind, from, to };
    }
    case "PROPERTY": {
      if ("unitFrom" in d || "unitTo" in d) {
        const from = v(d.unitFrom);
        const to = v(d.unitTo);
        return from === null || to === null ? null : { key: "unit", from, to };
      }
      const from = v(d.from);
      const to = v(d.to);
      return from === null || to === null ? null : { key: "property", from, to };
    }
    case "ASSIGNED": {
      const side = (x: unknown) => {
        const o = x && typeof x === "object" ? (x as Data) : {};
        return `${s(o.userId) ?? ""}|${s(o.contactId) ?? ""}`;
      };
      return { key: "assigned", from: side(d.from), to: side(d.to) };
    }
    case "CHECKLIST": {
      const item = s(d.itemId);
      if (!item || d.action !== undefined || typeof d.done !== "boolean") return null;
      return { key: `tick:${item}`, from: d.done ? "off" : "on", to: d.done ? "on" : "off" };
    }
    default:
      return null;
  }
}

/**
 * The events to leave out because the same person undid them inside two
 * minutes (due date there and back, a tick and an untick, an Approve taken
 * back). Only when both were Internal: a Shared change may already be in an
 * email or on the contractor's screen, so a reversal of it stays. A Done
 * whose next repeat was created is kept too, since that line still stands.
 */
function reversedPairs(events: readonly ActivityEvent[]): Set<string> {
  const hidden = new Set<string>();
  const repeatMade = events.filter((e) => e.kind === "REPEAT_CREATED").map((e) => e.createdAt.getTime());
  const last = new Map<string, { e: ActivityEvent; move: { from: string; to: string } }>();
  for (const e of events) {
    const move = moveOf(e);
    if (!move) continue;
    const key = `${actorKey(e)}|${move.key}`;
    const prev = last.get(key);
    const undoes =
      prev &&
      prev.move.from === move.to &&
      prev.move.to === move.from &&
      e.createdAt.getTime() - prev.e.createdAt.getTime() <= TWO_MINUTES &&
      prev.e.visibility === "INTERNAL" &&
      e.visibility === "INTERNAL" &&
      !(statusOf(prev.e) === "DONE" && repeatMade.some((t) => t >= prev.e.createdAt.getTime() && t <= prev.e.createdAt.getTime() + 60_000));
    if (undoes) {
      hidden.add(prev.e.id);
      hidden.add(e.id);
      last.delete(key);
    } else {
      last.set(key, { e, move });
    }
  }
  return hidden;
}

/* ---------------- Bursts ---------------- */

/** Which events of a burst read as one sentence. */
function groupKey(e: ActivityEvent): string {
  const d = dataOf(e);
  switch (e.kind) {
    case "CHECKLIST":
      return d.action === undefined && typeof d.done === "boolean" ? "tick" : `solo:${e.id}`;
    case "DUE":
      return "due";
    case "SCHEDULED":
      return "visit";
    case "STATUS":
      return "status";
    case "NOTES":
      return "notes";
    case "TITLE":
      return "title";
    case "ASSIGNED":
      return "assigned";
    case "PROPERTY":
      return "unitTo" in d || "unitFrom" in d ? "unit" : "property";
    case "REPEAT":
      return "repeat";
    default:
      return `solo:${e.id}`;
  }
}

/** A date moved several times: "moved the due date from Oct 20 to Oct 30", "set the due date, then cleared it". */
function datesSentence(a: string, noun: string, evs: ActivityEvent[], today: Ymd, verbs: { move: string; clear: string }): string {
  const from = s(dataOf(evs[0]).from);
  const to = s(dataOf(evs[evs.length - 1]).to);
  if (!from && !to) return `${a} set ${noun}, then cleared it`;
  if (!to) return `${a} ${verbs.clear}`;
  if (!from) return `${a} set ${noun} to ${fmtShortDay(to, today)}`;
  if (from === to) return `${a} moved ${noun} ${evs.length} times`;
  return `${a} moved ${noun} from ${fmtShortDay(from, today)} to ${fmtShortDay(to, today)}`;
}

/** Several events of one kind as one sentence. */
function mergedSentence(key: string, evs: ActivityEvent[], names: ActivityNames, today: Ymd): { text: string; status?: TaskStatus; previousNotes?: string } {
  const a = who(evs[0]);
  const last = evs[evs.length - 1];
  switch (key) {
    case "tick": {
      const on = evs.filter((e) => dataOf(e).done === true).length;
      const off = evs.length - on;
      const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;
      const parts = [on && `checked ${items(on)}`, off && `unchecked ${items(off)}`].filter(Boolean);
      return { text: `${a} ${parts.join(" and ")}` };
    }
    case "due":
      return { text: datesSentence(a, "the due date", evs, today, { move: "moved", clear: "cleared the due date" }) };
    case "visit":
      return { text: datesSentence(a, "the visit", evs, today, { move: "moved", clear: "cleared the visit date" }) };
    case "status": {
      const first = evs[0];
      const origin = s(dataOf(first).from) as TaskStatus | null;
      const now = statusOf(last);
      const label = (x: string | null) => (x && x in STATUS_LABEL ? STATUS_LABEL[x as TaskStatus] : "another status");
      if (evs.length === 2 && origin && now === origin) {
        return { text: `${a} set status to ${label(s(dataOf(first).to))}, then back to ${label(origin)}`, status: now };
      }
      return { text: `${a} changed the status ${evs.length} times, now ${label(now ?? null)}`, status: now };
    }
    case "notes":
      return { text: `${a} edited the notes`, previousNotes: notesBefore(evs[0]) };
    case "title": {
      const from = s(dataOf(evs[0]).from);
      return { text: from ? `${a} renamed this from ${quoted(from)}` : `${a} renamed this` };
    }
    default:
      return { text: eventLine(last, names, today).text };
  }
}

/* ---------------- The timeline ---------------- */

export interface BuildOptions {
  /** The kinds of the files each ATTACHMENT event carries, by event id, so a batch can say "4 photos". */
  fileKinds?: ReadonlyMap<string, readonly ("image" | "video" | "file")[]>;
}

/**
 * Events (any order) into timeline entries, oldest first: folded, paired and
 * batched as the file header describes.
 */
export function buildActivity<E extends ActivityEvent>(events: readonly E[], names: ActivityNames, today: Ymd, opts: BuildOptions = {}): ActivityEntry<E>[] {
  const sorted = [...events].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || x.id.localeCompare(y.id));
  // A deleted comment leaves a line. Anything else deleted (an undone approval) is gone from the timeline, and so
  // is a photo post its contractor took back (`data.batch`): that is an Undo at once, not a deleted comment.
  const live = sorted.filter((e) => !e.deletedAt || (e.kind === "COMMENT" && dataOf(e).batch !== true));
  const hidden = reversedPairs(live.filter((e) => !e.deletedAt));

  // A note is paired with the status change it was written with, by id, never by adjacency.
  const statusIds = new Set(live.filter((e) => e.kind === "STATUS" && !hidden.has(e.id)).map((e) => e.id));
  const noteFor = new Map<string, E>();
  for (const e of live) {
    const of = e.kind === "COMMENT" && !e.deletedAt ? s(dataOf(e).statusEventId) : null;
    if (of && statusIds.has(of) && !noteFor.has(of)) noteFor.set(of, e);
  }
  const paired = new Set([...noteFor.values()].map((e) => e.id));

  const out: ActivityEntry<E>[] = [];
  const line = (e: E): LineEntry<E> => {
    const l = eventLine(e, names, today);
    const imported = isImported(e);
    return {
      type: "line",
      id: e.id,
      at: e.createdAt,
      events: [e],
      imported,
      event: e,
      text: l.text,
      ...(l.href ? { href: l.href } : {}),
      ...(statusOf(e) ? { status: statusOf(e) } : {}),
      ...(notesBefore(e) !== undefined ? { previousNotes: notesBefore(e) } : {}),
      ...(e.source === "ASANA" && !imported ? { viaAsana: true } : {}),
    };
  };

  let burst: E[] = [];
  let files: E[] = [];

  const flushFiles = () => {
    if (files.length === 0) return;
    if (files.length === 1) out.push(line(files[0]));
    else {
      const kinds = files.flatMap((e) => opts.fileKinds?.get(e.id) ?? ["file" as const]);
      out.push({
        type: "batch",
        id: files[0].id,
        at: files[files.length - 1].createdAt,
        events: files,
        imported: files.every(isImported),
        text: `${who(files[0])} added ${uploadCountPhrase(kinds)}`,
      });
    }
    files = [];
  };

  const flushBurst = () => {
    if (burst.length === 0) return;
    out.push(...burstEntries(burst, names, today, line));
    burst = [];
  };
  const flush = () => {
    flushBurst();
    flushFiles();
  };

  for (const e of live) {
    if (hidden.has(e.id)) continue;
    if (e.kind === "COMMENT") {
      if (paired.has(e.id)) continue;
      flush();
      const base = { id: e.id, at: e.createdAt, events: [e], imported: isImported(e), event: e };
      out.push(e.deletedAt ? { type: "deleted", ...base } : { type: "comment", ...base });
      continue;
    }
    const note = e.kind === "STATUS" ? noteFor.get(e.id) : undefined;
    if (note) {
      flush();
      out.push({ type: "decision", id: e.id, at: note.createdAt > e.createdAt ? note.createdAt : e.createdAt, events: [e, note], imported: isImported(e), line: line(e), note });
      continue;
    }
    if (e.kind === "ATTACHMENT") {
      flushBurst();
      if (dataOf(e).removed === true) {
        flushFiles();
        out.push(line(e));
        continue;
      }
      const prev = files[files.length - 1];
      if (prev && (actorKey(prev) !== actorKey(e) || e.createdAt.getTime() - prev.createdAt.getTime() > TWO_MINUTES)) flushFiles();
      files.push(e);
      continue;
    }
    flushFiles();
    if (neverFolds(e)) {
      flushBurst();
      out.push(line(e));
      continue;
    }
    if (burst.length && (actorKey(burst[0]) !== actorKey(e) || e.createdAt.getTime() - burst[0].createdAt.getTime() > THIRTY_MINUTES)) flushBurst();
    burst.push(e);
  }
  flush();
  return out;
}

/** One person's burst as entries: sentences by kind, folded when it stands for more than one event. */
function burstEntries<E extends ActivityEvent>(burst: E[], names: ActivityNames, today: Ymd, line: (e: E) => LineEntry<E>): ActivityEntry<E>[] {
  if (burst.length === 1) return [line(burst[0])];
  const groups = new Map<string, E[]>();
  for (const e of burst) groups.set(groupKey(e), [...(groups.get(groupKey(e)) ?? []), e]);
  const imported = burst.every(isImported);
  const run = (evs: E[], sentence: { text: string; status?: TaskStatus; previousNotes?: string }): ActivityEntry<E> => ({
    type: "run",
    id: evs[0].id,
    at: evs[evs.length - 1].createdAt,
    events: evs,
    imported,
    text: sentence.text,
    lines: evs.map(line),
    ...(sentence.status ? { status: sentence.status } : {}),
    ...(sentence.previousNotes !== undefined ? { previousNotes: sentence.previousNotes } : {}),
  });

  const list = [...groups.entries()];
  if (list.length >= 3) {
    // Three sentences or more: the first, and how many changes sit behind it.
    const [key, first] = list[0];
    const more = burst.length - first.length;
    const lead = first.length === 1 ? { text: eventLine(first[0], names, today).text } : mergedSentence(key, first, names, today);
    return [run(burst, { text: `${lead.text} and made ${more} more ${more === 1 ? "change" : "changes"}` })];
  }
  return list.map(([key, evs]) => (evs.length === 1 ? line(evs[0]) : run(evs, mergedSentence(key, evs, names, today))));
}

/* ---------------- Reading the timeline ---------------- */

/**
 * Whether anything an entry stands for is new to this viewer, whatever the
 * time: written in the app or the portal by someone else, a comment or a
 * contractor's photos, start or Mark done (activity 2.6). The client compares
 * its `at` with the New divider's baseline.
 */
export function countsAsUnread(e: UnreadCandidate, viewerId: string, baseline: Date): boolean {
  if (e.deletedAt) return false;
  if (e.source !== "APP" && e.source !== "PORTAL") return false;
  if (e.actorUserId === viewerId) return false;
  if (new Date(e.createdAt).getTime() <= baseline.getTime()) return false;
  if (e.kind === "COMMENT") return true;
  return e.actorContactId !== null && (e.kind === "ATTACHMENT" || e.kind === "STATUS");
}

/** What the unread rule reads from a task event. */
export interface UnreadCandidate {
  kind: string;
  /** "APP", "PORTAL", "ASANA" or "SYSTEM". */
  source: string;
  actorUserId: string | null;
  actorContactId: string | null;
  createdAt: Date | string;
  deletedAt?: Date | string | null;
}

/** Whether an entry holds anything new to this viewer, whenever it was written. */
export function entryIsFresh<E extends ActivityEvent>(entry: ActivityEntry<E>, viewerId: string): boolean {
  const epoch = new Date(0);
  return entry.events.some((e) => countsAsUnread({ ...e, source: e.source ?? "APP" }, viewerId, epoch));
}

/**
 * Who has the last word on the job: the contractor when their newest comment
 * has no Shared staff comment after it, staff when the newest is theirs, null
 * with no comments (activity 2.3; a later Home pass flags the contractor's).
 * An Internal note answers nobody, so it doesn't count as a reply.
 */
export function lastWordBy(events: readonly ActivityEvent[]): "contractor" | "staff" | null {
  const comments = events
    .filter((e) => e.kind === "COMMENT" && !e.deletedAt)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.actorContactId) return "contractor";
    if (c.visibility === "SHARED") return "staff";
  }
  return null;
}

/** The first entry that is new to this viewer after `newSince`, as an index, or -1. The New divider sits above it. */
export function firstNewIndex(rows: readonly { at: Date | string; fresh: boolean }[], newSince: Date | string | null): number {
  if (newSince == null) return -1;
  const since = new Date(newSince).getTime();
  return rows.findIndex((r) => r.fresh && new Date(r.at).getTime() > since);
}

/** The latest `shown` entries, and how many earlier ones are folded away. */
export function splitEarlier<T>(entries: readonly T[], shown = 15): { earlier: T[]; latest: T[] } {
  const cut = Math.max(0, entries.length - shown);
  return { earlier: entries.slice(0, cut), latest: entries.slice(cut) };
}

/**
 * Where the visible part of the timeline starts (activity 2.3 rule 7): the
 * latest `shown` rows, but never later than the New divider's first row or an
 * anchored one, so the fold never hides what a link or the dot points at.
 */
export function foldStart(total: number, o: { shown?: number; firstNew?: number; anchored?: number } = {}): number {
  let start = Math.max(0, total - (o.shown ?? 15));
  for (const i of [o.firstNew, o.anchored]) if (i != null && i >= 0) start = Math.min(start, i);
  return start;
}

/** Entries grouped under their day, in order. `dayOf` gives each entry's day. */
export function groupByDay<T>(entries: readonly T[], dayOf: (t: T) => Ymd): { day: Ymd; entries: T[] }[] {
  const groups: { day: Ymd; entries: T[] }[] = [];
  for (const t of entries) {
    const day = dayOf(t);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(t);
    else groups.push({ day, entries: [t] });
  }
  return groups;
}

/** Days after which history groups by month instead of day (activity 2.3 rule 8). */
export const MONTH_AFTER_DAYS = 60;

/**
 * Entries under a day heading, or under a month heading once they are more
 * than 60 days back. `day` is the entry's day (for a month, any day in it);
 * consecutive entries of one day or month share a group.
 */
export function groupHeadings<T>(entries: readonly T[], dayOf: (t: T) => Ymd, today: Ymd): { month: boolean; day: Ymd; entries: T[] }[] {
  const groups: { month: boolean; day: Ymd; entries: T[] }[] = [];
  for (const t of entries) {
    const day = dayOf(t);
    const month = (daysUntil(day, today) ?? 0) < -MONTH_AFTER_DAYS;
    const key = month ? day.slice(0, 7) : day;
    const last = groups[groups.length - 1];
    if (last && last.month === month && (month ? last.day.slice(0, 7) : last.day) === key) last.entries.push(t);
    else groups.push({ month, day, entries: [t] });
  }
  return groups;
}
