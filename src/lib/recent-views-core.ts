import type { Prisma, RecentKind } from "@prisma/client";

/**
 * The RecentView reads and writes, on whatever client the caller passes, so
 * recent-views.test.ts runs them against an in-memory table. App code calls
 * the server-only wrappers in recent-views.ts, never these.
 *
 * Recent in the command palette (docs/specs/search.md 2.5 and 2.10) is the
 * records a person opened last, kept on the server so a laptop and a phone
 * share one list. One row per (user, kind, record); opening it again bumps
 * viewedAt. Only the newest RECENT_KEEP rows per user and kind are kept.
 */

/** Rows kept per user and kind. The palette shows 5; the rest cover records deleted since. */
export const RECENT_KEEP = 20;

export const RECENT_KINDS = ["PROPERTY", "DEAL", "TASK", "CONTACT"] as const satisfies readonly RecentKind[];

/** Every row one person can have: RECENT_KEEP for each kind. */
export const RECENT_MAX = RECENT_KEEP * RECENT_KINDS.length;

/** Record ids are 25-character cuids; anything longer is not a record. */
const MAX_ID_LENGTH = 64;

export type RecentEntry = { kind: RecentKind; recordId: string; viewedAt: Date };

export type RecentViewDb = Pick<Prisma.TransactionClient, "recentView">;

export function isRecentKind(value: unknown): value is RecentKind {
  return typeof value === "string" && (RECENT_KINDS as readonly string[]).includes(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH && value.trim() === value;
}

/** Newest first; the id breaks a tie between two views in the same millisecond. */
const NEWEST_FIRST = [{ viewedAt: "desc" }, { id: "desc" }] satisfies Prisma.RecentViewOrderByWithRelationInput[];

/**
 * Puts the record on top of this person's Recent: adds the row, or bumps its
 * viewedAt, then drops the rows of the same kind past the newest RECENT_KEEP.
 * Ids that can't be a record write nothing. Returns whether it wrote.
 */
export async function recordViewIn(
  db: RecentViewDb,
  userId: string,
  kind: RecentKind,
  recordId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isId(userId) || !isRecentKind(kind) || !isId(recordId)) return false;
  const key = { userId, kind, recordId };
  try {
    await db.recentView.upsert({
      where: { userId_kind_recordId: key },
      create: { ...key, viewedAt: now },
      update: { viewedAt: now },
      select: { id: true },
    });
  } catch (err) {
    // Two tabs opening the same record at once can both try the insert; the
    // loser finds the winner's row and bumps it instead.
    if ((err as { code?: unknown } | null)?.code !== "P2002") throw err;
    await db.recentView.updateMany({ where: key, data: { viewedAt: now } });
  }
  const stale = await db.recentView.findMany({
    where: { userId, kind },
    orderBy: NEWEST_FIRST,
    skip: RECENT_KEEP,
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.recentView.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  }
  return true;
}

export type ReadRecentsOptions = {
  /** Only these kinds. Every kind when left out; an empty list reads nothing. */
  kinds?: readonly RecentKind[];
  /** Rows to return, newest first. Defaults to RECENT_KEEP, at most RECENT_MAX. */
  limit?: number;
};

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return RECENT_KEEP;
  return Math.min(RECENT_MAX, Math.max(1, Math.floor(limit)));
}

/**
 * This person's recently opened records, newest first, across kinds unless
 * `kinds` narrows them. The rows only name records: a reader looks them up
 * and skips any deleted since (and Template tasks) before trimming to what
 * it shows, so it asks for more than it shows.
 */
export async function readRecentsIn(db: RecentViewDb, userId: string, options: ReadRecentsOptions = {}): Promise<RecentEntry[]> {
  if (!isId(userId)) return [];
  const kinds = options.kinds?.filter(isRecentKind);
  if (kinds && kinds.length === 0) return [];
  return db.recentView.findMany({
    where: { userId, ...(kinds ? { kind: { in: [...new Set(kinds)] } } : {}) },
    orderBy: NEWEST_FIRST,
    take: clampLimit(options.limit),
    select: { kind: true, recordId: true, viewedAt: true },
  });
}
