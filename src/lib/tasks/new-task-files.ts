import type { AttachmentKind, NewTaskForm, NewTaskUpload, Prisma, PrismaClient } from "@prisma/client";
import { DRAFT_MAX_AGE_DAYS } from "@/lib/drafts";
import { TaskRuleError } from "./core";

/**
 * New task's files before the task exists (docs/specs/new-task-checklist-photos.md, section 3): the rules on the
 * database, apart from Blob and Next so they run on Postgres in a test (new-task-files.pg.test.ts). The service around
 * them (new-task-uploads.ts) checks each blob with head() and deletes blobs.
 *
 * A form's files go up as they're picked, under the person and a form id the browser makes per new task, and wait as
 * NewTaskUpload rows. Create writes the form's NewTaskForm (the task and its "created" line) and attaches every file
 * already there; a file that lands after Create attaches as it's recorded. Both take the form's lock first, so a file
 * recorded at the moment Create runs is attached by one of the two, never by neither. The task's files hang from its
 * "created" line, so the task page, its zip, the contractor's job page and the job email treat them as posted
 * (media.ts isDraftUpload is a staff file on no line). They're Shared with no contractor of their own (Q2), so any
 * contractor on the job sees them, today's or a later one.
 */

type Tx = Prisma.TransactionClient | PrismaClient;

/** The most files one new task takes; the rest go on the task once it's made. */
export const NEW_TASK_FILES_MAX = 50;
export const NEW_TASK_FILES_FULL = "Add up to 50 here. Add more on the task.";
export const NOT_THIS_FORM = "That file didn't upload from this form.";

/** A form's id as the browser makes it (crypto.randomUUID): a folder name paths.ts accepts, and long enough not to guess. */
const FORM_ID = /^[A-Za-z0-9_-]{16,64}$/;
export const isFormId = (v: unknown): v is string => typeof v === "string" && FORM_ID.test(v);

