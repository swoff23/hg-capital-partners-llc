import type { TaskStatus } from "@prisma/client";
import { HG_TIME_ZONE, fmtDay, toYmd, todayYmdEastern, type Ymd } from "@/lib/dates";
import type { JobEmailDetails, JobEmailInput, JobEmailLink, JobEmailPhoto } from "@/lib/email/render";
import { shortAddress } from "@/lib/normalize";
import { STATUS_LABEL, isActiveStatus } from "@/lib/task-scope";
import { addDaysYmd } from "@/lib/quick-dates";
import { contractorMaySetDate, jobLinkDestination, jobLinkUrl, type JobLinkStep } from "@/lib/portal/job-link-paths";
import { DUE_SOON_DAYS, isAfterDue, scheduledDay, staffStatusEmails } from "@/lib/tasks/rules";
import { canonicalReminder, isReminderKind, reminderStillTrue, type ReminderKind } from "./reminder-rules";
import { addressLine, firstName, joinNames } from "@/lib/portal/job-view";
import { telHref } from "@/lib/contacts";

/**
 * What a bundled task email says, who it goes to, and the send rules
 * (docs/asana-migration-plan.md §5.4, D19, D20, D30; the words and layout are
 * docs/specs/emails-redesign.md). Pure; outbox.ts does the database and the
 * sending, render.ts the HTML. See content.test.ts.
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
   * drain re-reads it when it claims the row (reconcileItems), and a partner's
   * Open task opens at the first one (firstUpdateId). A row can mix items with
   * and without it, and an item without it sends exactly as stored.
   */
  eventId?: string;
  /** A send-back's note comment: its text is inside the STATUS summary, and the drain rebuilds or strips it. */
  noteEventId?: string;
  /** Legacy TARGET rows (before Nov 21) only: present means the line names the due date. */
  visit?: boolean;
  /** The morning lines (reminders.ts): the day the line is for, which keeps each to once per kind and day. */
  due?: string;
  /**
   * TARGET, DAY, NOTES, CHECKLIST, HOLD and STATUS: what the job had before this change, so a change put back before
   * the email goes is dropped (undoneDropped). TARGET: the due date, DAY: the scheduled day, "" for none. NOTES:
   * notesFingerprint of the notes; CHECKLIST: checklistFingerprint of the list. STATUS and HOLD: the status. OFF:
   * the status it had, so a Removed email can tell work was started. Absent on rows queued before Nov 15.
   */
  from?: string;
  /**
   * STATUS out of Scheduled: the day it had ("" for none), so Remove day and a new day in one bundle aren't read as
   * nothing changed (undoneDropped). Absent before Nov 22, and on moves from any other status.
   */
  fromDay?: string;
  /** OFF ("took you off"): the job as they knew it then (jobKey), for offItems. Absent on lines queued before Nov 20. */
  job?: string;
  /** STATUS: the status it moved to. Absent before Nov 22; the summary still says it (statusTo). */
  to?: string;
  /** DAY, and a move to Scheduled: the day set, "YYYY-MM-DD" ("" for none). Absent before Nov 22. */
  day?: string;
  /** A contractor's line: who it was, so a partner's reply link names them (outbox.ts). Absent before Nov 22. */
  contactId?: string;
  /** A contractor's Send for review note: its status line's event, so the note goes when its Review email does. */
  statusEventId?: string;
  /** OFF on a deleted job, whose task row is gone (core.ts deleteTask): the job's id, its title, its street and unit. */
  taskId?: string;
  title?: string;
  where?: string;
  /** Set by reconcileItems, never stored: a resident's own note on their comment, quoted in the partners' email. */
  words?: string;
}

/** The morning lines: the job's own news, with nobody's name in front. */
const isMorning = (i: Pick<OutboxItem, "kind">) => isReminderKind(i.kind);

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

/**
 * The longest comment an email carries; a longer one ends in an ellipsis. A note is quoted in full (emails-redesign.md,
 * Q9: Zack's note, a resident's words), so this only stops a pasted essay.
 */
export const EMAIL_COMMENT_MAX = 2000;

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

/** A comment's text for an email: its line breaks kept, cut at EMAIL_COMMENT_MAX characters with an ellipsis. */
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
 *  - a comment is rebuilt from the event's current text and files, with its
 *    line breaks, "3 photos and 1 file" for the files, and dropped if it is
 *    empty now;
 *  - a file post with no live file left is dropped, so its email never says
 *    "added quote.pdf" for a file that is gone;
 *  - a comment, file post or status for a contractor must still be Shared and
 *    addressed to them; a Shared event never turns Internal, so this only
 *    guards a row that was queued oddly. ASSIGNED, TARGET and NOTES have no
 *    event and are never filtered: they are emailed to contractors by design;
 *  - a send-back's note, which lives inside its STATUS line, is rebuilt from
 *    the note comment as it stands, line breaks and all, or taken out if that
 *    was deleted.
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
      // A resident's line keeps its own summary ("added a note and 2 photos"); their note comes along as `words`.
      if (isResident(item)) {
        out.push(text ? { ...item, words: text } : item);
        continue;
      }
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

/**
 * `sent "T" back: note` with the note as it is now: rewritten if edited, taken out if deleted. Its line breaks stay
 * (emails-redesign.md, section 7: a send-back note lost them). Other status lines are untouched.
 */
