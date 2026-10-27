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
   * The event the line is about (core.ts OutboxItem), decided per item. A row
   * can mix items with and without it; what the email says never depends on
   * it, so an old row sends exactly as stored.
   */
  eventId?: string;
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

/** Staff open the task in the app; contractors open the job in the portal. */
export function openUrl(appUrl: string, audience: Audience, taskId: string): string {
  const origin = appUrl.replace(/\/+$/, "");
  return audience === "staff" ? `${origin}/tasks/${taskId}` : `${origin}/p/jobs/${taskId}`;
}

// ---------------------------------------------------------------------------
// What it says
// ---------------------------------------------------------------------------

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** "set it to in progress" back to the label the app shows ("In progress"). */
const STATUS_BY_WORDS = new Map(Object.entries(STATUS_LABEL).map(([k, label]) => [k.replace("_", " ").toLowerCase(), label]));

/**
 * One change, after the person's first name, without the task's title
 * (the subject has it): "moved the target to Fri, Oct 30", "scheduled it for
 * Thu, Oct 29", "marked it done", `: "Doors arrive Thu"`. Dates arrive
 * already written out (core.ts emailDay). The title patterns are greedy so a
 * title with a quote in it ("Hang 36" mirror") still comes out whole.
 */
export function itemText(item: OutboxItem): string {
  const s = oneLine(item.summary);
  switch (item.kind) {
    case "ASSIGNED": {
      // Anchored on the date, so a title like `Quote "A" for B` isn't read as one.
      const m = /^assigned you ".*" for ([A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}(?:, \d{4})?)$/.exec(s);
      return m ? `assigned you this job for ${m[1]}` : "assigned you this job";
    }
    case "NOTES":
      return "updated the notes";
    case "TARGET": {
      const m = /^moved ".*" to (.+)$/.exec(s);
      return m && m[1] !== "no date" ? `moved the target to ${m[1]}` : "cleared the target date";
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
      const back = /^sent ".*" back(: .+)?$/.exec(s);
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
    buttonUrl: openUrl(input.appUrl, input.audience, input.taskId),
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
