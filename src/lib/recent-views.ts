import "server-only";
import type { RecentKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/log";
import { readRecentsIn, recordViewIn, type ReadRecentsOptions, type RecentEntry } from "@/lib/recent-views-core";

export { RECENT_KEEP, RECENT_KINDS, RECENT_MAX, isRecentKind, type ReadRecentsOptions, type RecentEntry } from "@/lib/recent-views-core";

/**
 * The only writer of RecentView, which feeds Recent in the command palette
 * (docs/specs/search.md 2.5 and 2.10). The rules and their tests live in
 * recent-views-core.ts.
 */

/**
 * Notes that this staff user opened a record, putting it on top of their
 * Recent. The record pages call it inside `after()` once the record has
 * loaded, so no page waits on it:
 *
 *   after(() => recordView(user.id, "PROPERTY", property.id));
 *
 * Never throws: a failed write is logged and the page is unaffected.
 */
export async function recordView(userId: string, kind: RecentKind, recordId: string): Promise<void> {
  try {
    await recordViewIn(prisma, userId, kind, recordId);
  } catch (err) {
    logError("recent-views.record", err, { kind, recordId });
  }
}

/**
 * This staff user's recently opened records, newest first. Each entry names a
 * record only; the caller loads them, skips any deleted since and Template
 * tasks, then trims to what it shows. Throws on a database error, so the
 * caller can answer with its own failure state.
 */
export async function readRecents(userId: string, options?: ReadRecentsOptions): Promise<RecentEntry[]> {
  return readRecentsIn(prisma, userId, options);
}