function withSendBackNote(item: OutboxItem, note: EventSnapshot | undefined): OutboxItem {
  // Non-greedy for the same reason as sendBackTail's: the old note may say `" back` itself.
  const m = /^sent (".*?") back(?:: [\s\S]*)?$/.exec(oneLine(item.summary));
  if (!m) return item;
  const text = note && !note.deletedAt && note.body ? keepBreaks(note.body) : "";
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
 * The morning lines (reminders.ts) at send time: each goes only while it is still true (reminder-rules.ts
 * reminderStillTrue): the job still waits where the line found it and the day it names still holds. A line the job has
 * moved past is dropped; a bundle left empty closes as "nothing to send". `needsNotice` is whether the home still needs
 * 24 hours' notice; `planned` is the day column whatever the status, for a Today line on a job started that morning.
 */
export function liveReminders(
  items: readonly OutboxItem[],
  now: { status: TaskStatus; due: Ymd | null; scheduled: Ymd | null; planned?: Ymd | null; needsNotice: boolean; today: Ymd },
): OutboxItem[] {
  return items.filter((i) => !isReminderKind(i.kind) || reminderStillTrue({ kind: i.kind, due: i.due }, now, now.today));
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

/** A checklist's items in order, as one fingerprint (notesFingerprint of the titles), so an edit put back says nothing. */
export function checklistFingerprint(items: readonly { title: string }[]): string {
  return notesFingerprint(items.map((i) => oneLine(i.title)).join("\n"));
}

/** The kinds a later change can put back as they were, and what each is compared on. */
const UNDOABLE_KINDS = ["TARGET", "DAY", "NOTES", "CHECKLIST", "STATUS", "HOLD"] as const;

/**
 * Changes put back before the email goes (Connor, Nov 15): a date moved and
 * moved back, notes or the checklist edited back to what they said, a status
 * changed and changed back, a job put on hold and taken off it. For each of
 * those kinds, when its first line's `from` is what the job has now, every
 * line of that kind goes: the email would only report a change that isn't
 * there. A kind that ends somewhere new keeps all its lines, as before. Lines
 * without `from` (queued before Nov 15) stay. A checklist compares only when
 * the caller read it (`checklist`).
 *
 * A status put back takes a send-back's note with it (it lives inside the
 * STATUS line); the note comment itself stays on the job. Approve's Undo
 * deletes its line, which reconcileItems already drops.
 */
export function undoneDropped(
  items: readonly OutboxItem[],
  now: { due: Ymd | null; scheduled: Ymd | null; notes: string | null; status: TaskStatus; checklist?: readonly { title: string }[] },
): OutboxItem[] {
  const current: Record<(typeof UNDOABLE_KINDS)[number], string | null> = {
    TARGET: now.due ?? "",
    DAY: now.scheduled ?? "",
    NOTES: notesFingerprint(now.notes),
    CHECKLIST: now.checklist ? checklistFingerprint(now.checklist) : null,
    STATUS: now.status,
    HOLD: now.status,
  };
  const undone = new Set<string>(
    UNDOABLE_KINDS.filter((kind) => {
      const first = items.find((i) => i.kind === kind);
      if (first?.from === undefined || current[kind] === null || first.from !== current[kind]) return false;
      // Out of Scheduled and back is only put back when the day is too: Remove day, then a new day, is a real move.
      if (kind === "STATUS" && first.from === "SCHEDULED" && first.fromDay !== undefined && first.fromDay !== current.DAY) return false;
      return true;
    }),
  );
  // A status put back somewhere other than Scheduled takes any day set in between with it: that day is gone.
  if (undone.has("STATUS") && now.status !== "SCHEDULED") undone.add("DAY");
  return items.filter((i) => !undone.has(i.kind));
}

// ---------------------------------------------------------------------------
// What leads an email, and what only rides along (emails-redesign.md, Q2, Q6)
// ---------------------------------------------------------------------------

const RESIDENT = /\s\(resident\)$/;

/** A resident's line (residents/requests.ts principalFor labels them "Dana Lee (resident)"). */
export function isResident(item: Pick<OutboxItem, "actorLabel">): boolean {
  return RESIDENT.test(item.actorLabel);
}

/** A comment line that carries words (a quote), not only files ("added 3 photos"). */
function hasWords(item: OutboxItem): boolean {
  return item.kind === "COMMENT" && !isResident(item) && oneLine(item.summary).startsWith('"');
}

/** A comment line's words, line breaks kept, without its quotes and its "(3 photos)". */
function commentWords(item: OutboxItem): string {
  const m = /^"([\s\S]*)"(?: \(([^)]*)\))?$/.exec(keepBreaks(item.summary));
  return m ? m[1] : "";
}

const STATUSES: readonly TaskStatus[] = ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW", "DONE", "CANCELED", "DRAFT"];
const asStatus = (v: string | undefined): TaskStatus | null => (v && (STATUSES as readonly string[]).includes(v) ? (v as TaskStatus) : null);

/** Where a STATUS line moved the job: its `to`, or read from its words on a line queued before it carried one. */
function statusTo(item: OutboxItem): TaskStatus | null {
  const to = asStatus(item.to);
  if (to) return to;
  const s = oneLine(item.summary);
  // A send-back first: its note may end in "for review" itself.
  if (sendBackTail(s) !== null) return "IN_PROGRESS";
  if (/^sent ".*" for review$/.test(s) || /^marked ".*" done$/.test(s)) return "REVIEW";
  if (/^scheduled ".*" for /.test(s)) return "SCHEDULED";
  if (/^started ".*"$/.test(s)) return "IN_PROGRESS";
  if (/^approved ".*"$/.test(s)) return "DONE";
  if (/^unscheduled ".*"$/.test(s)) return "OPEN";
  const set = /^set ".*" to (.+)$/.exec(s);
  return set ? asStatus(set[1].replace(" ", "_").toUpperCase()) : null;
}

/** Where a STATUS line moved the job from: its `from`, or Review for a send-back queued before it carried one. */
function statusFrom(item: OutboxItem): TaskStatus | null {
  return asStatus(item.from) ?? (isSendBack(item) ? "REVIEW" : null);
}

function isSendBack(item: OutboxItem): boolean {
  return item.kind === "STATUS" && sendBackTail(oneLine(item.summary)) !== null;
}

const isReviewLine = (i: OutboxItem) => i.kind === "STATUS" && statusTo(i) === "REVIEW" && !isSendBack(i);

/** A day line: a pick or move (DAY), a move to Scheduled, or a day taken off (Remove day, or back to To do). */
function isDayLine(i: OutboxItem): boolean {
  if (i.kind === "DAY") return true;
  if (i.kind !== "STATUS") return false;
  const to = statusTo(i);
  return to === "SCHEDULED" || (to === "OPEN" && statusFrom(i) === "SCHEDULED");
}

/** A day line that takes the day off: Remove day, a move back to To do, or a DAY line to no date. */
function isDayRemoval(i: OutboxItem): boolean {
  const s = oneLine(i.summary);
  if (i.kind === "DAY") return /^unscheduled /.test(s) || / to no date$/.test(s);
  return i.kind === "STATUS" && statusTo(i) === "OPEN";
}

/** The job as the lead rule reads it, as days. */
interface JobNow {
  status: TaskStatus;
  due: Ymd | null;
  scheduled: Ymd | null;
  today: Ymd;
}

/** Due is this close, or past (DUE_SOON_DAYS): a contractor's day taken off then puts the job at risk (Q6). */
function dueSoon(due: Ymd | null, today: Ymd): boolean {
  const soon = addDaysYmd(today, DUE_SOON_DAYS);
  return !!due && !!soon && due <= soon;
}

/**
 * Whether a line makes an email of its own, or only rides along in one something else sends
 * (docs/specs/emails-redesign.md, Q2 and Q6).
 *
 * A contractor's: everything a partner does that changes the trip (a new job, their words, the notes, the checklist,
 * Due, their day, on hold, a send-back, taken off) and the morning lines. Photos or files with no words, and a status
 * a partner set for them, only ride along.
 *
 * A partner's: a contractor's words, Send for review, a resident's request, addition or cancel, and a contractor's day
 * that puts the job at risk: their day now after Due, or their day taken off with Due DUE_SOON_DAYS out or less. A
 * Start, a day on or before Due and photos with no words only ride along. The day is judged on the job as it is now,
 * so a pick after Due that was moved back before the email went says nothing.
 */
export function leadsEmail(item: OutboxItem, audience: Audience, job: JobNow): boolean {
  if (audience === "contractor") {
    if (item.kind === "ATTACHMENT") return false;
    if (item.kind === "COMMENT") return hasWords(item);
    if (item.kind === "STATUS") {
      const from = statusFrom(item);
      const to = statusTo(item);
      return !!from && !!to && staffStatusEmails(from, to);
    }
    return true;
  }
  if (isResident(item)) return true;
  if (item.kind === "COMMENT") return hasWords(item);
  if (item.kind === "ATTACHMENT") return false;
  if (isDayLine(item)) {
    if (isDayRemoval(item)) return (job.status === "OPEN" || job.status === "WAITING") && dueSoon(job.due, job.today);
    return job.status === "SCHEDULED" && isAfterDue(job.scheduled, job.due);
  }
  if (item.kind === "STATUS") return isReviewLine(item);
  return true;
}

/**
 * A partner's lines at send time (Q6): a Send for review goes only while the job still waits in Review (it left, or the
 * other partner decided, and the email would be stale: the "Done:" after an Approve inside the bundle), taking the note
 * written with it; a new request goes only while nobody is assigned; a request and its cancel in one bundle say
 * nothing at all.
 */
function partnerKept(items: readonly OutboxItem[], job: { status: TaskStatus; assigned: boolean }): OutboxItem[] {
  const created = items.some((i) => i.kind === "CREATED");
  const canceled = items.some((i) => isResident(i) && /^canceled /.test(oneLine(i.summary)));
  if (created && canceled) return [];
  const staleReviews = job.status === "REVIEW" ? [] : items.filter(isReviewLine);
  const staleIds = new Set(staleReviews.map((i) => i.eventId).filter(Boolean));
  const staleAts = new Set(staleReviews.map((i) => i.at));
  return items.filter((i) => {
    if (staleReviews.includes(i)) return false;
    // The note a Send for review was written with: tied by its status line's id, or (queued before that) its moment.
    if (i.kind === "COMMENT" && !isResident(i) && ((i.statusEventId && staleIds.has(i.statusEventId)) || (!i.statusEventId && staleAts.has(i.at)))) return false;
    if (i.kind === "CREATED" && job.assigned) return false;
    return true;
  });
}

/**
 * A contractor's lines at send time beyond offItems and liveReminders: on a job in review only a partner's words still
 * go (their work is done, so Due, the notes and the rest wait); on a closed job, the same; on hold, only that and a
 * partner's words.
 */
function contractorKept(items: readonly OutboxItem[], status: TaskStatus): OutboxItem[] {
  if (items.some((i) => i.kind === "OFF")) return [...items];
  if (status === "REVIEW" || !isActiveStatus(status)) return items.filter(hasWords);
  if (status === "WAITING" && items.some((i) => i.kind === "HOLD")) return items.filter((i) => i.kind === "HOLD" || hasWords(i));
  // Put on hold and moved on since (back to work, or scheduled): the hold says nothing now.
  return items.filter((i) => i.kind !== "HOLD");
}

// ---------------------------------------------------------------------------
// The send run's decisions about a row (outbox.ts drainDue)
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
 *  - Its task is gone: "no task" (a deleted job's Removed row is deletedRowVerdict's).
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

/**
 * A row with no task (core.ts deleteTask queues one for the contractor of a deleted job, docs/specs/emails-redesign.md,
 * Q2): it goes when it is a contractor's and its OFF line carries the job's title, to a login that still takes job
 * emails, with nothing but that line. Any other task-less row is "no task".
 */
export function deletedRowVerdict(row: RowRecipient & { taskId: string | null; items: unknown }): { send: true; to: string; off: OutboxItem } | { send: false; reason: string } {
  const off = parseItems(row.items).find((i) => i.kind === "OFF" && typeof i.title === "string");
  if (row.taskId || !off || row.recipientUser) return { send: false, reason: "no task" };
  const delivery = deliveryFor({ recipientUser: null, recipientContact: row.recipientContact }, { contractorHasAccess: true });
  return delivery.ok ? { send: true, to: delivery.to, off } : { send: false, reason: delivery.reason };
}

/** The job as the send run reads it again once a row is claimed. */
export interface ClaimedJob {
  status: TaskStatus;
  dueDate: Date | null;
  scheduledFor: Date | null;
  description: string | null;
  /** Who has the job now: a new request goes only while nobody does. Absent reads as nobody. */
  assigneeContactId?: string | null;
  assigneeUserId?: string | null;
  /** The checklist's titles in order, for a checklist edit put back. Absent: not compared. */
  checklist?: readonly { title: string }[];
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
 *  - A contractor's lines go through offItems, liveReminders and contractorKept, a partner's through partnerKept; then,
 *    for anyone, a change put back before the email goes is dropped (undoneDropped).
 *  - Nothing left that leads an email of its own (leadsEmail): "nothing to send". Lines that only ride along close
 *    with it.
 *  - A partner who opened the task in the app at or after its newest line (`seenAt`, TaskReadState) already saw it:
 *    "seen in app" (Q6).
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
  /** Partner: when they last opened the task (TaskReadState.lastSeenAt), or null. */
  seenAt?: Date | null;
  today: Ymd;
}):
  | { send: true; items: OutboxItem[]; due: Ymd | null; scheduled: Ymd | null; job: ClaimedJob }
  | { send: false; reason: "no task" | "draft" | "nothing to send" | "seen in app" } {
  const job = input.job;
  if (!job) return { send: false, reason: "no task" };
  if (job.status === "DRAFT") return { send: false, reason: "draft" };
  // Two dates (docs/specs/contractor-scheduled-date.md): Due, and the contractor's scheduled day while Scheduled.
  const due = toYmd(job.dueDate);
  const scheduled = toYmd(scheduledDay(job));
  const kept =
    input.audience === "contractor"
      ? contractorKept(
          liveReminders(offItems(input.items, { hasAccess: input.hasAccess, canceled: job.status === "CANCELED", job: jobKey({ status: job.status, due, scheduled, notes: job.description }) }), {
            status: job.status,
            due,
            scheduled,
            planned: toYmd(job.scheduledFor),
            needsNotice: !!input.needsNotice,
            today: input.today,
          }),
          job.status,
        )
      : partnerKept(input.items, { status: job.status, assigned: !!(job.assigneeContactId || job.assigneeUserId) });
  // A date, the notes, the checklist or a status put back as they were before the bundle's first change says nothing.
  const items = undoneDropped(kept, { due, scheduled, notes: job.description, status: job.status, checklist: job.checklist });
  const now: JobNow = { status: job.status, due, scheduled, today: input.today };
  if (!items.some((i) => leadsEmail(i, input.audience, now))) return { send: false, reason: "nothing to send" };
  if (input.audience === "staff" && input.seenAt) {
    const newest = Math.max(...items.map((i) => Date.parse(i.at)).filter((t) => !Number.isNaN(t)));
    if (Number.isFinite(newest) && input.seenAt.getTime() >= newest) return { send: false, reason: "seen in app" };
  }
  return { send: true, items, due, scheduled, job };
}

