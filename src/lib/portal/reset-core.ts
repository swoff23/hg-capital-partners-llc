import type { PrismaClient } from "@prisma/client";
import type { EmailMessage } from "@/lib/email/resend";
import type { SendResult } from "@/lib/email/send";

/**
 * The part of reset.ts that records what happened to a reset email, taking
 * the client and the sender as arguments (no `server-only`) so it can be
 * tested. reset.ts re-reads nothing here: it hands over the event it wrote.
 */

/**
 * What a PASSWORD_RESET_REQUESTED event holds. The request writes `sent:
 * false` for every address, known or not, inside its locked transaction (the
 * hourly limits count these rows by emailHash and ipHash whatever `sent`
 * says). Only deliverResetEmail sets it true, once the email went, so a send
 * that fails, or never runs, spends nothing of the daily email cap
 * (notifications/sent-count.ts).
 */
export type ResetRequestData = { emailHash: string; sent: boolean };

/**
 * Send the reset email and mark the request's event `sent: true` when it
 * went. Returns whether it went. Runs after the response (reset.ts), so the
 * request answers the same way whether or not this happens.
 */
export async function deliverResetEmail(
  db: Pick<PrismaClient, "securityEvent">,
  send: (msg: EmailMessage) => Promise<SendResult>,
  r: { eventId: string; data: ResetRequestData; msg: EmailMessage },
): Promise<boolean> {
  const res = await send(r.msg);
  if (!res.ok) return false;
  await db.securityEvent.updateMany({ where: { id: r.eventId }, data: { data: { ...r.data, sent: true } } });
  return true;
}