/** One form at a time, to the end of the transaction (record, Create, remove and discard all take it first). */
const NEW_TASK_FORM_LOCK = 7307;
export async function lockForm(tx: Tx, formId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${NEW_TASK_FORM_LOCK}::int, hashtext(${formId}))`;
}

/** A form someone else's files or task already use: no one picks up another person's form. */
export async function formTakenByOther(tx: Tx, formId: string, userId: string): Promise<boolean> {
  const [row, claim] = await Promise.all([
    tx.newTaskUpload.findFirst({ where: { formId, userId: { not: userId } }, select: { id: true } }),
    tx.newTaskForm.findFirst({ where: { id: formId, userId: { not: userId } }, select: { id: true } }),
  ]);
  return !!row || !!claim;
}

/** The form's file count has reached the cap. */
export async function formFull(tx: Tx, formId: string, userId: string): Promise<boolean> {
  return (await tx.newTaskUpload.count({ where: { formId, userId } })) >= NEW_TASK_FILES_MAX;
}

/** What the record step keeps, read from Blob's own head(), never the browser's. */
export interface HeldFile {
  pathname: string;
  url: string;
  filename: string;
  size: number;
  contentType: string;
  kind: AttachmentKind;
  thumbPathname: string | null;
  posterPathname: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

/** One held file as the task's own: Shared, no contractor of its own, on the task's "created" line. */
async function attachOne(tx: Tx, upload: NewTaskUpload, form: Pick<NewTaskForm, "taskId" | "eventId" | "userId">): Promise<string> {
  const att = await tx.taskAttachment.create({
    data: {
      taskId: form.taskId,
      eventId: form.eventId,
      url: upload.url,
      pathname: upload.pathname,
      filename: upload.filename.slice(0, 255) || "file",
      size: upload.size,
      contentType: upload.contentType,
      kind: upload.kind,
      visibility: "SHARED",
      uploadedByUserId: form.userId,
      audienceContactId: null,
      thumbPathname: upload.thumbPathname,
      posterPathname: upload.posterPathname,
      width: upload.width,
      height: upload.height,
      durationSec: upload.durationSec,
    },
    select: { id: true },
  });
  await tx.newTaskUpload.update({ where: { id: upload.id }, data: { attachmentId: att.id } });
  return att.id;
}

/**
 * The record step's write, under the form's lock: hold the file, and when the form already made its task, attach it
 * there. A Retry of a record that committed gets the same row back. Returns the row's id, and the task it joined.
 */
export async function holdFile(tx: Tx, userId: string, formId: string, file: HeldFile): Promise<{ id: string; taskId: string | null }> {
  if (!isFormId(formId)) throw new TaskRuleError(NOT_THIS_FORM);
  await lockForm(tx, formId);
  const existing = await tx.newTaskUpload.findUnique({ where: { pathname: file.pathname }, select: { id: true, userId: true, formId: true } });
  if (existing) {
    if (existing.userId !== userId || existing.formId !== formId) throw new TaskRuleError(NOT_THIS_FORM);
    const claim = await tx.newTaskForm.findUnique({ where: { id: formId }, select: { taskId: true } });
    return { id: existing.id, taskId: claim?.taskId ?? null };
  }
  if (await formTakenByOther(tx, formId, userId)) throw new TaskRuleError(NOT_THIS_FORM);
  if (await formFull(tx, formId, userId)) throw new TaskRuleError(NEW_TASK_FILES_FULL);
  const row = await tx.newTaskUpload.create({ data: { userId, formId, ...file } });
  const claim = await tx.newTaskForm.findUnique({ where: { id: formId } });
  if (claim) {
    await attachOne(tx, row, claim);
    return { id: row.id, taskId: claim.taskId };
  }
  return { id: row.id, taskId: null };
}

/**
 * Create's part, in the task's own transaction: record which task this form made (the first time only: a form makes
 * one task) and attach every file already held. Files still going attach as they're recorded (holdFile). Returns how
 * many it attached.
 */
export async function attachForm(tx: Tx, formId: string, userId: string, taskId: string): Promise<number> {
  if (!isFormId(formId)) return 0;
  await lockForm(tx, formId);
  if (await tx.newTaskForm.findUnique({ where: { id: formId }, select: { id: true } })) return 0;
  if (await formTakenByOther(tx, formId, userId)) return 0;
  const created = await tx.taskEvent.findFirst({ where: { taskId, kind: "CREATED" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!created) return 0;
  const form = await tx.newTaskForm.create({ data: { id: formId, userId, taskId, eventId: created.id } });
  const held = await tx.newTaskUpload.findMany({ where: { formId, userId, attachmentId: null }, orderBy: { createdAt: "asc" } });
  for (const upload of held) await attachOne(tx, upload, form);
  return held.length;
}

/** The paths a held file's blobs live at. */
export const blobsOf = (u: Pick<NewTaskUpload, "url" | "thumbPathname" | "posterPathname">) =>
  [u.url, u.thumbPathname, u.posterPathname].filter((x): x is string => !!x);

/** Removing a tile before Create: the row goes, and the caller deletes its blobs. Nothing once it's the task's. */
export async function releaseFile(tx: Tx, userId: string, id: string): Promise<string[]> {
  const row = await tx.newTaskUpload.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return [];
  await lockForm(tx, row.formId);
  const { count } = await tx.newTaskUpload.deleteMany({ where: { id, attachmentId: null } });
  return count ? blobsOf(row) : [];
}

/** Discard or Clear: every file the form holds goes, unless the form already made its task. */
export async function releaseForm(tx: Tx, userId: string, formId: string): Promise<string[]> {
  if (!isFormId(formId)) return [];
  await lockForm(tx, formId);
  if (await tx.newTaskForm.findUnique({ where: { id: formId }, select: { id: true } })) return [];
  const rows = await tx.newTaskUpload.findMany({ where: { formId, userId, attachmentId: null } });
  if (!rows.length) return [];
  await tx.newTaskUpload.deleteMany({ where: { id: { in: rows.map((r) => r.id) }, attachmentId: null } });
  return rows.flatMap(blobsOf);
}

/** A draft keeps its files as long as it keeps its words (drafts.ts), and a day past it. */
export const HELD_KEEP_MS = (DRAFT_MAX_AGE_DAYS + 1) * 86_400_000;

/**
 * The every-minute run's part: files on a form that never made a task, past HELD_KEEP_MS, go with their blobs (the
 * caller deletes those). Rows of files that did join a task, and forms that made one, go once they're that old too:
 * nothing lands on a form after that. A batch at a time.
 */
export async function sweepHeld(tx: Tx, now: Date, take = 200): Promise<string[]> {
  const before = new Date(now.getTime() - HELD_KEEP_MS);
  const stale = await tx.newTaskUpload.findMany({ where: { attachmentId: null, createdAt: { lt: before } }, orderBy: { createdAt: "asc" }, take });
  const claimed = new Set(
    (await tx.newTaskForm.findMany({ where: { id: { in: [...new Set(stale.map((r) => r.formId))] } }, select: { id: true } })).map((f) => f.id),
  );
  const loose = stale.filter((r) => !claimed.has(r.formId));
  if (loose.length) await tx.newTaskUpload.deleteMany({ where: { id: { in: loose.map((r) => r.id) }, attachmentId: null } });
  await tx.newTaskUpload.deleteMany({ where: { attachmentId: { not: null }, createdAt: { lt: before } } });
  await tx.newTaskForm.deleteMany({ where: { createdAt: { lt: before } } });
  return loose.flatMap(blobsOf);
}
