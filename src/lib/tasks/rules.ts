import type { TaskEventKind, TaskStatus, Visibility } from "@prisma/client";

/**
 * Who may do what to a task, what contractors see, and who gets emailed.
 * Pure; see rules.test.ts. src/lib/tasks/core.ts enforces these on every write.
 */

/** Who's acting. "asana" is the importer: it writes history and never emails. */
export type PrincipalKind = "staff" | "contractor" | "system" | "asana";

/** Contractors get two buttons: Start job and Mark done (docs/asana-migration-plan.md D6c). */
const CONTRACTOR_CAN_START: readonly TaskStatus[] = ["OPEN", "SCHEDULED", "WAITING"];
const CONTRACTOR_CAN_FINISH: readonly TaskStatus[] = ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING"];

export function canSetStatus(kind: PrincipalKind, from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  if (kind !== "contractor") return true;
  if (to === "IN_PROGRESS") return CONTRACTOR_CAN_START.includes(from);
  if (to === "REVIEW") return CONTRACTOR_CAN_FINISH.includes(from);
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

/** What a contractor sees as "Target": the visit date while Scheduled, otherwise the due date. */
export function targetDate(t: { status: TaskStatus; scheduledFor: Date | null; dueDate: Date | null }): Date | null {
  return targetIsVisit(t) ? t.scheduledFor : t.dueDate;
}

/** Whether that date is the booked visit, which the portal labels "Visit date" rather than "Due date". */
export function targetIsVisit(t: { status: TaskStatus; scheduledFor: Date | null }): boolean {
  return t.status === "SCHEDULED" && t.scheduledFor !== null;
}

/**
 * Email only crosses the staff/contractor line (D19, D20):
 *   - staff change a contractor's job → the contractor hears about it
 *     (assignment, a shared comment or file, a shared status, target date or
 *     notes changes). Internal notes never email a contractor.
 *   - a contractor changes their job → both partners hear about it.
 *   - staff changing staff tasks, the system and the importer email nobody.
 * `TARGET` stands for "the date the contractor sees moved"; core decides that.
 */
export type NotifyChange = { kind: TaskEventKind | "TARGET"; visibility: Visibility };

const STAFF_TO_CONTRACTOR: ReadonlySet<NotifyChange["kind"]> = new Set(["ASSIGNED", "TARGET", "NOTES"]);
const CONTRACTOR_TO_STAFF: ReadonlySet<NotifyChange["kind"]> = new Set(["COMMENT", "ATTACHMENT", "STATUS"]);

export function notifyAudience(
  actor: PrincipalKind,
  change: NotifyChange,
  opts: { contractorHasLogin: boolean },
): "contractor" | "staff" | null {
  if (actor === "staff") {
    if (!opts.contractorHasLogin) return null;
    if (change.visibility === "SHARED" && (change.kind === "COMMENT" || change.kind === "ATTACHMENT" || change.kind === "STATUS")) {
      return "contractor";
    }
    return STAFF_TO_CONTRACTOR.has(change.kind) ? "contractor" : null;
  }
  if (actor === "contractor") return CONTRACTOR_TO_STAFF.has(change.kind) ? "staff" : null;
  return null;
}

/**
 * Bundling: everything for one recipient about one task goes out as one email.
 * It sends 3 minutes after the latest change, but never more than 10 minutes
 * after the first, so a busy back-and-forth still lands promptly.
 */
export const BUNDLE_QUIET_MS = 3 * 60_000;
export const BUNDLE_MAX_MS = 10 * 60_000;

/**
 * How long Approve's Undo lasts (core.ts undoApproval): under the 3 minutes
 * an approval email waits. A bundle near its 10-minute cap can be due sooner,
 * so Undo is also refused once the approval's email row is claimed or sent.
 */
export const APPROVAL_UNDO_MS = 2 * 60_000;

export function bundleSendAfter(firstAt: Date, now: Date): Date {
  return new Date(Math.min(firstAt.getTime() + BUNDLE_MAX_MS, now.getTime() + BUNDLE_QUIET_MS));
}
