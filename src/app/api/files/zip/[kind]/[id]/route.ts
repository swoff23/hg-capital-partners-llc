import { get } from "@vercel/blob";
import { downloadZip } from "client-zip";
import { NextResponse } from "next/server";
import { ZIP_VIEWERS, mayDownloadZip } from "@/lib/attachments/access";
import { ERROR_HEADERS } from "@/lib/attachments/headers";
import { zipEntryNames, zipFileName } from "@/lib/attachments/zip";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { contentDisposition } from "@/lib/http";
import { logError } from "@/lib/log";
import { staffReturnPath, withNext } from "@/lib/next-path";
import { shortAddress } from "@/lib/normalize";
import { isDraftUpload } from "@/lib/tasks/media";

export const dynamic = "force-dynamic";

/**
 * Download all (docs/specs/uploads-photos.md 2.5): one ZIP of a record's
 * files, named for the place and the job ("56 Tamarack St Fix porch light.zip"),
 * streamed straight from Blob through client-zip, so a few hundred megabytes
 * never sit in memory.
 *
 *   /api/files/zip/task/<taskId>   every posted photo, video and document on the task
 *
 * Staff only (attachments/access.ts ZIP_VIEWERS): a contractor never gets a
 * ZIP of anything, and a kind that isn't listed is a 404. Drafts waiting in
 * someone's composer are left out, as the task page leaves them out. Files
 * uploaded before documents went private may still be public blobs, so each
 * is tried private first, then public, as /api/files does. A file that can't
 * be fetched is skipped rather than ending the archive. Links have no bytes
 * here and aren't in it.
 */

const fail = (message: string, status: number) => new NextResponse(message, { status, headers: ERROR_HEADERS });

/** A stream of one blob's bytes, or null when the store doesn't have it. */
async function open(source: string, token: string | undefined): Promise<ReadableStream<Uint8Array> | null> {
  for (const access of ["private", "public"] as const) {
    const blob = await get(source, { access, token }).catch(() => null);
    if (blob && blob.statusCode === 200) return blob.stream;
  }
  return null;
}

export async function GET(req: Request, ctx: RouteContext<"/api/files/zip/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  if (!Object.hasOwn(ZIP_VIEWERS, kind)) return fail("Not found", 404);
  const user = await getCurrentUser();
  if (!user) {
    // A link opened in the browser goes to sign-in and comes back; a fetch keeps the plain 401.
    if (req.headers.get("sec-fetch-mode") === "navigate") {
      const url = new URL(req.url);
      return NextResponse.redirect(new URL(withNext("/login", staffReturnPath(url.pathname + url.search)), url));
    }
    return fail("Unauthorized", 401);
  }
  if (!mayDownloadZip(kind, "staff")) return fail("Not found", 404);

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      title: true,
      property: { select: { address: true } },
      attachments: {
        where: { deletedAt: null, kind: { in: ["IMAGE", "VIDEO", "FILE"] }, url: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { filename: true, url: true, createdAt: true, eventId: true, asanaGid: true, uploadedByUserId: true },
      },
    },
  });
  if (!task) return fail("Not found", 404);
  const files = task.attachments.filter((a) => !isDraftUpload(a) && a.url);
  if (files.length === 0) return fail("Nothing to download", 404);

  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const names = zipEntryNames(files.map((f) => f.filename));
  async function* entries() {
    for (const [i, f] of files.entries()) {
      try {
        const input = await open(f.url!, token);
        if (input) yield { name: names[i], lastModified: f.createdAt, input };
      } catch (err) {
        logError("files:zip", err, { taskId: id });
      }
    }
  }

  const zip = downloadZip(entries());
  const name = zipFileName({ address: task.property ? shortAddress(task.property.address) : null, title: task.title });
  return new NextResponse(zip.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(name, "attachment"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
