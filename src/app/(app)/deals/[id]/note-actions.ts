"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import * as notes from "@/lib/deals/notes";
import { withResult } from "@/lib/server-action";

/**
 * The deal page's note actions: authenticate, parse, then write through
 * lib/deals/notes.ts. Each answers with a result instead of throwing, so a
 * note that doesn't save stays in the box with its line (activity 2.7, 2.9)
 * rather than swapping the page for the error boundary.
 */

const id = z.string().min(1).max(64);
// The cap is the service's (NOTE_MAX), which words its refusal; this only stops absurd posts.
const text = z.string().max(20_000);

const addSchema = z.object({ body: text, clientId: z.string().min(1).max(64).optional() }).strict();

/** A note from the box. `clientId` makes a Retry after a timeout safe: the same id never posts twice. */
export async function addDealNote(dealId: string, input: z.input<typeof addSchema>): Promise<ActionResult<{ id: string }>> {
  return withResult("addDealNote", async () => {
    const user = await requireUser();
    const parsed = addSchema.parse(input);
    return notes.createDealNote(id.parse(dealId), parsed.body, user, parsed.clientId);
  });
}

/** New text on your own note. */
export async function editDealNoteAction(dealId: string, noteId: string, body: string): Promise<ActionResult<{ editedAt: string | null }>> {
  return withResult("editDealNote", async () => {
    const user = await requireUser();
    return notes.editDealNote(id.parse(noteId), id.parse(dealId), text.parse(body), user);
  });
}

/** Takes your own note off the log; the toast's Undo restores it. */
export async function deleteDealNoteAction(dealId: string, noteId: string): Promise<ActionResult> {
  return withResult("deleteDealNote", async () => {
    const user = await requireUser();
    await notes.deleteDealNote(id.parse(noteId), id.parse(dealId), user);
  });
}

/** Undo for a delete. */
export async function restoreDealNoteAction(dealId: string, noteId: string): Promise<ActionResult> {
  return withResult("restoreDealNote", async () => {
    const user = await requireUser();
    await notes.restoreDealNote(id.parse(noteId), id.parse(dealId), user);
  });
}
