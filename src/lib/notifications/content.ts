import type { TaskStatus } from "@prisma/client";
import { HG_TIME_ZONE, fmtDay, todayYmdEastern, type Ymd } from "@/lib/dates";
import { firstName as greetingName } from "@/lib/names";
import { shortAddress } from "@/lib/normalize";
import { STATUS_LABEL, isActiveStatus } from "@/lib/task-scope";
import { contractorMaySetDate, jobLinkUrl, type JobLinkStep } from "@/lib/portal/job-link-paths";
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
  /** TARGET: the date that moved is the booked visit. Absent on old rows, which read neutrally. */
  visit?: boolean;
  /** DUE_TODAY and OVERDUE (reminders.ts): the date the reminder is for. */
  due?: string;
}

/** Lines that are the job's own news, with nobody's name in front: the 8 am emails. */
const UNSIGNED_KINDS = new Set(["DUE_TODAY", "OVERDUE"]);

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
 * The off-the-job line (core.ts notifyOff) at send time. Taken off the job
 * (no access now): that line alone goes, and nothing else about a job that
 * isn't theirs. Still on it: a "took you off" undone by putting them back is
 * dropped, and "canceled" goes only while the job is still canceled.
 */
export function offItems(items: readonly OutboxItem[], now: { hasAccess: boolean; canceled: boolean }): OutboxItem[] {
  if (!now.hasAccess) return items.filter((i) => i.kind === "OFF");
  return items.filter((i) => i.kind !== "OFF" || (now.canceled && /^canceled /.test(oneLine(i.summary))));
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
      // Every job has one date and emails call it the due date, a scheduled job's included: never "visit" or
      // "target" (docs/specs/contractor-job-emails.md). A row queued before core.ts recorded which reads neutrally.
      const m = /^moved ".*" to (.+)$/.exec(s);
      if (m && m[1] !== "no date") return `moved the ${item.visit === undefined ? "date" : "due date"} to ${m[1]}`;
      return `cleared the ${item.visit === undefined ? "date" : "due date"}`;
    }
    case "COMMENT": {
      const files = /^added files \(\+(\d+) files?\)$/.exec(s);
      if (files) return `added ${files[1]} file${files[1] === "1" ? "" : "s"}`;
      return s.startsWith('"') ? `: ${s}` : s;
    }
    case "STATUS": {
      const scheduled = /^scheduled ".*" for (.+)$/.exec(s);
      if (scheduled) return `set the due date to ${scheduled[1]}`;
      if (/^approved ".*"$/.test(s)) return "approved it";
      // Only the contractor's own Start reads as starting the job (core.ts statusSummary).
      if (/^started ".*"$/.test(s)) return "started the job";
      const set = /^set ".*" to (.+)$/.exec(s);
      if (set) return `moved it to ${STATUS_BY_WORDS.get(set[1]) ?? set[1]}`;
      if (/^marked ".*" done$/.test(s)) return "marked it done";
      const tail = sendBackTail(s, title);
      if (tail !== null) return `sent it back${tail}`;
      return s.replace(/"[^"]*"/, "it");
    }
    case "DUE_TODAY":
      return "Due today";
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

/** Target and notes changes say only their latest; everything else is kept, oldest first. */
function latestOnly(items: OutboxItem[]): OutboxItem[] {
  const lastOf = new Map<string, number>();
  items.forEach((it, i) => {
    if (it.kind === "TARGET" || it.kind === "NOTES") lastOf.set(it.kind, i);
  });
  return items.filter((it, i) => (it.kind === "TARGET" || it.kind === "NOTES" ? lastOf.get(it.kind) === i : true));
}

/**
 * The lines of one email, oldest first. Target and notes changes say only
 * their latest; everything else is listed.
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
  if (at < 0) at = kept.findLastIndex((i) => i.kind === "TARGET");
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
 * The subject every email about a job carries (Connor, Nov 14: the date
 * first, always "Due"): "Due Mon, Nov 23: Replace kitchen faucet, 118
 * Congress St · Rear". No date, just the job. It doesn't change with the kind
 * of change, so each job keeps one thread per date (threadKey).
 */
export function jobSubject(input: { title: string; where: string; due: string | null }): string {
  const what = [oneLine(input.title) || "A job", input.where].filter(Boolean).join(", ");
  return input.due ? `Due ${input.due}: ${what}` : what;
}

