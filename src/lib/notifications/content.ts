import type { TaskStatus } from "@prisma/client";
import { HG_TIME_ZONE, dueLabel, fmtDay, toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import { firstName as greetingName } from "@/lib/names";
import { shortAddress } from "@/lib/normalize";
import { STATUS_LABEL, isActiveStatus } from "@/lib/task-scope";
import { contractorMaySetDate, jobLinkUrl, type JobLinkStep } from "@/lib/portal/job-link-paths";
import { isAfterDue, scheduledDay } from "@/lib/tasks/rules";
import { reminderFor } from "./reminder-rules";
import { addressLine, firstName, joinNames, nextStep } from "@/lib/portal/job-view";

/**
 * What a bundled task email says, who it goes to, and the send rules
 * (docs/asana-migration-plan.md §5.4, D19, D20, D30). Pure; outbox.ts does
 * the database and the sending. See content.test.ts.
 *
 * Rows are queued by src/lib/tasks/core.ts, one per recipient and task, each
 * holding the bundled changes as items: { kind, actorLabel, summary, at },
 * and on some items the eventId of the event the line is about.
 */

export interface OutboxItem {
  kind: string;
  actorLabel: string;
  summary: string;
  at: string;
  /**
   * The event the line is about (core.ts OutboxItem), decided per item: the
   * drain re-reads it when it claims the row (reconcileItems), and the button
   * opens at the first one (firstUpdateId). A row can mix items with and
   * without it, and an item without it sends exactly as stored.
   */
  eventId?: string;
  /** A send-back's note comment: its text is inside the STATUS summary, and the drain rebuilds or strips it. */
  noteEventId?: string;
  /** Legacy TARGET rows (before Nov 21) only: present means the line names the due date. */
  visit?: boolean;
  /** The 8 am lines (reminders.ts): the day the reminder is for, which keeps each to once per kind and day. */
  due?: string;
  /**
   * TARGET, DAY, NOTES and STATUS: what the job had before this change, so a
   * change put back before the email goes is dropped (undoneDropped). TARGET:
   * the due date, DAY: the scheduled day, "" for none. NOTES: notesFingerprint of the
   * notes. STATUS: the status. Absent on rows queued before Nov 15.
   */
  from?: string;
  /** OFF ("took you off"): the job as they knew it then (jobKey), for offItems. Absent on lines queued before Nov 20. */
  job?: string;
}

/** Lines that are the job's own news, with nobody's name in front: the 8 am emails. */
const UNSIGNED_KINDS = new Set(["SCHEDULED_TODAY", "SCHEDULED_TOMORROW", "DUE_TODAY", "DUE_TOMORROW", "OVERDUE"]);

/** The 24-hour notice heads-up (docs/specs/contractor-scheduled-date.md, Q6). */
const NOTICE_KINDS = new Set(["SCHEDULED_TOMORROW", "DUE_TOMORROW"]);

/** The items column, keeping only well-formed entries. */
export function parseItems(json: unknown): OutboxItem[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (i): i is OutboxItem =>
      !!i && typeof i === "object" && typeof i.kind === "string" && typeof i.actorLabel === "string" && typeof i.summary === "string",
  );
}

// ---------------------------------------------------------------------------
// Who it goes to
// ---------------------------------------------------------------------------

export type Audience = "staff" | "contractor";

export interface RowRecipient {
  recipientUser: { email: string } | null;
  recipientContact: { active: boolean; portalAccount: { email: string; status: string; jobEmails: boolean } | null } | null;
}

export type Delivery =
  | { ok: true; to: string; audience: Audience }
  | { ok: false; reason: "no login" | "no recipient" | "no access" | "emails off" };

/**
 * A row goes to a staff User, or to a contractor with an active contact and
 * an ACTIVE portal login (their login email). A contractor without one is
 * skipped: there's nothing for the button to open.
 *
 * A contractor also needs live access to the job when it's sent, not just
 * when it was queued (D12: reassigning removes access). Otherwise someone
 * taken off a job minutes after a change would still get its title, address
 * and Shared comments by email. `contractorHasAccess` is an unrevoked
 * TaskAccess row for the recipient on the row's task.
 *
 * Their "Job emails" switch is read again here too
 * (docs/specs/contractor-email-switch.md): a line still waiting when staff
 * turn it off is dropped, not sent. The first sign-in isn't: a row is only
 * ever queued for someone who has signed in (tasks/core.ts notify).
 */
export function deliveryFor(row: RowRecipient, opts: { contractorHasAccess: boolean }): Delivery {
  if (row.recipientUser) return { ok: true, to: row.recipientUser.email, audience: "staff" };
  const c = row.recipientContact;
  if (!c) return { ok: false, reason: "no recipient" };
  if (!c.active || c.portalAccount?.status !== "ACTIVE") return { ok: false, reason: "no login" };
  if (!c.portalAccount.jobEmails) return { ok: false, reason: "emails off" };
  if (!opts.contractorHasAccess) return { ok: false, reason: "no access" };
  return { ok: true, to: c.portalAccount.email, audience: "contractor" };
}

/**
 * Staff open the task in the app; contractors open the job in the portal.
 * With `eventId` the link opens at that update (`#update-<id>`, activity 2.6).
 */
export function openUrl(appUrl: string, audience: Audience, taskId: string, eventId?: string | null): string {
  const origin = appUrl.replace(/\/+$/, "");
  const page = audience === "staff" ? `${origin}/tasks/${taskId}` : `${origin}/p/jobs/${taskId}`;
  return eventId ? `${page}#update-${eventId}` : page;
}

// ---------------------------------------------------------------------------
// Re-reading the events a row names, when it is claimed (activity 2.5)
// ---------------------------------------------------------------------------

/** What the drain read back about one event an item names. */
export interface EventSnapshot {
  id: string;
  visibility: "SHARED" | "INTERNAL";
  /** Set once it was deleted: the item is dropped. */
  deletedAt: Date | string | null;
  body: string | null;
  /** The contractor the event was addressed to when it was written, if any. */
  audienceContactId: string | null;
  /** The files still up on it, by kind. */
  files: readonly ("image" | "video" | "file")[];
}

