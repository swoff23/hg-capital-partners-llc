import "server-only";
import { revalidatePath } from "next/cache";
import { BlobNotFoundError, del, head, type HeadBlobResult } from "@vercel/blob";
import { Prisma, type Visibility } from "@prisma/client";
import { acceptsContractorUpload } from "@/lib/attachments/access";
import { PREVIEW_RULE, UPLOAD_RULES, fileKindForType, filenameForType, normalizeContentType } from "@/lib/attachments/content-types";
import { durationHint, pixelHint } from "@/lib/attachments/limits";
import { isPrivateStoreUrl, storeIdFromToken, storedUploadRole, type UploadRole } from "@/lib/attachments/paths";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { taskPrincipal, type PortalPrincipal } from "@/lib/portal/session";
import * as core from "./core";

/**
 * Files on a task (docs/specs/uploads-photos.md): the record step for what
 * the browser just uploaded straight to Vercel Blob, the contractor's version
 * of it with the job rules, and deleting and renaming. Moved out of
 * ./service.ts, which re-exports these names, so every importer keeps its
 * path. Server actions authenticate and parse, then call in; the token route
 * (src/app/api/blob/[kind]/route.ts) calls contractorUploadRefusal when it
 * mints a contractor's token.
 */

/**
 * What the browser sends once an upload finishes: where it put the file and
 * what to call it, never what the file is. Size and type come from Blob's
 * own head(); width, height and duration are display hints only.
 */
export interface UploadedFile {
  pathname: string;
  filename: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  thumbPathname?: string | null;
  posterPathname?: string | null;
  /** A contractor's file: when it joined the phone's queue (ISO), for the late-upload rule. */
  queuedAt?: string | null;
}

interface BlobAuth {
  token: string;
  storeId: string;
}

function blobAuth(): BlobAuth {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const storeId = storeIdFromToken(token);
  if (!token || !storeId) throw new core.TaskRuleError("File uploads need a Blob store, and none is connected yet.");
  return { token, storeId };
}

/** Every path one record request names. */
const requestPaths = (input: UploadedFile) => [input.pathname, input.thumbPathname, input.posterPathname].filter((x): x is string => !!x);

/** Rows using any of these paths, in any of the three columns. */
const usingPaths = (paths: string[]): Prisma.TaskAttachmentWhereInput => ({
  OR: [{ pathname: { in: paths } }, { thumbPathname: { in: paths } }, { posterPathname: { in: paths } }],
});

/**
 * Best effort: delete blobs a refused record step named, so they don't sit in
 * the store unrecorded. A client token stays good for an hour after it's
 * minted and can't be held to private access, so refusals would otherwise
 * pile up. Only paths in this task's folder that no row points at: a recorded
 * file is never deleted, and an unrecorded path carries Blob's random suffix,
 * so only its uploader can name it.
 */
async function discardUnrecorded(taskId: string, paths: (string | null | undefined)[], auth: BlobAuth): Promise<void> {
  const mine = paths.filter((p): p is string => !!p && storedUploadRole(p, taskId) !== null);
  if (!mine.length) return;
  try {
    const rows = await prisma.taskAttachment.findMany({
      where: usingPaths(mine),
      select: { pathname: true, thumbPathname: true, posterPathname: true },
    });
    const used = new Set(rows.flatMap((r) => [r.pathname, r.thumbPathname, r.posterPathname]));
    const loose = mine.filter((p) => !used.has(p));
    if (loose.length) await del(loose, { token: auth.token });
  } catch (err) {
    logError("tasks:attachments:discard", err, { taskId, paths: mine });
  }
}

/** Run one record step. When it's refused, discard what the request uploaded, then rethrow. */
async function discardingOnRefusal<T>(taskId: string, input: UploadedFile, auth: BlobAuth, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof core.TaskRuleError) await discardUnrecorded(taskId, requestPaths(input), auth);
    throw err;
  }
}

/**
 * Check one uploaded blob against what this task may hold, with our token:
 * our private store, this task's folder and role, an allowed type for its
 * kind, under that kind's cap. Returns Blob's own url, size and type. The
 * caller has already checked that no row uses the path; a refusal here is
 * cleaned up by discardingOnRefusal.
 */
