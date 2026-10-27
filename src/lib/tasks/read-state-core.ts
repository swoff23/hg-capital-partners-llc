import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * Staff read state, without the database client (docs/specs/activity-comments.md
 * 2.6 and choice 3.5 A): what a partner hasn't seen on a task yet, for the
 * unread dot on task rows and the New divider on the task page. It reads and
 * writes `TaskReadState` rows by `userId`; the contractor's rows (by
 * `contactId`) are the portal's. read-state.ts binds these to the app's
 * client; the rules and their tests live here.
 *
 * No rows are seeded at release. A partner with no row reads as having seen
 * everything up to READ_STATE_SINCE, so day one shows no dot or divider for
 * history nobody missed. The dot and the divider share one baseline,
 * COALESCE(lastSeenAt, READ_STATE_SINCE) (seenBaseline).
 *
 * Only what was written in the app or the portal by someone else counts
 * (countsAsUnread). Imported Asana history, whenever the load or a delta
 * brings it in, never does: some importer rows are stamped with the time they
 * were imported (a conflict, a legacy-link assignment, a series join).
 *
 * Writes stamp nothing on the Task row (no editStamp, no task.update), so
 * opening a task never trips the importer's compare-and-set on `appEditedAt`.
 */

type Db = Pick<PrismaClient, "$queryRaw" | "taskReadState">;

/** The release: every partner has seen everything before it. Set to the instant this ships to production. */
export const READ_STATE_SINCE = new Date("2026-10-27T11:00:00.000Z");

/**
 * When the viewer last looked at a task, as unread is counted:
 * COALESCE(lastSeenAt, READ_STATE_SINCE), their row's time or the release
 * without one. The row dot and the New divider both read it, so they agree.
 */
export function seenBaseline(lastSeenAt: Date | null | undefined): Date {
  return lastSeenAt ?? READ_STATE_SINCE;
}

/**
 * Whether one event is new to a partner (activity 2.6): written in the app or
 * the portal after `baseline` by someone else, and a comment, or a
 * contractor's photos, start or Mark done. What the other partner changes
 * (a date, an assignee) doesn't dot, but their comments do. The same rule
 * unreadTaskIdsIn writes in SQL; it lives in activity.ts so the task page's
 * client code can use it without this file's database imports.
 */
export { countsAsUnread, type UnreadCandidate } from "./activity";

/** The tasks among `taskIds` with something new for this partner since they last opened them. */
export async function unreadTaskIdsIn(db: Db, userId: string, taskIds: readonly string[]): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();
  // The columns are UTC timestamps without a zone, so the release instant is converted explicitly.
  const since = Prisma.sql`(${READ_STATE_SINCE.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
  const rows = await db.$queryRaw<{ taskId: string }[]>`
    SELECT DISTINCT e."taskId"
    FROM "TaskEvent" e
    LEFT JOIN "TaskReadState" r ON r."taskId" = e."taskId" AND r."userId" = ${userId}
    WHERE e."taskId" IN (${Prisma.join([...taskIds])})
      AND e."deletedAt" IS NULL
      AND e."source" IN ('APP', 'PORTAL')
      AND e."actorUserId" IS DISTINCT FROM ${userId}
      AND e."createdAt" > COALESCE(r."lastSeenAt", ${since})
      AND (e."kind" = 'COMMENT' OR (e."actorContactId" IS NOT NULL AND e."kind" IN ('ATTACHMENT', 'STATUS')))`;
  return new Set(rows.map((r) => r.taskId));
}

/** When this partner last opened the task, before this visit: null if they never have. */
export async function lastSeenIn(db: Db, userId: string, taskId: string): Promise<Date | null> {
  const row = await db.taskReadState.findUnique({ where: { taskId_userId: { taskId, userId } }, select: { lastSeenAt: true } });
  return row?.lastSeenAt ?? null;
}

/**
 * Note that this partner opened the task. Call it after the page has been
 * sent, once the previous `lastSeenAt` has been read (it is the New divider's
 * baseline). Two tabs opening the task at once both create the row: the second
 * finds it written, which is the same fact.
 */
export async function markSeenIn(db: Db, userId: string, taskId: string, now: Date): Promise<void> {
  try {
    await db.taskReadState.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId, lastSeenAt: now },
      update: { lastSeenAt: now },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
}

/**
 * The other partners' latest opens of a task, newest first: "Seen by Pieter"
 * under your own newest Internal note (activity 2.6). Partners don't email
 * each other, so this is the only signal.
 */
export async function otherPartnersSeenIn(
  db: Db,
  userId: string,
  taskId: string,
): Promise<{ userId: string; lastSeenAt: Date }[]> {
  const rows = await db.taskReadState.findMany({
    where: { taskId, userId: { not: null, notIn: [userId] } },
    orderBy: { lastSeenAt: "desc" },
    select: { userId: true, lastSeenAt: true },
  });
  return rows.flatMap((r) => (r.userId ? [{ userId: r.userId, lastSeenAt: r.lastSeenAt }] : []));
}
