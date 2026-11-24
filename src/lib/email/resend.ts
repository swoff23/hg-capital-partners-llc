import { BRAND } from "@/lib/brand";
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
  /** This email's own Reply-To (a job email's reply address, inbound.ts replyAddress); overrides EMAIL_REPLY_TO. */
  replyTo?: string;
  /** Files Resend fetches by URL and attaches (a reply on a closed job, forwarded to the partners). */
  attachments?: { filename: string; path: string }[];
  /**
   * Resend's Idempotency-Key (an HTTP header on the send, kept 24 hours): the same key sends once, so a step that can
   * run again (a redelivered webhook) never emails twice. Never part of the body.
   */
  idempotencyKey?: string;
  /**
   * Keeps one job's emails in one thread (content.ts threadKey): every email
   * with the same key points at the same parent, so mail apps that thread on
   * headers keep them together, and Gmail does while the subject matches too.
   */
  threadKey?: string;
  /**
   * The name the inbox shows for this email, in place of EMAIL_FROM's (docs/specs/emails-redesign.md, Q5): "HG Capital"
   * on a contractor's job email, "Zack Miller via HG Capital" on a partner's when a contractor's words lead. The
   * address stays EMAIL_FROM's, so threading and replies don't change.
   */
  fromName?: string;
}

/**
 * The From line with a name: an EMAIL_FROM that is a bare address
 * ("jobs@mail.example.com") shows in the inbox as that address, so it gets
 * the company's name. One that already names itself ("HG <jobs@…>") is kept.
 */
export function fromWithName(from: string): string {
  return from.includes("<") ? from : `${BRAND.company} <${from.trim()}>`;
}

/** EMAIL_FROM's bare address, without any name it carries. */
function fromAddress(from: string): string {
  return (/<([^>]+)>/.exec(from)?.[1] ?? from).trim();
}

/**
 * A display name made safe for the From header: no quotes, angle brackets, backslashes or line breaks, spaces collapsed,
 * then quoted, so a name with a comma or a period can't be read as a second address.
 */
export function fromHeader(name: string, from: string): string {
  const clean = name.replace(/["<>\\\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return clean ? `"${clean}" <${fromAddress(from)}>` : fromWithName(from);
}

/** The sending domain, for the thread header's id: the From address after its @. */
function fromDomain(from: string): string {
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
  return address.split("@")[1]?.trim() || "localhost";
}

/** reply_to goes only when EMAIL_REPLY_TO is set; otherwise replies go to the From address. */
export function resendBody(config: Pick<EmailEnv, "from" | "replyTo">, msg: EmailMessage) {
  const parent = msg.threadKey ? `<${msg.threadKey}@${fromDomain(config.from)}>` : null;
  return {
    from: msg.fromName ? fromHeader(msg.fromName, config.from) : fromWithName(config.from),
    to: [msg.to],
    subject: msg.subject,
    text: msg.text,
    ...(msg.html ? { html: msg.html } : {}),
    ...(msg.replyTo || config.replyTo ? { reply_to: msg.replyTo ?? config.replyTo } : {}),
    ...(msg.attachments?.length ? { attachments: msg.attachments } : {}),
    ...(parent ? { headers: { "In-Reply-To": parent, References: parent } } : {}),
  };
}
