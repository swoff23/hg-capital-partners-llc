/**
 * The toast list's one rule, kept pure for its test: a toast with a `key`
 * replaces the live toast with the same key instead of stacking (forms 2.13),
 * so ten quick edits on one record show one toast, for the latest. The
 * replacement keeps the old id (it doesn't animate in again), moves to the
 * newest spot and gets a new `version`, which restarts its timer. Otherwise
 * the newest is added and only the last `max` stay.
 *
 * A `sticky` toast (the update notice) waits for the person, so newer toasts
 * never push it out: the oldest toast that isn't sticky goes instead. With
 * only sticky toasts left to drop, the list runs over `max`.
 */
export type QueuedToast<T> = T & { id: number; version: number };

export function addToast<T extends { key?: string; sticky?: boolean }>(
  list: QueuedToast<T>[],
  input: T,
  nextId: number,
  max: number,
): { list: QueuedToast<T>[]; id: number } {
  const live = input.key === undefined ? undefined : list.find((t) => t.key === input.key);
  if (live) {
    const rest = list.filter((t) => t !== live);
    return { list: [...rest, { ...input, id: live.id, version: live.version + 1 }], id: live.id };
  }
  const next = [...list, { ...input, id: nextId, version: 0 }];
  while (next.length > max) {
    const oldest = next.findIndex((t) => !t.sticky);
    // The newest is the one just added: it always shows.
    if (oldest < 0 || oldest === next.length - 1) break;
    next.splice(oldest, 1);
  }
  return { list: next, id: nextId };
}