/** What threads one job's emails under one subject: the job and the date in it (resend.ts makes it a header). */
export function threadKey(taskId: string, dueYmd: string | null): string {
  return `job-${taskId}-${dueYmd ?? "none"}`;
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
  /** The date the contractor sees, written out ("Mon, Nov 23"). */
  due: string | null;
  /** Contractor only: the notes, with this property's lockbox codes masked. */
  notes: string | null;
  /** Contractor only: the checklist. */
  checklist: { title: string; done: boolean }[];
  /** Staff only: who has the job. */
  contractor: string | null;
  /** Staff only: "2 of 3 done". */
  checklistLine: string | null;
  /** Contractor only, with a job link: "Show access", which opens the job at its Lockbox. Null when it has no code. */
  accessUrl: string | null;
  /** Contractor only, with a job link and a date: the .ics for Add to calendar. */
  calendarUrl: string | null;
  /** Contractor only, with a job link, while the job takes a new date: Change date (section 7). */
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
  /** A contractor's approval thanks them: "Thanks, Zack." */
  closing?: string;
  /** The next step; null on an email with nothing left to do (taken off the job). */
  primary: EmailButton | null;
  secondary: EmailButton[];
  job: JobFacts;
  /** Contractors only: where to answer, so a reply to the email isn't lost. */
  footnote?: string;
  /** Threads the job's emails (threadKey). */
  threadKey: string;
}

/** True when the email's latest status change is an approval. */
function endsApproved(items: OutboxItem[]): boolean {
  const last = items.findLast((i) => i.kind === "STATUS");
  return !!last && /^approved ".*"$/.test(oneLine(last.summary));
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
  approved: boolean;
  appUrl: string;
  taskId: string;
  items: OutboxItem[];
  linkToken: string | null;
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
  // The morning after the due date (reminders.ts): the next step, or a new date, and nothing else.
  const overdue = input.items.some((i) => i.kind === "OVERDUE");
  const extras: EmailButton[] =
    overdue && token && contractorMaySetDate(input.status)
      ? [{ label: "Change date", url: to("date") }]
      : [{ label: "Add photos", url: to("photos") }, ...(token ? [{ label: "Text to my crew", url: to("share") }] : [])];
  const step = input.approved ? null : nextStep(input.status);
  if (step === "start") return { primary: { label: "Start job", url: to(null) }, secondary: extras };
  if (step === "done") return { primary: { label: "Mark done", url: to("done") }, secondary: extras };
  return { primary: { label: "See job", url: to(null, updateId) }, secondary: [] };
}

/** The most thumbnails a strip shows before "+3". */
export const EMAIL_PHOTO_MAX = 4;

/**
 * A photo's thumbnail in an email, through the private file route with the
 * email's link as the key (`?l=`), since a mail app fetches it with no
 * cookie: the route checks the link still reaches that job and file.
 */
