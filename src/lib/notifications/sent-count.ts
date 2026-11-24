import type { PrismaClient } from "@prisma/client";

/**
 * How many emails went out since `since` against D30's daily cap: the one
 * count the send run (outbox.ts sentTodayCount) and Home's "Email limit
 * reached today." banner (tasks/queries.ts emailCapReached) both use, so the
 * banner shows exactly when the run starts holding emails back.
 *
 * Outbox rows count once sent with no error. A row closed unsent ("no
 * login", "no access", "emails off", "gave up", "nothing to send") carries
 * its reason in lastError and never went. Password-reset and sign-in link
 * emails count too: src/lib/portal/reset.ts and sign-in-link.ts send them
 * from the same Resend account and mark their PASSWORD_RESET_REQUESTED or
 * SIGN_IN_LINK_REQUESTED event `sent: true` once the email went.
 *
 * Takes the client as an argument (no `server-only`) so the pg test can run it.
 */
export async function sentSince(db: Pick<PrismaClient, "notificationOutbox" | "securityEvent">, since: Date): Promise<number> {
  const [outbox, resets] = await Promise.all([
    db.notificationOutbox.count({ where: { sentAt: { gte: since }, lastError: null } }),
    db.securityEvent.count({
      where: { kind: { in: ["PASSWORD_RESET_REQUESTED", "SIGN_IN_LINK_REQUESTED"] }, createdAt: { gte: since }, data: { path: ["sent"], equals: true } },
    }),
  ]);
  return outbox + resets;
}
