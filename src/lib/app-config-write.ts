import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CONFLICT_MESSAGE } from "@/lib/action-result";

/**
 * Write one column of the AppConfig singleton with optimistic concurrency.
 * `expectedVersion` is the `updatedAt` the editor loaded (null when the row
 * did not exist yet). Returns the new version. Throws CONFLICT_MESSAGE when
 * the row moved on — the two settings tabs write different columns, but a
 * stale tab must still not overwrite a newer save of its own column.
 */
export async function saveAppConfigAtVersion(
  expectedVersion: string | null,
  data: Prisma.AppConfigUpdateInput & Prisma.AppConfigCreateInput,
): Promise<string> {
  const existing = await prisma.appConfig.findUnique({ where: { id: "singleton" }, select: { updatedAt: true } });

  if (!existing) {
    if (expectedVersion !== null) throw new Error(CONFLICT_MESSAGE);
    const created = await prisma.appConfig.create({ data: { ...data, id: "singleton" } });
    return created.updatedAt.toISOString();
  }

  const expected = expectedVersion ? new Date(expectedVersion) : null;
  if (!expected || Number.isNaN(expected.getTime()) || expected.getTime() !== existing.updatedAt.getTime()) {
    throw new Error(CONFLICT_MESSAGE);
  }
  const r = await prisma.appConfig.updateMany({ where: { id: "singleton", updatedAt: expected }, data });
  if (r.count === 0) throw new Error(CONFLICT_MESSAGE);
  const after = await prisma.appConfig.findUniqueOrThrow({ where: { id: "singleton" }, select: { updatedAt: true } });
  return after.updatedAt.toISOString();
}