export function emailPhotoUrl(appUrl: string, attachmentId: string, linkToken: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/files/task/${encodeURIComponent(attachmentId)}?v=thumb&l=${linkToken}`;
}

/** Up to EMAIL_PHOTO_MAX thumbnails, each opening `href`, and how many more there are. */
function photoStrip(ids: readonly string[], appUrl: string, linkToken: string | null, href: string): { photos: EmailPhoto[]; morePhotos: number } {
  if (!linkToken || ids.length === 0) return { photos: [], morePhotos: 0 };
  const shown = ids.slice(0, EMAIL_PHOTO_MAX);
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
  const what = [oneLine(title) || "A job", where].filter(Boolean).join(", ");
  const headline = "You're off this job. No need to go.";
  return {
    subject: `Off this job: ${what}`,
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
 * One email about a job (docs/specs/contractor-job-emails.md): the Due
 * subject, the preview line, What's new, the next step's buttons and the job.
 *
 * The job names its street and unit as My jobs does (job-view.ts
 * addressLine), so the email names the same unit whose lockbox code the job
 * page shows (D21). A contractor's email carries the notes and checklist; a
 * partner's names the contractor and the checklist's progress.
 *
 * A contractor's email ends on the reply line while the job is still open: a
 * closed job's page is read-only and core.ts addComment refuses a
 * contractor's comment on it. When its latest status change is an approval,
 * it also thanks them by first name and the button reads See job
 * (BCONTRACT-008): nothing is left to do, only the record to see.
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
  /** The date the contractor sees (rules.ts targetDate), as a day. */
  due?: Ymd | null;
  /** Today in Buffalo, for writing the date (a year only when it isn't this one). */
  today: Ymd;
  notes?: string | null;
  checklist?: { title: string; done: boolean }[];
  photoUrl?: string | null;
  /** Staff: the contractor on the job. */
  contractorName?: string | null;
  /** The contractor's name on their contact, for the thanks. */
  recipientName?: string | null;
  /** First names of the partners, for a contractor's reply line. */
  staffNames?: readonly string[];
  /** The email's own link (job-links.ts): a contractor's EMAIL link, a partner's STAFF link. Null sends plain links. */
  linkToken?: string | null;
  /** Contractor: the job has a lockbox code to show (never the code itself). */
  hasAccess?: boolean;
  /** The photos the bundle's updates carry, oldest first, as attachment ids the recipient may see. */
  newPhotoIds?: readonly string[];
  /** Contractor: HG's other photos on the job, newest first. */
  jobPhotoIds?: readonly string[];
  /** The email has its own reply address (replies post to the job, section 5): the footer says what a reply does. */
  replyByEmail?: boolean;
}): TaskEmail {
  const street = input.address ? shortAddress(input.address) || oneLine(input.address) : "";
  const where = addressLine(street || null, input.unitLabel ? oneLine(input.unitLabel) : null);
  const contractor = input.audience === "contractor";
  const approved = contractor && endsApproved(input.items);
  const thanksTo = greetingName(input.recipientName);
  const due = input.due ? fmtDay(input.due, { weekday: true, year: "auto", now: input.today }) : null;
  const { headline, lines } = whatsNew(input.items, input.title);
  const checklist = input.checklist ?? [];
  const notes = input.notes?.trim() ? keepBreaks(input.notes) : null;
  if (contractor && input.items.some((i) => i.kind === "OFF")) return offEmail(input.title, where, input.taskId);
  const token = input.linkToken ?? null;
  const btns = buttons({ audience: input.audience, status: input.status, approved, appUrl: input.appUrl, taskId: input.taskId, items: input.items, linkToken: token });
  // Tapping a photo opens the job: the contractor's through their link, a partner's on the task page.
  const photoHref = contractor ? (token ? jobLinkUrl(input.appUrl, token, null, firstUpdateId(input.items)) : openUrl(input.appUrl, "contractor", input.taskId)) : openUrl(input.appUrl, "staff", input.taskId, firstUpdateId(input.items));
  const fresh = photoStrip(input.newPhotoIds ?? [], input.appUrl, token, photoHref);
  const older = contractor ? photoStrip(input.jobPhotoIds ?? [], input.appUrl, token, photoHref) : { photos: [], morePhotos: 0 };
  return {
    subject: jobSubject({ title: input.title, where, due }),
    preview: previewText(headline, lines),
    headline,
    lines,
    photos: fresh.photos,
    morePhotos: fresh.morePhotos,
    ...(approved ? { closing: thanksTo ? `Thanks, ${thanksTo}.` : "Thanks." } : {}),
    ...btns,
    job: {
      title: oneLine(input.title),
      where,
      directionsUrl: directionsUrl(input.address),
      photoUrl: input.photoUrl ?? null,
      due,
      notes: contractor ? notes : null,
      checklist: contractor ? checklist : [],
      contractor: contractor ? null : input.contractorName ? oneLine(input.contractorName) : null,
      checklistLine: contractor ? null : checklistLine(checklist),
      accessUrl: contractor && token && input.hasAccess && isActiveStatus(input.status) ? jobLinkUrl(input.appUrl, token, "access") : null,
      calendarUrl: contractor && token && input.due && isActiveStatus(input.status) ? `${jobLinkUrl(input.appUrl, token)}/calendar` : null,
      dateUrl: contractor && token && contractorMaySetDate(input.status) ? jobLinkUrl(input.appUrl, token, "date") : null,
      photos: older.photos,
      morePhotos: older.morePhotos,
    },
    ...footnoteFor(input),
    threadKey: threadKey(input.taskId, input.due ?? null),
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
