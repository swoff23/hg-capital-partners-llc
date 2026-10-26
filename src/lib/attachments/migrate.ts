import "server-only";
import { del, get, put } from "@vercel/blob";
import { countStillPublic, storeIdFromToken } from "@/lib/attachments/paths";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";

/**
 * One-time move of documents from public to private Blob storage.
 *
 * Documents uploaded before the switch are public blobs: anyone holding the
 * URL can read a mortgage statement. For each attachment this checks whether
 * the blob is already private (a private `get` succeeds); if not it streams
 * the public blob into a new private one, points the row at it, and deletes
 * the public copy. Idempotent — safe to run again; already-private rows are
 * skipped. Runs where BLOB_READ_WRITE_TOKEN exists (i.e. on Vercel).
 */
export interface MigrationReport {
  scanned: number;
  alreadyPrivate: number;
  moved: number;
  failed: { id: string; filename: string; error: string }[];
}

type Row = { id: string; url: string; pathname: string; filename: string; contentType: string | null };

async function moveOne(row: Row, update: (id: string, url: string, pathname: string) => Promise<unknown>): Promise<"private" | "moved"> {
  const priv = await get(row.url, { access: "private" }).catch(() => null);
  if (priv && priv.statusCode === 200) {
    priv.stream.cancel().catch(() => {});
    return "private";
  }
  const pub = await get(row.url, { access: "public" });
  if (!pub || pub.statusCode !== 200) throw new Error("public blob not readable");
  const copy = await put(row.pathname, pub.stream, {
    access: "private",
    addRandomSuffix: true,
    contentType: row.contentType || pub.headers.get("content-type") || undefined,
  });
  await update(row.id, copy.url, copy.pathname);
  try {
    await del(row.url);
  } catch (err) {
    logError("attachments:migrate:del", err, { id: row.id });
  }
  return "moved";
}

export async function migrateDocumentsToPrivate(): Promise<MigrationReport> {
  const report: MigrationReport = { scanned: 0, alreadyPrivate: 0, moved: 0, failed: [] };

  // Links (kind LINK) have no bytes in Blob, so there is nothing to move.
  const taskRows = await prisma.taskAttachment.findMany({
    where: { url: { not: null }, pathname: { not: null } },
    select: { id: true, url: true, pathname: true, filename: true, contentType: true },
  });
  const tasks = taskRows.flatMap((r) => (r.url && r.pathname ? [{ ...r, url: r.url, pathname: r.pathname }] : []));
  const props = await prisma.propertyAttachment.findMany({
    select: { id: true, url: true, pathname: true, filename: true, contentType: true },
  });

  const run = async (rows: Row[], update: (id: string, url: string, pathname: string) => Promise<unknown>) => {
    for (const row of rows) {
      report.scanned += 1;
      try {
        const r = await moveOne(row, update);
        if (r === "private") report.alreadyPrivate += 1;
        else report.moved += 1;
      } catch (err) {
        logError("attachments:migrate", err, { id: row.id, filename: row.filename });
        report.failed.push({ id: row.id, filename: row.filename, error: err instanceof Error ? err.message : String(err) });
      }
    }
  };

  await run(tasks, (id, url, pathname) => prisma.taskAttachment.update({ where: { id }, data: { url, pathname } }));
  await run(props, (id, url, pathname) => prisma.propertyAttachment.update({ where: { id }, data: { url, pathname } }));
  return report;
}

/**
 * How many files are still public, for the Storage page's one status line
 * (task attachments and property documents together). Null where no store is
 * connected: there is nothing to compare against.
 */
export async function stillPublicCount(): Promise<number | null> {
  const storeId = storeIdFromToken(getEnv().BLOB_READ_WRITE_TOKEN);
  if (!storeId) return null;
  const [tasks, props] = await Promise.all([
    prisma.taskAttachment.findMany({ where: { url: { not: null } }, select: { url: true, pathname: true } }),
    prisma.propertyAttachment.findMany({ select: { url: true, pathname: true } }),
  ]);
  return countStillPublic(tasks, storeId) + countStillPublic(props, storeId);
}