/** The update a partner's Open task opens at: the first comment, status or file post in the bundle. */
export function firstUpdateId(items: readonly OutboxItem[]): string | null {
  return items.find((i) => i.eventId && (i.kind === "COMMENT" || i.kind === "STATUS" || i.kind === "ATTACHMENT"))?.eventId ?? null;
}

/** The contractor a partner's email is about, for its reply link (outbox.ts): the first contractor line that says. */
export function aboutContactId(items: readonly OutboxItem[]): string | null {
  return items.find((i) => i.contactId)?.contactId ?? null;
}

// ---------------------------------------------------------------------------
// The words of one line (Q9: contractor emails name partners by first name, partner emails say "task" and "this" and
// name contractors by their full name)
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

/** Who a line is from: a resident and a partner by first name; in a partner's email, a contractor by full name. */
export function whoOf(item: Pick<OutboxItem, "actorLabel">, voice: Audience): string {
  const label = oneLine(item.actorLabel.replace(RESIDENT, ""));
  if (RESIDENT.test(item.actorLabel) || voice === "contractor") return firstName(label);
  return label;
}

/** A day as an email writes it: "Thu, Nov 26", with the year only when it isn't this one. */
const dayText = (d: Ymd, today: Ymd) => fmtDay(d, { weekday: true, year: "auto", now: today });

/** The "(was Tue, Nov 24)" at the end of a contractor's own day line, or the day a STATUS line left (fromDay). */
function wasText(item: OutboxItem, today: Ymd): string | null {
  const m = / \(was ([^)]*)\)$/.exec(oneLine(item.summary));
  if (m) return m[1];
  if (item.kind === "DAY" && item.from) return dayText(item.from as Ymd, today);
  return item.fromDay ? dayText(item.fromDay as Ymd, today) : null;
}

/**
 * One change, after the person's name, without the task's title (the subject
 * has it), in the reader's words: a contractor reads "moved your day to Thu,
 * Nov 27" and "sent this job back", a partner "moved the scheduled day to Fri,
 * Nov 27 (was Tue, Nov 24)" and "started this", as the task's Activity reads.
 * Dates arrive already written out (core.ts emailDay). The title patterns are
 * greedy so a title with a quote in it ("Hang 36" mirror") still comes out
 * whole; the send-back's is not, since its note comes after the title
 * (sendBackTail). `title`, when the caller has the job's, lets that one be cut
 * off exactly. A morning line has no name and reads whole.
 */
