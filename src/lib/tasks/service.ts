import "server-only";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import type { Task, TaskStatus, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { TEMPLATE_BUCKET } from "@/lib/config";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { firstName } from "@/lib/names";
import { activeTask } from "@/lib/task-scope";
import { asEditorConflict } from "./conflicts";
import * as core from "./core";
import { contactsWhoSaw, deleteEmailNote, emailStatesIn } from "./delivery";
import type { DraftContractor } from "./drafts";

/**
 * Task domain for the app: every staff, system and public-form task write
 * goes through here. Server actions authenticate and parse, then call in.
 * The rules themselves (who may do what, timeline events, contractor access,
 * repeats, which emails go out) live in ./core, shared with the contractor
 * portal and the Asana importer. This layer adds the transaction, then
 * revalidates every page that shows the task once it commits.
 */

export type { ChecklistSnapshot, DraftInput, Principal, NewTaskInput, SaveDraftsResult, TaskPatch, StatusOptions } from "./core";
export { AssigneeChangedError, DraftRefusedError, NotesChangedError, TaskChangedError, TaskRuleError, bucketFor } from "./core";
export type { DraftContractor } from "./drafts";
export { MAX_WAITING_DRAFTS } from "./drafts";
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

/* ---------------- Drafts from Claude (docs/specs/tasks-from-claude.md, section 6) ----------------
 *
 * Each of these is core.ts's rule in one transaction, then a refresh of the
 * pages that show what it changed. The rules, and their tests on Postgres,
 * are core's (drafts.pg.test.ts): this file loads Next, which a test can't.
 */

/** A batch makes several round trips per draft; give Add all and a full save room (as bulk.ts). */
const DRAFTS_TX = { timeout: 20_000, maxWait: 10_000 };

/** The lists, Home's drafts row, and each of these tasks' own page and property page. */
function revalidateTaskRows(rows: readonly { id: string; propertyId?: string | null; dealId?: string | null }[], propertyIds: readonly string[] = []): void {
  revalidatePath("/tasks");
  revalidatePath("/");
  for (const r of rows) revalidatePath(`/tasks/${r.id}`);
  for (const id of new Set([...rows.map((r) => r.propertyId), ...propertyIds])) if (id) revalidatePath(`/properties/${id}`);
  for (const id of new Set(rows.map((r) => r.dealId))) if (id) revalidatePath(`/deals/${id}`);
}

/**
 * One save from a partner's Claude: every draft, or none (core.saveDrafts).
 * `saved` wrote them; `replay` is the same save sent again, answered with the
 * tasks the first one made; `key-reused` is other drafts under a batchKey
 * that was already used; `too-many` would put more than MAX_WAITING_DRAFTS in
 * the partner's My drafts. Only `saved` writes anything. `check` runs inside
 * the transaction, only for a save that is new and fits, and throws to refuse
 * it.
 */
export async function saveDrafts(
  batchKey: string,
  drafts: readonly core.DraftInput[],
  p: core.Principal,
  check?: (tx: core.Tx) => Promise<void>,
): Promise<core.SaveDraftsResult> {
  const result = await prisma.$transaction((tx) => core.saveDrafts(tx, batchKey, drafts, p, check), DRAFTS_TX);
  if (result.kind === "saved") revalidateTaskRows(result.tasks);
  return result;
}

/** What Add did to one draft: the task's id, the line its Undo names, and who hears (drafts.ts draftsAddedNames). */
export interface AddedDraft {
  taskId: string;
  addEventId: string;
  contractor: DraftContractor | null;
}

const addedOf = (a: core.AddedDraft): AddedDraft => ({ taskId: a.task.id, addEventId: a.addEventId, contractor: a.contractor });

/**
 * Add on a draft's row or page: it becomes a To do task, its contractor can
 * open the job and their email is queued, as New task does. A refused one
 * (already added, discarded, its contractor archived, its unit gone) still
 * refreshes the pages, so the screen that sent it shows where it is.
 */
export async function addDraft(taskId: string, p: core.Principal): Promise<AddedDraft> {
  try {
    const added = await prisma.$transaction((tx) => core.addDraft(tx, taskId, p));
    revalidateTaskRows([added.task]);
    return addedOf(added);
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTask({ id: taskId });
    throw err;
  }
}

/**
 * Add all: every one of these drafts in one transaction, or none
 * (core.DraftRefusedError says which one stopped it). `mine` keeps it to the
 * partner's own drafts, whatever ids arrive, so My drafts' button never adds
 * from the other partner's group.
 */
export async function addDrafts(taskIds: readonly string[], p: core.Principal, opts: { mine?: boolean } = {}): Promise<AddedDraft[]> {
  try {
    const added = await prisma.$transaction((tx) => core.addDrafts(tx, taskIds, p, new Date(), opts), DRAFTS_TX);
    revalidateTaskRows(added.map((a) => a.task));
    return added.map(addedOf);
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTaskRows(taskIds.map((id) => ({ id })));
    throw err;
  }
}

/**
 * Add's Undo, for one task or for every task one Add all added, each on its
 * own: `undone` are drafts again, with the access and the waiting emails
 * their Add made taken back; `kept` stayed tasks, each with its title and the
 * line why ("Zack already opened it."). Every page is refreshed either way.
 */
export async function undoAddDrafts(
  adds: readonly { taskId: string; addEventId: string }[],
  p: core.Principal,
): Promise<{ undone: string[]; kept: { taskId: string; title: string; message: string }[] }> {
  try {
    const out = await prisma.$transaction((tx) => core.undoAddDrafts(tx, adds, p), DRAFTS_TX);
    revalidateTaskRows([...out.undone, ...out.kept.map((k) => ({ id: k.taskId }))]);
    return { undone: out.undone.map((t) => t.id), kept: out.kept };
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTaskRows(adds.map((a) => ({ id: a.taskId })));
    throw err;
  }
}

/**
 * Discard on a draft's row or page: gone from every screen at once, and
 * nothing deleted. Returns its id, which the Undo toast hands to
 * `restoreDrafts`. Refused, with who added it, when it is a task by now.
 */
export async function discardDraft(taskId: string, p: core.Principal): Promise<{ ids: string[] }> {
  try {
    const gone = await prisma.$transaction((tx) => core.discardDraft(tx, taskId, p));
    revalidateTaskRows([{ id: taskId }], gone.propertyIds);
    return { ids: gone.ids };
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTask({ id: taskId });
    throw err;
  }
}

/**
 * Discard all: each of these that is still a waiting draft, in one
 * transaction. With `mine`, only the partner's own. Returns the ids
 * discarded, for the one Undo.
 */
export async function discardDrafts(taskIds: readonly string[], p: core.Principal, opts: { mine?: boolean } = {}): Promise<{ ids: string[] }> {
  const gone = await prisma.$transaction((tx) => core.discardDrafts(tx, taskIds, p, new Date(), opts), DRAFTS_TX);
  revalidateTaskRows(
    gone.ids.map((id) => ({ id })),
    gone.propertyIds,
  );
  return { ids: gone.ids };
}

/**
 * Discard's Undo, by id: `restored` wait in their draft groups again, whole
 * (nothing was deleted); `gone` can't come back (the sweep deleted them, about
 * ten minutes after the Discard). Nothing but ids comes from the browser.
 */
export async function restoreDrafts(taskIds: readonly string[], p: core.Principal): Promise<{ restored: string[]; gone: string[] }> {
  const out = await prisma.$transaction((tx) => core.restoreDrafts(tx, taskIds, p), DRAFTS_TX);
  revalidateTaskRows([...out.restored, ...out.gone.map((id) => ({ id }))]);
  return { restored: out.restored.map((t) => t.id), gone: out.gone };
}

/** The blobs of files that went with deleted drafts, removed once the delete has committed (as deleteTask does). */
async function removeDraftBlobs(blobs: readonly string[]): Promise<void> {
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (blobs.length === 0 || !token) return;
  await del([...blobs], { token }).catch((err) => logError("tasks:discard:blobs", err, { count: blobs.length }, { level: "warning" }));
}

/**
 * The every-minute run's sweep (/api/cron/notifications): drafts discarded
 * more than ten minutes ago are deleted, then their files. Returns how many
 * drafts went. No page is refreshed: they left every screen when they were
 * discarded.
 */
export async function sweepDiscardedDrafts(now: Date = new Date()): Promise<number> {
  const swept = await prisma.$transaction((tx) => core.sweepDiscardedDrafts(tx, now), DRAFTS_TX);
  await removeDraftBlobs(swept.blobs);
  return swept.ids.length;
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
 * Field edits. A task deleted elsewhere is refused ("That task no longer
 * exists."), never a quiet success: the screen would toast "Task renamed"
 * over nothing saved. A refused one (deleted, someone reassigned it or saved
 * the notes first) still refreshes the pages, so the screen that sent it
 * shows where the task is now; a stale notes save comes back as the notes
 * field's conflict (conflicts.ts).
 */
export async function patchTask(id: string, patch: core.TaskPatch, p: core.Principal): Promise<void> {
  try {
    const { after, propertyBefore } = await prisma.$transaction(async (tx) => {
      // Read with the write, so the property page it leaves is the one it was on.
      const was = await tx.task.findUnique({ where: { id }, select: { propertyId: true } });
      return { after: await core.patchTask(tx, id, patch, p), propertyBefore: was?.propertyId ?? null };
    });
    revalidateTask(after, [propertyBefore]);
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTask({ id });
    throw asEditorConflict(err);
  }
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
 * timeline. No-op when the task doesn't exist. A draft is refused
 * (core.deleteTask): it goes by Discard.
 */
export async function deleteTask(id: string, p: core.Principal): Promise<void> {
  const removed = await prisma.$transaction((tx) => core.deleteTask(tx, id, p));
  if (!removed) return;
  const token = getEnv().BLOB_READ_WRITE_TOKEN;
  if (removed.blobs.length && token) {
    await del(removed.blobs, { token }).catch((err) => logError("tasks:delete:blobs", err, { taskId: id, count: removed.blobs.length }, { level: "warning" }));
  }
  revalidateTask(removed);
}

export async function addTaskComment(taskId: string, input: core.CommentInput, p: core.Principal): Promise<void> {
  try {
    await prisma.$transaction((tx) => core.addComment(tx, taskId, input, p));
  } catch (err) {
    // A refusal means the page is out of date (a draft discarded from another tab): redraw it, as patchTask does.
    if (err instanceof core.TaskRuleError) revalidatePath(`/tasks/${taskId}`);
    throw err;
  }
  revalidatePath(`/tasks/${taskId}`);
}

/** Save new text on your own comment (activity 2.5). Nothing is emailed: the drain re-reads each comment when it sends. */
export async function editTaskComment(eventId: string, body: string, p: core.Principal): Promise<void> {
  const ev = await prisma.$transaction((tx) => core.editComment(tx, eventId, { body }, p));
  revalidatePath(`/tasks/${ev.taskId}`);
}

/**
 * Delete your own comment, softly. Returns what the toast says about the
 * email: "Zack won't get it" while it is still queued, "Zack already got the
 * email" once it went, null for an Internal comment or one never emailed.
 */
export async function deleteTaskComment(eventId: string, p: core.Principal): Promise<{ emailNote: string | null }> {
  const out = await prisma.$transaction(async (tx) => {
    const was = await tx.taskEvent.findUnique({ where: { id: eventId }, select: { visibility: true, audienceContactId: true, taskId: true, createdAt: true } });
    // Who could have read it, settled before it comes off: a comment no contractor saw leaves no trace in the portal.
    const seenBy = was?.visibility === "SHARED" && p.kind === "staff" ? await contactsWhoSaw(tx, { id: eventId, ...was }) : undefined;
    const { taskId } = await core.deleteComment(tx, eventId, p, new Date(), seenBy);
    let emailNote: string | null = null;
    if (was?.visibility === "SHARED" && was.audienceContactId) {
      const states = await emailStatesIn(tx, taskId, was.audienceContactId, [eventId]);
      const contact = await tx.contact.findUnique({ where: { id: was.audienceContactId }, select: { fullName: true } });
      emailNote = deleteEmailNote(states.get(eventId) ?? null, firstName(contact?.fullName) || contact?.fullName || null);
    }
    return { taskId, emailNote };
  });
  revalidatePath(`/tasks/${out.taskId}`);
  return { emailNote: out.emailNote };
}

/** Undo a delete: the comment and the files that went with it come back. */
export async function restoreTaskComment(eventId: string, p: core.Principal): Promise<void> {
  const { taskId } = await prisma.$transaction((tx) => core.restoreComment(tx, eventId, p));
  revalidatePath(`/tasks/${taskId}`);
}

/**
 * Approve's Undo: back to Review as if never approved (core.undoApproval).
 * A refused one (the job moved on) still refreshes the pages, so the screen
 * shows where the job is.
 */
export async function undoTaskApproval(taskId: string, approvedEventId: string, p: core.Principal): Promise<void> {
  try {
    const { task } = await prisma.$transaction((tx) => core.undoApproval(tx, taskId, approvedEventId, p));
    revalidateTask(task);
  } catch (err) {
    if (err instanceof core.TaskRuleError) revalidateTask({ id: taskId });
    throw err;
  }
}

export async function setChecklistItem(itemId: string, done: boolean, p: core.Principal): Promise<void> {
  const item = await prisma.$transaction((tx) => core.setChecklistItem(tx, itemId, done, p));
  revalidatePath(`/tasks/${item.taskId}`);
}

export async function addChecklistItem(taskId: string, title: string, p: core.Principal): Promise<void> {
  try {
    await prisma.$transaction((tx) => core.addChecklistItem(tx, taskId, title, p));
  } catch (err) {
    // As addTaskComment: a refused write redraws the page it came from.
    if (err instanceof core.TaskRuleError) revalidatePath(`/tasks/${taskId}`);
    throw err;
  }
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

// Moved to ./attachments (docs/specs/build-plan.md 1.3); every importer keeps this path.
export {
  contractorUploadRefusal,
  deleteTaskAttachment,
  recordPortalAttachment,
  recordTaskAttachment,
  renameTaskAttachment,
  type UploadedFile,
} from "./attachments";
