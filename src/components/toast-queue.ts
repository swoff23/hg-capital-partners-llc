/**
 * The toast list's one rule, kept pure for its test: a toast with a `key`
 * replaces the live toast with the same key instead of stacking (forms 2.13),
 * so ten quick edits on one record show one toast, for the latest. The
 * replacement keeps the old id (it doesn't animate in again), moves to the
 * newest spot and gets a new `version`, which restarts its timer. Otherwise
 * the newest is added and only the last `max` stay.
 */
export type QueuedToast<T> = T & { id: number; version: number };

export function addToast<T extends { key?: string }>(
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
  return { list: [...list.slice(-(max - 1)), { ...input, id: nextId, version: 0 }], id: nextId };
}
