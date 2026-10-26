import "server-only";
import { revalidatePath } from "next/cache";
import { BlobNotFoundError, del, head, type HeadBlobResult } from "@vercel/blob";
import { Prisma, type Task, type TaskStatus, type User, type Visibility } from "@prisma/client";
import { acceptsContractorUpload } from "@/lib/attachments/access";
import { PREVIEW_RULE, UPLOAD_RULES, fileKindForType, filenameForType, normalizeContentType } from "@/lib/attachments/content-types";
import { durationHint, pixelHint } from "@/lib/attachments/limits";
import { isPrivateStoreUrl, storeIdFromToken, storedUploadRole, type UploadRole } from "@/lib/attachments/paths";
import { prisma } from "@/lib/db";
import { TEMPLATE_BUCKET } from "@/lib/config";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { taskPrincipal, type PortalPrincipal } from "@/lib/portal/session";
import type { UnitRename } from "@/lib/property-types";
import { activeTask, isActiveStatus } from "@/lib/task-scope";
import * as core from "./core";

/**
 * Task domain for the app: every staff, system and public-form task write
 * goes through here. Server actions authenticate and parse, then call in.
 * The rules themselves (who may do what, timeline events, contractor access,
 * repeats, which emails go out) live in ./core, shared with the contractor
 * portal and the Asana importer. This layer adds the transaction, then
 * revalidates every page that shows the task once it commits.
 */

export type { ChecklistSnapshot, Principal, NewTaskInput, TaskPatch, StatusOptions } from "./core";
export { AssigneeChangedError, TaskChangedError, TaskRuleError, bucketFor } from "./core";
export { TEMPLATE_BUCKET };

/** The signed-in staff user as the actor on a write. */
export function staffPrincipal(user: Pick<User, "id" | "name" | "email">): core.Principal {
  return { kind: "staff", userId: user.id, label: user.name ?? user.email };
}

/** An automated writer: "Property reminder", "Move-in form". */
export function systemPrincipal(label: string): core.Principal {
  return { kind: "system", label };
}

function revalidateTask(t: { id: string; propertyId?: string | null; dealId?: string | null } | null, extraPropertyIds: (string | null | undefined)[] = []): void {
  revalidatePath("/tasks");
  revalidatePath("/");
  if (!t) return;
  revalidatePath(`/tasks/${t.id}`);
  for (const p of new Set([t.propertyId, ...extraPropertyIds])) if (p) revalidatePath(`/properties/${p}`);
  if (t.dealId) revalidatePath(`/deals/${t.dealId}`);
}

export async function createTask(input: core.NewTaskInput, p: core.Principal): Promise<Task> {
  const task = await prisma.$transaction((tx) => core.createTask(tx, input, p));
  revalidateTask(task);
  return task;
}

/**
 * Any status change. A refused one (the task moved on, or is gone) still
 * refreshes the pages, so the screen that sent it shows where the task is.
 */
export async function setTaskStatus(id: string, to: TaskStatus, p: core.Principal, opts: core.StatusOptions = {}): Promise<core.StatusResult> {
  try {
    const result = await prisma.$transaction((tx) => core.setStatus(tx, id, to, p, opts));
    revalidateTask(result.task);
    return result;
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTask({ id });
    throw err;
  }
}

/**
 * Field edits. No-op when the task doesn't exist. A refused one (someone
 * reassigned it first) still refreshes the pages, so the screen that sent it
 * shows who has the task now.
 */
export async function patchTask(id: string, patch: core.TaskPatch, p: core.Principal): Promise<void> {
  const before = await prisma.task.findUnique({ where: { id }, select: { propertyId: true } });
  if (!before) return;
  try {
    const after = await prisma.$transaction((tx) => core.patchTask(tx, id, patch, p));
    revalidateTask(after, [before.propertyId]);
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTask({ id });
    throw err;
  }
}

/**
 * A unit renamed on its property: the tasks that name it follow
 * (core.renameTaskUnits). Runs inside the property save's transaction, so
 * the units and their tasks change together; pass the ids it returns to
 * revalidateTasks once that commits.
 */
export function renameTaskUnits(tx: core.Tx, propertyId: string, renames: readonly UnitRename[], p: core.Principal): Promise<string[]> {
  return core.renameTaskUnits(tx, propertyId, renames, p);
}

/** Refresh the task lists and these tasks' pages after a write made from another page. */
export function revalidateTasks(ids: readonly string[]): void {
  if (ids.length === 0) return;
  revalidateTask(null);
  for (const id of ids) revalidatePath(`/tasks/${id}`);
}

/**
 * Staff only: removes the task for good, with its timeline, checklist,
 * files, access rows and queued emails (all cascade), then its blobs once
 * the delete has committed. A task on a deal leaves a line on the deal's
 * timeline. No-op when the task doesn't exist.
 */
export async function deleteTask(id: string, p: core.Principal): Promise<void> {
  if (p.kind !== "staff") throw new core.TaskRuleError("Only staff can delete a task.");
  const removed = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        propertyId: true,
        dealId: true,
        attachments: { select: { url: true, thumbPathname: true, posterPathname: true } },
      },
    });
    if (!task) return null;
    await tx.task.delete({ where: { id } });
    if (task.dealId) {
      await tx.dealNote.create({ data: { dealId: task.dealId, body: `Task deleted: ${task.title}  ·  ${p.label}`, noteDate: new Date(), source: "change" } });
    }
    return task;
  });
  if (!removed) return;
  // A LINK has no blob. Older rows may still point at a public blob; del() takes either URL.
  const blobs = removed.attachments.flatMap((a) => [a.url, a.thumbPathname, a.posterPathname]).filter((x): x is string => !!x);
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (blobs.length && token) {
    await del(blobs, { token }).catch((err) => logError("tasks:delete:blobs", err, { taskId: id, count: blobs.length }));
  }
  revalidateTask(removed);
}

