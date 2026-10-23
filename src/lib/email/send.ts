import "server-only";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";

/**
 * Sends one email through Resend's REST API (docs/asana-migration-plan.md
 * D30, §5.4). Plain fetch, no SDK. Never throws: the caller decides what a
 * failed send means (the outbox retries; password reset just logs).
 *
 * Without RESEND_API_KEY and EMAIL_FROM:
 *  - locally, the message prints to the server console and counts as sent,
 *    so reset links and notification bundles can be followed in dev;
 *  - in production, nothing is printed (the body can carry a reset link)
 *    and the send fails.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const env = getEnv();
  const config = env.email;

  if (!config) {
    if (env.isProduction) {
      logError("email:send", new Error("RESEND_API_KEY or EMAIL_FROM is unset"), { subject: msg.subject });
      return { ok: false, error: "Email is not configured" };
    }
    console.info(`[email] (not sent: RESEND_API_KEY unset)\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n`);
    return { ok: true, id: "dev-console" };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      const error = `Resend ${res.status}: ${body.message ?? body.name ?? "request failed"}`;
      logError("email:send", new Error(error), { subject: msg.subject });
      return { ok: false, error };
    }
    return { ok: true, id: body.id };
  } catch (err) {
    logError("email:send", err, { subject: msg.subject });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
