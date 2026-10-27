import type { AttachmentKind, TaskStatus } from "@prisma/client";
import { LATE_UPLOAD_WINDOW_MS } from "@/lib/attachments/access";
import type { FileKind } from "@/lib/attachments/content-types";
import { daysUntil, todayYmdEastern, type Ymd } from "@/lib/dates";
import { firstName as greetingName } from "@/lib/names";
import { shortAddress } from "@/lib/normalize";

/**
 * How the contractor portal words and arranges a job (docs/asana-migration-plan.md
 * §6, My jobs and Job page). Pure, so the server pages and the client lists
 * share it; see job-view.test.ts. Queries live in queries.ts.
 */

// ---------------------------------------------------------------------------
// My jobs
// ---------------------------------------------------------------------------

export type JobsTab = "open" | "done";
export type JobsGroup = "date" | "property";

/** Remembers By date / By property per browser. Written client-side, read by /p. */
export const JOBS_GROUP_COOKIE = "hg-jobs-group";

export function parseJobsGroup(v: string | null | undefined): JobsGroup {
  return v === "property" ? "property" : "date";
}

export function parseJobsTab(v: string | string[] | null | undefined): JobsTab {
  return v === "done" ? "done" : "open";
}

/** One card on My jobs. */
export interface JobCard {
  id: string;
  title: string;
  status: TaskStatus;
  /** The property's full address, or null for a job with no property. */
  address: string | null;
  /** The property's front photo (public Blob), or null: the fallback tile. */
  photoUrl: string | null;
  unitLabel: string | null;
  /** The neutral Target (rules.ts targetDate), never shown in red. */
  target: Ymd | null;
  /** The target is the booked visit ("Visit date"), not the due date. */
  targetIsVisit: boolean;
  /** The Buffalo day a finished job was closed; null while it's open. */
  finishedOn: Ymd | null;
  /** Shared updates from someone else since the contractor last opened it. */
  newCount: number;
}

export interface JobGroup {
  key: string;
  label: string;
  jobs: JobCard[];
}