async function verifyBlob(taskId: string, pathname: string, role: UploadRole, auth: BlobAuth) {
  if (storedUploadRole(pathname, taskId) !== role) throw new core.TaskRuleError("That file isn't in this task's folder.");
  let blob: HeadBlobResult;
  try {
    blob = await head(pathname, { token: auth.token });
  } catch (err) {
    if (err instanceof BlobNotFoundError) throw new core.TaskRuleError("That upload didn't finish. Try again.");
    throw err;
  }
  if (blob.pathname !== pathname || !isPrivateStoreUrl(blob.url, auth.storeId, pathname)) {
    // Uploaded with access "public": delete that exact blob by its URL, since
    // a pathname alone may name the private one.
    if (blob.pathname === pathname) {
      await del(blob.url, { token: auth.token }).catch((err) => logError("tasks:attachments:discard", err, { pathname }));
    }
    throw new core.TaskRuleError("That file isn't in our private storage.");
  }
  const contentType = normalizeContentType(blob.contentType);
  const kind = fileKindForType(contentType);
  const rule = role === "orig" ? kind && UPLOAD_RULES[kind] : PREVIEW_RULE.contentTypes.includes(contentType) ? PREVIEW_RULE : null;
  if (!rule) throw new core.TaskRuleError("That type of file can't be attached.");
  if (blob.size > rule.maxBytes) {
    throw new core.TaskRuleError(`That file is over the ${Math.round(rule.maxBytes / (1024 * 1024))} MB limit.`);
  }
  return { url: blob.url, size: blob.size, contentType, kind };
}

/** The verified metadata for core.recordAttachment, built from head(), not the browser. */
async function verifiedAttachment(taskId: string, input: UploadedFile, auth: BlobAuth): Promise<core.AttachmentMeta> {
  const paths = requestPaths(input);
  if (new Set(paths).size !== paths.length) throw new core.TaskRuleError("Each file needs its own path.");
  const taken = await prisma.taskAttachment.findFirst({ where: usingPaths(paths), select: { id: true } });
  if (taken) throw new core.TaskRuleError("That file is already attached.");

  const orig = await verifyBlob(taskId, input.pathname, "orig", auth);
  const thumb = input.thumbPathname ? await verifyBlob(taskId, input.thumbPathname, "thumb", auth) : null;
  // A poster is a frame of a video; on anything else it's dropped, blob and all.
  const poster = input.posterPathname && orig.kind === "video" ? await verifyBlob(taskId, input.posterPathname, "poster", auth) : null;
  if (input.posterPathname && !poster) await discardUnrecorded(taskId, [input.posterPathname], auth);
  return {
    url: orig.url,
    pathname: input.pathname,
    // The name agrees with the verified type, so "Invoice.html" stored as text/plain is "Invoice.txt".
    filename: filenameForType(input.filename, orig.contentType),
    size: orig.size,
    contentType: orig.contentType,
    width: pixelHint(input.width),
    height: pixelHint(input.height),
    durationSec: durationHint(input.durationSec),
    thumbPathname: thumb ? input.thumbPathname : null,
    posterPathname: poster ? input.posterPathname : null,
  };
}

/** Two requests recording the same blob at once: the unique pathname lets one through. */
function alreadyAttached(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new core.TaskRuleError("That file is already attached.");
  }
  throw err;
}

/**
 * Staff: record a file the browser just uploaded straight to Blob. Shared
 * by default (D15); pass `visibility: "INTERNAL"` for a private note.
 * Returns the new attachment's id.
 */
export async function recordTaskAttachment(
  taskId: string,
  input: UploadedFile,
  p: core.Principal,
  opts: { standalone?: boolean; visibility?: Visibility } = {},
): Promise<{ id: string }> {
  if (p.kind === "contractor") throw new core.TaskRuleError("Contractor uploads go through recordPortalAttachment.");
  const auth = blobAuth();
  const att = await discardingOnRefusal(taskId, input, auth, async () => {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new core.TaskRuleError("That task no longer exists.");
    const meta = await verifiedAttachment(taskId, input, auth);
    return prisma
      .$transaction((tx) =>
        core.recordAttachment(tx, taskId, meta, p, { visibility: opts.visibility ?? "SHARED", standalone: opts.standalone }),
      )
      .catch(alreadyAttached);
  });
  revalidatePath(`/tasks/${taskId}`);
  return { id: att.id };
}

/**
 * Why this contractor can't add a file to the task right now, or null when
 * they can. They need live access to the job (core.assertContractorAccess).
 * Then the job must be active, or Done or in Review because they marked it so
 * within the hour (attachments/access.ts), which also keeps "Add photo/video"
 * working while HG reviews. A file queued before Mark done (`queuedAt`, from
 * the phone's outbox) still records, and still gets a token, within a day of
 * it: the late-upload rule, uploads question 4. `atMint` once held a token
 * back from a finished job; with the rule above a resumed upload needs one
 * after Mark done, so it no longer changes the answer.
 */
