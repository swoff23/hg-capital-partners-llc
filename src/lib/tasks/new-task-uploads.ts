import "server-only";
import { revalidatePath } from "next/cache";
import { BlobNotFoundError, del, head, type HeadBlobResult } from "@vercel/blob";
import { PREVIEW_RULE, UPLOAD_RULES, fileKindForType, filenameForType, normalizeContentType } from "@/lib/attachments/content-types";
import { blobSizeRefusal, durationHint, pixelHint } from "@/lib/attachments/limits";
import { isPrivateStoreUrl, storeIdFromToken, storedNewTaskUploadRole, type UploadRole } from "@/lib/attachments/paths";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { TaskRuleError } from "./core";
import { NEW_TASK_FILES_FULL, NOT_THIS_FORM, formFull, formTakenByOther, holdFile, isFormId, releaseFile, releaseForm, sweepHeld } from "./new-task-files";

/**
 * New task's files (docs/specs/new-task-checklist-photos.md, section 3): the record step for a file the form just
 * uploaded, Remove on a tile, Discard and Clear, the token route's check and the every-minute sweep. The rules on the
 * database are new-task-files.ts; this adds Blob (head() before a row is written, del() after one goes) and the page
 * refresh. Server actions authenticate and parse, then call in.
 */

/** What the browser sends once a file is up: where it put it and what to call it, never what it is. */
export interface NewTaskUploadInput {
  pathname: string;
  filename: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  thumbPathname?: string | null;
  posterPathname?: string | null;
}

interface BlobAuth {
  token: string;
  storeId: string;
}

function blobAuth(): BlobAuth {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  const storeId = storeIdFromToken(token);
  if (!token || !storeId) throw new TaskRuleError("File uploads need a Blob store, and none is connected yet.");
  return { token, storeId };
}

/** One blob in this form's folder, in our private store, of a type and size its role allows. */
async function verifyBlob(formId: string, pathname: string, role: UploadRole, auth: BlobAuth) {
  if (storedNewTaskUploadRole(pathname, formId) !== role) throw new TaskRuleError(NOT_THIS_FORM);
  let blob: HeadBlobResult;
  try {
    blob = await head(pathname, { token: auth.token });
  } catch (err) {
    if (err instanceof BlobNotFoundError) throw new TaskRuleError("That upload didn't finish. Try again.");
    throw err;
  }
  if (blob.pathname !== pathname || !isPrivateStoreUrl(blob.url, auth.storeId, pathname)) {
    if (blob.pathname === pathname) await del(blob.url, { token: auth.token }).catch(() => {});
    throw new TaskRuleError("That file isn't in our private storage.");
  }
  const contentType = normalizeContentType(blob.contentType);
  const kind = fileKindForType(contentType);
  const rule = role === "orig" ? kind && UPLOAD_RULES[kind] : PREVIEW_RULE.contentTypes.includes(contentType) ? PREVIEW_RULE : null;
  if (!rule) throw new TaskRuleError("That type of file can't be attached.");
  const tooBig = blobSizeRefusal(blob.size, rule.maxBytes);
  if (tooBig) throw new TaskRuleError(tooBig);
  return { url: blob.url, size: blob.size, contentType, kind };
}

const KIND = { image: "IMAGE", video: "VIDEO", file: "FILE" } as const;

/** Best effort: blobs a refused record step named, in this form's folder, that no row holds. Only their uploader can name them. */
async function discardUnheld(formId: string, paths: (string | null | undefined)[], auth: BlobAuth): Promise<void> {
  const mine = paths.filter((p): p is string => !!p && storedNewTaskUploadRole(p, formId) !== null);
  if (!mine.length) return;
  try {
    const held = await prisma.newTaskUpload.findMany({
      where: { OR: [{ pathname: { in: mine } }, { thumbPathname: { in: mine } }, { posterPathname: { in: mine } }] },
      select: { pathname: true, thumbPathname: true, posterPathname: true },
    });
    const used = new Set(held.flatMap((r) => [r.pathname, r.thumbPathname, r.posterPathname]));
    const loose = mine.filter((p) => !used.has(p));
    if (loose.length) await del(loose, { token: auth.token });
  } catch (err) {
    logError("tasks:new-task-uploads:discard", err, { formId }, { level: "warning" });
  }
}