const fmt = (ymd: Ymd, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** "Today", "Tomorrow", "Yesterday", "Thu, Oct 29", "Tue, Jan 5, 2027". */
export function dayLabel(ymd: Ymd, today: Ymd): string {
  const d = daysUntil(ymd, today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  const sameYear = ymd.slice(0, 4) === today.slice(0, 4);
  return fmt(ymd, { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/**
 * A job's date as a label and a day (Connor, Oct 26: "Target today" didn't
 * read): "Due date" then "Today" or "Thu, Oct 29", and "Visit date" for a
 * Scheduled job's booked visit, as staff task rows say it. `short` is the
 * label on a narrow My jobs row, where the status leads the subline.
 */
export function dueDateParts(target: Ymd, isVisit: boolean, today: Ymd): { label: string; short: string; day: string } {
  return { label: isVisit ? "Visit date" : "Due date", short: isVisit ? "Visit" : "Due", day: dayLabel(target, today) };
}

const NO_DATE = "No due date";

/** Which day a job sorts and groups by, and in which direction. */
export interface DayOrder {
  dayOf: (job: JobCard) => Ymd | null;
  order: "asc" | "desc";
}

/** Open jobs by Target, soonest first; finished ones by the day they were finished, most recent first. */
const OPEN_ORDER: DayOrder = { dayOf: (j) => j.target, order: "asc" };
const DONE_ORDER: DayOrder = { dayOf: (j) => j.finishedOn, order: "desc" };

/** Jobs with a day by that day in `order`, jobs with none last, then A to Z. */
function byDay({ dayOf, order }: DayOrder) {
  return (a: JobCard, b: JobCard) => {
    const da = dayOf(a);
    const db = dayOf(b);
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return order === "asc" ? da.localeCompare(db) : db.localeCompare(da);
    }
    return a.title.localeCompare(b.title);
  };
}

/** By date: one group per day ("Today", "Thu, Oct 29"), jobs with no day last. */
export function groupByDate(jobs: JobCard[], today: Ymd, by: DayOrder = OPEN_ORDER): JobGroup[] {
  const sorted = [...jobs].sort(byDay(by));
  const groups: JobGroup[] = [];
  for (const job of sorted) {
    const day = by.dayOf(job);
    const key = day ?? "none";
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      g = { key, label: day ? dayLabel(day, today) : NO_DATE, jobs: [] };
      groups.push(g);
    }
    g.jobs.push(job);
  }
  return groups;
}

/** By property: one group per address, A to Z, jobs with no property last; inside, the same day order as By date. */
export function groupByProperty(jobs: JobCard[], by: DayOrder = OPEN_ORDER): JobGroup[] {
  const byKey = new Map<string, JobGroup>();
  for (const job of jobs) {
    const key = job.address ?? "";
    let g = byKey.get(key);
    if (!g) {
      g = { key: key || "none", label: job.address ?? "No property", jobs: [] };
      byKey.set(key, g);
    }
    g.jobs.push(job);
  }
  const groups = [...byKey.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b, "en", { numeric: true })));
  for (const [, g] of groups) g.jobs.sort(byDay(by));
  return groups.map(([, g]) => g);
}

/**
 * My jobs' groups for a tab and switch. Open goes by Target; Done goes by the
 * day each job was finished, since a closed job's Target is just its old due
 * date.
 */
export function groupJobs(jobs: JobCard[], opts: { tab: JobsTab; group: JobsGroup; today: Ymd }): JobGroup[] {
  const by = opts.tab === "done" ? DONE_ORDER : OPEN_ORDER;
  return opts.group === "property" ? groupByProperty(jobs, by) : groupByDate(jobs, opts.today, by);
}

/** "23 Sherwood St · Upper" for a card; the full address on the job page. */
export function addressLine(address: string | null, unitLabel: string | null, opts: { short?: boolean } = {}): string {
  const street = address ? (opts.short ? shortAddress(address) || address : address) : "";
  return [street, unitLabel?.trim()].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// Job page
// ---------------------------------------------------------------------------

/**
 * Status changes a contractor sees in Updates: scheduled, started (or sent
 * back), marked done, approved. The same list core.ts makes Shared on a
 * contractor's job (rules.ts statusEventVisibility); queries.ts filters on
 * it in SQL. Waiting and Canceled stay internal.
 */
export const PORTAL_STATUS_UPDATES = ["SCHEDULED", "IN_PROGRESS", "REVIEW", "DONE"] as const satisfies readonly TaskStatus[];

/**
 * What a status update says after the person's name: "started the job".
 * Only a contractor starts the job; staff moving it to In progress is a
 * status change ("Connor moved it to In progress"), as in the email.
 */
export function statusUpdateText(from: string | null, to: string | null, by: { contractor: boolean } = { contractor: true }): string {
  switch (to) {
    case "SCHEDULED":
      return "scheduled the job";
    case "IN_PROGRESS":
      return from === "REVIEW" ? "sent it back" : by.contractor ? "started the job" : "moved it to In progress";
    case "REVIEW":
      return "marked it done";
    case "DONE":
      return from === "REVIEW" ? "approved it" : "closed the job";
    default:
      return "updated the job";
  }
}

/** What a file post says after the person's name: "added a photo", "added 3 videos", "added 2 files". */
export function addedText(kinds: string[]): string {
  const n = kinds.length;
  const noun = kinds.every((k) => k === "IMAGE") ? "photo" : kinds.every((k) => k === "VIDEO") ? "video" : "file";
  return n === 1 ? `added a ${noun}` : `added ${n} ${noun}s`;
}

/**
 * "Connor" from "Connor Swofford", "Jake" from "Jacob (Jake) Hoak" (names.ts),
 * or the label as is when there's no first word to take.
 */
export function firstName(label: string): string {
  return greetingName(label) || label;
}

/**
 * The name a contractor sees on an update or a photo: "You" for their own,
 * a first name for staff and contractors ("Connor"), and the stored label as
 * is for system and unmatched imported rows ("Property reminder"). Null when
 * there's no name at all. `label` is the event's actorLabel, or the
 * uploader's name (a staff user's name or email local part, a contact's full
 * name). Other contractors only reach this through imported history (D17);
 * queries.ts filters out the rest.
 */
export function portalActorLabel(
  viewerContactId: string,
  actor: { userId: string | null; contactId: string | null; label: string | null },
): string | null {
  if (actor.contactId && actor.contactId === viewerContactId) return "You";
  const label = actor.label?.trim();
  if (!label) return null;
  return actor.userId || actor.contactId ? firstName(label) : label;
}

/** "Connor and Pieter", "Connor, Pieter and Dana". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * When an update happened, short: "just now", "5m", "2h", "yesterday",
 * "Mon", "Oct 3", "Oct 3, 2025". Days are Buffalo days.
 */
export function updateTimeLabel(at: Date, now: Date): string {
  const mins = Math.floor((now.getTime() - at.getTime()) / 60_000);
  const today = todayYmdEastern(now);
  const day = todayYmdEastern(at);
  if (mins < 1) return "just now";
  if (mins < 60 && day === today) return `${mins}m`;
  if (day === today) return `${Math.floor(mins / 60)}h`;
  const d = daysUntil(day, today) ?? 0;
  if (d === -1) return "yesterday";
  if (d > -7 && d < 0) return fmt(day, { weekday: "short" });
  return fmt(day, { month: "short", day: "numeric", ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }) });
}

