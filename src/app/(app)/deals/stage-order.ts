import { DEAL_STATUSES } from "@/lib/config";

/**
 * The deals list's Stage sort. A stage has no order the database knows (it's
 * a string, and the pipeline isn't alphabetical: the legacy "Active" would
 * land between "6 - Holding" and "CLOSED!"), so each stage ranks by its place
 * in DEAL_STATUSES and a stage the list doesn't know ranks last. Newest
 * update first within a stage.
 */
const STATUS_RANK = new Map(DEAL_STATUSES.map((s, i) => [s as string, i]));
export const statusRank = (status: string) => STATUS_RANK.get(status) ?? DEAL_STATUSES.length;

export function sortByStatus<T extends { status: string; updatedAt: Date }>(list: readonly T[], desc: boolean): T[] {
  return [...list].sort((a, b) => {
    const diff = statusRank(a.status) - statusRank(b.status);
    if (diff !== 0) return desc ? -diff : diff;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}

/**
 * The ids of the first `cap` deals in Stage order, from every match's id,
 * stage and update time. The page ranks these and reads only the shown rows
 * in full, so the cap applies before the list columns and notes are read,
 * and no stage group is cut before the sort runs.
 */
export function firstByStage(keys: readonly { id: string; status: string; updatedAt: Date }[], desc: boolean, cap: number): string[] {
  return sortByStatus(keys, desc)
    .slice(0, cap)
    .map((k) => k.id);
}
