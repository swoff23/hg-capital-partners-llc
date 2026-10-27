import { HG_TIME_ZONE, todayYmdEastern } from "@/lib/dates";
import { firstName as greetingName } from "@/lib/names";
import { shortAddress } from "@/lib/normalize";
import { STATUS_LABEL } from "@/lib/task-scope";
import { addressLine, firstName, joinNames } from "@/lib/portal/job-view";

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
}

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
  recipientContact: { active: boolean; portalAccount: { email: string; status: string } | null } | null;
}

export type Delivery = { ok: true; to: string; audience: Audience } | { ok: false; reason: "no login" | "no recipient" | "no access" };

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
 */
export function deliveryFor(row: RowRecipient, opts: { contractorHasAccess: boolean }): Delivery {
  if (row.recipientUser) return { ok: true, to: row.recipientUser.email, audience: "staff" };
  const c = row.recipientContact;
  if (!c) return { ok: false, reason: "no recipient" };
  if (!c.active || c.portalAccount?.status !== "ACTIVE") return { ok: false, reason: "no login" };
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
 * send-back's is not, since its note comes after the title.
 */
export function itemText(item: OutboxItem): string {
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
      // What a contractor reads is a due date or a visit, never "target" (the job page's words). core.ts records
      // which at enqueue; a row queued before it reads neutrally.
      const m = /^moved ".*" to (.+)$/.exec(s);
      if (m && m[1] !== "no date") return `moved the ${item.visit === undefined ? "date" : item.visit ? "visit" : "due date"} to ${m[1]}`;
      return `cleared the ${item.visit === undefined ? "date" : item.visit ? "visit date" : "due date"}`;
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
      if (/^marked ".*" done$/.test(s)) return "marked it done";
      // Non-greedy, unlike the other title patterns: the note follows the title, and a greedy title would swallow
      // a note that says `" back` itself ('put the "old" back') and drop it from the line.
      const back = /^sent ".*?" back(: .+)?$/.exec(s);
      if (back) return `sent it back${back[1] ?? ""}`;
      return s.replace(/"[^"]*"/, "it");
    }
    default:
      return s;
  }
}

/** "Connor moved the target to Fri, Oct 30", 'Zack: "Uppers in"'. */
export function itemLine(item: OutboxItem): string {
  const text = itemText(item);
  const name = firstName(item.actorLabel);
  return text.startsWith(":") ? `${name}${text}` : `${name} ${text}`;
}

/**
 * The lines of one email, oldest first. Target and notes changes say only
 * their latest; everything else is listed.
 */
export function itemLines(items: OutboxItem[]): string[] {
  const lastOf = new Map<string, number>();
  items.forEach((it, i) => {
    if (it.kind === "TARGET" || it.kind === "NOTES") lastOf.set(it.kind, i);
  });
  return items.filter((it, i) => (it.kind === "TARGET" || it.kind === "NOTES" ? lastOf.get(it.kind) === i : true)).map(itemLine);
}

/**
 * The subject for a status change that tells the recipient where the job
 * stands, in the same words as its line: "Connor sent back Cabinet install",
 * "Connor scheduled Cabinet install for Thu, Oct 29", "Connor approved
 * Cabinet install". Null for any other change.
 */
function statusSubject(item: OutboxItem, what: string, laterTarget: OutboxItem | undefined): string | null {
  const s = oneLine(item.summary);
  const who = firstName(item.actorLabel) || "HG";
  if (/^sent ".*" back(: .+)?$/.test(s)) return `${who} sent back ${what}`;
  const scheduled = /^scheduled ".*" for (.+)$/.exec(s);
  if (scheduled) {
    // The visit date moved again in the same email: the subject gives the new
    // one, since it's often all that's read; a cleared date says "updated".
    if (laterTarget) {
      const moved = /^moved ".*" to (.+)$/.exec(oneLine(laterTarget.summary));
      return moved && moved[1] !== "no date" ? `${who} scheduled ${what} for ${moved[1]}` : null;
    }
    return `${who} scheduled ${what} for ${scheduled[1]}`;
  }
  if (/^approved ".*"$/.test(s)) return `${who} approved ${what}`;
  return null;
}

