import { createHash, randomUUID } from "node:crypto";
import type { InboundEmailStatus, PrismaClient, TaskStatus } from "@prisma/client";
import { INVOICE_FILE_RULES, invoiceFileKind, invoiceFolder } from "@/lib/attachments/limits";
import { safeUploadName } from "@/lib/attachments/paths";
import { easternDayStart, todayYmdEastern } from "@/lib/dates";
import { fromAddress, htmlToText, isOutOfOfficeReply, singleAddress } from "@/lib/email/inbound";
import { FieldError } from "@/lib/action-result";
import { logError } from "@/lib/log";
import { sortFile, type ReceivedAttachment, type ReceivedEmail } from "@/lib/email/received";
import * as core from "./core";
import { INVOICE_INBOX } from "./fields";

/**
 * The email ways in (docs/contractor-invoices-plan.md, 4.2 and 4.3): an email to invoices@ becomes a To review
 * invoice, and a Done job's reply with a bill attached (replies.ts) makes one linked to that job. The router
 * (src/lib/email/inboxes.ts) has already picked the inbox; the email was read from Resend once (received.ts).
 *
 * Each email is stored once as an InboundEmail, by Resend's id, with its raw From line, its bare address, its DMARC
 * result and its whole text body (links kept), and makes at most one invoice (core.ts locks the stored row). A
 * webhook Resend retries finds its row: a filed one makes nothing, a stored one that didn't finish goes on. A
 * failure throws, so the webhook answers 500 and Resend tries again; a rule's refusal (FieldError), which no retry
 * would change, doesn't (receiveInvoiceEmail).
 *
 * The invoice inbox's caps (4.3): past INVOICE_EMAILS_PER_DAY invoice emails on one Eastern day, or
 * INVOICE_EMAILS_PER_SENDER from one address, the rest are stored OVER_CAP, which the Invoices page counts
 * (queries.ts droppedInvoiceEmailsToday), and make nothing. A DMARC-verified forward from a partner's own address
 * counts toward neither (notify.ts isPartnerForward's rule), so a launch-day backlog all lands. Automatic replies
 * (out-of-office and delivery reports, isOutOfOfficeReply; never a billing tool's auto-generated invoice) are stored
 * IGNORED and count toward nothing.
 *
 * On a passed client and passed calls (InboundDeps), with no `server-only`, so a test can stand in for Resend and
 * Blob; inbox.ts binds the app's. Files go up before the invoice row (no lock held while they download), into the
 * invoice's own folder (invoices/<id>/), with the id chosen first; a delivery that lost the race deletes its copies.
 */

type Db = PrismaClient;

/** Invoice emails a day (Eastern) past which the rest are dropped and counted. */
export const INVOICE_EMAILS_PER_DAY = 50;
/** Invoice emails a day from one address past which the rest from it are dropped and counted. */
export const INVOICE_EMAILS_PER_SENDER = 10;
/** The most files one email's invoice takes; a bill is a PDF or a few photos, so the rest are a signature's or junk. */
export const INVOICE_EMAIL_MAX_FILES = 20;
/** The longest stored body; a forwarded thread past it is cut. */
export const INVOICE_TEXT_MAX = 50_000;

/** The Resend and Blob calls this needs. */
export interface InboundDeps {
  db: Db;
  /** The email's attachments, read only when it will make an invoice. */
  attachments(): Promise<ReceivedAttachment[]>;
  download(a: ReceivedAttachment): Promise<Buffer>;
  /** Into the private store, with a random suffix. */
  put(pathname: string, bytes: Buffer, contentType: string): Promise<{ url: string; pathname: string }>;
  /** Never throws. */
  del(url: string): Promise<void>;
  /** service.ts's, which refreshes the pages; core's on the same client otherwise. */
  createEmailInvoice?(input: core.EmailInvoiceInput, by: core.Actor): Promise<{ id: string; created: boolean }>;
  createReplyInvoice?(input: core.ReplyInvoiceInput, by: core.Contractor): Promise<{ id: string; created: boolean }>;
  now?: Date;
}

// ---------------------------------------------------------------------------
// The pure parts
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };

