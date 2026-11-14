import crypto from "node:crypto";

/**
 * Reply by email (docs/specs/contractor-job-emails.md, section 5): the pure
 * half. Checking Resend's webhook signature, finding the job a reply is for,
 * and cutting a reply down to what the person wrote. See inbound.test.ts. The
 * route is src/app/api/email/inbound; the database half is
 * src/lib/email/replies.ts.
 */

// ---------------------------------------------------------------------------
// Resend's webhook signature (Svix)
// ---------------------------------------------------------------------------

/** How old a webhook may be when it arrives: Svix's own tolerance, against replays. */
export const WEBHOOK_TOLERANCE_S = 5 * 60;

/**
 * True when the body was signed with the webhook's secret. Resend signs with
 * Svix: the secret is `whsec_` and base64 key bytes; the signed content is
 * `<svix-id>.<svix-timestamp>.<raw body>`, HMAC-SHA256, base64; the
 * `svix-signature` header lists one or more `v1,<signature>` separated by
 * spaces, any of which may match. The timestamp must be within five minutes.
 * Compared in constant time.
 */
export function verifyWebhook(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_S) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return false;
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`, "utf8").digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

// ---------------------------------------------------------------------------
// Which job a reply is for
// ---------------------------------------------------------------------------

/**
 * The address in a From line, lowercased: the angle-addr at its end ("Zack <zack@x.com>"), or the line itself. Never
 * the first <…>, which a display name can hold (`"<pieter@hg.com>" <attacker@x.com>`).
 */
export function fromAddress(from: string): string {
  // A trailing comment ("zack@x.com (Zack Reading)") isn't part of the address.
  const line = from.replace(/\s*\([^()]*\)\s*$/, "");
  return (/<([^<>]+)>\s*$/.exec(line)?.[1] ?? line).trim().toLowerCase();
}

/**
 * A From line that names one address, however often: `"zack@x.com" <zack@x.com>` is one; a display name holding
 * another address (`"pieter@hg.com" <attacker@x.com>`) is a disguise, and so is a line with two.
 */
export function singleAddress(from: string | null | undefined): boolean {
  const line = from ?? "";
  const matches = line.match(/[^\s<>"(),;:]+@[^\s<>"(),;:]+/g) ?? [];
  // An @ the pattern can't place (a quoted local part, a comment or a space before it) is an address it can't see.
  if ((line.match(/@/g) ?? []).length !== matches.length) return false;
  const found = new Set(matches.map((a) => a.toLowerCase()));
  return found.size === 1 && found.has(fromAddress(line));
}

/** A reply address's token: `r+<token>@<domain>` (any case for the `r`, the token as minted). */
export function replyToken(addresses: readonly string[]): string | null {
  for (const raw of addresses) {
    const address = /<([^>]+)>/.exec(raw)?.[1] ?? raw;
    const m = /^r\+([A-Za-z0-9_-]{43})@/i.exec(address.trim());
    if (m) return m[1];
  }
  return null;
}

/** The reply address for an email's own token, on the sending domain: `r+<token>@mail.example.com`. */
export function replyAddress(token: string, from: string): string {
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const domain = address.split("@")[1]?.trim() || "localhost";
  return `r+${token}@${domain}`;
}

/**
 * The job a reply's thread names, when it came to the plain address instead
 * (a mail app that ignored Reply-To): our emails carry `References:
 * <job-<taskId>-<date>@…>` (content.ts threadKey), which a reply keeps.
 */
export function threadTaskId(references: string | null | undefined): string | null {
  const m = /<job-([A-Za-z0-9]{1,64})-(?:\d{4}-\d{2}-\d{2}|none)@/.exec(references ?? "");
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// What the person wrote
// ---------------------------------------------------------------------------

/** The longest reply that posts; past it the rest is cut, as a comment's own limit is 5,000. */
export const REPLY_MAX = 5000;

/**
 * The lines that start the email being replied to, in the mail apps HG's
 * contractors use: Gmail and Apple Mail ("On Mon, Nov 23, 2026 at 9:31 AM
 * HG Capital Partners <…> wrote:", which Gmail may wrap onto two lines),
 * Outlook ("From: …" after a rule, or "-----Original Message-----"), and a
 * forwarded copy.
 */
const QUOTE_STARTS = [
  /^On .{0,300}wrote:\s*$/im,
  /^On .{0,200}\n.{0,200}wrote:\s*$/im,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^_{8,}\s*$/m,
  /^From: .+\n(?:Sent|Date): .+$/im,
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/im,
  /^Begin forwarded message:\s*$/im,
];

/** Sign-offs a phone adds, and the start of a signature ("-- " on its own line). */
const SIGN_OFFS = [/^Sent from my .{1,40}$/im, /^Get Outlook for .{1,20}$/im, /^-- ?$/m];

/**
 * What the person wrote in a reply: the text before the quoted email and
 * before a signature or "Sent from my iPhone", with quoted `>` lines out,
 * runs of blank lines down to one, and the ends trimmed. Empty when they
 * wrote nothing (a reply that only attaches photos).
 */
export function replyBody(text: string): string {
  let body = text.replace(/\r\n?/g, "\n");
  let cut = body.length;
  for (const re of [...QUOTE_STARTS, ...SIGN_OFFS]) {
    const m = re.exec(body);
    if (m && m.index < cut) cut = m.index;
  }
  body = body
    .slice(0, cut)
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return body.length > REPLY_MAX ? `${body.slice(0, REPLY_MAX - 1).trimEnd()}…` : body;
}

/**
 * HTML to text, for a reply that came with no text part: breaks and block
 * ends become new lines, tags go, the common entities are decoded. Only to
 * read what was written; it never renders.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * An automatic reply that should never post: an out-of-office or vacation
 * notice, a mailing list or bulk sender, or a delivery report. Read from the
 * headers RFC 3834 and the common mail servers set, and the subject.
 */
export function isAutoReply(headers: Readonly<Record<string, string | undefined>>, subject: string | null | undefined): boolean {
  const h = (name: string) => (headers[name] ?? headers[name.toLowerCase()] ?? "").toLowerCase();
  if (h("auto-submitted") && h("auto-submitted") !== "no") return true;
  if (h("x-autoreply") || h("x-autorespond") || h("x-auto-response-suppress").includes("all")) return true;
  if (/^(bulk|list|junk|auto_reply)$/.test(h("precedence"))) return true;
  return /^(auto(matic)? ?reply|out of (the )?office|away|vacation|undeliverable|delivery status notification)\b/i.test((subject ?? "").replace(/^(re|fw|fwd):\s*/i, ""));
}