export async function contractorUploadRefusal(
  taskId: string,
  contactId: string,
  opts: { atMint?: boolean; queuedAt?: string | null } = {},
  db: core.Tx = prisma,
  now = new Date(),
): Promise<string | null> {
  try {
    await core.assertContractorAccess(db, taskId, contactId);
  } catch (err) {
    if (err instanceof core.TaskRuleError) return err.message;
    throw err;
  }
  const task = await db.task.findUnique({ where: { id: taskId }, select: { status: true, completedByContactId: true, completedAt: true } });
  if (!task) return "That job no longer exists.";
  const lastReview =
    task.status === "DONE" || task.status === "REVIEW"
      ? await db.taskEvent.findFirst({
          where: { taskId, kind: "STATUS", data: { path: ["to"], equals: "REVIEW" } },
          orderBy: { createdAt: "desc" },
          select: { actorContactId: true, createdAt: true },
        })
      : null;
  return acceptsContractorUpload(task, lastReview, contactId, now, opts.queuedAt) ? null : "This job is closed.";
}

/**
 * Contractor: the portal's record step, for uploads made through
 * /api/blob/portal-task-upload. Same checks as staff, plus the job rules
 * above, rechecked inside the transaction. Always Shared.
 */
export async function recordPortalAttachment(
  taskId: string,
  input: UploadedFile,
  portal: PortalPrincipal,
  opts: { standalone?: boolean } = {},
): Promise<{ id: string }> {
  const auth = blobAuth();
  const queuedAt = input.queuedAt ?? null;
  // A refusal here (job closed, access gone, the hour after Mark done run out) discards the uploads too: they can never be recorded.
  const att = await discardingOnRefusal(taskId, input, auth, async () => {
    const early = await contractorUploadRefusal(taskId, portal.contactId, { queuedAt });
    if (early) throw new core.TaskRuleError(early);
    const meta = await verifiedAttachment(taskId, input, auth);
    return prisma
      .$transaction(async (tx) => {
        const refusal = await contractorUploadRefusal(taskId, portal.contactId, { queuedAt }, tx);
        if (refusal) throw new core.TaskRuleError(refusal);
        return core.recordAttachment(tx, taskId, meta, taskPrincipal(portal), { visibility: "SHARED", standalone: opts.standalone });
      })
      .catch(alreadyAttached);
  });
  revalidatePath(`/tasks/${taskId}`);
  return { id: att.id };
}

/**
 * Staff only: removes the row, then the blobs, for good. A file that was
 * already posted (on a comment or a line of its own) leaves an ATTACHMENT
 * event with `data.removed` when `p` says who removed it ("Connor removed
 * quote.pdf"), so the line that said it was added still makes sense; a
 * draft nobody saw leaves nothing, and neither does a call without `p`
 * (the composer unreadying its own draft).
 */
export async function deleteTaskAttachment(attachmentId: string, p?: core.Principal): Promise<void> {
  const att = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!att) return;
  await prisma.$transaction(async (tx) => {
    await tx.taskAttachment.delete({ where: { id: attachmentId } });
    if (p && att.eventId !== null) {
      await core.addEvent(tx, att.taskId, p, {
        kind: "ATTACHMENT",
        visibility: att.visibility,
        audienceContactId: att.audienceContactId,
        data: { attachmentId: att.id, filename: att.filename, removed: true },
      });
    }
  });
  // A LINK has no blob. Older rows may still point at a public blob; del() takes either URL.
  const blobs = [att.url, att.thumbPathname, att.posterPathname].filter((x): x is string => !!x);
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (blobs.length && token) {
    await del(blobs, { token }).catch((err) => logError("tasks:attachments:delete", err, { attachmentId }));
  }
  revalidatePath(`/tasks/${att.taskId}`);
}

/** The name a renamed file is saved under: trimmed, agreeing with its stored type, at most 255 characters. */
export function renamedFile(name: string, contentType: string | null): string {
  return filenameForType(name.trim(), contentType);
}

/**
 * Staff only: gives a file a new name (Rename in a file row's menu). The
 * extension stays the type's, so a rename can't turn a PDF into something
 * else. A link keeps whatever the person types. Returns the saved name.
 */
export async function renameTaskAttachment(attachmentId: string, name: string): Promise<{ filename: string }> {
  const att = await prisma.taskAttachment.findUnique({ where: { id: attachmentId }, select: { taskId: true, kind: true, contentType: true } });
  if (!att) throw new core.TaskRuleError("That file no longer exists.");
  const next = att.kind === "LINK" ? name.trim().slice(0, 255) : renamedFile(name, att.contentType);
  if (!next) throw new core.TaskRuleError("Enter a name.");
  await prisma.taskAttachment.update({ where: { id: attachmentId }, data: { filename: next } });
  revalidatePath(`/tasks/${att.taskId}`);
  return { filename: next };
}