/** The bottom bar's main button for a job in this state; null when it's read-only. */
export type NextStep = "start" | "done" | "review" | null;

export function nextStep(status: TaskStatus): NextStep {
  switch (status) {
    case "OPEN":
    case "SCHEDULED":
    case "WAITING":
      return "start";
    case "IN_PROGRESS":
      return "done";
    case "REVIEW":
      return "review";
    default:
      return null;
  }
}

/** "Finishing 1 upload…", "Finishing 3 uploads…". */
export function finishingLabel(pending: number): string {
  return `Finishing ${pending} upload${pending === 1 ? "" : "s"}…`;
}

/**
 * The most photos a playbook can ask for at Mark done, so a typo in the
 * count (200) never draws two hundred slots.
 */
const MAX_FINISH_PHOTOS = 12;

/**
 * How many photos Mark done asks for: the playbook's `finishPhotosRequired`,
 * where null, 0 and anything that isn't a count mean "optional" (0). Every
 * job starts optional (uploads choice 5 A).
 */
export function finishPhotosNeeded(required: number | null | undefined): number {
  if (typeof required !== "number" || !Number.isFinite(required) || required < 1) return 0;
  return Math.min(Math.floor(required), MAX_FINISH_PHOTOS);
}

/**
 * How many of a Mark done's files count toward `finishPhotosNeeded`: photos
 * and videos, the two kinds the job page uploads, so the server counts what
 * the sheet counts. A document (a PDF) never stands in for a photo.
 */
export function finishPhotoCount(kinds: readonly AttachmentKind[]): number {
  return kinds.filter((k) => k === "IMAGE" || k === "VIDEO").length;
}

/** How many proof slots the Mark done sheet draws: the count asked for, or one on an optional job. */
export function finishSlots(required: number): number {
  return required > 0 ? required : 1;
}

/** "1 of 2", right-aligned over the slots when the playbook asks for photos. Never past the count. */
export function finishCountLabel(required: number, uploaded: number): string {
  return `${Math.min(Math.max(uploaded, 0), required)} of ${required}`;
}

