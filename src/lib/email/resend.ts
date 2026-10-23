import type { EmailEnv } from "@/lib/env";

/**
 * The JSON body for Resend's POST /emails. Pure, so resend.test.ts can check
 * it; send.ts is server-only and does the network.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** reply_to goes only when EMAIL_REPLY_TO is set; otherwise replies go to the From address. */
export function resendBody(config: Pick<EmailEnv, "from" | "replyTo">, msg: EmailMessage) {
  return {
    from: config.from,
    to: [msg.to],
    subject: msg.subject,
    text: msg.text,
    ...(msg.html ? { html: msg.html } : {}),
    ...(config.replyTo ? { reply_to: config.replyTo } : {}),
  };
}
