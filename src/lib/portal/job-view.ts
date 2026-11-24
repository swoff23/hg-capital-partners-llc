import type { AttachmentKind, TaskStatus } from "@prisma/client";
import { LATE_UPLOAD_WINDOW_MS } from "@/lib/attachments/access";
import type { FileKind } from "@/lib/attachments/content-types";
import { daysUntil, todayYmdEastern, type Ymd } from "@/lib/dates";
import { firstName as greetingName } from "@/lib/names";
import { shortAddress } from "@/lib/normalize";
import { STATUS_LABEL } from "@/lib/task-scope";
import { eventLine, fmtShortDay } from "@/lib/tasks/activity";
import { TOAST_ACTION_MS } from "@/lib/toast-time";

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
  unitLabel: string | null;
  /** HG Capital's due date, never shown in red here. */
  due: Ymd | null;
  /** Their scheduled day while the job is Scheduled (rules.ts scheduledDay), else null. */
  scheduled: Ymd | null;
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

/** The day a My jobs row shows and sorts by: their scheduled day, else Due (docs/specs/contractor-scheduled-date.md, Q8). */
export const shownDay = (j: Pick<JobCard, "due" | "scheduled">): Ymd | null => j.scheduled ?? j.due;

/**
 * A job's date as a label and a day (Connor, Oct 26: "Target today" didn't
 * read): "Due date" then "Today" or "Thu, Oct 29", or "Scheduled" for their
 * scheduled day. Never "visit" (Connor). `short` is the label on a narrow My
 * jobs row, where the status leads the subline: "Due", or nothing for the
 * scheduled day, whose status already says Scheduled.
 */
export function dateParts(day: Ymd, kind: "due" | "scheduled", today: Ymd): { label: string; short: string; day: string } {
  return kind === "scheduled" ? { label: "Scheduled", short: "", day: dayLabel(day, today) } : { label: "Due date", short: "Due", day: dayLabel(day, today) };
}

const NO_DATE = "No due date";

/** Which day a job sorts and groups by, and in which direction. */
export interface DayOrder {
  dayOf: (job: JobCard) => Ymd | null;
  order: "asc" | "desc";
}

/** Open jobs by the day shown (their day, else Due), soonest first; finished ones by the day they were finished, most recent first. */
const OPEN_ORDER: DayOrder = { dayOf: shownDay, order: "asc" };
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

/**
 * Getting in's two lines, in the job page's own words (job-details.tsx GettingInSection, Connor, Nov 22): with
 * Permission to enter and a code, "Let yourself in" over who said so; at a home someone lives in without it,
 * someone must be home after 24 hours' notice; nobody living there with a code, "Let yourself in" over "No one
 * lives here". Null when the page says nothing about getting in. The job emails use it (docs/specs/emails-redesign.md,
 * Q4), never with the code; the emails list the tenants themselves under it (Connor, Nov 23).
 */
