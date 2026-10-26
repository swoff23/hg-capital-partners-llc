import "server-only";
import { prisma } from "@/lib/db";
import { ConflictError } from "@/lib/action-result";
import { blobVersion } from "@/lib/app-config-version";

/** The two Settings blobs, each saved on its own version. */
export type AppConfigColumn = "capexRules" | "moveInFormSchema";

/** A save that finds the row moved by the other tab's save retries this many times before giving up. */
const ATTEMPTS = 3;

/**
 * Write one column of the AppConfig singleton against the version the editor
 * loaded (forms 2.12, "Separate Settings versions"). `expectedVersion` is that
 * column's `blobVersion` when the editor was rendered (null when nothing had
 * been saved into it); it is compared with the column as it is now, so saving
 * the CapEx rules never conflicts the move-in form, and the other way round.
 * Returns the new version.
 *
 * A column that changed since throws a `ConflictError` naming who saved it
 * (`AppConfig.updatedBy`) and when. The write itself is pinned to the row's
 * `updatedAt` as just read, so two saves in the same moment can't both win; if
 * the other tab saved its own column in between, the row moved but our column
 * didn't, and the write is read and tried again.
 */
export async function saveAppConfigColumn(
  column: AppConfigColumn,
  expectedVersion: string | null,
  value: object,
  updatedBy: string,
): Promise<string> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const existing = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
    if (!existing) {
      // The editor had a version, and the row is gone: someone reset it.
      if (expectedVersion !== null) throw new ConflictError({ fields: [column], at: new Date() });
      await prisma.appConfig.create({ data: { id: "singleton", [column]: value, updatedBy } });
      return blobVersion(value)!;
    }
    if (blobVersion(existing[column]) !== expectedVersion) {
      throw new ConflictError({ fields: [column], by: existing.updatedBy, at: existing.updatedAt });
    }
    const written = await prisma.appConfig.updateMany({
      where: { id: "singleton", updatedAt: existing.updatedAt },
      data: { [column]: value, updatedBy },
    });
    if (written.count === 1) return blobVersion(value)!;
  }
  throw new Error("Settings are being saved from somewhere else right now. Try again.");
}
