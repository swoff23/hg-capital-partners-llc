/**
 * Whose upload queue a request comes from, and the check that it is still
 * the person signed in (docs/specs/uploads-photos.md 2.1). The queue is each
 * person's own: "app:<user id>" in the app, "portal:<contact id>" in the
 * contractor portal (UploadEngine's scope), and a file is only ever recorded
 * and posted as the person who picked it.
 *
 * The queue says who it belongs to with every request that acts for it: the
 * token route's payload, the record step, and a contractor's post and Undo.
 * The server compares that with the session the request arrived under and
 * refuses a mismatch. That closes the second-tab gap: a tab still showing
 * Zack's portal keeps Zack's queue mounted after Mike signs in from another
 * tab, and without this its files would mint, record and post under Mike's
 * cookie. Refused, the tile turns red and the file waits in the outbox for
 * its own person (a queue restores only its own scope).
 *
 * A request that names no owner (a tab loaded before this shipped) is let
 * through, so a deploy never strands a file mid-upload; the current client
 * always names it. Pure; see queue-owner.test.ts.
 */

/** The line a mismatch shows on the red tile. */
export const WRONG_SIGN_IN = "You're signed in as someone else now. Reload the page.";

/** The queue scope of a signed-in staff member. */
export const appScope = (userId: string): string => `app:${userId}`;

/** The queue scope of a signed-in contractor. */
export const portalScope = (contactId: string): string => `portal:${contactId}`;

/** The refusal's words when `sent` names a queue other than `mine` (the session's), else null. Absent means not named. */
export function ownerRefusal(sent: unknown, mine: string): string | null {
  if (sent === undefined || sent === null) return null;
  return sent === mine ? null : WRONG_SIGN_IN;
}

/** Throws the refusal for a server action to hand back as its one-line result. */
export function assertQueueOwner(sent: unknown, mine: string): void {
  const refusal = ownerRefusal(sent, mine);
  if (refusal) throw new Error(refusal);
}

/**
 * Runs `act` for the queue `sent` names, once it is known to be the session's own
 * (`mine`): a mismatch throws the refusal and `act` is never called, so nothing
 * is written for a tab still showing someone else's queue. A call that names no
 * owner passes. The portal's Send and Mark done run their write through this, so
 * the check cannot be parsed after the write or against another scope.
 */
export async function withQueueOwner<T>(sent: unknown, mine: string, act: () => Promise<T>): Promise<T> {
  assertQueueOwner(sent, mine);
  return act();
}
