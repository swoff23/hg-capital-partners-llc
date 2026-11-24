import "server-only";
import { prisma } from "@/lib/db";
import { replyAddress } from "@/lib/email/inbound";
import { getEnv } from "@/lib/env";
import { hashToken, newToken } from "@/lib/portal/tokens";

/**
 * A resident email's own Reply-To (docs/specs/tenant-welcome-email.md, Q2):
 * `r+<token>@` on the sending domain, as a job email's is, with a new token
 * for each email and only its hash stored (ResidentReplyAddress). Never the
 * form link's token: a reply address travels in To and CC lines and address
 * books, and must not open the form. `requestId` is the request the email is
 * about, null on the form email. A reply through it posts on that request or
 * reaches both partners (src/lib/email/reply-sender.ts).
 *
 * Undefined when replies by email are off (no RESEND_WEBHOOK_SECRET), so the
 * email keeps EMAIL_REPLY_TO, as job emails do (notifications/outbox.ts).
 */
export async function residentReplyTo(who: { tenantId: string; leaseId: string; requestId: string | null }): Promise<string | undefined> {
  const config = getEnv().email;
  if (!config?.webhookSecret) return undefined;
  const token = newToken();
  await prisma.residentReplyAddress.create({ data: { tokenHash: hashToken(token), tenantId: who.tenantId, leaseId: who.leaseId, requestId: who.requestId } });
  return replyAddress(token, config.from);
}
