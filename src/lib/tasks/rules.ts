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
 * Status changes a contractor sees on their job: it got scheduled, work
 * started (or was sent back), they marked it done, it was approved.
 * Waiting and Canceled stay internal.
 */
const CONTRACTOR_VISIBLE_STATUS: readonly TaskStatus[] = ["SCHEDULED", "IN_PROGRESS", "REVIEW", "DONE"];

export function statusEventVisibility(to: TaskStatus, hasContractor: boolean): Visibility {
  return hasContractor && CONTRACTOR_VISIBLE_STATUS.includes(to) ? "SHARED" : "INTERNAL";
}

/** What a contractor sees as "Target": the visit date while Scheduled, otherwise the due date. */
export function targetDate(t: { status: TaskStatus; scheduledFor: Date | null; dueDate: Date | null }): Date | null {
  return t.status === "SCHEDULED" && t.scheduledFor ? t.scheduledFor : t.dueDate;
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

export function bundleSendAfter(firstAt: Date, now: Date): Date {
  return new Date(Math.min(firstAt.getTime() + BUNDLE_MAX_MS, now.getTime() + BUNDLE_QUIET_MS));
}