export function itemText(item: OutboxItem, title?: string, voice: Audience = "contractor", today: Ymd = todayYmdEastern()): string {
  // A comment keeps its line breaks (activity 2.10); everything else is one line.
  const s = item.kind === "COMMENT" ? keepBreaks(item.summary) : oneLine(item.summary);
  const partner = voice === "staff";
  switch (item.kind) {
    case "ASSIGNED":
      return "sent you a new job";
    case "NOTES":
      return "edited the notes";
    case "CHECKLIST": {
      const what = /^(added|removed|put back) "(.*)" (?:to|from|on) the checklist$/.exec(s) ?? /^renamed ".*" to "(.*)" on the checklist$/.exec(s);
      if (!what) return "edited the checklist";
      if (what.length === 2) return `renamed a checklist item to "${what[1]}"`;
      return what[1] === "added" ? `added "${what[2]}" to the checklist` : what[1] === "removed" ? `took "${what[2]}" off the checklist` : `put "${what[2]}" back on the checklist`;
    }
    case "TARGET": {
      const m = /^moved ".*" to (.+)$/.exec(s);
      const to = m && m[1] !== "no date" ? m[1] : null;
      if (partner) {
        // A contractor's pick that moved Due, before Nov 21.
        const what = item.visit === undefined && item.from === undefined ? "date" : "due date";
        return to ? `moved the ${what} to ${to}` : `cleared the ${what}`;
      }
      if (!to) return "cleared Due";
      return item.from === "" ? `set Due to ${to}` : `moved Due to ${to}`;
    }
    case "DAY": {
      const m = /^moved ".*" to (.+?)(?: \(was [^)]*\))?$/.exec(s);
      const to = m && m[1] !== "no date" ? m[1] : null;
      const was = wasText(item, today);
      if (partner) {
        if (!to) return `removed the scheduled day${was ? ` (was ${was})` : ""}`;
        return `moved the scheduled day to ${to}${was ? ` (was ${was})` : ""}`;
      }
      return to ? `moved your day to ${to}` : "removed your day";
    }
    case "HOLD":
      return "put this job on hold";
    case "COMMENT": {
      if (isResident(item)) return s;
      const files = /^added files \(\+(\d+) files?\)$/.exec(s);
      if (files) return `added ${files[1]} file${files[1] === "1" ? "" : "s"}`;
      return s.startsWith('"') ? `: ${s}` : s;
    }
    case "CREATED":
      return "sent this request";
    case "ATTACHMENT":
      return s;
    case "STATUS": {
      const scheduled = /^scheduled ".*" for (.+)$/.exec(s);
      if (scheduled) return partner ? `scheduled this for ${scheduled[1]}` : `set your day: ${scheduled[1]}`;
      if (/^approved ".*"$/.test(s)) return partner ? "approved this" : "approved this job";
      // A contractor's Remove day (core.ts unscheduleByContractor), naming the day it had (section 7).
      if (/^unscheduled ".*"$/.test(s)) {
        const was = wasText(item, today);
        return `removed the scheduled day${was ? ` (was ${was})` : ""}`;
      }
      // Only the contractor's own Start reads as starting the job (core.ts statusSummary).
      if (/^started ".*"$/.test(s)) return partner ? "started this" : "started the job";
      if (/^marked ".*" done$/.test(s)) return partner ? "sent this for review" : "sent this job for review";
      // A send-back first: its note may end in "for review" itself.
      const tail = sendBackTail(s, title);
      if (tail !== null) return partner ? `sent this back${tail}` : "sent this job back";
      if (/^sent ".*" for review$/.test(s)) return partner ? "sent this for review" : "sent this job for review";
      const set = /^set ".*" to (.+)$/.exec(s);
      if (set) {
        const label = STATUS_BY_WORDS.get(set[1]) ?? set[1];
        // A partner taking their day away is a move, said as one.
        if (!partner && set[1] === "open" && statusFrom(item) === "SCHEDULED") return "removed your day";
        return partner ? `moved this to ${label}` : `moved this job to ${label}`;
      }
      return s.replace(/"[^"]*"/, partner ? "this" : "this job");
    }
    case "OFF":
      if (/^deleted /.test(s) || /^canceled /.test(s)) return isResident(item) ? "canceled the request" : "canceled this job";
      return "took you off this job";
    default:
      if (isMorning(item)) return morningHeadline(canonicalReminder(item.kind as ReminderKind), item.due ?? null, today);
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
  const m = /^sent ".*?" back(: [\s\S]+)?$/.exec(s);
  return m ? (m[1] ?? "") : null;
}

/** A send-back's note with its line breaks, or "" for none. */
function sendBackNote(item: OutboxItem, title?: string): string {
  const raw = item.summary.replace(/\r\n?/g, "\n").trim();
  const firstLine = raw.split("\n")[0];
  const tail = sendBackTail(oneLine(firstLine), title);
  if (tail === null) return "";
  // The tail of the first line, then any further lines as written.
  const rest = raw.slice(firstLine.length);
  return keepBreaks(`${tail.replace(/^: /, "")}${rest}`);
}

/** "Connor moved Due to Fri, Dec 4", 'Zack Miller: "Doors arrive Thursday."' A morning line has no name. */
export function itemLine(item: OutboxItem, title?: string, voice: Audience = "contractor", today?: Ymd): string {
  const text = itemText(item, title, voice, today);
  if (isMorning(item)) return text;
  const name = whoOf(item, voice);
  return text.startsWith(":") ? `${name}${text}` : `${name} ${text}`;
}

