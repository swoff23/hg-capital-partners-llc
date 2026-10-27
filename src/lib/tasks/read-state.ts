import "server-only";
import { prisma } from "@/lib/db";
import { lastSeenIn, markSeenIn, otherPartnersSeenIn, unreadTaskIdsIn } from "./read-state-core";

/**
 * Staff read state on the app's database client (docs/specs/activity-comments.md
 * 2.6, choice 3.5 A). The rules, the release constant and their tests are in
 * read-state-core.ts; this binds them to `prisma`.
 *
 *   unreadTaskIds   the task rows' unread dot (Today, All)
 *   lastSeen        the New divider's baseline, read before the page writes
 *   markTaskSeen    note the open, in after() once the page is out
 */

export { READ_STATE_SINCE, seenBaseline } from "./read-state-core";

/** The tasks among `taskIds` with something new for this partner since they last opened them. */
export function unreadTaskIds(userId: string, taskIds: readonly string[]): Promise<Set<string>> {
  return unreadTaskIdsIn(prisma, userId, taskIds);
}

/** When this partner last opened the task before now; null if they never have. */
export function lastSeen(userId: string, taskId: string): Promise<Date | null> {
  return lastSeenIn(prisma, userId, taskId);
}

/** Note that this partner opened the task. Never throws into the page that called it. */
export function markTaskSeen(userId: string, taskId: string, now = new Date()): Promise<void> {
  return markSeenIn(prisma, userId, taskId, now);
}

/** The other partners' latest opens of the task, newest first. */
export function otherPartnersSeen(userId: string, taskId: string): Promise<{ userId: string; lastSeenAt: Date }[]> {
  return otherPartnersSeenIn(prisma, userId, taskId);
}
