"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { withResult } from "@/lib/server-action";
import * as tasks from "@/lib/tasks/service";

/**
 * The writes behind the Tasks list's draft rows and the draft's page
 * (docs/specs/tasks-from-claude.md 6.3 and 6.4): Add, Add all, Undo of an Add,
 * Discard, Discard all and Discard's Undo. Each checks the session, parses
 * what the browser sent, and calls the task service, which holds the rules
 * (core.ts addDraft, undoAddDrafts, discardDrafts, restoreDrafts). Nothing but
 * ids comes from the browser: a Discard answers with the ids it discarded and
 * its Undo sends them back. A refusal comes back as a failed result with the
 * rule's own line, for a toast.
 */

const taskId = z.string().min(1).max(64);
const ids = z.array(taskId).min(1).max(500);
const adds = z.array(z.object({ taskId, addEventId: z.string().min(1).max(64) }).strict()).min(1).max(500);

/** What Add did to one draft: its id, the line its Undo names, and who hears (the toast's words). */
export type AddedDraftResult = tasks.AddedDraft;

/** Add all's answer: every draft added, or the one that stopped it, so the toast can open it. */
export type AddAllResult = { added: AddedDraftResult[]; refused: null } | { added: null; refused: { taskId: string; message: string } };

/** Add on one draft: it becomes a To do task. Returns what the toast and its Undo need. */
export async function addDraftTask(id: string): Promise<ActionResult<AddedDraftResult>> {
  return withResult("addDraftTask", async () => {
    const user = await requireUser();
    return tasks.addDraft(taskId.parse(id), tasks.staffPrincipal(user));
  });
}

/**
 * Add all: every draft in My drafts, in one transaction, or none. `mine` keeps
 * it to the partner's own whatever ids arrive. A draft that can't be added
 * stops it, and the answer names that draft (a refusal is a value here, not a
 * failure, so it can carry the draft's id for the toast's Open button).
 */
export async function addDraftTasks(draftIds: string[]): Promise<ActionResult<AddAllResult>> {
  return withResult("addDraftTasks", async () => {
    const user = await requireUser();
    try {
      return { added: await tasks.addDrafts(ids.parse(draftIds), tasks.staffPrincipal(user), { mine: true }), refused: null };
    } catch (err) {
      if (err instanceof tasks.DraftRefusedError) return { added: null, refused: { taskId: err.taskId, message: err.message } };
      throw err;
    }
  });
}

/** What Add's Undo did: the tasks that are drafts again, and each that stayed a task with the line why. */
export type UndoAddResult = Awaited<ReturnType<typeof tasks.undoAddDrafts>>;

/** Add's Undo, for one task or for every task one Add all added: drafts again, within the Undo window. */
export async function undoAddDraftTasks(added: { taskId: string; addEventId: string }[]): Promise<ActionResult<UndoAddResult>> {
  return withResult("undoAddDraftTasks", async () => {
    const user = await requireUser();
    return tasks.undoAddDrafts(adds.parse(added), tasks.staffPrincipal(user));
  });
}

/** Discard on one draft: gone at once. Returns its id, which Undo sends back. */
export async function discardDraftTask(id: string): Promise<ActionResult<{ ids: string[] }>> {
  return withResult("discardDraftTask", async () => {
    const user = await requireUser();
    return tasks.discardDraft(taskId.parse(id), tasks.staffPrincipal(user));
  });
}

/** Discard all: every draft in My drafts, never the other partner's. Returns the ids for the one Undo. */
export async function discardDraftTasks(draftIds: string[]): Promise<ActionResult<{ ids: string[] }>> {
  return withResult("discardDraftTasks", async () => {
    const user = await requireUser();
    return tasks.discardDrafts(ids.parse(draftIds), tasks.staffPrincipal(user), { mine: true });
  });
}

/** Discard's Undo: the drafts come back whole, or are `gone` once the sweep has cleared them (about ten minutes). */
export async function restoreDraftTasks(draftIds: string[]): Promise<ActionResult<{ restored: string[]; gone: string[] }>> {
  return withResult("restoreDraftTasks", async () => {
    const user = await requireUser();
    return tasks.restoreDrafts(ids.parse(draftIds), tasks.staffPrincipal(user));
  });
}
