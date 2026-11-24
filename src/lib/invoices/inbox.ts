import "server-only";
import { del, put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { getEnv, type EmailEnv } from "@/lib/env";
import { downloadAttachment, fetchReceivedAttachments, type ReceivedEmail } from "@/lib/email/received";
import { logError } from "@/lib/log";
import * as inbound from "./inbound";
import * as service from "./service";

/**
 * inbound.ts bound to the app: the app's client, Resend's attachment reads, the private Blob store, and service.ts's
 * writes (which refresh the Invoices pages). The router (src/lib/email/router.ts) and replies.ts call in.
 */
function deps(config: EmailEnv, emailId: string): inbound.InboundDeps {
  return {
    db: prisma,
    attachments: () => fetchReceivedAttachments(config, emailId),
    download: downloadAttachment,
    async put(pathname, bytes, contentType) {
      const token = getEnv().BLOB_READ_WRITE_TOKEN;
      if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is unset: an invoice email's files have nowhere to go");
      const blob = await put(pathname, bytes, { access: "private", token, contentType, addRandomSuffix: true });
      return { url: blob.url, pathname: blob.pathname };
    },
    async del(url) {
      try {
        await del(url, { token: getEnv().BLOB_READ_WRITE_TOKEN });
      } catch (err) {
        logError("invoices:inbound:discard", err, { url });
      }
    },
    createEmailInvoice: service.createEmailInvoice,
    createReplyInvoice: service.createReplyInvoice,
  };
}

/** An email to invoices@ (4.3). */
export function handleInvoiceEmail(config: EmailEnv, email: ReceivedEmail): Promise<inbound.InvoiceEmailOutcome> {
  return inbound.receiveInvoiceEmail(deps(config, email.id), email);
}

/** A Done job's reply with a bill (4.2), for replies.ts. */
export function fileReplyInvoice(
  config: EmailEnv,
  input: Parameters<typeof inbound.fileReplyInvoice>[1],
): Promise<{ id: string; created: boolean }> {
  return inbound.fileReplyInvoice(deps(config, input.email.id), input);
}