async function deleteBlobs(blobs: string[], where: string): Promise<void> {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (!blobs.length || !token) return;
  await del(blobs, { token }).catch((err) => logError(where, err, { count: blobs.length }, { level: "warning" }));
}

/**
 * The record step for New task's upload queue: the file is up, so check it with head() and hold it for Create, or
 * attach it to the task Create already made. Returns the held row's id.
 */
export async function recordNewTaskUpload(userId: string, formId: string, input: NewTaskUploadInput): Promise<{ id: string }> {
  if (!isFormId(formId)) throw new TaskRuleError(NOT_THIS_FORM);
  const existing = await prisma.newTaskUpload.findUnique({ where: { pathname: input.pathname }, select: { id: true, userId: true, formId: true } });
  if (existing) {
    if (existing.userId !== userId || existing.formId !== formId) throw new TaskRuleError(NOT_THIS_FORM);
    return { id: existing.id };
  }
  const auth = blobAuth();
  const paths = [input.pathname, input.thumbPathname, input.posterPathname];
  try {
    const orig = await verifyBlob(formId, input.pathname, "orig", auth);
    if (!orig.kind) throw new TaskRuleError("That type of file can't be attached.");
    const thumb = input.thumbPathname ? await verifyBlob(formId, input.thumbPathname, "thumb", auth) : null;
    // A poster is a frame of a video; on anything else it's dropped, blob and all.
    const poster = input.posterPathname && orig.kind === "video" ? await verifyBlob(formId, input.posterPathname, "poster", auth) : null;
    if (input.posterPathname && !poster) await discardUnheld(formId, [input.posterPathname], auth);
    const held = await prisma.$transaction((tx) =>
      holdFile(tx, userId, formId, {
        pathname: input.pathname,
        url: orig.url,
        filename: filenameForType(input.filename, orig.contentType),
        size: orig.size,
        contentType: orig.contentType,
        kind: KIND[orig.kind!],
        thumbPathname: thumb ? input.thumbPathname! : null,
        posterPathname: poster ? input.posterPathname! : null,
        width: pixelHint(input.width) ?? null,
        height: pixelHint(input.height) ?? null,
        durationSec: durationHint(input.durationSec) ?? null,
      }),
    );
    if (held.taskId) revalidatePath(`/tasks/${held.taskId}`);
    return { id: held.id };
  } catch (err) {
    if (err instanceof TaskRuleError) await discardUnheld(formId, paths, auth);
    throw err;
  }
}

/** Why the token route won't mint for this form, or null: someone else's form, or a full one. */
export async function newTaskTokenRefusal(formId: string, userId: string): Promise<{ message: string; final: boolean } | null> {
  if (!isFormId(formId)) return { message: NOT_THIS_FORM, final: true };
  if (await formTakenByOther(prisma, formId, userId)) return { message: NOT_THIS_FORM, final: true };
  if (await formFull(prisma, formId, userId)) return { message: NEW_TASK_FILES_FULL, final: true };
  return null;
}

/** Remove on a tile before Create: the file is gone for good, nothing left anywhere. */
export async function removeNewTaskUpload(userId: string, id: string): Promise<void> {
  const blobs = await prisma.$transaction((tx) => releaseFile(tx, userId, id));
  await deleteBlobs(blobs, "tasks:new-task-uploads:remove");
}

/** Discard changes, or Clear on the draft line: every file the form holds, unless it already made its task. */
export async function discardNewTaskUploads(userId: string, formId: string): Promise<void> {
  const blobs = await prisma.$transaction((tx) => releaseForm(tx, userId, formId));
  await deleteBlobs(blobs, "tasks:new-task-uploads:discard");
}

/** The every-minute run: files on drafts that expired, with their blobs. Returns how many went. */
export async function sweepNewTaskUploads(now: Date = new Date()): Promise<number> {
  const blobs = await prisma.$transaction((tx) => sweepHeld(tx, now));
  await deleteBlobs(blobs, "tasks:new-task-uploads:sweep");
  return blobs.length;
}
