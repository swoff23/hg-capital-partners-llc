import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { verifyWebhook } from "@/lib/email/inbound";
import { routeReceivedEmail } from "@/lib/email/router";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";
// Downloading a reply's files from Resend and putting them in Blob.
export const maxDuration = 300;

/**
 * Resend's receiving webhook (docs/specs/contractor-job-emails.md, section 5):
 * every email to the sending domain, a reply to a job email among them. The
 * signature (RESEND_WEBHOOK_SECRET, Svix) is the caller check: nothing is
 * read before it holds. The router (src/lib/email/router.ts) hands each email
 * to the inbox its recipients name: a reply posts to its job
 * (src/lib/email/replies.ts), an email to invoices@ becomes a To review
 * invoice (src/lib/invoices/inbound.ts); anything neither takes is answered
 * 200 and dropped. A failure answers 500, so Resend tries again; each inbox
 * keeps its work to once per email.
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
  if (event.type !== "email.received" || typeof event.data?.email_id !== "string") return NextResponse.json({ outcome: "ignored", reason: "not a received email" });
  try {
    return NextResponse.json(await routeReceivedEmail(event.data.email_id));
  } catch (err) {
    logError("email:inbound", err, { emailId: event.data.email_id });
    return new NextResponse("Couldn't take this email yet", { status: 500 });
  }
}