/**
 * "Connor updated Cabinet install", "Zack marked Fix front steps done",
 * "Connor assigned you Bathroom tile". A bundle whose latest status change is
 * sent back, scheduled or approved says that instead of "updated", so the
 * inbox shows whether the job needs anything; a later status change (say a
 * reopen after an approve) falls back to "updated".
 */
export function emailSubject(items: OutboxItem[], title: string): string {
  const who = joinNames([...new Set(items.map((i) => firstName(i.actorLabel)))]) || "HG";
  const what = oneLine(title) || "a job";
  const single = new Set(items.map((i) => i.actorLabel)).size === 1;
  if (single && items.some((i) => i.kind === "STATUS" && /^marked\b/.test(i.summary))) return `${who} marked ${what} done`;
  const at = items.findLastIndex((i) => i.kind === "STATUS");
  const laterTarget = at < 0 ? undefined : items.slice(at + 1).findLast((i) => i.kind === "TARGET");
  const outcome = at >= 0 && statusSubject(items[at], what, laterTarget);
  if (outcome) return outcome;
  if (items.length > 0 && items.every((i) => i.kind === "ASSIGNED")) return `${who} assigned you ${what}`;
  return `${who} updated ${what}`;
}

export interface TaskEmail {
  subject: string;
  /** The job and where it is. */
  line: string;
  items: string[];
  /** A contractor's approval thanks them: "Thanks, Zack." */
  closing?: string;
  buttonLabel: string;
  buttonUrl: string;
  /** Contractors only: where to answer, so a reply to the email isn't lost. */
  footnote?: string;
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
  return `Reply in the job so ${names || "HG"} sees it.`;
}

/**
 * The job line: "Cabinet install, 23 Sherwood St · Upper", the street and
 * unit as My jobs shows them (job-view.ts addressLine), so the email names
 * the same unit whose lockbox code the job page shows (D21).
 *
 * A contractor's email ends on the reply line while the job is still open: a
 * closed job's page is read-only and core.ts addComment refuses a contractor's
 * comment on it. When its latest status change is an approval, it also thanks
 * them by first name and the button reads "See job" (BCONTRACT-008): nothing
 * is left to do, only the record to see.
 */
export function taskEmail(input: {
  items: OutboxItem[];
  title: string;
  address: string | null;
  unitLabel?: string | null;
  audience: Audience;
  appUrl: string;
  taskId: string;
  /** The contractor's name on their contact, for the thanks. */
  recipientName?: string | null;
  /** First names of the partners, for a contractor's reply line. */
  staffNames?: readonly string[];
  /** The job's status is still active when the email is sent; false drops the reply line. */
  jobOpen?: boolean;
}): TaskEmail {
  const street = input.address ? shortAddress(input.address) || oneLine(input.address) : "";
  const where = addressLine(street || null, input.unitLabel ? oneLine(input.unitLabel) : null);
  const contractor = input.audience === "contractor";
  const approved = contractor && endsApproved(input.items);
  const thanksTo = greetingName(input.recipientName);
  return {
    subject: emailSubject(input.items, input.title),
    line: where ? `${oneLine(input.title)}, ${where}` : oneLine(input.title),
    items: itemLines(input.items),
    ...(approved ? { closing: thanksTo ? `Thanks, ${thanksTo}.` : "Thanks." } : {}),
    buttonLabel: !contractor ? "Open task" : approved ? "See job" : "Open job",
    // Opens at the first update in the bundle, when the items name one (rows queued before they did open the job).
    buttonUrl: openUrl(input.appUrl, input.audience, input.taskId, firstUpdateId(input.items)),
    ...(contractor && input.jobOpen !== false ? { footnote: replyLine(input.staffNames ?? []) } : {}),
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
