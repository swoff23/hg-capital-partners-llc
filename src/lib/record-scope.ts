/**
 * Which deals, properties and contractors a list, count, total, search or
 * picker sees, as `task-scope.ts` is for tasks. An archived record
 * (`archivedAt` set, src/lib/archive.ts) is out of all of them; its own page
 * still opens from a link and says so, with Restore. Spread these into a
 * `where`; they hold no model-specific field, so one works on Deal,
 * Property and Contact alike.
 */

/** A record that isn't archived: every list, count, total, Home, search and picker. */
export const liveRecord = { archivedAt: null } as const;

/** An archived record: a list's Archived view. */
export const archivedRecord = { archivedAt: { not: null } } as const;

/**
 * Live records, plus the ones named in `keep` even when archived: the value a
 * picker already shows (a task's own property, its assigned contractor) or a
 * pick in the URL, so opening a picker never drops what it holds.
 */
export function liveOrKept(keep: readonly (string | null | undefined)[] = []): { archivedAt: null } | { OR: [{ archivedAt: null }, { id: { in: string[] } }] } {
  const ids = [...new Set(keep.filter((k): k is string => typeof k === "string" && k !== ""))];
  return ids.length === 0 ? liveRecord : { OR: [liveRecord, { id: { in: ids } }] };
}

/** A property the public move-in form offers: its switch is on and it isn't archived. */
export const onMoveInForm = { showOnMoveInForm: true, archivedAt: null } as const;

/** Whether a row read with its `archivedAt` is archived. */
export const isArchived = (row: { archivedAt: Date | string | null }) => row.archivedAt !== null;