export function gettingInWords(a: { permitted: boolean; hasLockbox: boolean; needsNotice: boolean; vacant: boolean; tenants: number }): { value: string; note: string } | null {
  const one = a.tenants === 1;
  if (a.permitted && a.hasLockbox) return { value: "Let yourself in", note: one ? "The tenant said it's OK" : "The tenants said it's OK" };
  if (a.needsNotice) return { value: one ? "The tenant must be home" : "A tenant must be home", note: "Call/text them 24 hours in advance" };
  if (a.hasLockbox && a.vacant) return { value: "Let yourself in", note: "No one lives here" };
  return null;
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
 * Only a contractor starts the job or marks it done; staff moving it to In
 * progress or Review is a status change ("Connor moved it to Review"), as in
 * the email, so a partner's move never reads as the contractor's own.
 */
export function statusUpdateText(
  from: string | null,
  to: string | null,
  by: { contractor: boolean } = { contractor: true },
  // The day a move to Scheduled set, and today for its words: "scheduled the job for Fri, Nov 27" (Connor, Nov 22).
  scheduled: { day: string | null; today: Ymd } | null = null,
): string {
  switch (to) {
    case "SCHEDULED":
      return scheduled?.day ? `scheduled the job for ${fmtShortDay(scheduled.day as Ymd, scheduled.today)}` : "scheduled the job";
    case "IN_PROGRESS":
      return from === "REVIEW" ? "sent it back" : by.contractor ? "started the job" : "moved it to In progress";
    case "REVIEW":
      return by.contractor ? "sent it for review" : "moved it to Review";
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

/**
 * Statuses only the job's story shows (docs/specs/contractor-timeline.md): a
 * move to these is a plain line, never counted as new and never a rail mark.
 */
export const STORY_STATUSES = ["OPEN", "WAITING", "CANCELED"] as const satisfies readonly TaskStatus[];

/**
 * One event of the job's story, as the portal reads it (queries.ts
 * jobUpdates): only the fields a line needs, never the event's whole `data`.
 * `actor` is portalActorLabel's ("You", a first name), null for the system.
 */
export interface StoryRow {
  kind: string;
  actor: string | null;
  from: string | null;
  to: string | null;
  /** CHECKLIST: the item, what was done to it ("renamed", "removed", "restored") and a tick's "true" or "false". */
  itemTitle: string | null;
  itemAction: string | null;
  itemDone: string | null;
  /** CREATED: a resident's request from their link. */
  request: boolean;
  /** A resident made the change (their request's cancel), so the line never names them or calls it HG Capital's. */
  resident?: boolean;
}

/**
 * The line a contractor reads for one event of the job's story
 * (docs/specs/contractor-timeline.md, section 2), or null for anything off
 * its list, so a kind added later never shows by accident. The staff page's
 * own words (activity.ts eventLine) for dates, notes and the checklist; the
 * contractor's for the rest: "Connor added this job", "Connor gave you this
 * job", "Connor canceled this job". A resident who sent a request isn't
 * named (call 1), and a move to Waiting never carries its reason (call 2:
 * jobUpdates doesn't read it either).
 */
export function storyLine(r: StoryRow, today: Ymd): string | null {
  const a = r.actor ?? "HG Capital";
  switch (r.kind) {
    case "CREATED":
      return r.request ? "A resident sent this request" : `${a} added this job`;
    case "ASSIGNED":
      return r.actor ? `${a} gave you this job` : "This job was given to you";
    case "STATUS":
      if (r.from === "DRAFT") return null;
      if (r.to === "CANCELED") return r.resident ? "A resident canceled this request" : `${a} canceled this job`;
      // Their own Remove day (core.ts unscheduleByContractor) is a move from Scheduled back to To do.
      if (r.to === "OPEN" && r.from === "SCHEDULED" && r.actor === "You") return "You removed the scheduled day";
      if (r.to === "OPEN" || r.to === "WAITING") return `${a} set status to ${STATUS_LABEL[r.to]}`;
      return null;
    case "SCHEDULED":
      // Their own Remove day on a To do or Waiting job that kept a day (core.ts unscheduleByContractor).
      if (!r.to && r.actor === "You") return "You removed the scheduled day";
    // falls through
    case "DUE":
    case "NOTES":
    case "CHECKLIST": {
      const data =
        r.kind === "CHECKLIST"
          ? { title: r.itemTitle, action: r.itemAction, from: r.from, to: r.to, done: r.itemDone === "true" ? true : r.itemDone === "false" ? false : undefined }
          : { from: r.from, to: r.to };
      // No ids: eventLine then names the actor by the label as given, which is already the portal's.
      const event = { id: "", kind: r.kind, visibility: "INTERNAL", actorLabel: a, actorUserId: null, actorContactId: null, body: null, data, createdAt: new Date(0) } as const;
      return eventLine(event, {}, today).text;
    }
    default:
      return null;
  }
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

/** One step on the job page: what it says, and whether it's done, the one they're on, still to come, or passed by. */
export interface JobStepView {
  label: string;
  state: "done" | "current" | "next" | "skipped";
}

/**
 * The job page's steps (Connor, Nov 22): Schedule, Start and Approval, each
 * named for what's next and in the past tense once done: Schedule, then
 * Scheduled; Start, In progress while they work, then Completed once it's
 * sent for review; Approval, Awaiting approval while HG Capital reviews, then
 * Approved. Send invoice and Paid join once invoices ship. A day counts once
 * it's set, whatever the status says; a job started without one passes
 * Schedule by ("skipped": no check, since nothing was scheduled). Null for
 * Waiting and Canceled, which aren't steps: the page shows their status.
 */
export function jobSteps(status: TaskStatus, scheduled: string | null): JobStepView[] | null {
  const before = status === "OPEN" || status === "SCHEDULED";
  if (!before && status !== "IN_PROGRESS" && status !== "REVIEW" && status !== "DONE") return null;
  const schedule: JobStepView = scheduled
    ? { label: "Scheduled", state: "done" }
    : { label: "Schedule", state: before ? "current" : "skipped" };
  const work: JobStepView = before
    ? { label: "Start", state: scheduled ? "current" : "next" }
    : status === "IN_PROGRESS"
      ? { label: "In progress", state: "current" }
      : { label: "Completed", state: "done" };
  const approval: JobStepView =
    status === "DONE"
      ? { label: "Approved", state: "done" }
      : status === "REVIEW"
        ? { label: "Awaiting approval", state: "current" }
        : { label: "Approval", state: "next" };
  return [schedule, work, approval];
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
  label: "Send for review";
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
  const label = "Send for review" as const;
  if (s.pending > 0) return { label, enabled: false, busy: false, reason: "uploading", line: finishingLabel(s.pending) };
  if (s.sending) return { label, enabled: false, busy: true, reason: null, line: null };
  if (s.failed > 0) return { label, enabled: false, busy: false, reason: "failed", line: null };
  if (s.waiting > 0) return { label, enabled: false, busy: false, reason: "waiting", line: null };
  if (s.uploaded < s.required) {
    return { label, enabled: false, busy: false, reason: "short", line: addMorePhotosLine(s.required - s.uploaded) };
  }
  return { label, enabled: true, busy: false, reason: null, line: null };
}

/**
 * How a written update's Send ended, for the files it went with: `posted` (it answered that it went), `refused` (it
 * wrote nothing: it answered that it didn't, or it was sent with no connection and never left the phone) or `lost`
 * (a send that may have reached the server got no answer, so it may have posted).
 */
export type SendOutcome = "posted" | "refused" | "lost";

/**
 * How a Send ended, from what the page saw: the server's answer when there was one; with none, a call made while the
 * browser knew it had no connection (`offlineAtStart`) never left the phone, so nothing was written, and one made
 * with a signal that then failed may have reached the server and lost its answer.
 */
export function sendOutcome(answer: { ok: boolean } | null, offlineAtStart: boolean): SendOutcome {
  if (answer) return answer.ok ? "posted" : "refused";
  return offlineAtStart ? "refused" : "lost";
}

/** A written update whose answer was lost: the id it was sent with and the tray's files it went with. */
export type LostSend = { clientId: string; ids: string[] };

/**
 * The written updates that may have posted, after a Send. Their files come back on the tray for that update's Send
 * again, and Mark done never counts a written update's photos (the server counts unposted ones and a batch post's,
 * portal/job-batch.ts ownPosted), so the sheet leaves them out (finishable) until a Send of theirs answers that it
 * went, or the page learns the send never did (settleLost). A refusal changes nothing: it wrote nothing, but an
 * earlier send of the same files whose answer was lost may still have posted them.
 */
export function lostAfter(prev: readonly LostSend[], sent: LostSend, outcome: SendOutcome): LostSend[] {
  if (outcome === "posted") {
    return prev.map((l) => ({ ...l, ids: l.ids.filter((id) => !sent.ids.includes(id)) })).filter((l) => l.ids.length > 0);
  }
  if (outcome === "refused") return [...prev];
  const same = prev.find((l) => l.clientId === sent.clientId);
  if (!same) return [...prev, { clientId: sent.clientId, ids: [...new Set(sent.ids)] }];
  return prev.map((l) => (l === same ? { clientId: l.clientId, ids: [...new Set([...l.ids, ...sent.ids])] } : l));
}

/** The tray's files a written update may have posted (lostAfter): the ones the Mark done sheet leaves out. */
export function unconfirmedIds(lost: readonly LostSend[]): string[] {
  return [...new Set(lost.flatMap((l) => l.ids))];
}

/**
 * What the page's own updates (`sentClientIds`, read after the signal came back) say of the sends whose answers were
 * lost, the rule a reload applies to a pending message (composer-draft.ts resolvePending): one the page holds did
 * post, so its files stay out of Mark done until a Send of them answers; one it doesn't hold never committed, so its
 * files are unposted and count again.
 */
export function settleLost(lost: readonly LostSend[], sentClientIds: readonly string[]): LostSend[] {
  return lost.filter((l) => sentClientIds.includes(l.clientId));
}

/** The tray's files the Mark done sheet shows, counts and sends: all but the ones a written update may have posted (unconfirmedIds). */
export function finishable<T extends { id: string }>(ready: readonly T[], unconfirmed: readonly string[]): T[] {
  return ready.filter((r) => !unconfirmed.includes(r.id));
}

/**
 * Where a failed send's files go back: the front of the tray, ahead of the files that landed on it while the send was
 * away, so a Send again still has every file the first one went with and keeps its `clientId`
 * (composer-draft.ts clientIdToReuse; a missing one makes a new id, and a send that did post would post its words
 * twice). The tray holds `max` (one post's worth): the newest files past it are `kept`, for the tab to post as their
 * own batch. `front` are the sent files that fit and aren't on the tray already.
 */
export function backOnTray<T extends { id: string }>(sent: readonly T[], tray: readonly T[], max = MAX_FILES_PER_POST): { front: T[]; kept: T[] } {
  const back = sent.filter((s) => !tray.some((t) => t.id === s.id));
  return { front: back.slice(0, max), kept: [...back, ...tray].slice(max) };
}

// ---------------------------------------------------------------------------
// Batch posts and Undo (uploads 2.7, question 5)
// ---------------------------------------------------------------------------

/**
 * The most files one post takes: a batch post, a written update and Mark done each refuse more (their actions'
 * schemas read this). The job page's queue target holds no more than this unposted at once (maxFiles), so a pick of
 * 55 sends 50 and the other 5 get a refused tile with MAX_FILES_REASON instead of a post that fails; once those 50
 * post, more can go. Files a tab kept for the job (recorded-uploads.ts) can come to more, so every post of recorded
 * files goes in pieces of this many (postInBatches), and a Send or Mark done never holds more.
 */
export const MAX_FILES_PER_POST = 50;

/** The refused tile's reason past the cap, short enough for the bar's line at 320: "5 photos didn't upload: only 50 at a time". */
export const MAX_FILES_REASON = `only ${MAX_FILES_PER_POST} at a time`;

/**
 * The server's refusal of more files than one post takes, past a page that would have held them back. No noun: it
 * covers videos as well as photos, and it shows in a toast right after a send, so it fits one line at 320.
 */
export const TOO_MANY_FILES = `Send up to ${MAX_FILES_PER_POST} at a time.`;

/**
 * The toast after a Retry the cap turned back: the step, not the rule. "Send these 50, then Retry." on the job page,
 * "Close this and Send first." inside the Mark done sheet, whose footer has no Send. Each fits one line at 320.
 */
export const RETRY_PAST_CAP = `Send these ${MAX_FILES_PER_POST}, then Retry.`;
export const RETRY_PAST_CAP_IN_SHEET = "Close this and Send first.";

/** Room left for files on the job page's target: what one post takes, less the files recorded and waiting to post. */
export function postRoom(unposted: number): number {
  return Math.max(0, MAX_FILES_PER_POST - Math.max(0, unposted));
}

/** How long "3 photos posted · Undo" stays: the time of a toast with a button (lib/toast-time.ts). */
export const POST_UNDO_MS = TOAST_ACTION_MS;

/**
 * The server accepts an Undo a little after the toast has gone: the tap spends
 * part of the window in flight on a weak signal, and a toast held under the
 * pointer or focus (toast.tsx) lasts longer than its five seconds.
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

/**
 * The line on the Send for review payoff: who it went to, and that it's for
 * review, in one sentence (Connor, Nov 22: "should just be simple"). It
 * promised an email once, which depended on the contractor's Job emails
 * switch and wasn't theirs to get on a shared link.
 */
export function payoffLine(to: string, invoice?: { getsEmail: boolean }): string {
  // An invoice's payoff (docs/contractor-invoices-plan.md, 4.1): the invoice card above already shows it arrived and
  // who has it, so only the next step is said.
  if (invoice) return invoice.getsEmail ? "You'll get an email when it's paid." : "Check back here to see when it's paid.";
  return `Sent to ${to} for review.`;
}

/**
 * Whether the job page's bar offers Send invoice (docs/contractor-invoices-plan.md, 4.1; drawing 09, B1): once the
 * work is finished, In review or Done. To do, Scheduled, Waiting and In progress jobs never do, and a canceled one
 * has no bar.
 */
export function mayOfferSendInvoice(status: TaskStatus): boolean {
  return status === "REVIEW" || status === "DONE";
}

/** What Send invoice's button in its sheet shows, and the one line under it saying why it's off. */
export type SendInvoiceState = { enabled: boolean; busy: boolean; line: string | null };

/**
 * The sheet's primary: on once a file is up, off while one is still going up, failed or held for a signal (the
 * tray says which, with Retry) and with no file at all, where the line says what to add. The label never changes.
 */
export function sendInvoiceButton(s: { pending: number; waiting: number; failed: number; sending: boolean; uploaded: number }): SendInvoiceState {
  if (s.sending) return { enabled: false, busy: true, line: null };
  if (s.pending > 0) return { enabled: false, busy: false, line: finishingLabel(s.pending) };
  if (s.failed > 0 || s.waiting > 0) return { enabled: false, busy: false, line: null };
  // No file yet: Add file sits beside the button, so no line repeats it.
  if (s.uploaded === 0) return { enabled: false, busy: false, line: null };
  return { enabled: true, busy: false, line: null };
}

/** What the toast says after a batch posts: "3 photos posted", "1 video posted", "2 files posted". */
export function postedText(kinds: readonly (FileKind | null)[]): string {
  const n = kinds.length;
  const noun = kinds.every((k) => k === "image") ? "photo" : kinds.every((k) => k === "video") ? "video" : "file";
  return `${n} ${noun}${n === 1 ? "" : "s"} posted`;
}

/**
 * What the toast says when files land on a job that has been approved or
 * canceled since: "3 photos added to the job". They are on the job, in its
 * photos, and HG is told once (core.addLateContractorBatch), but the job
 * takes no batch post, so there is no Undo.
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
 * "2 photos not added" in its place when every red one is a photo the job
 * refused for good (a Retry can't change it, as the job page's tray says),
 * "3 photos waiting" when the only ones left are held for a signal ("3 photos
 * paused" when it is the upload code they wait for, not a signal; the job
 * page's bar keeps "No signal · 3 photos waiting", the row has no room for
 * the reason), and "Open to send 2 photos" when their bytes are
 * up but only the job's page can record and post them (a sign-in or a reload
 * put them back from the outbox before it opened). Failed leads: it's the one
 * that needs the contractor. Null when the job has no uploads. The queue counts failed
 * and waiting-for-the-page files without their kinds, so those lines say photos.
 */
export function rowUploadLine(c: {
  pending: number;
  waiting: number;
  /** Of `waiting`, the files held for the upload code and not a signal. */
  paused?: number;
  failed: number;
  /** Of `failed`, the ones the job refused for good. */
  refused?: number;
  awaitingPage?: number;
  pendingKinds: readonly (FileKind | null)[];
}): { text: string; tone: "info" | "danger" } | null {
  if (c.failed > 0) {
    const photos = `${c.failed} ${c.failed === 1 ? "photo" : "photos"}`;
    return { text: `${photos} ${(c.refused ?? 0) >= c.failed ? "not added" : "didn't upload"}`, tone: "danger" };
  }
  const kinds = c.pendingKinds;
  const noun = kinds.length > 0 && kinds.every((k) => k === "video") ? "video" : kinds.length > 0 && kinds.every((k) => k === "file") ? "file" : "photo";
  const parked = Math.min(c.awaitingPage ?? 0, c.pending);
  const going = c.pending - parked;
  if (going > 0) return { text: `Uploading ${going} ${noun}${going === 1 ? "" : "s"}`, tone: "info" };
  if (c.waiting > 0) return { text: `${c.waiting} ${noun}${c.waiting === 1 ? "" : "s"} ${(c.paused ?? 0) > 0 ? "paused" : "waiting"}`, tone: "info" };
  if (parked > 0) return { text: `Open to send ${parked} ${parked === 1 ? "photo" : "photos"}`, tone: "info" };
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
