import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { deliveryEvent, recordDeliveryEvent } from "@/lib/email/delivery-events";
import { verifyWebhook } from "@/lib/email/inbound";
import { routeReceivedEmail } from "@/lib/email/router";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";
// Downloading a reply's files from Resend and putting them in Blob.
export const maxDuration = 300;

/**
 * Resend's webhook (docs/specs/contractor-job-emails.md, section 5): every
 * email to the sending domain, a reply to a job email among them, and what
 * happened to the emails we sent (docs/specs/emails-redesign.md, section 5).
 * The signature (RESEND_WEBHOOK_SECRET, Svix) is the caller check: nothing is
 * read before it holds. The router (src/lib/email/router.ts) hands each
 * received email to the inbox its recipients name: a reply posts to its job
 * (src/lib/email/replies.ts), an email to invoices@ becomes a To review
 * invoice (src/lib/invoices/inbound.ts). A bounce, a suppression, a spam
 * report or a delivery is recorded on whoever it was sent to
 * (src/lib/email/delivery-events.ts); anything else is answered 200 and
 * dropped. A failure answers 500, so Resend tries again; each inbox keeps its
 * work to once per email, and an event Resend sends twice changes nothing twice.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = getEnv().email?.webhookSecret;
  if (!secret) return new NextResponse("Not found", { status: 404 });
  const body = await request.text();
  const signed = verifyWebhook(
    body,
    { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") },
    secret,
  );
  if (!signed) {
    // Resend's own headers with a signature that doesn't hold means our RESEND_WEBHOOK_SECRET is
    // wrong, and every reply would bounce off this 401 for a day of retries with no other sign
    // (docs/specs/error-alerts.md, Q19). A stranger's post without them stays quiet.
    if (request.headers.get("svix-signature")) {
      logError("email:inbound-signature", new Error("A Resend webhook failed its signature check; RESEND_WEBHOOK_SECRET may not match Resend's"));
    }
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let event: { type?: unknown; data?: { email_id?: unknown } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ outcome: "ignored", reason: "not json" });
  }
  const delivery = deliveryEvent(event);
  if (delivery) {
    try {
      const change = await recordDeliveryEvent(prisma, delivery);
      const recorded = change.contactIds.length + change.userIds.length;
      if (delivery.kind === "complained" && recorded > 0) {
        // A warning, as the daily cap's line is: the alert itself is the background jobs' check-in, which says
        // "email_complained" for a day (src/lib/jobs-health.ts). Ids only, never the address.
        logError("email:complained", new Error("An email was marked as spam"), { contactIds: change.contactIds, userIds: change.userIds }, { level: "warning" });
      }
      return NextResponse.json({ outcome: recorded > 0 ? "recorded" : "ignored", kind: delivery.kind, recorded });
    } catch (err) {
      logError("email:delivery-event", err, { kind: delivery.kind });
      return new NextResponse("Couldn't record this event yet", { status: 500 });
    }
  }
  if (event.type !== "email.received" || typeof event.data?.email_id !== "string") return NextResponse.json({ outcome: "ignored", reason: "not a received email" });
  try {
    return NextResponse.json(await routeReceivedEmail(event.data.email_id));
  } catch (err) {
    logError("email:inbound", err, { emailId: event.data.email_id });
    return new NextResponse("Couldn't take this email yet", { status: 500 });
  }
}
