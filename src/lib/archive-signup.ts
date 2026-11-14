import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { setContactArchived } from "@/lib/archive";
import { disablePortalAccountIn } from "@/lib/portal/accounts";
import { enablePortalAccountIn, type Staff } from "@/lib/portal/accounts-core";

/**
 * Home's Needs you buttons for new people (docs/specs/contractor-onboarding.md, 4.5), kept beside the archive rules.
 *
 * Archive on a sign-up does two things the contractor page does in two steps: turn their login off the way Remove
 * access does (the archive rule refuses a contractor with a login), then archive them. It is one transaction, so a
 * refusal (an open job) leaves the login on. Undo is the same two steps the other way.
 */

export class SignupReviewError extends Error {}

type Tx = Prisma.TransactionClient;

/** The contact, under its row lock, and whether it is a sign-up from the shared link that still waits on a partner. */
async function lockedSignup(tx: Tx, contactId: string) {
  await tx.$executeRaw`SELECT 1 FROM "Contact" WHERE "id" = ${contactId} FOR UPDATE`;
  const contact = await tx.contact.findUnique({
    where: { id: contactId },
    select: { id: true, signupSource: true, needsReview: true, archivedAt: true, portalAccount: { select: { id: true, status: true } } },
  });
  if (!contact) throw new SignupReviewError("This contractor is gone.");
  return contact;
}

/** Archive a new sign-up: login off (sessions, reset links and job links ended), then the contractor archived. Answers whether anything changed. */
export async function archiveSignup(contactId: string, by: Staff): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const contact = await lockedSignup(tx, contactId);
    if (contact.archivedAt) return false; // a second partner got there first
    if (contact.signupSource !== "LINK" || !contact.needsReview) throw new SignupReviewError("This contractor was already kept.");
    const account = contact.portalAccount;
    if (account && account.status === "ACTIVE") await disablePortalAccountIn(tx, account.id, by);
    return setContactArchived(tx, contactId, true, by);
  });
}

/** Undo for archiveSignup: the contractor is restored and their login is back on. */
export async function restoreSignup(contactId: string, by: Staff): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const contact = await lockedSignup(tx, contactId);
    if (contact.signupSource !== "LINK") throw new SignupReviewError("This contractor was not a sign-up.");
    const changed = await setContactArchived(tx, contactId, false, by);
    const account = contact.portalAccount;
    if (account && account.status === "DISABLED") await enablePortalAccountIn(tx, account.id, by);
    return changed;
  });
}

/** Undo for Keep: the sign-up is New again. Nothing else about them changes. */
export async function unkeepSignup(contactId: string): Promise<void> {
  await prisma.contact.updateMany({ where: { id: contactId, signupSource: "LINK", needsReview: false, archivedAt: null }, data: { needsReview: true } });
}

/** Sent records that a partner sent Baselane's link; with `sent` false (Undo) it clears it. Only someone who did their own setup. */
export async function setBaselaneSent(contactId: string, sent: boolean, now: Date = new Date()): Promise<void> {
  await prisma.contact.updateMany({
    where: { id: contactId, signupSource: { not: "STAFF" }, baselaneSentAt: sent ? null : { not: null } },
    data: { baselaneSentAt: sent ? now : null },
  });
}
