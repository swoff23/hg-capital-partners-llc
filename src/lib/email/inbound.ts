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
 * <job-<taskId>@…>` (content.ts threadKey), which a reply keeps. Emails sent
 * before Nov 15 carried `<job-<taskId>-<date>@…>`, so a reply to one of
 * those still finds its job. The off email's `-off` id never matches.
 */
export function threadTaskId(references: string | null | undefined): string | null {
  const m = /<job-([A-Za-z0-9]{1,64})(?:-(?:\d{4}-\d{2}-\d{2}|none))?@/.exec(references ?? "");
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
 * forwarded copy. Tenants' phones add the same lines in Spanish ("El … escribió:",
 * "De: … Enviado:", Samsung's "Mensaje original"), French ("Le … a écrit :") and
 * Portuguese ("Em … escreveu:").
 */
const QUOTE_STARTS = [
  /^On .{0,300}wrote:\s*$/im,
  /^On .{0,200}\n.{0,200}wrote:\s*$/im,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^_{8,}\s*$/m,
  /^From: .+\n(?:Sent|Date): .+$/im,
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/im,
  /^Begin forwarded message:\s*$/im,
  /^El .{0,300}escribió:\s*$/im,
  /^El .{0,200}\n.{0,200}escribió:\s*$/im,
  /^-{2,}\s*Mensaje original\s*-{2,}\s*$/im,
  /^De: .+\n(?:Enviado(?: el)?|Fecha): .+$/im,
  /^Le .{0,300}a\sécrit\s?:\s*$/im,
  /^Em .{0,300}escreveu:\s*$/im,
];

/** Sign-offs a phone adds, and the start of a signature ("-- " on its own line). */
const SIGN_OFFS = [/^Sent from my .{1,40}$/im, /^Enviado desde mi .{1,40}$/im, /^Envoyé de mon .{1,40}$/im, /^Enviado do meu .{1,40}$/im, /^Get Outlook for .{1,20}$/im, /^-- ?$/m];

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

/** Our app's address and our sending addresses (EMAIL_FROM's and EMAIL_REPLY_TO's), for telling our own email apart. */
export interface OurAddresses {
  appUrl: string;
  addresses: readonly string[];
}

/** The hosts our emails name: the app's, and the sending domains, lowercased, without "www.". */
function ourHosts(ours: OurAddresses): string[] {
  let app = "";
  try {
    app = new URL(ours.appUrl).hostname;
  } catch {
    // No app address to look for; the sending domains still count.
  }
  const hosts = [app, ...ours.addresses.map((a) => fromAddress(a).split("@")[1] ?? "")].map((h) => h.trim().toLowerCase().replace(/^www\./, ""));
  return [...new Set(hosts.filter(Boolean))];
}

/**
 * A resident's no-login link (`/r/<token>`, links.ts residentUrl) and a reply address (`r+<token>@…`), wherever they
 * sit, also percent-encoded inside another link (Outlook's Safe Links wraps ours as `?url=https%3A%2F%2F…%2Fr%2F<token>`).
 */
const RESIDENT_LINK = /[^\S\n]?\S*(?:\/|%2F)r(?:\/|%2F)[A-Za-z0-9_-]{32,}\S*/gi;
const REPLY_ADDRESS = /[^\S\n]?\S*\br(?:\+|%2B)[A-Za-z0-9_-]{32,}(?:@|%40)\S*/gi;

/**
 * A tenant's reply, safe to post on their request (docs/specs/tenant-welcome-email.md, Q2). It posts Shared, where the
 * contractor on the job reads it, and every resident email carries the tenant's own form link, which opens their page
 * with no login. So a quote replyBody didn't know (another mail app, or a language it doesn't read) must not post: the
 * words stop at the first line that names our app or our sending domain, which only our own email being quoted does,
 * and a resident link or reply address left anywhere else is taken out.
 */
export function residentReplyWords(written: string, ours: OurAddresses): string {
  const hosts = ourHosts(ours);
  const lines = written.split("\n");
  const at = lines.findIndex((line) => {
    const l = line.toLowerCase();
    return hosts.some((h) => l.includes(h));
  });
  return (at === -1 ? lines : lines.slice(0, at))
    .join("\n")
    .replace(RESIDENT_LINK, "")
    .replace(REPLY_ADDRESS, "")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

// ---------------------------------------------------------------------------
// Replies that can't post, and files that don't come through
// (docs/specs/emails-redesign.md, section 7)
// ---------------------------------------------------------------------------

/**
 * A link a mail app put in place of a file too big to attach: Apple's Mail Drop (an iCloud link that stops working
 * after 30 days), an iCloud Drive share, or Google Drive (Gmail's own "too big" link). Null when the words carry none.
 */
export type LinkedFile = "mail-drop" | "icloud" | "drive";

export function linkedFile(text: string): LinkedFile | null {
  if (/https:\/\/(?:www\.)?icloud\.com\/attachment\//i.test(text)) return "mail-drop";
  if (/https:\/\/(?:www\.)?icloud\.com\/iclouddrive\//i.test(text)) return "icloud";
  if (/https:\/\/drive\.google\.com\/(?:file|open|drive)\b/i.test(text)) return "drive";
  return null;
}

type Kind = "image" | "video" | "file";

const NOUN: Record<Kind, string> = { image: "photo", video: "video", file: "file" };

/** "your video", "2 photos", "3 files": a mix of kinds is files. */
function counted(kinds: readonly Kind[]): { words: string; one: boolean } {
  const kind = kinds.every((k) => k === kinds[0]) ? kinds[0] : "file";
  const noun = NOUN[kind ?? "file"];
  return kinds.length === 1 ? { words: `your ${noun}`, one: true } : { words: `${kinds.length} ${noun}s`, one: false };
}

/**
 * The one line of the note to a contractor whose reply posted without some of its files (the reply-problem email,
 * subject "Some files didn't post: …"): it says the rest posted, and what to do. The first that applies: a file over
 * its size cap, more files than one post takes, then a file sent as a link. Null when every file came through.
 * `posted` false: the reply was only files, all too big, so nothing posted and the line doesn't say it did.
 */
export function postedFilesLine(input: { tooBig: readonly Kind[]; tooMany: boolean; max: number; linked: LinkedFile | null; posted?: boolean }): string | null {
  if (input.tooBig.length) {
    const { words, one } = counted(input.tooBig);
    const what = `${words} ${one ? "was" : "were"} too big for email. Add ${one ? "it" : "them"} on the job.`;
    return input.posted === false ? what.charAt(0).toUpperCase() + what.slice(1) : `Your reply posted, but ${what}`;
  }
  if (input.posted === false) return null;
  if (input.tooMany) return `Your reply posted with its first ${input.max} files. Add the rest on the job.`;
  switch (input.linked) {
    case "mail-drop":
      return "Your reply posted. Its iCloud link stops working in 30 days, so add the file on the job.";
    case "icloud":
      return "Your reply posted with an iCloud link. Add the file itself on the job.";
    case "drive":
      return "Your reply posted with a Drive link. Add the file itself on the job.";
    default:
      return null;
  }
}

/**
 * The same note for a reply that went to the partners by email instead (a closed job, or one the contractor can't
 * post on): its files rode along as attachments, and these didn't fit. A link in the words went with the words, so
 * it needs no note. Null when nothing was left out.
 */
export function forwardedFilesLine(partners: string, dropped: readonly Kind[]): string | null {
  if (!dropped.length) return null;
  const { words, one } = counted(dropped);
  const what = one ? words.replace(/^your /, "a ") : words;
  return `Your reply reached ${partners}, but ${what} didn't fit in the email. Send ${one ? "it" : "them"} as an iCloud or Drive link.`;
}

