import type { Prisma, TaskStatus } from "@prisma/client";
import { TEMPLATE_BUCKET } from "@/lib/config";

/**
 * Spread into any Task `where` that feeds a list or a count. Template-bucket
 * rows are playbook definitions imported from Asana, not open work; before
 * this filter they inflated "Open tasks" on the dashboard and the task list.
 */
export const excludeTemplateTasks = {
  bucket: { not: TEMPLATE_BUCKET },
} satisfies Prisma.TaskWhereInput;

/**
 * Every status in display order. Sort with this, never by the enum's own
 * order: the newer values were appended after DONE in the database.
 */
export const STATUS_ORDER = [
  "OPEN",
  "SCHEDULED",
  "IN_PROGRESS",
  "WAITING",
  "REVIEW",
  "DONE",
  "CANCELED",
] as const satisfies readonly TaskStatus[];

/** Statuses that still need someone to act. "Open" in every list and count means these. */
export const ACTIVE_STATUSES = ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING", "REVIEW"] as const satisfies readonly TaskStatus[];

/** Finished, one way or the other. */
export const CLOSED_STATUSES = ["DONE", "CANCELED"] as const satisfies readonly TaskStatus[];

/** Spread into a Task `where` for "still open" work. Use this, never a filter on OPEN alone. */
export const activeTask = {
  status: { in: [...ACTIVE_STATUSES] },
} satisfies Prisma.TaskWhereInput;

export const closedTask = {
  status: { in: [...CLOSED_STATUSES] },
} satisfies Prisma.TaskWhereInput;

export function isActiveStatus(s: TaskStatus): boolean {
  return (ACTIVE_STATUSES as readonly TaskStatus[]).includes(s);
}

/** What the UI calls each status. OPEN predates the other six and reads "To do". */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: "To do",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  REVIEW: "Review",
  DONE: "Done",
  CANCELED: "Canceled",
};

/** Position in STATUS_ORDER, for sorting. */
export function statusRank(s: TaskStatus): number {
  return (STATUS_ORDER as readonly TaskStatus[]).indexOf(s);
}

/**
 * Overdue: still open, due before today, and not parked. Waiting and Review
 * tasks sit in their own sections instead, so they never count as overdue.
 */
export const OVERDUE_ELIGIBLE = ["OPEN", "SCHEDULED", "IN_PROGRESS"] as const satisfies readonly TaskStatus[];
