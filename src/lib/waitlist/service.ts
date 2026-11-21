import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import * as core from "./core";
import type { RemovedWaitlistEntry, WaitlistSignUp } from "./fields";

/**
 * A listing's sign-up list (docs/specs/coming-soon.md 3.4): the app's one
 * way to write it. Server actions authenticate (or, for the public form,
 * check the honeypot and the visitor's limit) and parse, then call in as
 * `* as waitlist`; the rules live in core.ts. Each write refreshes the
 * property page, whose listing row counts who's waiting, and Rentals.
 *
 * None of them touches Property.updatedAt, so a sign-up or a removal never
 * refuses Connor's open listing sheet. A database error reaches the action's
 * log with its values taken out (core.ts withoutValues): logs carry ids,
 * never a name, email or phone.
 */

function revalidate(propertyId: string): void {
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/rentals");
}

/** A renter's Notify me. Refuses a listing that isn't Coming soon anymore, and past the daily cap. */
export async function join(listingId: string, signUp: WaitlistSignUp): Promise<{ id: string; listingId: string; propertyId: string }> {
  try {
    const r = await core.join(prisma, listingId, signUp);
    revalidate(r.propertyId);
    return r;
  } catch (err) {
    throw core.withoutValues(err, { listingId });
  }
}

/** Remove from list. The row as it was, for Undo, or null when it was already gone. */
export async function remove(propertyId: string, entryId: string): Promise<RemovedWaitlistEntry | null> {
  try {
    const removed = await core.remove(prisma, propertyId, entryId);
    revalidate(propertyId);
    return removed;
  } catch (err) {
    throw core.withoutValues(err, { propertyId, entryId });
  }
}

/** Undo of a remove: the row back with its id and its original createdAt. */
export async function restore(propertyId: string, entry: RemovedWaitlistEntry): ReturnType<typeof core.restore> {
  try {
    const row = await core.restore(prisma, propertyId, entry);
    revalidate(propertyId);
    return row;
  } catch (err) {
    throw core.withoutValues(err, { propertyId, listingId: entry.listingId, entryId: entry.id });
  }
}
