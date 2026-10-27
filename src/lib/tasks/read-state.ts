/**
 * Staff read state: what a partner hasn't seen on a task yet (docs/specs/
 * activity-comments.md 2.6 and choice 3.5 A), for the unread dot on task
 * rows and the New divider on the task page. It reads `TaskReadState` rows
 * by `userId`; the contractor's rows (by `contactId`) are the portal's.
 *
 * No rows are seeded at release. A partner with no row reads as having seen
 * everything up to READ_STATE_SINCE, so day one shows no dot or divider for
 * history nobody missed. The dot and the divider share one baseline,
 * COALESCE(lastSeenAt, READ_STATE_SINCE) (seenBaseline). Only events written
 * in the app or the portal by someone else count toward unread, so imported
 * Asana history, whenever it loads, never does.
 *
 * Writes stamp nothing on the Task row (no editStamp, no task.update), so
 * opening a task never trips the importer's compare-and-set.
 *
 * Interim: unreadTaskIds answers an empty set until the read-state writes
 * and the unread rule land (activity slice 3).
 */

/** The release: every partner has seen everything before it. Set to the instant this ships to production. */
export const READ_STATE_SINCE = new Date("2026-10-27T04:00:00.000Z");

/**
 * When the viewer last looked at a task, as unread is counted:
 * COALESCE(lastSeenAt, READ_STATE_SINCE), their row's time or the release
 * without one. The row dot and the New divider both read it, so they agree.
 */
export function seenBaseline(lastSeenAt: Date | null | undefined): Date {
  return lastSeenAt ?? READ_STATE_SINCE;
}

/** The tasks among `taskIds` with something new for this partner since they last opened them. */
export async function unreadTaskIds(userId: string, taskIds: readonly string[]): Promise<Set<string>> {
  void userId;
  void taskIds;
  return new Set();
}