/** The longest comment an email carries; a longer one ends in an ellipsis. */
export const EMAIL_COMMENT_MAX = 500;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * How an email counts a comment's files: "3 photos and 1 file", "2 photos and
 * 1 video", "1 photo", "4 files". Photos, then videos, then everything else,
 * joined with commas and a last "and".
 */
export function filePhrase(kinds: readonly ("image" | "video" | "file")[]): string {
  const parts = [
    ["photo", kinds.filter((k) => k === "image").length],
    ["video", kinds.filter((k) => k === "video").length],
    ["file", kinds.filter((k) => k === "file").length],
  ]
    .filter(([, n]) => (n as number) > 0)
    .map(([noun, n]) => plural(n as number, noun as string));
  return parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** A comment's text for an email: its line breaks kept, cut at 500 characters with an ellipsis. */
function emailBody(body: string): string {
  const text = keepBreaks(body);
  return text.length > EMAIL_COMMENT_MAX ? `${text.slice(0, EMAIL_COMMENT_MAX).trimEnd()}…` : text;
}

/**
 * The items of a claimed row, as they stand now. Run on what the row held at
 * the claim, so what is sent is the comment as it is when the email goes:
 *
 *  - an item with no `eventId` (queued before it existed) sends as stored;
 *  - an item whose event is gone or deleted is dropped (a delete inside the
 *    10-minute bundle window means Zack never gets it);
 *  - a comment is rebuilt from the event's current text and files, up to 500
 *    characters with its line breaks, "3 photos and 1 file" for the files,
 *    and dropped if it is empty now;
 *  - a file post with no live file left is dropped, so its email never says
 *    "added quote.pdf" for a file that is gone, and its button never opens
 *    at a row the portal does not show;
 *  - a comment, file post or status for a contractor must still be Shared and
 *    addressed to them; a Shared event never turns Internal, so this only
 *    guards a row that was queued oddly. ASSIGNED, TARGET and NOTES have no
 *    event and are never filtered: they are emailed to contractors by design;
 *  - a send-back's note, which lives inside its STATUS line, is rebuilt from
 *    the note comment as it stands, or taken out if that was deleted.
 *
 * The order is kept. An item that names an event the caller didn't read
 * (`events` lacks it) is dropped like a missing one.
 */
export function reconcileItems(
  items: readonly OutboxItem[],
  events: ReadonlyMap<string, EventSnapshot>,
  row: { audience: Audience; recipientContactId: string | null },
): OutboxItem[] {
  const out: OutboxItem[] = [];
  for (const item of items) {
    if (!item.eventId) {
      out.push(item);
      continue;
    }
    const ev = events.get(item.eventId);
    if (!ev || ev.deletedAt) continue;
    const mayRead =
      row.audience === "staff" ||
      (ev.visibility === "SHARED" && (ev.audienceContactId === null || ev.audienceContactId === row.recipientContactId));
    if (item.kind === "COMMENT") {
      if (!mayRead) continue;
      const text = ev.body ? emailBody(ev.body) : "";
      const files = filePhrase(ev.files);
      if (!text && !files) continue;
      out.push({ ...item, summary: text ? `"${text}"${files ? ` (${files})` : ""}` : `added ${files}` });
      continue;
    }
    if (item.kind === "STATUS" || item.kind === "ATTACHMENT") {
      if (!mayRead) continue;
      // A file post whose files were all taken off since says nothing now, and the portal shows no row for it to open at.
      if (item.kind === "ATTACHMENT" && ev.files.length === 0) continue;
      out.push(item.kind === "STATUS" && item.noteEventId ? withSendBackNote(item, events.get(item.noteEventId)) : item);
      continue;
    }
    out.push(item);
  }
  return out;
}

/** `sent "T" back: note` with the note as it is now: rewritten if edited, taken out if deleted. Other status lines are untouched. */
function withSendBackNote(item: OutboxItem, note: EventSnapshot | undefined): OutboxItem {
  // Non-greedy for the same reason as itemText's: the old note may say `" back` itself.
  const m = /^sent (".*?") back(?:: [\s\S]*)?$/.exec(oneLine(item.summary));
  if (!m) return item;
  const text = note && !note.deletedAt && note.body ? oneLine(note.body) : "";
  return { ...item, summary: `sent ${m[1]} back${text ? `: ${text}` : ""}` };
}

/**
 * The job as a contractor knows it, in one string: its status, its due date,
 * their scheduled day and a fingerprint of its notes. A "took you off" line
 * carries it (core.ts notifyOff), so the send run can tell whether the job
 * changed while it was someone else's.
 */
export function jobKey(job: { status: string; due: Ymd | null; scheduled: Ymd | null; notes: string | null | undefined }): string {
  return `${job.status}|${job.due ?? ""}|${job.scheduled ?? ""}|${notesFingerprint(job.notes)}`;
}

/**
 * The off-the-job line (core.ts notifyOff) at send time. Taken off the job
 * (no access now): that line alone goes, and nothing else about a job that
 * isn't theirs. Still on it: a "took you off" undone by putting them back is
 * dropped, and so is the "assigned you" that put them back, when the job is
 * as it was when they were taken off (`job`, against the line's `job`): it
 * was theirs all along and nothing changed. A job that changed while it was
 * someone else's keeps its "assigned you", the one line that tells them. A
 * line queued before it carried `job` keeps it too. "canceled" goes only
 * while the job is still canceled.
 */
export function offItems(items: readonly OutboxItem[], now: { hasAccess: boolean; canceled: boolean; job?: string }): OutboxItem[] {
  // Handed the job and taken off it (or it canceled) inside this one bundle, before any email told them they had it
  // (a picker's Undo, a quick re-pick): there's nothing to tell them.
  const firstOff = items.findIndex((i) => i.kind === "OFF");
  if (firstOff >= 0 && (!now.hasAccess || now.canceled) && items.slice(0, firstOff).some((i) => i.kind === "ASSIGNED")) return [];
  if (!now.hasAccess) return items.filter((i) => i.kind === "OFF");
  // Taken off and given back inside this one bundle (an Undo of a reassignment, one job or many): they had it all along.
  const firstAssigned = items.findIndex((i) => i.kind === "ASSIGNED");
  const off = firstOff >= 0 ? items[firstOff] : null;
  const hadItAllAlong =
    !!off &&
    /^took you off /.test(oneLine(off.summary)) &&
    (firstAssigned < 0 || firstOff < firstAssigned) &&
    off.job !== undefined &&
    off.job === now.job;
  return items.filter((i) => {
    if (i.kind === "OFF") return now.canceled && /^canceled /.test(oneLine(i.summary));
    return !(hadItAllAlong && i.kind === "ASSIGNED");
  });
}

/**
 * The 8 am lines (reminders.ts) at send time: each goes only while it is still the one reminderFor picks for the job
 * now, for the same day. The job still waits on the contractor (not In review, Done or Canceled) and its dates are
 * still the ones the line was for. A line the job has moved past is dropped; a bundle left empty closes as "nothing
 * to send". `needsNotice` is whether the home still needs 24 hours' notice.
 */
export function liveReminders(
  items: readonly OutboxItem[],
  now: { status: TaskStatus; due: Ymd | null; scheduled: Ymd | null; needsNotice: boolean; today: Ymd },
): OutboxItem[] {
  const want = reminderFor(now, now.today);
  return items.filter((i) => !UNSIGNED_KINDS.has(i.kind) || (!!want && i.kind === want.kind && i.due === want.day));
}

/**
 * A short fingerprint of a job's notes (cyrb53, trimmed first as core.ts
 * stores them), so an outbox line can tell notes put back as they were
 * without keeping a copy: notes can hold lockbox codes, which stay out of the
 * outbox. "" for no notes.
 */
export function notesFingerprint(notes: string | null | undefined): string {
  const s = notes?.trim() ?? "";
  if (!s) return "";
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The kinds a later change can put back as they were, and what each is compared on. */
const UNDOABLE_KINDS = ["TARGET", "DAY", "NOTES", "STATUS"] as const;

/**
 * Changes put back before the email goes (Connor, Nov 15): a date moved and
 * moved back, notes edited back to what they said, a status changed and
 * changed back. For each of those kinds, when its first line's `from` is
 * what the job has now, every line of that kind goes: the email would only
 * report a change that isn't there. A kind that ends somewhere new keeps all
 * its lines, as before. Lines without `from` (queued before Nov 15) stay.
 *
 * A status put back takes a send-back's note with it (it lives inside the
 * STATUS line); the note comment itself stays on the job. Approve's Undo
 * deletes its line, which reconcileItems already drops.
 */
export function undoneDropped(
  items: readonly OutboxItem[],
  now: { due: Ymd | null; scheduled: Ymd | null; notes: string | null; status: TaskStatus },
): OutboxItem[] {
  const current: Record<(typeof UNDOABLE_KINDS)[number], string> = {
    TARGET: now.due ?? "",
    DAY: now.scheduled ?? "",
    NOTES: notesFingerprint(now.notes),
    STATUS: now.status,
  };
  const undone = new Set<string>(UNDOABLE_KINDS.filter((kind) => {
    const first = items.find((i) => i.kind === kind);
    return first?.from !== undefined && first.from === current[kind];
  }));
  return items.filter((i) => !undone.has(i.kind));
}

// ---------------------------------------------------------------------------
// The send run's two decisions about a row (outbox.ts drainDue)
// ---------------------------------------------------------------------------

/** A due row as the send run's batch read finds it, before it is claimed. */
export interface DueRow extends RowRecipient {
  taskId: string | null;
  recipientContactId: string | null;
  items: unknown;
  /** The job: its status, and who can open it right now (unrevoked access rows). Null once the task is gone. */
  task: { status: TaskStatus; access: readonly { contactId: string }[] } | null;
}

/**
 * Whether a due row goes at all, decided on the row as the batch read found
 * it. `send: false` closes it unsent with `reason`, and it is never claimed.
 *
 *  - Its task is gone: "no task".
 *  - Its task is a draft: "draft". A draft emails nobody, a contractor or a
 *    partner (docs/specs/tasks-from-claude.md 6.1). Nothing queues a row for
 *    one (tasks/core.ts notify) and Add's Undo deletes the rows its Add
 *    queued, so this is the run's own guard for a row that outlived both: one
 *    a refused send left waiting to try again, or an access row someone made
 *    by hand.
 *  - Otherwise as deliveryFor decides, on who can open the job. "You're off
 *    this job" goes though their access has just ended: it says only that
 *    (offItems).
 */
export function dueRowVerdict<R extends DueRow>(
  row: R,
): { send: true; delivery: Extract<Delivery, { ok: true }>; task: NonNullable<R["task"]>; taskId: string } | { send: false; reason: string } {
  if (!row.task) return { send: false, reason: "no task" };
  if (row.task.status === "DRAFT") return { send: false, reason: "draft" };
  const contractorHasAccess = !!row.recipientContactId && row.task.access.some((a) => a.contactId === row.recipientContactId);
  const tellsOff = !contractorHasAccess && parseItems(row.items).some((i) => i.kind === "OFF");
  const delivery = deliveryFor(row, { contractorHasAccess: contractorHasAccess || tellsOff });
  if (!delivery.ok) return { send: false, reason: delivery.reason };
  if (!row.taskId) return { send: false, reason: "no recipient" };
  return { send: true, delivery, task: row.task as NonNullable<R["task"]>, taskId: row.taskId };
}

/** The job as the send run reads it again once a row is claimed. */
export interface ClaimedJob {
  status: TaskStatus;
  dueDate: Date | null;
  scheduledFor: Date | null;
  description: string | null;
}

/**
 * What a claimed row still has to say, decided on the job and the recipient's
 * access as they are read again after the claim: the batch read can be a
 * write behind (taken off and put back, canceled, a date moved, an Add
 * undone). `send: false` closes the claimed row unsent with `reason`.
 *
 *  - The task is gone since: "no task".
 *  - It is a draft now (an Add's Undo landed between the batch read and the
 *    claim): "draft", for a contractor's row and a partner's alike.
 *  - A contractor's lines go through offItems and liveReminders; then, for
 *    anyone, a change put back before the email goes is dropped
 *    (undoneDropped). Nothing left: "nothing to send".
 *
 * `items` are the row's lines after reconcileItems. With `send`, `due` is
 * the date the contractor sees and `job` the job as read, which the email is
 * built from.
 */
export function claimedRowVerdict(input: {
  audience: Audience;
  items: readonly OutboxItem[];
  job: ClaimedJob | null;
  /** The recipient has an unrevoked access row now; ignored for a partner. */
  hasAccess: boolean;
  /** Contractor: the home still needs 24 hours' notice (docs/specs/contractor-scheduled-date.md, Q6). */
  needsNotice?: boolean;
  today: Ymd;
}):
  | { send: true; items: OutboxItem[]; due: Ymd | null; scheduled: Ymd | null; job: ClaimedJob }
  | { send: false; reason: "no task" | "draft" | "nothing to send" } {
  const job = input.job;
  if (!job) return { send: false, reason: "no task" };
  if (job.status === "DRAFT") return { send: false, reason: "draft" };
  // Two dates (docs/specs/contractor-scheduled-date.md): Due, and the contractor's scheduled day while Scheduled.
  const due = toYmd(job.dueDate);
  const scheduled = toYmd(scheduledDay(job));
  const kept =
    input.audience === "contractor"
      ? liveReminders(offItems(input.items, { hasAccess: input.hasAccess, canceled: job.status === "CANCELED", job: jobKey({ status: job.status, due, scheduled, notes: job.description }) }), {
          status: job.status,
          due,
          scheduled,
          needsNotice: !!input.needsNotice,
          today: input.today,
        })
      : [...input.items];
  // A date, the notes or a status put back as they were before the bundle's first change says nothing (undoneDropped).
  const items = undoneDropped(kept, { due, scheduled, notes: job.description, status: job.status });
  return items.length === 0 ? { send: false, reason: "nothing to send" } : { send: true, items, due, scheduled, job };
}

/** The update an email's button opens at: the first comment, status or file post the recipient can see. */
export function firstUpdateId(items: readonly OutboxItem[]): string | null {
  return items.find((i) => i.eventId && (i.kind === "COMMENT" || i.kind === "STATUS" || i.kind === "ATTACHMENT"))?.eventId ?? null;
}

// ---------------------------------------------------------------------------
// What it says
// ---------------------------------------------------------------------------

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** A comment's text with its line breaks kept: runs of spaces collapse, a blank line stays one, nothing is trimmed but the ends. */
const keepBreaks = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** "set it to in progress" back to the label the app shows ("In progress"). */
const STATUS_BY_WORDS = new Map(Object.entries(STATUS_LABEL).map(([k, label]) => [k.replace("_", " ").toLowerCase(), label]));

/**
 * One change, after the person's first name, without the task's title
 * (the subject has it): "moved the target to Fri, Oct 30", "scheduled it for
 * Thu, Oct 29", "marked it done", `: "Doors arrive Thu"`. Dates arrive
 * already written out (core.ts emailDay). The title patterns are greedy so a
 * title with a quote in it ("Hang 36" mirror") still comes out whole; the
 * send-back's is not, since its note comes after the title (sendBackTail).
 * `title`, when the caller has the job's, lets that one be cut off exactly.
 */
export function itemText(item: OutboxItem, title?: string): string {
  // A comment keeps its line breaks (activity 2.10); everything else is one line.
  const s = item.kind === "COMMENT" ? keepBreaks(item.summary) : oneLine(item.summary);
  switch (item.kind) {
    case "ASSIGNED": {
      // Anchored on the date, so a title like `Quote "A" for B` isn't read as one.
      const m = /^assigned you ".*" for ([A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}(?:, \d{4})?)$/.exec(s);
      return m ? `assigned you this job for ${m[1]}` : "assigned you this job";
    }
    case "NOTES":
      return "updated the notes";
    case "TARGET": {
      // The due date (docs/specs/contractor-scheduled-date.md); never "visit" or "target". A row queued before
      // core.ts recorded which date it was reads neutrally.
      const m = /^moved ".*" to (.+)$/.exec(s);
      const what = item.visit === undefined && item.from === undefined ? "date" : "due date";
      if (m && m[1] !== "no date") return `moved the ${what} to ${m[1]}`;
      return `cleared the ${what}`;
    }
    case "DAY": {
      // The contractor's scheduled day; a contractor's own move carries "(was Tue, Nov 17)".
      const m = /^moved ".*" to (.+)$/.exec(s);
      if (m && m[1] !== "no date") return `moved the scheduled day to ${m[1]}`;
      return "cleared the scheduled day";
    }
    case "COMMENT": {
      const files = /^added files \(\+(\d+) files?\)$/.exec(s);
      if (files) return `added ${files[1]} file${files[1] === "1" ? "" : "s"}`;
      return s.startsWith('"') ? `: ${s}` : s;
    }
    case "STATUS": {
      const scheduled = /^scheduled ".*" for (.+)$/.exec(s);
      if (scheduled) return `scheduled it for ${scheduled[1]}`;
      if (/^approved ".*"$/.test(s)) return "approved it";
      // Only the contractor's own Start reads as starting the job (core.ts statusSummary).
      if (/^started ".*"$/.test(s)) return "started the job";
      const set = /^set ".*" to (.+)$/.exec(s);
      if (set) return `moved it to ${STATUS_BY_WORDS.get(set[1]) ?? set[1]}`;
      // A contractor's Send for review, as rows queued before Nov 15 word it.
      if (/^marked ".*" done$/.test(s)) return "sent it for review";
      // A send-back first: its note may end in "for review" itself.
      const tail = sendBackTail(s, title);
      if (tail !== null) return `sent it back${tail}`;
      if (/^sent ".*" for review$/.test(s)) return "sent it for review";
      return s.replace(/"[^"]*"/, "it");
    }
    case "SCHEDULED_TODAY":
      return "Scheduled today";
    case "SCHEDULED_TOMORROW":
      return "Scheduled tomorrow";
    case "DUE_TODAY":
      return "Due today";
    case "DUE_TOMORROW":
      return "Due tomorrow";
    case "OVERDUE":
      return "Due yesterday";
    case "OFF":
      return /^canceled /.test(s) ? "canceled this job" : "took you off this job";
    default:
      return s;
  }
}

/**
 * What follows `sent "T" back` in a send-back line: `: note`, or nothing for a
 * send-back with no note; null when the line is not a send-back. With the
 * job's title, the line's own title is cut off exactly, so a title that says
 * `" back: ` itself ('Put "old" back: kitchen') keeps its words out of the
 * line. Without it, or when the job was renamed since the line was queued, the
 * title is taken to end at the first `" back`: the note follows the title, and
 * a greedy title would swallow a note that says `" back` itself ('put the
 * "old" back') and drop it from the line.
 *
 * Known and left as it is: a job renamed while the line waits to send, from
 * an old title that says `" back` itself, has that title cut at its first
 * `" back`, so the rest of the old title reads as the note ('Put "old" back:
 * kitchen', renamed, gives `sent it back: kitchen" back`). It takes both the
 * rename and such a title, and the email's subject still names the job as it
 * is now.
 */
function sendBackTail(s: string, title?: string): string | null {
  if (title) {
    const head = `sent "${oneLine(title)}" back`;
    if (s === head) return "";
    if (s.startsWith(`${head}: `) && s.length > head.length + 2) return s.slice(head.length);
  }
  const m = /^sent ".*?" back(: .+)?$/.exec(s);
  return m ? (m[1] ?? "") : null;
}

/** "Connor moved the target to Fri, Oct 30", 'Zack: "Uppers in"'. */
export function itemLine(item: OutboxItem, title?: string): string {
  const text = itemText(item, title);
  if (UNSIGNED_KINDS.has(item.kind)) return text;
  const name = firstName(item.actorLabel);
  return text.startsWith(":") ? `${name}${text}` : `${name} ${text}`;
}

/** Lines that say only their latest: a date, the notes, and an assignment (a picker's Undo and re-pick hands it over twice). */
const LATEST_ONLY = new Set(["TARGET", "DAY", "NOTES", "ASSIGNED"]);

/** Target, notes and assignment changes say only their latest; everything else is kept, oldest first. */
function latestOnly(items: OutboxItem[]): OutboxItem[] {
  const lastOf = new Map<string, number>();
  items.forEach((it, i) => {
    if (LATEST_ONLY.has(it.kind)) lastOf.set(it.kind, i);
  });
  const firstDay = items.find((it) => it.kind === "DAY");
  return items
    .filter((it, i) => (LATEST_ONLY.has(it.kind) ? lastOf.get(it.kind) === i : true))
    .map((it) => (it.kind === "DAY" && firstDay && it !== firstDay ? { ...it, summary: wasFrom(it.summary, firstDay.summary) } : it));
}

/**
 * A contractor's day moved twice in one email reads from the day the reader last saw: the latest line's "(was …)"
 * becomes the first line's, or goes when the first move set a day where there was none.
 */
function wasFrom(latest: string, first: string): string {
  const was = / \(was [^)]*\)$/;
  const base = latest.replace(was, "");
  const m = was.exec(first);
  return m ? `${base}${m[0]}` : base;
}

/**
 * The lines of one email, oldest first. Target, notes and assignment changes
 * say only their latest; everything else is listed.
 */
export function itemLines(items: OutboxItem[], title?: string): string[] {
  return latestOnly(items).map((it) => itemLine(it, title));
}

/** A line as a sentence: a period unless it already ends in one, a quote or a bracket. */
export function asSentence(line: string): string {
  return /[.!?"')…]$/.test(line) ? line : `${line}.`;
}

/**
 * The What's new section (docs/specs/contractor-job-emails.md, 2.2): the
 * bundle's most important line as the headline, then the others in order.
 * The headline is the latest status change (sent back, approved, marked
 * done), else the assignment, else the date, else the first line.
 */
export function whatsNew(items: OutboxItem[], title?: string): { headline: string; lines: string[] } {
  const kept = latestOnly(items);
  let at = kept.findLastIndex((i) => i.kind === "STATUS");
  if (at < 0) at = kept.findIndex((i) => i.kind === "ASSIGNED");
  if (at < 0) at = kept.findLastIndex((i) => UNSIGNED_KINDS.has(i.kind));
  if (at < 0) at = kept.findLastIndex((i) => i.kind === "TARGET" || i.kind === "DAY");
  if (at < 0) at = 0;
  const lines = kept.map((it) => asSentence(itemLine(it, title)));
  return { headline: lines[at] ?? "", lines: lines.filter((_, i) => i !== at) };
}

/** The longest inbox preview line; Gmail shows about 100 characters on a phone. */
export const PREVIEW_MAX = 140;

/** The hidden preview line: What's new on one line, cut on a word. */
export function previewText(headline: string, lines: readonly string[]): string {
  const s = oneLine([headline, ...lines].join(" "));
  if (s.length <= PREVIEW_MAX) return s;
  return `${s.slice(0, PREVIEW_MAX - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * A job's street and unit as My jobs shows them (job-view.ts addressLine), so an email names the same unit whose
 * lockbox code the job page shows (D21): "118 Congress St · Rear".
 */
export function jobWhere(address: string | null, unitLabel?: string | null): string {
  const street = address ? shortAddress(address) || oneLine(address) : "";
  return addressLine(street || null, unitLabel ? oneLine(unitLabel) : null);
}

/**
 * A job email's subject: a word for what the email is, then the job, street
 * and unit (docs/specs/contractor-job-emails.md 2.1): "Update: Replace
 * kitchen faucet, 118 Congress St · Rear".
 */
export function jobSubject(input: { word: string; title: string; where: string }): string {
  const what = [oneLine(input.title) || "A job", input.where].filter(Boolean).join(", ");
  return `${input.word}: ${what}`;
}

/**
 * The subject's word (Connor, Nov 15: "Due" on every email read wrong once a
 * job was done). The first that applies: Done while the job is Done when it
 * goes; Review on a partner's email while it still waits on their review
 * (docs/specs/send-for-review.md, section 4), the email that carries Approve
 * and Send back; New for an email that hands the contractor the job, with its
 * due date written the brand's way ("New, due Friday", dates.ts dueLabel); the
 * 8 am line's own words (Scheduled today, Scheduled tomorrow, Due today, Due
 * tomorrow, Due yesterday); then Update. Removed is
 * offEmail's, and Error is the reply path's (replies.ts).
 */
export function subjectWord(input: { items: readonly OutboxItem[]; status: TaskStatus; due: Ymd | null; today: Ymd; audience: Audience }): string {
  if (input.status === "DONE") return "Done";
  if (input.audience === "staff" && input.status === "REVIEW") return "Review";
  // A resident's request from their link (docs/specs/maintenance-requests.md, section 4.3).
  if (input.audience === "staff" && input.items.some((i) => i.kind === "CREATED")) return "New request";
  if (input.items.some((i) => i.kind === "ASSIGNED")) return input.due ? `New, due ${dueLabel(input.due, input.today)}` : "New";
  const reminder = input.items.find((i) => UNSIGNED_KINDS.has(i.kind));
  if (reminder) return itemText(reminder);
  return "Update";
}

/**
 * What threads one job's emails (resend.ts makes it a header): one id per job, so a date move no longer splits the
 * thread. Emails sent before Nov 15 carry `job-<id>-<date>`; inbound.ts threadTaskId reads both.
 */
export function threadKey(taskId: string): string {
  return `job-${taskId}`;
}

/** Directions to the building, the job page's target (job-details.tsx AddressActions). */
export function directionsUrl(address: string | null): string | null {
  return address ? `https://maps.apple.com/?daddr=${encodeURIComponent(address)}` : null;
}

export interface EmailButton {
  label: string;
  url: string;
}

/** A thumbnail in an email and where tapping it goes. */
export interface EmailPhoto {
  src: string;
  href: string;
}

/** The job, under What's new and the buttons. */
export interface JobFacts {
  title: string;
  /** Street and unit, as My jobs shows them. */
  where: string;
  directionsUrl: string | null;
  /** The building's front photo, a public image. Null when none. */
  photoUrl: string | null;
  /** The due date, written out ("Mon, Nov 23"). */
  due: string | null;
  /** The contractor's scheduled day while the job is Scheduled, written out; null otherwise. */
  scheduled?: string | null;
  /** That day lands after the due date: the row says so in words, since an email has no hover. */
  scheduledAfterDue?: boolean;
  /** Contractor only: the notes, with this property's lockbox codes masked. */
  notes: string | null;
  /** Contractor only: the checklist. */
  checklist: { title: string; done: boolean }[];
  /** Staff only: who has the job. */
  contractor: string | null;
  /** Staff only: "2 of 3 done". */
  checklistLine: string | null;
  /** Contractor only, with a job link: "Show access", which opens the job at its Tenants or Lockbox. Null when it shows neither. */
  accessUrl: string | null;
  /** Contractor only, with a job link and a date: the .ics for Add to calendar. */
  calendarUrl: string | null;
  /** Contractor only, with a job link, while they can set or move their day: Change day (docs/specs/contractor-scheduled-date.md). */
  dateUrl: string | null;
  /** Contractor only: HG's photos on the job, beyond the ones What's new shows. */
  photos: EmailPhoto[];
  morePhotos: number;
}

export interface TaskEmail {
  subject: string;
  /** The hidden inbox preview line. */
  preview: string;
  /** What's new: the headline, then the other lines. */
  headline: string;
  lines: string[];
  /** What's new's photos: the bundle's own, up to four, then "+N". */
  photos: EmailPhoto[];
  morePhotos: number;
  /** The 24-hour notice line under What's new (Q6), or none. */
  notice?: string;
  /** The next step; null on an email with nothing left to do (taken off the job). */
  primary: EmailButton | null;
  secondary: EmailButton[];
  job: JobFacts;
  /** Contractors only: where to answer, so a reply to the email isn't lost. */
  footnote?: string;
  /** Threads the job's emails (threadKey). */
  threadKey: string;
}

/**
 * The line under a contractor's button (BCONTRACT-002): "Reply in the job so
 * Connor and Pieter both see it.", naming the partners who get a
 * contractor's updates by email (portal/queries.ts staffFirstNames).
 */
export function replyLine(staffNames: readonly string[]): string {
  const names = joinNames([...staffNames]);
  if (staffNames.length > 2) return `Reply in the job so ${names} all see it.`;
  if (staffNames.length === 2) return `Reply in the job so ${names} both see it.`;
  return `Reply in the job so ${names || "HG Capital"} sees it.`;
}

/**
 * The buttons (spec 2.2, 3, 8): the job's next step first. A contractor's are
 * Start job, Mark done or See job, with Add photos and Text to my crew beside
 * the first two while the job takes them; a partner's are Approve and Send
 * back while it waits in Review, otherwise Open task. See job and Open task
 * open at the first update in the bundle (rows queued before items named one
 * open the job).
 *
 * With a job link (`linkToken`, job-links.ts) a contractor's buttons open the
 * job as them with no password, each ready for its step; without one they
 * open the portal's job page, behind sign-in. A partner's open the task page,
 * Approve and Send back with that step ready.
 */
function buttons(input: {
  audience: Audience;
  status: TaskStatus;
  appUrl: string;
  taskId: string;
  items: OutboxItem[];
  linkToken: string | null;
  /** Contractor: the job page shows the tenants or a lockbox code. */
  hasAccess?: boolean;
}): { primary: EmailButton | null; secondary: EmailButton[] } {
  const updateId = firstUpdateId(input.items);
  if (input.audience === "staff") {
    const task = openUrl(input.appUrl, "staff", input.taskId);
    if (input.status === "REVIEW") {
      return { primary: { label: "Approve", url: `${task}?do=approve` }, secondary: [{ label: "Send back", url: `${task}?do=send-back` }] };
    }
    return { primary: { label: "Open task", url: openUrl(input.appUrl, "staff", input.taskId, updateId) }, secondary: [] };
  }
  const token = input.linkToken;
  const to = (step: JobLinkStep | null, update: string | null = null) =>
    token ? jobLinkUrl(input.appUrl, token, step, update) : openUrl(input.appUrl, "contractor", input.taskId, update);
  const changeDay = token && contractorMaySetDate(input.status) ? [{ label: "Change day", url: to("date") }] : [];
  // The 24-hour notice heads-up (Q6): reach the tenant (the job opens at its Tenants), or pick another day.
  if (input.items.some((i) => NOTICE_KINDS.has(i.kind)) && token && input.hasAccess) {
    return { primary: { label: "Text the tenant", url: to("access") }, secondary: changeDay };
  }
  // The morning after the due date (reminders.ts): the next step, or a new day, and nothing else.
  const overdue = input.items.some((i) => i.kind === "OVERDUE");
  const extras: EmailButton[] =
    overdue && changeDay.length
      ? changeDay
      : [{ label: "Add photos", url: to("photos") }, ...(token ? [{ label: "Text to my crew", url: to("share") }] : [])];
  const step = nextStep(input.status);
  if (step === "start") return { primary: { label: "Start job", url: to(null) }, secondary: extras };
  if (step === "done") return { primary: { label: "Send for review", url: to("done") }, secondary: extras };
  return { primary: { label: "See job", url: to(null, updateId) }, secondary: [] };
}

/** The most thumbnails What's new shows before "+3". */
export const EMAIL_PHOTO_MAX = 4;
/** The most of HG's photos the job section shows before "+N" (spec 2.2). */
export const JOB_PHOTO_MAX = 6;

/**
 * A photo's thumbnail in an email, through the private file route with the
 * email's link as the key (`?l=`), since a mail app fetches it with no
 * cookie: the route checks the link still reaches that job and file.
 */
export function emailPhotoUrl(appUrl: string, attachmentId: string, linkToken: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/files/task/${encodeURIComponent(attachmentId)}?v=thumb&l=${linkToken}`;
}

/** Up to `max` thumbnails, each opening `href`, and how many more there are. */
function photoStrip(
  ids: readonly string[],
  appUrl: string,
  linkToken: string | null,
  href: string,
  max: number = EMAIL_PHOTO_MAX,
): { photos: EmailPhoto[]; morePhotos: number } {
  if (!linkToken || ids.length === 0) return { photos: [], morePhotos: 0 };
  const shown = ids.slice(0, max);
  return { photos: shown.map((id) => ({ src: emailPhotoUrl(appUrl, id, linkToken), href })), morePhotos: ids.length - shown.length };
}

/** "2 of 3 done", or null with no checklist. */
export function checklistLine(items: readonly { done: boolean }[]): string | null {
  return items.length ? `${items.filter((i) => i.done).length} of ${items.length} done` : null;
}

/**
 * The line under the job (spec 5). With replies by email: a contractor's open
 * job says a reply adds a comment and its photos go on the job, a closed one
 * that a reply reaches the partners (it's forwarded, not posted), a partner's
 * copy that a reply answers the contractor. Without: a contractor's open job
 * says to reply in the job (BCONTRACT-002), and nothing else carries a line.
 */
function footnoteFor(input: {
  audience: Audience;
  status: TaskStatus;
  staffNames?: readonly string[];
  contractorName?: string | null;
  replyByEmail?: boolean;
}): { footnote?: string } {
  const open = isActiveStatus(input.status);
  if (input.audience === "contractor") {
    if (!input.replyByEmail) return open ? { footnote: replyLine(input.staffNames ?? []) } : {};
    return { footnote: open ? "Reply to add a comment. Photos you attach go on the job." : `Reply to reach ${joinNames([...(input.staffNames ?? [])]) || "HG Capital"}.` };
  }
  const name = greetingName(input.contractorName);
  return input.replyByEmail && name ? { footnote: `Reply to answer ${name}. It goes on the job.` } : {};
}

/**
 * Taken off a job, or it was canceled (spec 2.3, 6): what it was and where,
 * and that there's no need to go. No date (the subject would send them
 * there), no access, notes, photos or buttons: the job isn't theirs now.
 */
export function offEmail(title: string, where: string, taskId: string): TaskEmail {
  const headline = "You're off this job. No need to go.";
  return {
    subject: jobSubject({ word: "Removed", title, where }),
    preview: headline,
    headline,
    lines: [],
    photos: [],
    morePhotos: 0,
    primary: null,
    secondary: [],
    job: {
      title: oneLine(title),
      where,
      directionsUrl: null,
      photoUrl: null,
      due: null,
      notes: null,
      checklist: [],
      contractor: null,
      checklistLine: null,
      accessUrl: null,
      calendarUrl: null,
      dateUrl: null,
      photos: [],
      morePhotos: 0,
    },
    threadKey: `job-${taskId}-off`,
  };
}

/**
 * The 24-hour notice line (docs/specs/contractor-scheduled-date.md, Q6 and
 * Q7): on a contractor's heads-up the day before, and on the morning of their
 * day, at a home where someone lives and Permission to enter is off.
 */
function noticeFor(input: { audience: Audience; items: readonly OutboxItem[]; needsNotice?: boolean }): { notice?: string } {
  if (input.audience !== "contractor" || !input.needsNotice) return {};
  if (input.items.some((i) => NOTICE_KINDS.has(i.kind))) {
    return { notice: "Tell the tenant today. They need 24 hours' notice, and you don't have permission to let yourself in." };
  }
  if (input.items.some((i) => i.kind === "SCHEDULED_TODAY")) return { notice: "Only go in if the tenant said yes. You don't have permission to let yourself in." };
  return {};
}

/**
 * One email about a job (docs/specs/contractor-job-emails.md): the subject
 * (subjectWord), the preview line, What's new, the next step's buttons and
 * the job.
 *
 * The job names its street and unit as My jobs does (jobWhere). A
 * contractor's email carries the notes and checklist; a partner's names the
 * contractor and the checklist's progress.
 *
 * A contractor's email ends on the reply line while the job is still open: a
 * closed job's page is read-only and core.ts addComment refuses a
 * contractor's comment on it. An approval emails them nothing
 * (docs/specs/send-for-review.md); a closed job's email reads See job.
 */
export function taskEmail(input: {
  items: OutboxItem[];
  title: string;
  address: string | null;
  unitLabel?: string | null;
  audience: Audience;
  appUrl: string;
  taskId: string;
  /** The job's status when the email is sent. */
  status: TaskStatus;
  /** The due date, as a day. */
  due?: Ymd | null;
  /** The contractor's scheduled day while the job is Scheduled (rules.ts scheduledDay). */
  scheduled?: Ymd | null;
  /** Contractor: someone lives there and Permission to enter is off (the notice line, Q6). */
  needsNotice?: boolean;
  /** Today in Buffalo, for writing the date (a year only when it isn't this one). */
  today: Ymd;
  notes?: string | null;
  checklist?: { title: string; done: boolean }[];
  photoUrl?: string | null;
  /** Staff: the contractor on the job. */
  contractorName?: string | null;
  /** First names of the partners, for a contractor's reply line. */
  staffNames?: readonly string[];
  /** The email's own link (job-links.ts): a contractor's EMAIL link, a partner's STAFF link. Null sends plain links. */
  linkToken?: string | null;
  /** Contractor: the job page shows the tenants or a lockbox code (never either one itself). */
  hasAccess?: boolean;
  /** The photos the bundle's updates carry, oldest first, as attachment ids the recipient may see. */
  newPhotoIds?: readonly string[];
  /** Contractor: HG's other photos on the job, newest first. */
  jobPhotoIds?: readonly string[];
  /** The email has its own reply address (replies post to the job, section 5): the footer says what a reply does. */
  replyByEmail?: boolean;
}): TaskEmail {
  const where = jobWhere(input.address, input.unitLabel);
  const contractor = input.audience === "contractor";
  const day = (d: Ymd) => fmtDay(d, { weekday: true, year: "auto", now: input.today });
  const due = input.due ? day(input.due) : null;
  const scheduled = input.scheduled ? day(input.scheduled) : null;
  const { headline, lines } = whatsNew(input.items, input.title);
  const checklist = input.checklist ?? [];
  const notes = input.notes?.trim() ? keepBreaks(input.notes) : null;
  if (contractor && input.items.some((i) => i.kind === "OFF")) return offEmail(input.title, where, input.taskId);
  const token = input.linkToken ?? null;
  const btns = buttons({ audience: input.audience, status: input.status, appUrl: input.appUrl, taskId: input.taskId, items: input.items, linkToken: token, hasAccess: input.hasAccess });
  // Tapping a photo opens the job: the contractor's through their link, a partner's on the task page.
  const photoHref = contractor ? (token ? jobLinkUrl(input.appUrl, token, null, firstUpdateId(input.items)) : openUrl(input.appUrl, "contractor", input.taskId)) : openUrl(input.appUrl, "staff", input.taskId, firstUpdateId(input.items));
  // A contractor's link stops opening a closed job, thumbnails included, so a closed job's email shows none.
  const showPhotos = !contractor || isActiveStatus(input.status);
  const none = { photos: [], morePhotos: 0 };
  const fresh = showPhotos ? photoStrip(input.newPhotoIds ?? [], input.appUrl, token, photoHref) : none;
  const older = contractor && showPhotos ? photoStrip(input.jobPhotoIds ?? [], input.appUrl, token, photoHref, JOB_PHOTO_MAX) : none;
  return {
    subject: jobSubject({ word: subjectWord({ items: input.items, status: input.status, due: input.due ?? null, today: input.today, audience: input.audience }), title: input.title, where }),
    preview: previewText(headline, lines),
    headline,
    lines,
    photos: fresh.photos,
    morePhotos: fresh.morePhotos,
    ...noticeFor(input),
    ...btns,
    job: {
      title: oneLine(input.title),
      where,
      directionsUrl: directionsUrl(input.address),
      photoUrl: input.photoUrl ?? null,
      due,
      scheduled,
      scheduledAfterDue: isAfterDue(input.scheduled, input.due),
      notes: contractor ? notes : null,
      checklist: contractor ? checklist : [],
      contractor: contractor ? null : input.contractorName ? oneLine(input.contractorName) : null,
      checklistLine: contractor ? null : checklistLine(checklist),
      accessUrl: contractor && token && input.hasAccess && isActiveStatus(input.status) ? jobLinkUrl(input.appUrl, token, "access") : null,
      calendarUrl: contractor && token && (input.scheduled || input.due) && isActiveStatus(input.status) ? `${jobLinkUrl(input.appUrl, token)}/calendar` : null,
      dateUrl: contractor && token && contractorMaySetDate(input.status) ? jobLinkUrl(input.appUrl, token, "date") : null,
      photos: older.photos,
      morePhotos: older.morePhotos,
    },
    ...footnoteFor(input),
    threadKey: threadKey(input.taskId),
  };
}

// ---------------------------------------------------------------------------
// Send rules
// ---------------------------------------------------------------------------

/** Resend's free plan (D30). */
export const DAILY_EMAIL_CAP = 100;

/** How many of this batch may go out, given how many went out today. */
export function sendBudget(sentToday: number, batchLimit: number, cap = DAILY_EMAIL_CAP): number {
  return Math.max(0, Math.min(batchLimit, cap - sentToday));
}

/** True on the one run that takes today's count to the cap, so it's logged once. */
export function reachedCapNow(sentBefore: number, sentNow: number, cap = DAILY_EMAIL_CAP): boolean {
  return sentBefore < cap && sentBefore + sentNow >= cap;
}

export const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60];

/** When to try again after `attempts` tries have failed; null once it's time to give up. */
export function retryAt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const minutes = BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1];
  return new Date(now.getTime() + minutes * 60_000);
}

/**
 * What a refused send means for the row. Resend answers 429 for both of its
 * limits, told apart by the error's name: a daily or monthly quota (wait for
 * tomorrow) or the per-second rate (try again in a minute). Neither is the
 * email's fault, so neither spends one of its tries.
 */
export type SendFailure = "quota" | "rate" | "error";

export function sendFailureKind(res: { status?: number; code?: string }): SendFailure {
  if (res.status !== 429) return "error";
  return res.code === "daily_quota_exceeded" || res.code === "monthly_quota_exceeded" ? "quota" : "rate";
}

/**
 * When to try again after Resend refused for one of its limits. The quota is
 * checked hourly rather than held to our midnight: Resend counts its own
 * window (password resets and anything else sent from the account spend it
 * too), so it can free up before or after our day turns over.
 */
export function refusedRetryAt(kind: Exclude<SendFailure, "error">, now: Date): Date {
  return new Date(now.getTime() + (kind === "quota" ? 60 : 1) * 60_000);
}

/** Midnight in Buffalo at the start of `now`'s Buffalo day, as an instant. */
export function easternDayStart(now: Date): Date {
  const ymd = todayYmdEastern(now);
  const midnightUtc = Date.parse(`${ymd}T00:00:00Z`);
  // Eastern midnight is 04:00Z in daylight time and 05:00Z in standard time.
  for (const hours of [4, 5]) {
    const t = new Date(midnightUtc + hours * 3_600_000);
    const local = new Intl.DateTimeFormat("en-US", { timeZone: HG_TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(t);
    if (todayYmdEastern(t) === ymd && local === "00") return t;
  }
  return new Date(midnightUtc + 5 * 3_600_000);
}
