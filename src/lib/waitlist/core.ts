import type { PrismaClient } from "@prisma/client";
import { liveRecord } from "@/lib/record-scope";
import { NOT_TAKING_SIGN_UPS, TOO_MANY_TODAY, type RemovedWaitlistEntry, type WaitlistSignUp } from "./fields";

/**
 * The rules every sign-up list write keeps (docs/specs/coming-soon.md 3.4),
 * on whatever client the caller hands in: the app's, through service.ts, or
 * a test's fake (core.test.ts). The inputs arrive already read by fields.ts.
 * A refusal is an Error in plain words, which the action passes through as
 * the form's line. Nothing here writes Property or Listing, so a sign-up
 * never moves the property's version and refuses an open listing sheet.
 */

export type WaitlistDb = Pick<PrismaClient, "listing" | "listingWaitlistEntry">;

/** New rows across every listing in 24 hours. Counted in the database, so it holds across server instances. */
export const DAILY_CAP = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Undo of a remove whose listing was deleted meanwhile. The listing sheet's own words for it. */
export const LISTING_GONE = "This listing was deleted.";

/**
 * Put someone on a listing's list: only a Coming soon listing at a property
 * that isn't archived takes sign-ups, and only while fewer than DAILY_CAP
 * rows were created in the last 24 hours. The same email on the same listing
 * is one person, so a second sign-up updates the name and phone.
 */
export async function join(db: WaitlistDb, listingId: string, signUp: WaitlistSignUp, now: Date = new Date()): Promise<{ id: string; listingId: string; propertyId: string }> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, status: "COMING_SOON", property: liveRecord },
    select: { id: true, propertyId: true },
  });
  if (!listing) throw new Error(NOT_TAKING_SIGN_UPS);
  const lately = await db.listingWaitlistEntry.count({ where: { createdAt: { gte: new Date(now.getTime() - DAY_MS) } } });
  if (lately >= DAILY_CAP) throw new Error(TOO_MANY_TODAY);
  const row = await db.listingWaitlistEntry.upsert({
    where: { listingId_email: { listingId: listing.id, email: signUp.email } },
    create: { listingId: listing.id, firstName: signUp.firstName, email: signUp.email, phone: signUp.phone },
    update: { firstName: signUp.firstName, phone: signUp.phone },
    select: { id: true },
  });
  return { id: row.id, listingId: listing.id, propertyId: listing.propertyId };
}

/**
 * Take someone off a listing's list at this property. Returns the row as it
 * was, for Undo, or null when it's already gone (not an error: the row is
 * gone either way).
 */
export async function remove(db: WaitlistDb, propertyId: string, entryId: string): Promise<RemovedWaitlistEntry | null> {
  const row = await db.listingWaitlistEntry.findFirst({
    where: { id: entryId, listing: { propertyId } },
    select: { id: true, listingId: true, firstName: true, email: true, phone: true, createdAt: true },
  });
  if (!row) return null;
  await db.listingWaitlistEntry.deleteMany({ where: { id: row.id } });
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/**
 * Undo of a remove: the row back on its listing with its id and its original
 * createdAt, so it keeps its place and its day. Whatever the listing's status
 * is now, since the list stays with the listing. Should the same email have
 * signed up again meanwhile, that row keeps its newer name and phone and takes
 * the original day. Restored rows don't count toward DAILY_CAP.
 */
export async function restore(
  db: WaitlistDb,
  propertyId: string,
  entry: RemovedWaitlistEntry,
): Promise<{ id: string; listingId: string; firstName: string; email: string; phone: string | null; createdAt: Date }> {
  const listing = await db.listing.findFirst({ where: { id: entry.listingId, propertyId }, select: { id: true } });
  if (!listing) throw new Error(LISTING_GONE);
  const createdAt = new Date(entry.createdAt);
  return db.listingWaitlistEntry.upsert({
    where: { listingId_email: { listingId: listing.id, email: entry.email } },
    create: { id: entry.id, listingId: listing.id, firstName: entry.firstName, email: entry.email, phone: entry.phone, createdAt },
    update: { createdAt },
    select: { id: true, listingId: true, firstName: true, email: true, phone: true, createdAt: true },
  });
}

/**
 * A database error with the values taken out, for the logs (spec 3.4: they
 * carry ids, never a name, email or phone). A Prisma error's message can
 * quote the query it ran; this keeps its name, so the person still sees the
 * generic line, and its code, and says which ids it was about. Anything
 * else, our own refusals included, is returned as it is.
 */
export function withoutValues(err: unknown, ids: Record<string, string | undefined>): unknown {
  if (!(err instanceof Error) || !err.name.startsWith("PrismaClient")) return err;
  const code = (err as { code?: unknown }).code;
  const about = Object.entries(ids)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  const scrubbed = new Error(`Sign-up list write failed${typeof code === "string" ? ` (${code})` : ""}${about ? ` for ${about}` : ""}`);
  scrubbed.name = err.name;
  return scrubbed;
}