/** The web links an email's HTML points at (its `href`s), in order, once each: a "View invoice" button among them. */
export function htmlLinks(html: string | null | undefined): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  for (let m = re.exec(html ?? ""); m; m = re.exec(html ?? "")) {
    const href = (m[1] ?? m[2] ?? m[3] ?? "").trim().replace(/&(amp|quot|#39|lt|gt);/g, (e) => ENTITIES[e] ?? e);
    if (/^https?:\/\/\S+$/i.test(href) && !out.includes(href)) out.push(href);
  }
  return out;
}

/** A web link that carries one of our login tokens: a job link (`/j/<token>`) or an email photo's key (`?l=<token>`). */
const TOKEN_LINK = /https?:\/\/[^\s<>"']*?(?:\/j\/[A-Za-z0-9_-]{43}|[?&]l=[A-Za-z0-9_-]{43})[^\s<>"']*/gi;
/** A job email's reply address, whose token posts as the contractor (email/inbound.ts replyToken). */
const REPLY_ADDRESS = /\br\+[A-Za-z0-9_-]{43}@/gi;
export const JOB_LINK_MASK = "[HG Capital job link]";
export const REPLY_ADDRESS_MASK = "[HG Capital reply address]@";

/**
 * The text with our own job email's secrets taken out, for a reply or forward that quotes one: its buttons open the
 * job as the contractor and its reply address posts as them, so neither is stored or shown as a link.
 */
export function maskLinkTokens(text: string): string {
  return text.replace(TOKEN_LINK, JOB_LINK_MASK).replace(REPLY_ADDRESS, REPLY_ADDRESS_MASK);
}

/**
 * The words an invoice keeps from its email: the whole text body (never replyBody's cut at "Forwarded message", so
 * a forward's own invoice text survives), or the HTML's text when it came with none, and any link the HTML held that
 * the text doesn't, on its own lines at the end (htmlToText drops the hrefs, so a Square or Jobber "View invoice"
 * link would go). A quoted job email's login links and reply address are masked (maskLinkTokens). Null when there's
 * nothing.
 */
export function invoiceEmailText(text: string | null | undefined, html: string | null | undefined): string | null {
  const body = maskLinkTokens(text?.trim() ? text : htmlToText(html ?? ""))
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const links = htmlLinks(html).filter((u) => !body.includes(u) && maskLinkTokens(u) === u);
  const whole = [body, links.join("\n")].filter(Boolean).join("\n\n");
  if (!whole) return null;
  return whole.length > INVOICE_TEXT_MAX ? `${whole.slice(0, INVOICE_TEXT_MAX - 1).trimEnd()}…` : whole;
}

/** An attachment that can be an invoice's file: a PDF or a photo within its cap, never a signature's small logo. */
export interface InvoiceAttachment {
  a: ReceivedAttachment;
  type: string;
}

/** The attachments an invoice keeps (INVOICE_FILE_RULES), in the email's order, up to INVOICE_EMAIL_MAX_FILES. */
export function invoiceAttachments(list: readonly ReceivedAttachment[]): InvoiceAttachment[] {
  const out: InvoiceAttachment[] = [];
  for (const a of list) {
    const s = sortFile(a);
    if (!s || "tooBig" in s) continue;
    const kind = invoiceFileKind(s.type);
    if (!kind || a.size > INVOICE_FILE_RULES[kind].maxBytes) continue;
    out.push({ a, type: s.type });
  }
  return out.slice(0, INVOICE_EMAIL_MAX_FILES);
}

/**
 * Whether a reply on a closed job also makes an invoice (4.2): only on a Done job, and only with a PDF or a photo. A
 * Canceled job takes no invoice (M7), and a reply on an active job stays a comment (staff use Use as invoice).
 */
export function replyMakesInvoice(status: TaskStatus, files: readonly InvoiceAttachment[]): boolean {
  return status === "DONE" && files.length > 0;
}

/** Whether an email's From is a partner's own DMARC-verified address, by notify.ts isPartnerForward's rule. */
export function isPartnerLine(fromLine: string | null | undefined, dmarc: string | null | undefined, partners: ReadonlySet<string>): boolean {
  if (dmarc !== "pass" || !fromLine || !singleAddress(fromLine)) return false;
  return partners.has(fromAddress(fromLine));
}

/**
 * Whether one more invoice email is past the day's caps (4.3), given the ones already let in today: `sender`'s bare
 * address, and whether it's a partner's own forward, which no cap holds. Earlier partner forwards don't count.
 */
export function overInvoiceCap(today: readonly { from: string; partner: boolean }[], next: { from: string; partner: boolean }): boolean {
  if (next.partner) return false;
  const counted = today.filter((r) => !r.partner);
  if (counted.length >= INVOICE_EMAILS_PER_DAY) return true;
  return counted.filter((r) => r.from === next.from).length >= INVOICE_EMAILS_PER_SENDER;
}

/** When Resend received it, the same on every retry; now when Resend didn't say. */
function receivedAtOf(email: ReceivedEmail, now: Date): Date {
  const t = email.created_at ? Date.parse(email.created_at) : NaN;
  return Number.isFinite(t) ? new Date(t) : now;
}

// ---------------------------------------------------------------------------
// The stored email
// ---------------------------------------------------------------------------

export interface StoredEmail {
  id: string;
  status: InboundEmailStatus;
  invoiceId: string | null;
}

const STATUSES_LET_IN: InboundEmailStatus[] = ["RECEIVED", "FILED"];

/**
 * The email's InboundEmail row, made the first time and found every time after (by Resend's id). With `capped`, the
 * invoice inbox's: an automatic reply is IGNORED, one past the caps is OVER_CAP, the rest RECEIVED. The caps are read
 * and the row written under one lock, so two deliveries at once can't both take the last place. A row is made once
 * whatever its first status: an email over the cap stays over it on a retry.
 */
export async function storeInboundEmail(
  db: Db,
  input: { email: ReceivedEmail; localPart: string; capped: boolean },
  now: Date = new Date(),
): Promise<StoredEmail> {
  const { email } = input;
  const fromLine = email.from ?? "";
  const from = fromAddress(fromLine);
  const dmarc = email.authentication?.dmarc ?? null;
  const receivedAt = receivedAtOf(email, now);
  const found = (row: { id: string; status: InboundEmailStatus; invoice: { id: string } | null }): StoredEmail => ({
    id: row.id,
    status: row.status,
    invoiceId: row.invoice?.id ?? null,
  });
  const select = { id: true, status: true, invoice: { select: { id: true } } } as const;
  return db.$transaction(async (tx) => {
    // The inbox's caps queue every delivery to it; outside them, two deliveries of one email queue on its id.
    const key = input.capped ? `inbound-cap:${input.localPart}` : `inbound-email:${email.id}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`;
    const had = await tx.inboundEmail.findUnique({ where: { resendId: email.id }, select });
    if (had) return found(had);
    let status: InboundEmailStatus = "RECEIVED";
    if (input.capped) {
      // Only a true automatic reply: a billing tool's invoice comes marked auto-generated or bulk, and must land.
      if (isOutOfOfficeReply(email.headers ?? {}, email.subject)) status = "IGNORED";
      else {
        const partners = new Set(
          (await tx.user.findMany({ where: { passwordHash: { not: null } }, select: { email: true } })).map((u) => u.email.trim().toLowerCase()),
        );
        const day = todayYmdEastern(receivedAt);
        const start = easternDayStart(day);
        const end = easternDayStart(todayYmdEastern(new Date(start.getTime() + 26 * 3_600_000)));
        const today = await tx.inboundEmail.findMany({
          where: { localPart: input.localPart, status: { in: STATUSES_LET_IN }, receivedAt: { gte: start, lt: end } },
          select: { from: true, fromLine: true, dmarc: true },
        });
        const over = overInvoiceCap(
          today.map((r) => ({ from: r.from, partner: isPartnerLine(r.fromLine, r.dmarc, partners) })),
          { from, partner: isPartnerLine(fromLine, dmarc, partners) },
        );
        if (over) status = "OVER_CAP";
      }
    }
    const row = await tx.inboundEmail.create({
      data: {
        resendId: email.id,
        localPart: input.localPart,
        from,
        fromLine: fromLine || null,
        subject: email.subject?.slice(0, 998) ?? null,
        receivedAt,
        text: invoiceEmailText(email.text, email.html),
        dmarc,
        status,
      },
      select,
    });
    return found(row);
  });
}

// ---------------------------------------------------------------------------
// Files into the invoice's own folder
// ---------------------------------------------------------------------------

/** Each picked attachment downloaded, hashed and put in invoices/<invoiceId>/. A failure deletes what went up. */
async function putFiles(deps: InboundDeps, invoiceId: string, picked: readonly InvoiceAttachment[]): Promise<core.InvoiceFileMeta[]> {
  const metas: core.InvoiceFileMeta[] = [];
  try {
    for (const { a, type } of picked) {
      const bytes = await deps.download(a);
      const filename = (a.filename?.trim() || `invoice-${a.id}`).slice(0, 255);
      const blob = await deps.put(`${invoiceFolder(invoiceId)}${safeUploadName(filename)}`, bytes, type);
      metas.push({ url: blob.url, pathname: blob.pathname, filename, size: bytes.length, contentType: type, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  } catch (err) {
    await dropFiles(deps, metas);
    throw err;
  }
  return metas;
}

async function dropFiles(deps: InboundDeps, metas: readonly core.InvoiceFileMeta[]): Promise<void> {
  for (const m of metas) await deps.del(m.url);
}

/** The write, with the files it was handed; a delivery that lost (another made it first) or failed drops its copies. */
async function creating(
  deps: InboundDeps,
  metas: readonly core.InvoiceFileMeta[],
  write: () => Promise<{ id: string; created: boolean }>,
): Promise<{ id: string; created: boolean }> {
  let r: { id: string; created: boolean };
  try {
    r = await write();
  } catch (err) {
    await dropFiles(deps, metas);
    throw err;
  }
  if (!r.created) await dropFiles(deps, metas);
  return r;
}

// ---------------------------------------------------------------------------
// invoices@ (4.3)
// ---------------------------------------------------------------------------

export type InvoiceEmailOutcome = { outcome: "filed"; invoiceId: string; files: number } | { outcome: "ignored"; reason: string; invoiceId?: string };

/** An email to the invoice inbox: stored, capped, and made into one To review invoice, with or without files (M3). */
export async function receiveInvoiceEmail(deps: InboundDeps, email: ReceivedEmail): Promise<InvoiceEmailOutcome> {
  const now = deps.now ?? new Date();
  const stored = await storeInboundEmail(deps.db, { email, localPart: INVOICE_INBOX, capped: true }, now);
  if (stored.invoiceId) return { outcome: "ignored", reason: "already filed", invoiceId: stored.invoiceId };
  if (stored.status === "IGNORED") return { outcome: "ignored", reason: "automatic reply" };
  if (stored.status === "OVER_CAP") return { outcome: "ignored", reason: "over the cap" };

  // M11: only a DMARC-verified, single-address From that is exactly one contractor's; otherwise "Who's this from?".
  const matched = await core.matchContractor(deps.db, email.from ?? "", email.authentication?.dmarc ?? null);
  const picked = invoiceAttachments(await deps.attachments());
  const write = deps.createEmailInvoice ?? ((input, by) => core.createEmailInvoice(deps.db, input, by, now));
  const by = core.systemActor(fromAddress(email.from ?? "") || "Email");
  const attempt = async (contactId: string | null) => {
    const id = randomUUID();
    const metas = await putFiles(deps, id, picked);
    const r = await creating(deps, metas, () => write({ id, inboundEmailId: stored.id, contactId, files: metas }, by));
    return { r, files: metas.length };
  };
  let done: Awaited<ReturnType<typeof attempt>>;
  try {
    done = await attempt(matched);
  } catch (first) {
    // A rule refused the write, which no retry from Resend would change. The matched contractor deleted between the
    // match and the write is the likely one: the bill still lands, as "Who's this from?".
    if (!(first instanceof FieldError)) throw first;
    try {
      if (!matched) throw first;
      done = await attempt(null);
    } catch (again) {
      if (!(again instanceof FieldError)) throw again;
      // Answered 200, so Resend stops; the stored row stays RECEIVED, with its text, for the record.
      logError("invoices:inbound:refused", again, { emailId: email.id });
      return { outcome: "ignored", reason: "refused" };
    }
  }
  const { r, files } = done;
  return r.created ? { outcome: "filed", invoiceId: r.id, files } : { outcome: "ignored", reason: "already filed", invoiceId: r.id };
}

// ---------------------------------------------------------------------------
// A Done job's reply with a bill (4.2)
// ---------------------------------------------------------------------------

/**
 * The invoice a Done job's reply makes (replies.ts, rule 3): stored as an InboundEmail of the reply's own inbox
 * (`localPart`, outside the invoice caps), from the contractor the reply token names, linked to the job, with the
 * reply's PDFs and photos. Once per email. The caller has checked replyMakesInvoice.
 */
export async function fileReplyInvoice(
  deps: InboundDeps,
  input: { email: ReceivedEmail; localPart: string; taskId: string; files: readonly InvoiceAttachment[]; by: core.Contractor },
): Promise<{ id: string; created: boolean }> {
  const now = deps.now ?? new Date();
  const stored = await storeInboundEmail(deps.db, { email: input.email, localPart: input.localPart, capped: false }, now);
  if (stored.invoiceId) return { id: stored.invoiceId, created: false };
  const id = randomUUID();
  const metas = await putFiles(deps, id, input.files);
  const write = deps.createReplyInvoice ?? ((x, by) => core.createReplyInvoice(deps.db, x, by));
  return creating(deps, metas, () => write({ id, inboundEmailId: stored.id, taskId: input.taskId, files: metas }, input.by));
}