export async function addTaskComment(taskId: string, input: core.CommentInput, p: core.Principal): Promise<void> {
  await prisma.$transaction((tx) => core.addComment(tx, taskId, input, p));
  revalidatePath(`/tasks/${taskId}`);
}

export async function setChecklistItem(itemId: string, done: boolean, p: core.Principal): Promise<void> {
  const item = await prisma.$transaction((tx) => core.setChecklistItem(tx, itemId, done, p));
  revalidatePath(`/tasks/${item.taskId}`);
}

export async function addChecklistItem(taskId: string, title: string, p: core.Principal): Promise<void> {
  await prisma.$transaction((tx) => core.addChecklistItem(tx, taskId, title, p));
  revalidatePath(`/tasks/${taskId}`);
}

/** Rename an item (forms 4.4). Staff only. */
export async function renameChecklistItem(itemId: string, title: string, p: core.Principal): Promise<void> {
  const item = await prisma.$transaction((tx) => core.renameChecklistItem(tx, itemId, title, p));
  revalidatePath(`/tasks/${item.taskId}`);
}

/** Remove an item. Returns the snapshot the Undo toast passes to `restoreChecklistItem`. */
export async function removeChecklistItem(itemId: string, p: core.Principal): Promise<core.ChecklistSnapshot> {
  const snapshot = await prisma.$transaction((tx) => core.removeChecklistItem(tx, itemId, p));
  revalidatePath(`/tasks/${snapshot.taskId}`);
  return snapshot;
}

/** Undo a removal: the item comes back with its id, place and tick. */
export async function restoreChecklistItem(snapshot: core.ChecklistSnapshot, p: core.Principal): Promise<void> {
  await prisma.$transaction((tx) => core.restoreChecklistItem(tx, snapshot, p));
  revalidatePath(`/tasks/${snapshot.taskId}`);
}

/* ---------------- Auto (system) tasks ---------------- */

/**
 * Idempotent reminder task keyed on `Task.autoKey`. Re-running only rewrites
 * the title + due date — never status or assignee — so a completed or
 * reassigned reminder is left alone. Used by the property key-date sync.
 * (The rest of the reminder fix, rolling a done reminder to next year, is
 * week 2 in docs/asana-migration-plan.md.)
 */
export async function upsertAutoTask(autoKey: string, propertyId: string, title: string, dueDate: Date): Promise<void> {
  const existing = await prisma.task.findUnique({ where: { autoKey }, select: { id: true } });
  if (existing) {
    await prisma.task.update({ where: { autoKey }, data: { title, dueDate } });
    return;
  }
  await prisma.$transaction((tx) =>
    core.createTask(tx, { title, dueDate: dueDate.toISOString().slice(0, 10), propertyId, autoKey }, systemPrincipal("Property reminder")),
  );
}

/**
 * The key date an auto task tracked was cleared: cancel it if it's still open
 * (never delete; its history stays). Clearing autoKey lets a later date
 * create a fresh reminder instead of reviving this one.
 */
export async function cancelOpenAutoTask(autoKey: string): Promise<void> {
  await prisma.task.updateMany({
    where: { autoKey, ...activeTask },
    data: { status: "CANCELED", autoKey: null, completedAt: new Date() },
  });
}

/* ---------------- Attachments (files in Vercel Blob) ---------------- */

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
 * Then, when the upload is recorded, the job must be active, or Done or in
 * Review because they marked it so within the hour (attachments/access.ts).
 * When a token is minted it must also still be active: no new uploads start
 * on a finished job.
 */
export async function contractorUploadRefusal(
  taskId: string,
  contactId: string,
  opts: { atMint?: boolean } = {},
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
  const ok = acceptsContractorUpload(task, lastReview, contactId, now) && (!opts.atMint || isActiveStatus(task.status));
  return ok ? null : "This job is closed.";
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
  // A refusal here (job closed, access gone, the hour after Mark done run out)
  // discards the uploads too: they can never be recorded.
  const att = await discardingOnRefusal(taskId, input, auth, async () => {
    const early = await contractorUploadRefusal(taskId, portal.contactId);
    if (early) throw new core.TaskRuleError(early);
    const meta = await verifiedAttachment(taskId, input, auth);
    return prisma
      .$transaction(async (tx) => {
        const refusal = await contractorUploadRefusal(taskId, portal.contactId, {}, tx);
        if (refusal) throw new core.TaskRuleError(refusal);
        return core.recordAttachment(tx, taskId, meta, taskPrincipal(portal), { visibility: "SHARED", standalone: opts.standalone });
      })
      .catch(alreadyAttached);
  });
  revalidatePath(`/tasks/${taskId}`);
  return { id: att.id };
}

/** Staff only: removes the row, then the blobs, for good. */
export async function deleteTaskAttachment(attachmentId: string): Promise<void> {
  const att = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!att) return;
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
  // A LINK has no blob. Older rows may still point at a public blob; del() takes either URL.
  const blobs = [att.url, att.thumbPathname, att.posterPathname].filter((x): x is string => !!x);
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (blobs.length && token) {
    await del(blobs, { token }).catch((err) => logError("tasks:attachments:delete", err, { attachmentId }));
  }
  revalidatePath(`/tasks/${att.taskId}`);
}