/** Why a contractor's reply didn't post on its job, or "no-job" for a fresh email to the jobs address. */
export type CantPost = "closed" | "off-task" | "login-off" | "old-link" | "no-job";

/** The headline of the email that brings such a reply to the partners, the contractor by full name (Q6). */
export function forwardHeadline(name: string, why: CantPost): string {
  switch (why) {
    case "closed":
      return `${name} replied after this closed.`;
    case "off-task":
      return `${name} replied, but they're no longer on this task.`;
    case "login-off":
      return `${name} replied, but their login is off.`;
    case "old-link":
      return `${name} replied to an old email, so it didn't post.`;
    case "no-job":
      return `${name} wrote to the jobs address. It isn't on a task.`;
  }
}

/**
 * Why a tenant's reply to a resident email goes to the partners instead of posting on their request
 * (docs/specs/tenant-welcome-email.md, Q2): it's about no request (the form email), the request closed, or they moved
 * out. "files": it posted, but some of its files can't go on a request (a document, or past ten).
 */
export type ResidentCantPost = "no-request" | "closed" | "moved-out";
export type ResidentForward = ResidentCantPost | "files";

/** That email's headline, the tenant by full name as a contractor is (forwardHeadline). */
export function residentForwardHeadline(name: string, why: ResidentForward): string {
  switch (why) {
    case "no-request":
      return `${name} replied by email. It isn't about a request.`;
    case "closed":
      return `${name} replied after this closed.`;
    case "moved-out":
      return `${name} replied after moving out.`;
    case "files":
      return `${name} replied with files that can't go on the request.`;
  }
}

/** That email's line about the files: what's attached, and what didn't fit. Null with no files. */
export function forwardFilesLine(attached: number, dropped: number): string | null {
  if (!attached && !dropped) return null;
  if (!attached) return dropped === 1 ? "Their file didn't fit in this email." : `Their ${dropped} files didn't fit in this email.`;
  const lead = attached === 1 ? "Their file is attached." : `Their ${attached} files are attached.`;
  return dropped ? `${lead} ${dropped} more didn't fit.` : lead;
}
