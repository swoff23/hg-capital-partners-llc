import type { Prisma, TaskStatus } from "@prisma/client";
import { TEMPLATE_BUCKET } from "@/lib/config";

/**
 * Spread into any Task `where` that feeds a list, a count or a search: the
 * one "listed task" filter. It leaves out the two kinds of row that aren't
 * work anyone can see yet:
 *  - Template-bucket rows, playbook definitions imported from Asana (before
 *    this filter they inflated "Open tasks" on the dashboard and the task list);
 *  - drafts a partner's Claude saved, until a partner adds them
 *    (docs/specs/tasks-from-claude.md 6.2). Only the Tasks list's draft
 *    groups, Home's drafts row and a draft's own page read those.
 *
 * The draft half is keyed on `NOT`, never on `status`, so it can be spread
 * beside `activeTask` or `closedTask` in either order without one dropping
 * the other (task-scope.test.ts holds it to that).
 */
export const listedTask = {
  bucket: { not: TEMPLATE_BUCKET },
  NOT: { status: "DRAFT" },
} satisfies Prisma.TaskWhereInput;

/**
 * Only drafts that wait: the Tasks list's draft groups and Home's count
 * (tasks/list-query.ts myDraftsWhere), and every other read that is of drafts.
 * A draft a partner discarded is not one of them. Discard only marks its row
 * (`discardedAt`, tasks/core.ts discardDrafts), so its Undo can bring it back
 * whole, and the row is deleted about ten minutes later (sweepDiscardedDrafts).
 * Until then it is gone to everyone: spread this wherever drafts are read, so
 * the rule stays in one place.
 */
export const draftTask = { status: "DRAFT", discardedAt: null } satisfies Prisma.TaskWhereInput;

/**
 * Spread into a read of one task by its id for a screen (the task's own page,
 * tasks/list-query.ts taskPageWhere): a discarded draft is gone to everyone,
 * so its page is a 404 though its row waits out its Undo. Only a draft is
 * ever discarded, so every task passes.
 */
export const notDiscarded = { discardedAt: null } satisfies Prisma.TaskWhereInput;

/** Whether the task is a draft: saved by Claude, not yet added by a partner. */
export function isDraftStatus(s: TaskStatus): boolean {
  return s === "DRAFT";
}

/** Whether a partner discarded this draft: it is gone to everyone, as a deleted row is. */
export function isDiscarded(t: { discardedAt: Date | null }): boolean {
  return !!t.discardedAt;
}

/**
 * The jobs a contractor can open: a listed task (never a draft, never a
 * playbook template) with an unrevoked access row of theirs. The portal's
 * every read starts here (portal/queries.ts), so a draft stays out of it
 * even if an access row somehow exists.
 */
export const contractorCanOpen = (contactId: string) =>
  ({ ...listedTask, access: { some: { contactId, revokedAt: null } } }) satisfies Prisma.TaskWhereInput;

/**
 * Every status a task can be moved to, in display order: the status menu's
 * rows (components/status-menu.tsx). Sort with this, never by the enum's own
 * order: the newer values were appended after DONE in the database. Draft
 * isn't one: no menu offers it, and only Add moves a task out of it.
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

/**
 * Finished, one way or the other. A Draft is neither active nor closed, so
 * every list, count and filter built on these two skips it.
 */
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
  DRAFT: "Draft",
};

/** Position in STATUS_ORDER, for sorting. A Draft has none (-1): it is never in a list that sorts by status. */
export function statusRank(s: TaskStatus): number {
  return (STATUS_ORDER as readonly TaskStatus[]).indexOf(s);
}

/**
 * Overdue: still open, due before today, and not parked. Waiting and Review
 * tasks sit in their own sections instead, so they never count as overdue.
 */
export const OVERDUE_ELIGIBLE = ["OPEN", "SCHEDULED", "IN_PROGRESS"] as const satisfies readonly TaskStatus[];