/** "Add 1 more photo", "Add 2 more photos": the one line under a Mark done that's short of its count. */
export function addMorePhotosLine(missing: number): string {
  return `Add ${missing} more photo${missing === 1 ? "" : "s"}`;
}

export type MarkDoneState = {
  /** The label never changes (forms 2.7): it waits, and a line says why. */
  label: "Mark done";
  enabled: boolean;
  /** The action is running: the button keeps its label and shows its Spinner. */
  busy: boolean;
  /** Why it's off, for the caller to draw: "failed" and "waiting" are the uploader's UploadStatusLine ("2 photos didn't upload · Retry", "No signal · 2 photos waiting"). */
  reason: "uploading" | "failed" | "waiting" | "short" | null;
  /** The one grey line under the buttons for "uploading" and "short"; null otherwise. */
  line: string | null;
};

/**
 * The Mark done sheet's main button (decision 13, uploads 2.8). It waits for
 * uploads still going up, stays off while any photo failed to upload until
 * each red tile is retried or removed, stays off while a photo waits for a
 * signal (it isn't on the job yet, so it would miss the finish set and land
 * later as its own update), and stays off until the photos the playbook asks
 * for are up (`required`, 0 when it asks for none). There is no Skip: with no
 * photos on an optional job it reads "Mark done" and is on. Only uploaded
 * photos count, so a failed one keeps its slot and the count waits for it.
 * The label is always "Mark done"; `line` says why it's off.
 */
export function markDoneButton(s: {
  pending: number;
  /** Files held for a signal: not done either. */
  waiting: number;
  failed: number;
  sending: boolean;
  uploaded: number;
  required: number;
}): MarkDoneState {
  const label = "Mark done" as const;
  if (s.pending > 0) return { label, enabled: false, busy: false, reason: "uploading", line: finishingLabel(s.pending) };
  if (s.sending) return { label, enabled: false, busy: true, reason: null, line: null };
  if (s.failed > 0) return { label, enabled: false, busy: false, reason: "failed", line: null };
  if (s.waiting > 0) return { label, enabled: false, busy: false, reason: "waiting", line: null };
  if (s.uploaded < s.required) {
    return { label, enabled: false, busy: false, reason: "short", line: addMorePhotosLine(s.required - s.uploaded) };
  }
  return { label, enabled: true, busy: false, reason: null, line: null };
}

// ---------------------------------------------------------------------------
// Batch posts and Undo (uploads 2.7, question 5)
// ---------------------------------------------------------------------------

/** How long "3 photos posted · Undo" stays (the toast's own five seconds). */
export const POST_UNDO_MS = 5_000;

/**
 * The server accepts an Undo a little after the toast has gone: the tap spends
 * part of the window in flight on a weak signal, and a toast held under the
 * pointer or focus (toast.tsx) lasts longer than five seconds.
 */
export const POST_UNDO_GRACE_MS = 10_000;

/**
 * Whether a contractor's post can still be taken back: within the toast's
 * window plus the grace. A clock that reads the post as slightly in the
 * future still counts.
 */
export function undoWindowOpen(postedAt: Date | string, now: Date): boolean {
  const at = typeof postedAt === "string" ? Date.parse(postedAt) : postedAt.getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at <= POST_UNDO_MS + POST_UNDO_GRACE_MS;
}

/** What the toast says after a batch posts: "3 photos posted", "1 video posted", "2 files posted". */
export function postedText(kinds: readonly (FileKind | null)[]): string {
  const n = kinds.length;
  const noun = kinds.every((k) => k === "image") ? "photo" : kinds.every((k) => k === "video") ? "video" : "file";
  return `${n} ${noun}${n === 1 ? "" : "s"} posted`;
}

/**
 * What the toast says when files land on a job that has been approved since:
 * "3 photos added to the job". They are on the job, in its photos, but there
 * is no update to post them as, so there is no Undo and nobody is emailed.
 */
