import type { TaskEventKind, TaskStatus, Visibility } from "@prisma/client";
import type { Ymd } from "@/lib/dates";

/**
 * Who may do what to a task, what contractors see, and who gets emailed.
 * Pure; see rules.test.ts. src/lib/tasks/core.ts enforces these on every write.
 */

/** Who's acting. "asana" is the importer: it writes history and never emails. */
export type PrincipalKind = "staff" | "contractor" | "system" | "asana";

/** Contractors get two buttons: Start job and Mark done (docs/asana-migration-plan.md D6c). */
const CONTRACTOR_CAN_START: readonly TaskStatus[] = ["OPEN", "SCHEDULED", "WAITING"];
const CONTRACTOR_CAN_FINISH: readonly TaskStatus[] = ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING"];
/** Picking their day turns a To do or Waiting job Scheduled (docs/specs/contractor-scheduled-date.md, Q2). Only core.ts scheduleByContractor asks. */
const CONTRACTOR_CAN_SCHEDULE: readonly TaskStatus[] = ["OPEN", "WAITING"];
// Taking their day off a Scheduled job puts it back to To do (core.ts unscheduleByContractor; Connor, Nov 22).
const CONTRACTOR_CAN_UNSCHEDULE: readonly TaskStatus[] = ["SCHEDULED"];

/**
 * No status change goes to or from Draft, for anyone (docs/specs/tasks-from-claude.md 6.1): a draft becomes a task
 * only through Add (core.ts addDraft), and goes back only through that Add's Undo (undoAddDraft).
 */
export function canSetStatus(kind: PrincipalKind, from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  if (from === "DRAFT" || to === "DRAFT") return false;
  if (kind !== "contractor") return true;
  if (to === "IN_PROGRESS") return CONTRACTOR_CAN_START.includes(from);
  if (to === "REVIEW") return CONTRACTOR_CAN_FINISH.includes(from);
  if (to === "SCHEDULED") return CONTRACTOR_CAN_SCHEDULE.includes(from);
  if (to === "OPEN") return CONTRACTOR_CAN_UNSCHEDULE.includes(from);
  return false;
}

/**
 * Why a contractor's Start job or Mark done was refused, from where the job is now. The page asking is usually a
 * stale tab (HG approved meanwhile, a second tab already marked it done or started it), so it says what happened;
 * the page refreshes to show it. Anything else keeps the rule itself.
 */
export function contractorStatusRefusal(from: TaskStatus, to: TaskStatus): string {
  if (from === "DONE") return "This job is already done.";
  if (from === "CANCELED") return "This job was canceled.";
  if (from === "REVIEW") return "This job is already in review.";
  if (from === "IN_PROGRESS" && to === "IN_PROGRESS") return "This job is already started.";
  return "You can start a job or mark it done.";
}

/**
 * Status changes a contractor sees on their job: it got scheduled, work
 * started (or was sent back), they marked it done, it was approved.
 * Waiting and Canceled stay internal.
 */
const CONTRACTOR_VISIBLE_STATUS: readonly TaskStatus[] = ["SCHEDULED", "IN_PROGRESS", "REVIEW", "DONE"];

export function statusEventVisibility(to: TaskStatus, hasContractor: boolean): Visibility {
  return hasContractor && CONTRACTOR_VISIBLE_STATUS.includes(to) ? "SHARED" : "INTERNAL";
}

/**
 * Who a staff or system write is addressed to: the contractor assigned when
 * it's written, or null with none. Stamped on the event and the file
 * (`audienceContactId`), so a reply to Zack stays Zack's after the job moves
 * to someone else. Contractor rows already say whose they are, and imported
 * rows stay visible to the assignee (D17), so neither carries one.
 */
export function writeAudience(actor: PrincipalKind, assigneeContactId: string | null): string | null {
  return actor === "staff" || actor === "system" ? assigneeContactId : null;
}

/**
 * Whose rows a contractor sees on a job they can open (docs/asana-migration-plan.md
 * §5.1, "other contractors are never shown"): their own; imported Asana
 * history (D17: they could already see it there); and staff or system rows
 * addressed to them or to nobody in particular. Never another contractor's,
 * and never staff replies to another contractor. Visibility (Shared) and the
 * kind allowlist are checked separately. portalEvents and visibleFile in
 * src/lib/portal/queries.ts apply the same rule in SQL.
 */
export function contractorSeesRow(
  row: { imported: boolean; actorContactId: string | null; audienceContactId: string | null },
  contactId: string,
): boolean {
  if (row.imported) return true;
  if (row.actorContactId !== null) return row.actorContactId === contactId;
  return row.audienceContactId === null || row.audienceContactId === contactId;
}

/**
 * A job's two dates (docs/specs/contractor-scheduled-date.md): Due is HG
 * Capital's alone, and the scheduled day is the day the contractor plans to
 * go. The scheduled day counts only while the job is Scheduled; the column
 * keeps its last value after Start, unseen. Late, the Due emails and the date
 * chip on staff lists go by Due only.
 */
export function scheduledDay<T extends Date | Ymd>(t: { status: TaskStatus; scheduledFor: T | null }): T | null {
  return t.status === "SCHEDULED" ? t.scheduledFor : null;
}

/** The day a contractor's own lists, crew text and calendar go by: their scheduled day, else Due (Q8). */
export function jobDay<T extends Date | Ymd>(t: { status: TaskStatus; scheduledFor: T | null; dueDate: T | null }): T | null {
  return scheduledDay(t) ?? t.dueDate;
}

/** Their day lands after Due: the warning after the date (Q4). Both are "YYYY-MM-DD", so they compare as text. */
export function isAfterDue(scheduled: Ymd | null | undefined, due: Ymd | null | undefined): boolean {
  return !!scheduled && !!due && scheduled > due;
}