/** A line as a sentence: a period unless it already ends in one or in a quote. A ")" is not an end (section 7). */
export function asSentence(line: string): string {
  return /[.!?"…]$/.test(line) ? line : `${line}.`;
}

/** Lines that say only their latest: a date, the notes, and an assignment (a picker's Undo and re-pick hands it over twice). */
const LATEST_ONLY = new Set(["TARGET", "DAY", "NOTES", "ASSIGNED", "HOLD"]);

/** Target, notes and assignment changes say only their latest; everything else is kept, oldest first. */
function latestOnly(items: readonly OutboxItem[]): OutboxItem[] {
  const lastOf = new Map<string, number>();
  items.forEach((it, i) => {
    if (LATEST_ONLY.has(it.kind)) lastOf.set(it.kind, i);
  });
  const firstDay = items.find((it) => it.kind === "DAY");
  return items
    .filter((it, i) => (LATEST_ONLY.has(it.kind) ? lastOf.get(it.kind) === i : true))
    .map((it) => (it.kind === "DAY" && firstDay && it !== firstDay ? { ...it, summary: wasFrom(it.summary, firstDay.summary), from: firstDay.from } : it));
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

/** The lines of one email as sentences, oldest first; dates, notes and the assignment only at their latest. */
export function itemLines(items: readonly OutboxItem[], title?: string, voice: Audience = "contractor", today?: Ymd): string[] {
  return latestOnly(items).map((it) => asSentence(itemLine(it, title, voice, today)));
}

/** The longest inbox preview line (Q9: under about 90 characters). */
export const PREVIEW_MAX = 90;

/** The hidden preview line: one line, cut on a word. */
export function previewText(...parts: readonly string[]): string {
  const s = oneLine(parts.filter(Boolean).join(" "));
  if (s.length <= PREVIEW_MAX) return s;
  return `${s.slice(0, PREVIEW_MAX - 1).replace(/\s+\S*$/, "")}…`;
}

/** A quote for a preview line: `Connor: "Use the side door."`, cut by previewText. */
const quotePreview = (name: string, words: string) => `${name}: "${oneLine(words)}"`;

/**
 * A job's street and unit as My jobs shows them (job-view.ts addressLine), so an email names the same unit whose
 * lockbox code the job page shows (D21): "118 Congress St · Rear".
 */
export function jobWhere(address: string | null, unitLabel?: string | null): string {
  const street = address ? shortAddress(address) || oneLine(address) : "";
  return addressLine(street || null, unitLabel ? oneLine(unitLabel) : null);
}

/**
 * The job's address on two lines (Q9): the street and unit, then the city, state and zip: "118 Congress St, Rear" over
 * "Buffalo, NY 14213". One line when the address has no city part.
 */
export function addressLines(address: string | null, unitLabel?: string | null): string[] {
  const unit = unitLabel ? oneLine(unitLabel) : "";
  if (!address) return unit ? [unit] : [];
  const street = shortAddress(address) || oneLine(address.split(",")[0]);
  const rest = oneLine(address.split(",").slice(1).join(",")).replace(/^,\s*/, "");
  return [[street, unit].filter(Boolean).join(", "), rest].filter(Boolean);
}

/**
 * A job email's subject (Q9): "Word: title, street · unit", so the word and the title land in the first 38
 * characters: "Update: Replace kitchen faucet, 118 Congress St · Rear".
 */
export function jobSubject(input: { word: string; title: string; where: string }): string {
  const what = [oneLine(input.title) || "A job", input.where].filter(Boolean).join(", ");
  return `${input.word}: ${what}`;
}

/**
 * What threads one job's emails (resend.ts makes it a header): one id per job, so a date move no longer splits the
 * thread. Emails sent before Nov 15 carry `job-<id>-<date>`; inbound.ts threadTaskId reads both.
 */
export function threadKey(taskId: string): string {
  return `job-${taskId}`;
}

/** A thumbnail in an email and where tapping it goes. */
export type EmailPhoto = JobEmailPhoto;
export type EmailButton = JobEmailLink;

/** The most of the job's photos a job email shows before "+N" (Q9: three tiles of 64x48). */
export const JOB_PHOTO_MAX = 3;
/** The Review and New request emails' larger tiles, two across at half the column (Q9). */
export const TILE_MAX = 2;

/**
 * A photo's thumbnail in an email, through the private file route with the
 * email's link as the key (`?l=`), since a mail app fetches it with no
 * cookie: the route checks the link still reaches that job and file.
 */
export function emailPhotoUrl(appUrl: string, attachmentId: string, linkToken: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/files/task/${encodeURIComponent(attachmentId)}?v=thumb&l=${linkToken}`;
}

/** Up to `max` thumbnails, each opening `href`, and how many more there are. */
function photoStrip(ids: readonly string[], appUrl: string, linkToken: string | null, href: string, max: number): { photos: EmailPhoto[]; morePhotos: number } {
  if (!linkToken || ids.length === 0) return { photos: [], morePhotos: 0 };
  const shown = ids.slice(0, max);
  return { photos: shown.map((id) => ({ src: emailPhotoUrl(appUrl, id, linkToken), href })), morePhotos: ids.length - shown.length };
}

/** "2 of 3 done", or null with no checklist. */
export function checklistLine(items: readonly { done: boolean }[]): string | null {
  return items.length ? `${items.filter((i) => i.done).length} of ${items.length} done` : null;
}

/** The share icon before Share with crew: lucide Share at 3x in --muted-foreground, a hosted PNG (Gmail drops SVG). */
export function shareIconUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/email/share.png`;
}

/** The status as the task list words it (Q9): "In progress", "Scheduled Tue, Nov 24", "Waiting on National Fuel". */
export function statusWords(status: TaskStatus, opts: { scheduled: Ymd | null; waitingOn?: string | null; today: Ymd }): string {
  if (status === "SCHEDULED" && opts.scheduled) return `Scheduled ${dayText(opts.scheduled, opts.today)}`;
  if (status === "WAITING" && opts.waitingOn?.trim()) return `Waiting on ${oneLine(opts.waitingOn)}`;
  return STATUS_LABEL[status];
}

/**
 * A morning line's headline (Q8, Q9), with nobody's name: "Your day is today.", "Your day was Tue, Nov 24." The day is
 * the one the line was for.
 */
function morningHeadline(kind: ReminderKind, day: Ymd | null, today: Ymd): string {
  switch (kind) {
    case "TELL_TENANT":
      return day ? `Your day is ${dayText(day, today)}.` : "Your day is coming up.";
    case "SCHEDULED_TODAY":
      return "Your day is today.";
    case "STILL_OPEN":
      return day ? `Your day was ${dayText(day, today)}.` : "Your day has passed.";
    case "NO_DAY":
      return "This job has no day yet.";
    case "DUE_TODAY":
      return "This job is due today.";
    case "OVERDUE":
      return "This job was due yesterday.";
  }
}

/** The morning words as subject words (Q9). */
const MORNING_WORD: Record<ReminderKind, string> = {
  TELL_TENANT: "Tell the tenant",
  SCHEDULED_TODAY: "Today",
  STILL_OPEN: "Still open",
  NO_DAY: "No day yet",
  DUE_TODAY: "Due today",
  OVERDUE: "Due yesterday",
};

/**
 * A morning line's subject word. No day yet names the Due date instead when there is one (Connor, Nov 23): the
 * missing day is already the headline, and the subject should say when it has to be done: "Due Thu, Nov 26".
 */
function morningWord(kind: ReminderKind, due: Ymd | null | undefined, today: Ymd): string {
  if (kind === "NO_DAY" && due) return `Due ${dayText(due, today)}`;
  return MORNING_WORD[kind];
}

/** Highest first when a bundle has more than one (Q9). */
const MORNING_ORDER: readonly ReminderKind[] = ["TELL_TENANT", "SCHEDULED_TODAY", "STILL_OPEN", "NO_DAY", "DUE_TODAY", "OVERDUE"];

// ---------------------------------------------------------------------------
// One email
// ---------------------------------------------------------------------------

/**
 * One job email, as render.ts draws it (docs/specs/emails-redesign.md, Q3, Q4 and Q9): the subject, the From name, the
 * preview, the headline (the event only), the lines under it, a person's own words quoted, one button that is the
 * reader's next step, Share with crew under it on a contractor's open job, then the job, labels over values. Removed,
 * On hold and a job in review or closed carry the headline and one line instead of the job.
 */
export interface TaskEmail extends JobEmailInput {
  subject: string;
  /** The name the inbox shows (Q5): "HG Capital", or "Zack Miller via HG Capital" when a contractor leads a partner's email. */
  fromName: string;
  /** Threads the job's emails (threadKey). */
  threadKey: string;
}

/** What taskEmail is told about a job and its reader. */
export interface TaskEmailInput {
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
  /** The day column whatever the status: an In progress job still shows the day it was planned for. */
  planned?: Ymd | null;
  /** Today in Buffalo, for writing the date (a year only when it isn't this one). */
  today: Ymd;
  notes?: string | null;
  checklist?: { title: string; done: boolean }[];
  /** On hold: what it waits on (Task.waitingOn). */
  waitingOn?: string | null;
  /** Contractor: Getting in's two lines (job-view.ts gettingInWords), or null when the job page says nothing. */
  gettingIn?: { value: string; note: string } | null;
  /** Contractor: who lives there today (access-code.ts readJobAccess), shown under Getting in. Empty or absent when nobody does. */
  tenants?: readonly { name: string; phone: string | null; dial: string | null }[];
  /** Partner: the contractor on the job, by full name (Contact.fullName). */
  contractorName?: string | null;
  /** First names of the partners, for a closed job's "Reply to reach Connor and Pieter.". */
  staffNames?: readonly string[];
  /** The email's own link (job-links.ts): a contractor's EMAIL link, a partner's STAFF link. Null sends plain links. */
  linkToken?: string | null;
  /** The photos the bundle's updates carry, oldest first, as attachment ids the recipient may see. */
  newPhotoIds?: readonly string[];
  /** Contractor: HG's other photos on the job, newest first. */
  jobPhotoIds?: readonly string[];
  /** The email has its own reply address (replies post to the job): the footer says what a reply does. */
  replyByEmail?: boolean;
  /** Partner: the job has an assignee (a new request's Assign, else Open task). */
  assigned?: boolean;
  /** Partner, on a resident's request: their words in full and their answers (ResidentRequest). */
  request?: { whatsWrong: string; details: string | null; letUsIn: boolean; pets: boolean | null; petsNote: string | null } | null;
}

const FROM_HG = "HG Capital";

export function taskEmail(input: TaskEmailInput): TaskEmail {
  return input.audience === "contractor" ? contractorEmail(input) : partnerEmail(input);
}

/** A contractor's link for a step: through their job link when there is one, else the portal page (behind sign-in). */
function contractorLink(input: TaskEmailInput, step: JobLinkStep | null): string {
  const token = input.linkToken ?? null;
  if (token) return jobLinkUrl(input.appUrl, token, step);
  return `${input.appUrl.replace(/\/+$/, "")}${jobLinkDestination(input.taskId, step)}`;
}

/** The short form's one line (Q4): the title, then the street and unit, "Vanity swap, 118 Congress St, Rear". */
function shortLine(title: string, address: string | null, unitLabel?: string | null): string {
  const street = addressLines(address, unitLabel)[0] ?? "";
  return [oneLine(title) || "A job", street].filter(Boolean).join(", ");
}

/**
 * Removed (Q2, Q4, Q9): taken off, canceled, deleted, or a resident's cancel. The headline and one line, no button, no
 * footer, no Share with crew: the job isn't theirs now. Work already under way asks for what's done so far.
 */
export function removedEmail(input: { off: OutboxItem; title: string; where: string; short: string; taskId: string | null; today: Ymd }): TaskEmail {
  const s = oneLine(input.off.summary);
  const name = whoOf(input.off, "contractor");
  const started = input.off.from === "IN_PROGRESS";
  const what = /^took you off /.test(s) ? `${name} took you off this job.` : isResident(input.off) ? `${name} canceled the request.` : `${name} canceled this job.`;
  const next = started ? "Reply with what's done so far." : "No need to go.";
  // Two lines at most at 320 (Q9): work under way puts its ask on the next line.
  const headline = started ? what : `${what} ${next}`;
  return {
    subject: jobSubject({ word: "Removed", title: input.title, where: input.where }),
    fromName: FROM_HG,
    preview: previewText(what, next),
    headline,
    lines: started ? [next] : [],
    quotes: [],
    primary: null,
    job: null,
    short: input.short,
    // The job's own thread for Removed, as before (Q9 keeps threading as it is).
    threadKey: input.taskId ? `job-${input.taskId}-off` : `job-${input.off.at}-off`,
  };
}

/** The headline, preview and lines a contractor's lead change gives, read on the job as it is now. */
interface Lead {
  headline: string;
  preview: string;
  lines: string[];
}

function contractorEmail(input: TaskEmailInput): TaskEmail {
  const today = input.today;
  const where = jobWhere(input.address, input.unitLabel);
  const short = shortLine(input.title, input.address, input.unitLabel);
  const off = input.items.find((i) => i.kind === "OFF");
  if (off) return removedEmail({ off, title: input.title, where, short, taskId: input.taskId, today });

  const items = latestOnly(input.items);
  const status = input.status;
  const due = input.due ?? null;
  const scheduled = input.scheduled ?? null;
  const open = isActiveStatus(status) && status !== "REVIEW";
  const quotes = items.filter(hasWords);
  const sentBack = [...items].reverse().find(isSendBack) ?? null;
  const assigned = items.find((i) => i.kind === "ASSIGNED") ?? null;
  const hold = status === "WAITING" ? (items.find((i) => i.kind === "HOLD") ?? null) : null;
  const dayLines = items.filter((i) => isDayLine(i) && i.kind !== "TARGET");
  const target = items.find((i) => i.kind === "TARGET") ?? null;
  const dueBeforeDay = !!target && !!due && !!scheduled && due < scheduled;
  const mornings = items.filter(isMorning).map((i) => ({ item: i, kind: canonicalReminder(i.kind as ReminderKind) }));
  mornings.sort((a, b) => MORNING_ORDER.indexOf(a.kind) - MORNING_ORDER.indexOf(b.kind));
  const tell = open && status === "SCHEDULED" ? (mornings.find((m) => m.kind === "TELL_TENANT") ?? null) : null;
  const dayMoved = dayLines.length > 0 && dayChange(dayLines, { status, scheduled }, today) !== null;

  // The word (Q9), highest first; Tell the tenant picks the word when it applies, and the move goes in the headline.
  const word = sentBack
    ? "Sent back"
    : tell
      ? "Tell the tenant"
      : assigned
        ? "New"
        : dayMoved || dueBeforeDay
          ? "Moved"
          : hold
            ? "On hold"
            : items.some((i) => !isMorning(i))
              ? "Update"
              : mornings.length
                ? morningWord(mornings[0].kind, due, today)
                : "Update";

  // The lead's headline, and the lines that came with it. A new job carries the whole job, so its other edits say
  // nothing of their own; the job below is already as they left it.
  const partnerName = (i: OutboxItem | null) => (i ? whoOf(i, "contractor") : "HG Capital");
  const lead: Lead = (() => {
    if (sentBack) {
      return { headline: `${partnerName(sentBack)} sent this job back.`, preview: `${partnerName(sentBack)} sent this job back.`, lines: [] };
    }
    if (assigned) {
      const getIn = input.gettingIn?.value ?? null;
      const when = scheduled ? `Your day is ${dayText(scheduled, today)}` : due ? `Due ${dayText(due, today)}` : null;
      return { headline: `${partnerName(assigned)} sent you a new job.`, preview: [when, getIn].filter(Boolean).join(" · ") || `${partnerName(assigned)} sent you a new job.`, lines: [] };
    }
    if (dayMoved) {
      const who = partnerName(dayLines[dayLines.length - 1]);
      const change = dayChange(dayLines, { status, scheduled }, today)!;
      if (change.kind === "set") return { headline: `${who} set your day: ${change.to}.`, preview: `${who} set your day: ${change.to}.`, lines: [] };
      if (change.kind === "moved") return { headline: `${who} moved your day to ${change.to}.`, preview: `${who} moved your day to ${change.to} (was ${change.was}).`, lines: [`It was ${change.was}.`] };
      return { headline: `${who} removed your day.`, preview: change.was ? `${who} removed your day (was ${change.was}).` : `${who} removed your day.`, lines: change.was ? [`It was ${change.was}.`] : [] };
    }
    if (dueBeforeDay && target && due && scheduled) {
      return {
        headline: `${partnerName(target)} moved Due to ${dayText(due, today)}.`,
        preview: `Due is now ${dayText(due, today)}, before your day (${dayText(scheduled, today)}).`,
        lines: [`That's before your day, ${dayText(scheduled, today)}.`],
      };
    }
    if (hold) {
      const why = input.waitingOn?.trim() ? oneLine(input.waitingOn) : null;
      return {
        headline: `${partnerName(hold)} put this job on hold.`,
        preview: why ? `${partnerName(hold)} put this on hold: waiting on ${why}.` : `${partnerName(hold)} put this job on hold.`,
        lines: why ? [`Waiting on ${why}.`] : [],
      };
    }
    const notes = items.find((i) => i.kind === "NOTES") ?? null;
    if (notes) {
      const text = input.notes?.trim() ? oneLine(input.notes) : null;
      return { headline: `${partnerName(notes)} edited the notes.`, preview: text ? quotePreview(`${partnerName(notes)} edited the notes`, text) : `${partnerName(notes)} edited the notes.`, lines: [] };
    }
    const lists = items.filter((i) => i.kind === "CHECKLIST");
    if (lists.length) {
      const one = lists.length === 1 ? asSentence(itemLine(lists[0], input.title, "contractor", today)) : `${partnerName(lists[0])} edited the checklist.`;
      return { headline: `${partnerName(lists[0])} edited the checklist.`, preview: one, lines: [] };
    }
    if (target) {
      const line = asSentence(`${partnerName(target)} ${dueText(target, due, today)}`);
      return { headline: line, preview: line, lines: [] };
    }
    if (quotes.length) return { headline: `${partnerName(quotes[0])} sent you a note.`, preview: "", lines: [] };
    if (mornings.length) {
      const m = mornings[0];
      return { headline: morningHeadline(m.kind, m.item.due ?? null, today), preview: morningPreview(m.kind, input), lines: morningLines(m.kind) };
    }
    return { headline: "", preview: "", lines: [] };
  })();

  // The bundle's other lines, in order, as short sentences under the headline. A new job and a send-back say nothing
  // more than their lead; comments are quotes, not lines; a morning line already led or is folded into Tell the tenant.
  const consumed = new Set<OutboxItem>([...(sentBack ? [sentBack] : []), ...(assigned ? [assigned] : []), ...quotes]);
  if (dayMoved) dayLines.forEach((i) => consumed.add(i));
  if (dueBeforeDay && target) consumed.add(target);
  if (hold) consumed.add(hold);
  const leadKind = lead.headline;
  const extra = assigned
    ? items.filter((i) => i.kind === "HOLD" && status === "WAITING")
    : items.filter((i) => !consumed.has(i) && !isMorning(i) && !(i.kind === "NOTES" && leadKind.endsWith("edited the notes.")));
  const lists = extra.filter((i) => i.kind === "CHECKLIST");
  const otherLines: string[] = [];
  let listSaid = leadKind.endsWith("edited the checklist.");
  for (const i of extra) {
    if (i.kind === "CHECKLIST") {
      if (listSaid) continue;
      listSaid = true;
      otherLines.push(lists.length === 1 ? asSentence(itemLine(i, input.title, "contractor", today)) : `${partnerName(i)} edited the checklist.`);
      continue;
    }
    if (i.kind === "TARGET") {
      const line = asSentence(`${partnerName(i)} ${dueText(i, due, today)}`);
      if (line !== lead.headline) otherLines.push(line);
      continue;
    }
    if (i.kind === "HOLD") {
      otherLines.push(input.waitingOn?.trim() ? `On hold: waiting on ${oneLine(input.waitingOn)}.` : "On hold.");
      continue;
    }
    otherLines.push(asSentence(itemLine(i, input.title, "contractor", today)));
  }
  // A morning line that didn't lead: Tell the tenant's notice, or the line's own headline under a partner's change.
  const morningExtra = mornings.length && (lead.headline !== morningHeadline(mornings[0].kind, mornings[0].item.due ?? null, today))
    ? tell
      ? ["They need 24 hours' notice."]
      : [morningHeadline(mornings[0].kind, mornings[0].item.due ?? null, today)]
    : [];
  const lines = [...lead.lines, ...otherLines, ...morningExtra];
  // Every email leads with something (claimedRowVerdict); a lead this list doesn't word takes its first line.
  if (!lead.headline) lead.headline = lines.shift() ?? `${partnerName(items.find((i) => !isMorning(i)) ?? null)} updated this job.`;

  // The quote's words (a partner's note, or the send-back's), and who to answer.
  const sentBackNote = sentBack ? sendBackNote(sentBack, input.title) : "";
  const quoteTexts = [...(sentBackNote ? [sentBackNote] : []), ...quotes.map(commentWords).filter(Boolean)];
  const quoteAuthors = [...new Set([...(sentBackNote && sentBack ? [partnerName(sentBack)] : []), ...quotes.map((q) => partnerName(q))])];
  const firstWords = quoteTexts[0];
  const closed = !isActiveStatus(status);
  const preview = firstWords
    ? quotePreview(sentBackNote && sentBack ? partnerName(sentBack) : partnerName(quotes[0]), firstWords)
    : tell
      ? "They need 24 hours' notice."
      : lead.preview || lead.headline;

  // On hold, in review and closed: the headline and one line, no button and no Share with crew (Q4).
  const shortForm = !open || (hold !== null && word === "On hold");
  const quoteReply = quoteTexts.length && input.replyByEmail && !closed ? `Reply to answer ${joinNames(quoteAuthors)}.` : undefined;
  const footnote = !input.replyByEmail || quoteReply ? undefined : closed ? `Reply to reach ${joinNames([...(input.staffNames ?? [])]) || "HG Capital"}.` : "Reply to post an update or photos.";
  const base = {
    subject: jobSubject({ word, title: input.title, where }),
    fromName: FROM_HG,
    preview: previewText(preview),
    headline: lead.headline,
    lines,
    quotes: quoteTexts,
    ...(quoteReply ? { quoteReply } : {}),
    ...(footnote ? { footnote } : {}),
    threadKey: threadKey(input.taskId),
  };
  if (shortForm) return { ...base, primary: null, job: null, short };

  // The one button (Q3): the reader's next step, the one the job page's bar shows.
  const primary: EmailButton = tell
    ? { label: "Text the tenant", url: contractorLink(input, "access") }
    : status === "IN_PROGRESS"
      ? { label: "Send for review", url: contractorLink(input, "done") }
      : scheduled
        ? { label: "Start job", url: contractorLink(input, null) }
        : { label: "Schedule", url: contractorLink(input, "date") };

  // The day row (Q9): Add to calendar only when a partner set or moved their day (Moved, or Tell the tenant with the
  // move in its headline); Reschedule under any other set day; nothing under "Not set".
  const calendar = dayMoved && scheduled && input.linkToken ? `${jobLinkUrl(input.appUrl, input.linkToken)}/calendar` : null;
  const dayLink: EmailButton | null = scheduled
    ? calendar
      ? { label: "Add to calendar", url: calendar }
      : contractorMaySetDate(status)
        ? { label: "Reschedule", url: contractorLink(input, "date") }
        : null
    : null;

  const isNew = !!assigned;
  const changed = (kind: string) => !isNew && items.some((i) => i.kind === kind);
  const shownDay = scheduled ?? (status === "IN_PROGRESS" ? (input.planned ?? null) : null);
  const photosHref = contractorLink(input, null);
  const strip = isActiveStatus(status)
    ? photoStrip([...(input.newPhotoIds ?? []), ...(input.jobPhotoIds ?? [])], input.appUrl, input.linkToken ?? null, photosHref, JOB_PHOTO_MAX)
    : { photos: [], morePhotos: 0 };
  const notes = input.notes?.trim() ? keepBreaks(input.notes) : null;
  const checklist = input.checklist ?? [];
  const job: JobEmailDetails = {
    title: oneLine(input.title),
    address: addressLines(input.address, input.unitLabel),
    addressLabel: true,
    dates: [
      { label: "Scheduled", value: shownDay ? dayText(shownDay, today) : "Not set", changed: dayMoved && !isNew },
      { label: "Due", value: due ? dayText(due, today) : "Not set", changed: changed("TARGET") },
    ],
    dayLink,
    notes: notes ? { text: notes, changed: changed("NOTES") } : null,
    checklist: checklist.length ? { items: checklist.map((c) => ({ title: oneLine(c.title), done: c.done })), changed: changed("CHECKLIST") } : null,
    checklistLine: null,
    photos: strip.photos,
    morePhotos: strip.morePhotos,
    gettingIn: input.gettingIn ?? null,
    tenants: (input.tenants ?? []).map((p) => ({ name: oneLine(p.name), phone: p.phone?.trim() ? oneLine(p.phone) : null, tel: telHref(p.dial) })),
  };
  return {
    ...base,
    primary,
    share: { label: "Share with crew", url: contractorLink(input, "share"), icon: shareIconUrl(input.appUrl) },
    job,
    short: null,
  };
}

/**
 * A partner's day lines, read against the day the job has now (section 7: a scheduling bundle's headline named a day
 * the job no longer had): set where there was none, moved from the day the contractor last saw, or taken off. Null
 * when the day is back where it was, or the job moved on (started).
 */
function dayChange(
  lines: readonly OutboxItem[],
  job: { status: TaskStatus; scheduled: Ymd | null },
  today: Ymd,
): { kind: "set"; to: string } | { kind: "moved"; to: string; was: string } | { kind: "removed"; was: string | null } | null {
  const first = lines[0];
  const was = first.kind === "DAY" ? (first.from ?? null) : (first.fromDay ?? null);
  // A line queued before `from` was kept: its own "(was …)" words, or none.
  const wasWords = was ? dayText(was as Ymd, today) : first.kind === "DAY" ? (/ \(was ([^)]*)\)$/.exec(oneLine(first.summary))?.[1] ?? null) : null;
  if (job.status === "SCHEDULED" && job.scheduled) {
    if (was === job.scheduled) return null;
    if (!wasWords) return { kind: "set", to: dayText(job.scheduled, today) };
    return { kind: "moved", to: dayText(job.scheduled, today), was: wasWords };
  }
  if ((job.status === "OPEN" || job.status === "WAITING") && lines.some(isDayRemoval)) return { kind: "removed", was: wasWords };
  return null;
}

/** A partner's Due change in the contractor's words, on the date it has now: "moved Due to Fri, Dec 4", "cleared Due". */
function dueText(item: OutboxItem, due: Ymd | null, today: Ymd): string {
  if (!due) return "cleared Due";
  return item.from === "" ? `set Due to ${dayText(due, today)}` : `moved Due to ${dayText(due, today)}`;
}

/** A morning email's preview (Q9): one fact the subject lacks. */
function morningPreview(kind: ReminderKind, input: TaskEmailInput): string {
  const street = addressLines(input.address, input.unitLabel)[0] ?? "";
  const due = input.due ? dayText(input.due, input.today) : null;
  switch (kind) {
    case "TELL_TENANT":
      return "They need 24 hours' notice.";
    case "SCHEDULED_TODAY":
      return [street, input.gettingIn?.value].filter(Boolean).join(" · ");
    case "STILL_OPEN":
      return input.scheduled ? `Your day was ${dayText(input.scheduled, input.today)}. Start the job or pick a new day.` : "Start the job or pick a new day.";
    case "NO_DAY":
      // The subject already says Due (morningWord), so the preview says what's missing.
      return due ? "No day yet. Pick a day to go." : "Pick a day to go.";
    case "DUE_TODAY":
    case "OVERDUE":
      return "No day is set yet.";
  }
}

/** The line under a morning headline (Q8): Still open says what to do. */
function morningLines(kind: ReminderKind): string[] {
  return kind === "STILL_OPEN" ? ["Start the job or pick a new day."] : [];
}

// ---------------------------------------------------------------------------
// A partner's email (Q6, Q9)
// ---------------------------------------------------------------------------

/** A resident's answers on one line (Q9): "Dana must be home", "Dana said it's OK to come in · No pets". */
export function requestAnswers(name: string, r: { letUsIn: boolean; pets: boolean | null; petsNote: string | null }): string {
  if (!r.letUsIn) return `${name} must be home`;
  const pets = r.pets === null ? null : r.pets ? `Pets: ${r.petsNote?.trim() ? oneLine(r.petsNote) : "yes"}` : "No pets";
  return [`${name} said it's OK to come in`, pets].filter(Boolean).join(" · ");
}

function partnerEmail(input: TaskEmailInput): TaskEmail {
  const today = input.today;
  const where = jobWhere(input.address, input.unitLabel);
  const short = shortLine(input.title, input.address, input.unitLabel);
  const items = latestOnly(input.items);
  const status = input.status;
  const due = input.due ?? null;
  const scheduled = input.scheduled ?? null;
  const taskUrl = openUrl(input.appUrl, "staff", input.taskId);
  const now: JobNow = { status, due, scheduled, today };

  const review = status === "REVIEW" ? ([...items].reverse().find(isReviewLine) ?? null) : null;
  const created = items.find((i) => i.kind === "CREATED") ?? null;
  const residentLines = items.filter((i) => isResident(i) && i.kind !== "CREATED");
  const canceled = residentLines.find((i) => /^canceled /.test(oneLine(i.summary))) ?? null;
  const reviewNotes = review ? items.filter((i) => i.kind === "COMMENT" && !isResident(i) && (i.statusEventId ? i.statusEventId === review.eventId : i.at === review.at)) : [];
  const words = items.filter((i) => hasWords(i) && !reviewNotes.includes(i));
  const dayLines = items.filter((i) => isDayLine(i) && leadsEmail(i, "staff", now));
  const legacyTarget = items.find((i) => i.kind === "TARGET") ?? null;
  const contractorLead = review ?? words[0] ?? dayLines[0] ?? legacyTarget ?? null;
  const residentOnly = !contractorLead && items.every((i) => isResident(i));
  const contractor = contractorLead ? whoOf(contractorLead, "staff") : input.contractorName ? oneLine(input.contractorName) : null;
  const residentName = (created ?? residentLines[0]) ? whoOf((created ?? residentLines[0])!, "staff") : null;

  const word = status === "DONE" ? "Done" : review ? "Review" : created ? "New request" : canceled ? "Canceled" : "Update";

  // The quotes: the review note, the request's words in full, a contractor's words, a resident's note.
  const reviewWords = reviewNotes.map(commentWords).filter(Boolean);
  const requestWords = created && input.request ? oneLine(input.request.details?.trim() || input.request.whatsWrong) : null;
  const residentWords = residentLines.map((i) => i.words ?? "").filter(Boolean);
  const quoteTexts = review ? reviewWords : created ? [...(requestWords ? [requestWords] : []), ...residentWords] : [...words.map(commentWords).filter(Boolean), ...residentWords];

  // Headline (the event only) and what goes under it.
  let headline: string;
  let preview: string;
  const lines: string[] = [];
  if (review && contractor) {
    headline = `${contractor} sent this for review.`;
    const check = checklistLine(input.checklist ?? []);
    const photos = (input.newPhotoIds ?? []).length;
    preview = reviewWords[0] ? `"${oneLine(reviewWords[0])}"` : [check ? `Checklist ${check}` : null, photos ? plural(photos, "photo") : null, due ? `Due ${dayText(due, today)}` : null].filter(Boolean).join(" · ");
  } else if (created && residentName) {
    headline = `${residentName} · ${addressLines(input.address, input.unitLabel)[0] ?? oneLine(input.title)}`;
    preview = requestWords ? `"${requestWords}"` : input.request ? requestAnswers(residentName, input.request) : `${residentName} sent a request.`;
  } else if (canceled && residentName) {
    headline = `${residentName} canceled the request.`;
    preview = headline;
  } else if (words.length && contractor) {
    headline = `${contractor} sent a note.`;
    preview = quotePreview(contractor, commentWords(words[0]));
  } else if (dayLines.length && contractor) {
    const was = wasText(dayLines[0], today);
    const dueWords = due ? `Due is ${dayText(due, today)}.` : "";
    if (scheduled) {
      const firstPick = !was;
      headline = firstPick ? `${contractor} picked ${dayText(scheduled, today)}.` : `${contractor} moved the day to ${dayText(scheduled, today)}.`;
      if (!firstPick) lines.push(`It was ${was}.`);
      preview = previewText(headline, dueWords);
    } else {
      headline = `${contractor} removed the scheduled day.`;
      if (was) lines.push(`It was ${was}.`);
      preview = previewText(was ? `${contractor} removed the scheduled day (was ${was}).` : headline, dueWords);
    }
    if (dueWords) lines.push(dueWords);
  } else if (legacyTarget && contractor) {
    headline = asSentence(itemLine(legacyTarget, input.title, "staff", today));
    preview = headline;
  } else if (residentLines.length && residentName) {
    headline = asSentence(`${residentName} ${oneLine(residentLines[0].summary)}`);
    preview = residentWords[0] ? quotePreview(residentName, residentWords[0]) : headline;
  } else {
    headline = contractor ? `${contractor} updated this.` : "This task changed.";
    preview = headline;
  }

  // The other lines, in the task's Activity words. The lead's own lines are already said.
  const consumed = new Set<OutboxItem>([...(review ? [review] : []), ...reviewNotes, ...(created ? [created] : []), ...words, ...dayLines, ...(legacyTarget && headline.includes("date") ? [legacyTarget] : [])]);
  if (canceled && word === "Canceled") consumed.add(canceled);
  if (!created && !canceled && !words.length && !dayLines.length && !review && residentLines.length) consumed.add(residentLines[0]);
  for (const i of items) {
    if (consumed.has(i)) continue;
    lines.push(asSentence(isResident(i) ? `${whoOf(i, "staff")} ${oneLine(i.summary)}` : itemLine(i, input.title, "staff", today)));
  }

  // The photos: Review's and a new request's as two larger tiles (Q9); a contractor's update with words as the
  // usual strip.
  const tilesShown = !!review || !!created;
  const photoHref = openUrl(input.appUrl, "staff", input.taskId, firstUpdateId(items));
  const tiles = tilesShown ? photoStrip(input.newPhotoIds ?? [], input.appUrl, input.linkToken ?? null, photoHref, TILE_MAX) : { photos: [], morePhotos: 0 };
  const strip = !tilesShown ? photoStrip(input.newPhotoIds ?? [], input.appUrl, input.linkToken ?? null, photoHref, JOB_PHOTO_MAX) : { photos: [], morePhotos: 0 };
  const checkLine = checklistLine(input.checklist ?? []);
  const tilesNote = review ? [tiles.morePhotos ? `+${tiles.morePhotos} more` : null, checkLine ? `Checklist ${checkLine}` : null].filter(Boolean).join(" · ") : tiles.morePhotos ? `+${tiles.morePhotos} more` : "";

  // The button (Q3, Q9): Approve with Send back under it while it waits on review; Assign on a request nobody has, else
  // Open task for a resident's line; a contractor's update shows the status in the button's place.
  const assigned = !!input.assigned;
  let primary: EmailButton | null = null;
  let link: EmailButton | null = null;
  let actionNote: string | undefined;
  if (review) {
    primary = { label: "Approve", url: `${taskUrl}?do=approve` };
    link = { label: "Send back", url: `${taskUrl}?do=send-back` };
  } else if (created || (residentLines.length && !canceled)) {
    primary = assigned ? { label: "Open task", url: openUrl(input.appUrl, "staff", input.taskId, firstUpdateId(items)) } : { label: "Assign", url: `${taskUrl}?do=assign` };
    if (created) actionNote = due ? (due === today ? "Due today" : `Due ${dayText(due, today)}`) : undefined;
  } else if (!canceled && status !== "SCHEDULED") {
    // A Scheduled task's status would only repeat the Scheduled day the details show below.
    actionNote = statusWords(status, { scheduled, waitingOn: input.waitingOn, today });
  }

  // The task below (Q9): title, street and unit, Due | Scheduled, the checklist's progress. A new request and a
  // cancel show none: the headline already names the home.
  const details: JobEmailDetails | null =
    created || canceled
      ? null
      : {
          title: oneLine(input.title),
          address: addressLines(input.address, input.unitLabel).slice(0, 1),
          addressLabel: false,
          dates: [
            { label: "Due", value: due ? dayText(due, today) : "Not set" },
            { label: "Scheduled", value: scheduled ? dayText(scheduled, today) : "Not set" },
          ],
          dayLink: null,
          notes: null,
          checklist: null,
          checklistLine: review ? null : checkLine ? `Checklist ${checkLine}` : null,
          photos: strip.photos,
          morePhotos: strip.morePhotos,
          gettingIn: null,
        };

  // Footer (Q9): a reply answers the contractor when one leads; none on a resident's lines or an unassigned request.
  const footnote = input.replyByEmail && contractor && !residentOnly && !(created && !assigned) ? `Reply to answer ${contractor}.` : undefined;
  const note = created && input.request && residentName ? requestAnswers(residentName, input.request) : undefined;

  return {
    subject: jobSubject({ word, title: input.title, where }),
    // Q5: "Zack Miller via HG Capital" when a contractor's words or action leads; a resident never gets "via".
    fromName: contractorLead && contractor ? `${contractor} via ${FROM_HG}` : FROM_HG,
    preview: previewText(preview),
    headline,
    lines,
    quotes: quoteTexts,
    tiles: tiles.photos,
    ...(tilesShown && (tilesNote || tiles.photos.length) ? { tilesNote: tilesNote || undefined } : {}),
    ...(note ? { note } : {}),
    primary,
    link,
    ...(actionNote ? { actionNote } : {}),
    job: details,
    short: canceled && !created ? short : null,
    ...(footnote ? { footnote } : {}),
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
