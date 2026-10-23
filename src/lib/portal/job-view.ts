import type { TaskStatus } from "@prisma/client";
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
  unitLabel: string | null;
  /** The neutral Target (rules.ts targetDate), never shown in red. */
  target: Ymd | null;
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

/** "Target today", "Target Thu, Oct 29". */
export function targetLabel(target: Ymd, today: Ymd): string {
  const day = dayLabel(target, today);
  return `Target ${/^(Today|Tomorrow|Yesterday)$/.test(day) ? day.toLowerCase() : day}`;
}

const NO_DATE = "No target date";

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
