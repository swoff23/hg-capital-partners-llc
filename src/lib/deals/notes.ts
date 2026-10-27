import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * A deal's notes: what a partner writes on its timeline (`DealNote.source =
 * "manual"`). Moved out of service.ts so the deal's Activity (the record log,
 * docs/specs/activity-comments.md 2.9) owns its writes; the field changes
 * are deals/log.ts.
 *
 * A note records who wrote it (`authorUserId`) and is no longer signed with
 * their initials. A partner edits or deletes only their own: an edit sets
 * `editedAt`, a delete sets `deletedAt` and a restore (the toast's Undo)
 * clears it. Notes from before an author was recorded have none, so nobody
 * can edit them until the backfill (scripts/backfill-deal-note-authors.ts)
 * names theirs.
 */

/** Who wrote it: the signed-in user, as requireUser() returns them. */
export interface NoteAuthor {
  id: string;
  name: string | null;
  email: string;
}

/** The longest note. A deal log holds sentences, not documents. */
export const NOTE_MAX = 5000;

/** A refusal with a line safe to show (the action's `withResult` hands it back as is). */
export class NoteError extends Error {}

const clean = (body: string) => body.replace(/\r\n/g, "\n").trim();

function checkBody(body: string): string {
  const text = clean(body);
  if (!text) throw new NoteError("Add some text, or delete the note.");
  if (text.length > NOTE_MAX) throw new NoteError(`Keep the note under ${NOTE_MAX.toLocaleString("en-US")} characters.`);
  return text;
}

function revalidate(dealId: string): void {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
}

/**
 * Adds a note and answers with its id. `clientId` is made in the browser for
 * each send: a second write of the same id by the same person on the same
 * deal answers with the note already there, so a Retry after a timeout that
 * did post never posts twice. The deal row is locked first (FOR NO KEY
 * UPDATE, never FOR UPDATE) so two sends at once run one after the other.
 */
export async function createDealNote(dealId: string, body: string, actor: NoteAuthor, clientId?: string | null): Promise<{ id: string }> {
  const text = checkBody(body);
  const id = await prisma.$transaction(async (tx) => {
    if (clientId) {
      await tx.$executeRaw`SELECT 1 FROM "Deal" WHERE "id" = ${dealId} FOR NO KEY UPDATE`;
      const [seen] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "DealNote"
        WHERE "dealId" = ${dealId} AND "authorUserId" = ${actor.id} AND "data"->>'clientId' = ${clientId}
        LIMIT 1`;
      if (seen) return seen.id;
    }
    const note = await tx.dealNote.create({
      data: {
        dealId,
        body: text,
        noteDate: new Date(),
        source: "manual",
        authorUserId: actor.id,
        ...(clientId ? { data: { clientId } } : {}),
      },
      select: { id: true },
    });
    return note.id;
  });
  revalidate(dealId);
  return { id };
}

/** A manual note on the timeline. Kept for the callers that don't need the id (New deal's first note). */
export async function addDealNote(dealId: string, body: string, actor: NoteAuthor): Promise<void> {
  if (!clean(body)) return;
  await createDealNote(dealId, body, actor);
}

/** The note, when it is the author's own, still there and typed here: what edit and delete both need. */
async function ownNote(noteId: string, dealId: string, actor: NoteAuthor, opts: { deleted?: boolean } = {}) {
  const note = await prisma.dealNote.findFirst({
    where: { id: noteId, dealId, source: "manual", authorUserId: actor.id, deletedAt: opts.deleted ? { not: null } : null },
    select: { id: true, body: true },
  });
  if (!note) throw new NoteError("That note is no longer there, or it isn't yours.");
  return note;
}

/** Saves new text on your own note: sets `editedAt`. Saving the text it already has changes nothing. */
export async function editDealNote(noteId: string, dealId: string, body: string, actor: NoteAuthor): Promise<{ editedAt: string | null }> {
  const text = checkBody(body);
  const note = await ownNote(noteId, dealId, actor);
  if (clean(note.body) === text) return { editedAt: null };
  const editedAt = new Date();
  await prisma.dealNote.update({ where: { id: note.id }, data: { body: text, editedAt } });
  revalidate(dealId);
  return { editedAt: editedAt.toISOString() };
}

/** Takes your own note off the log (a soft delete, so Undo can bring it back). */
export async function deleteDealNote(noteId: string, dealId: string, actor: NoteAuthor): Promise<void> {
  const note = await ownNote(noteId, dealId, actor);
  await prisma.dealNote.update({ where: { id: note.id }, data: { deletedAt: new Date() } });
  revalidate(dealId);
}

/** Undo for a delete: the note comes back as it was. */
export async function restoreDealNote(noteId: string, dealId: string, actor: NoteAuthor): Promise<void> {
  const note = await ownNote(noteId, dealId, actor, { deleted: true });
  await prisma.dealNote.update({ where: { id: note.id }, data: { deletedAt: null } });
  revalidate(dealId);
}