export function addedToJobText(kinds: readonly (FileKind | null)[]): string {
  const n = kinds.length;
  const noun = kinds.every((k) => k === "image") ? "photo" : kinds.every((k) => k === "video") ? "video" : "file";
  return `${n} ${noun}${n === 1 ? "" : "s"} added to the job`;
}

// ---------------------------------------------------------------------------
// Late uploads after Mark done (uploads question 4)
// ---------------------------------------------------------------------------

function timeOf(at: Date | string | null | undefined): number | null {
  if (!at) return null;
  const t = typeof at === "string" ? Date.parse(at) : at.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Whether "Add photo/video" still shows on a job in Review: for the hour the
 * server keeps taking files after Mark done (attachments/access.ts
 * LATE_UPLOAD_WINDOW_MS), then it hides, so nobody picks a photo the record
 * step would refuse. With no time to go by (an older page, or a job another
 * way into Review) it stays, as before.
 */
export function lateUploadsOpen(markedDoneAt: Date | string | null | undefined, now: Date): boolean {
  const at = timeOf(markedDoneAt);
  return at === null || now.getTime() - at <= LATE_UPLOAD_WINDOW_MS;
}

/** Milliseconds until `lateUploadsOpen` turns false, or null when it has no end (no time known). */
export function lateUploadsEndsIn(markedDoneAt: Date | string | null | undefined, now: Date): number | null {
  const at = timeOf(markedDoneAt);
  return at === null ? null : Math.max(0, at + LATE_UPLOAD_WINDOW_MS - now.getTime());
}

// ---------------------------------------------------------------------------
// My jobs row and the payoff strip
// ---------------------------------------------------------------------------

/**
 * A My jobs row's uploads line (uploads 2.1): "Uploading 3 photos" while any
 * file for the job is going up, "2 photos didn't upload" once some failed,
 * "No signal · 3 photos waiting" when the only ones left are held for a
 * signal. Failed leads: it's the one that needs the contractor. Null when the
 * job has no uploads. The queue counts failed files without their kinds, so
 * that line says photos.
 */
export function rowUploadLine(c: {
  pending: number;
  waiting: number;
  failed: number;
  pendingKinds: readonly (FileKind | null)[];
}): { text: string; tone: "info" | "danger" } | null {
  if (c.failed > 0) return { text: `${c.failed} ${c.failed === 1 ? "photo" : "photos"} didn't upload`, tone: "danger" };
  const kinds = c.pendingKinds;
  const noun = kinds.length > 0 && kinds.every((k) => k === "video") ? "video" : kinds.length > 0 && kinds.every((k) => k === "file") ? "file" : "photo";
  if (c.pending > 0) return { text: `Uploading ${c.pending} ${noun}${c.pending === 1 ? "" : "s"}`, tone: "info" };
  if (c.waiting > 0) return { text: `No signal · ${c.waiting} ${noun}${c.waiting === 1 ? "" : "s"} waiting`, tone: "info" };
  return null;
}

/** Thumbs the payoff strip fits beside its count: four and "+2" measure about 240px (uploads 2.7). */
export const STRIP_THUMBS = 4;

/** How many of `total` the strip draws, and the "+N" for the rest. */
export function stripCounts(total: number, fit = STRIP_THUMBS): { shown: number; more: number } {
  const all = Math.max(total, 0);
  const shown = Math.min(all, fit);
  return { shown, more: all - shown };
}

/**
 * The leave sheet's title while files are still going up (decision 24):
 * "2 photos are still uploading", "1 video is still uploading", and "files"
 * for a mix, as addedText names them.
 */
export function stillUploading(kinds: readonly (FileKind | null)[]): string {
  const noun = kinds.every((k) => k === "image") ? "photo" : kinds.every((k) => k === "video") ? "video" : "file";
  return kinds.length === 1 ? `1 ${noun} is still uploading` : `${kinds.length} ${noun}s are still uploading`;
}