/**
 * Email only crosses the staff/contractor line (D19, D20):
 *   - staff change a contractor's job → the contractor hears about it
 *     (assignment, a shared comment or file, a shared status, Due, their
 *     day, the notes, the checklist, on hold). Internal notes never email a
 *     contractor, and neither does a move to Done: Approve, or a partner
 *     closing the job, is only shown on the job (docs/specs/send-for-review.md,
 *     section 2). The contractor hears back about finished work only when
 *     it's sent back.
 *   - a contractor changes their job → both partners hear about it.
 *   - staff changing staff tasks, the system and the importer email nobody.
 * `TARGET` stands for "the due date moved", `DAY` for "the scheduled day
 * moved" (docs/specs/contractor-scheduled-date.md) and `HOLD` for "a partner
 * put the job on hold" (docs/specs/emails-redesign.md, Q2); core decides which.
 *
 * Who hears is not the same as whether the line makes an email of its own
 * (docs/specs/emails-redesign.md, Q2 and Q6): every line here is queued, but
 * photos with no words, a partner changing the status for a contractor, and a
 * contractor's Start or on-time day only ride along in an email something
 * else sends. content.ts decides that as the email goes (leadsEmail), and
 * staffStatusEmails below says it for a partner's status change, for the
 * toast's "Zack gets an email".
 *
 * `contractorGetsEmail` is the whole rule for a contractor's task emails
 * (src/lib/portal/job-emails.ts): an active login, signed in at least once,
 * and their "Job emails" switch on. Without it a staff change queues nothing,
 * and nothing is sent later to catch them up.
 */
export type NotifyChange = {
  kind: TaskEventKind | "TARGET" | "DAY" | "HOLD";
  visibility: Visibility;
  /** A STATUS change's new status: a staff move to Done emails nobody. */
  to?: TaskStatus;
};

// CHECKLIST: a partner added, renamed, removed or put back an item (Q2: it changes what they do). HOLD: a partner put
// a job they already have on hold.
const STAFF_TO_CONTRACTOR: ReadonlySet<NotifyChange["kind"]> = new Set(["ASSIGNED", "TARGET", "DAY", "NOTES", "CHECKLIST", "HOLD"]);
// DAY: the contractor moved their scheduled day (core.ts scheduleByContractor). TARGET stays for rows queued before
// Nov 21, when a contractor's pick moved the due date.
const CONTRACTOR_TO_STAFF: ReadonlySet<NotifyChange["kind"]> = new Set(["COMMENT", "ATTACHMENT", "STATUS", "TARGET", "DAY"]);

export function notifyAudience(
  actor: PrincipalKind,
  change: NotifyChange,
  opts: { contractorGetsEmail: boolean },
): "contractor" | "staff" | null {
  if (actor === "staff") {
    if (!opts.contractorGetsEmail) return null;
    if (change.kind === "STATUS" && change.to === "DONE") return null;
    if (change.visibility === "SHARED" && (change.kind === "COMMENT" || change.kind === "ATTACHMENT" || change.kind === "STATUS")) {
      return "contractor";
    }
    return STAFF_TO_CONTRACTOR.has(change.kind) ? "contractor" : null;
  }
  if (actor === "contractor") return CONTRACTOR_TO_STAFF.has(change.kind) ? "staff" : null;
  return null;
}

/**
 * Whether a partner's status change emails the contractor on its own (docs/specs/emails-redesign.md, Q2): a send-back
 * (Sent back), setting their day (a move to Scheduled) or taking it away (Scheduled back to To do), both Moved. Any
 * other status a partner sets for them is only a line in an email that's already going. On hold is its own line
 * (HOLD), and a cancel its own (core.ts notifyOff).
 */
export function staffStatusEmails(from: TaskStatus, to: TaskStatus): boolean {
  if (from === "REVIEW" && to === "IN_PROGRESS") return true;
  if (to === "SCHEDULED") return true;
  return from === "SCHEDULED" && to === "OPEN";
}

/**
 * A contractor's day emails the partners only when it puts the job at risk (docs/specs/emails-redesign.md, Q6): a
 * day picked after Due, or their day taken off with Due this many days out or less (or already past).
 */
export const DUE_SOON_DAYS = 3;

/**
 * Bundling: everything for one recipient about one task goes out as one email.
 * It sends 3 minutes after the latest change, but never more than 10 minutes
 * after the first, so a busy back-and-forth still lands promptly.
 */
export const BUNDLE_QUIET_MS = 3 * 60_000;
export const BUNDLE_MAX_MS = 10 * 60_000;

/**
 * How long Approve's Undo lasts (core.ts undoApproval). An approval emails
 * nobody (notifyAudience), so nothing else limits it; the refusal for an
 * approval email claimed or sent only covers rows queued before that rule.
 *
 * Also how long Add's Undo lasts on a draft from Claude (core.ts
 * undoAddDraft): shorter than BUNDLE_QUIET_MS on purpose, so the job email
 * Add queued is still waiting, unsent, when the Undo deletes it with the
 * contractor's access (rules.test.ts holds the two apart).
 */
export const APPROVAL_UNDO_MS = 2 * 60_000;

/**
 * How long a discarded draft's row is kept before the every-minute run deletes
 * it with its files (core.ts sweepDiscardedDrafts): far longer than the toast
 * that offers Discard's Undo stays up, so an Undo tapped late, after a slow
 * answer or on a second look, still finds the draft whole.
 */
export const DISCARD_KEEP_MS = 10 * 60_000;

export function bundleSendAfter(firstAt: Date, now: Date): Date {
  return new Date(Math.min(firstAt.getTime() + BUNDLE_MAX_MS, now.getTime() + BUNDLE_QUIET_MS));
}
